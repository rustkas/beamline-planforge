import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export type RevisionMeta = {
  source: "user" | "agent" | "plugin" | "system";
  reason?: string;
};

export type Revision = {
  revision_id: string;
  project_id: string;
  created_at: string;
  kitchen_state: unknown;
  content_hash: string;
  parent_revision_id?: string;
  meta: RevisionMeta;
};

export type Project = {
  project_id: string;
  created_at: string;
  latest_revision_id: string;
};

export type ProjectSnapshot = {
  project: Project;
  revisions: Revision[];
  quotes: Quote[];
  orders: Order[];
};

export type Money = {
  currency: string;
  amount: number;
};

export type QuoteItem = {
  code: string;
  title: string;
  qty: number;
  unit_price: Money;
  amount: Money;
  meta?: Record<string, unknown>;
};

export type Quote = {
  quote_id: string;
  project_id: string;
  revision_id: string;
  created_at: string;
  ruleset_version: string;
  currency: string;
  total: Money;
  items: QuoteItem[];
  meta?: Record<string, unknown>;
};

export type OrderStatus = "draft" | "confirmed" | "production" | "delivered";

export type Order = {
  order_id: string;
  project_id: string;
  revision_id: string;
  quote_id: string;
  created_at: string;
  status: OrderStatus;
  quote: Quote;
  contact: {
    name: string;
    email: string;
    phone?: string;
  };
  address: {
    line1: string;
    city: string;
    country: string;
  };
};

export class InMemoryStore {
  private projects = new Map<string, Project>();
  private revisions = new Map<string, Revision[]>();
  private quotes = new Map<string, Quote[]>();
  private orders = new Map<string, Order[]>();
  private persist_path: string | null;

  constructor(persist_path: string | null) {
    this.persist_path = persist_path;
  }

  create_project(initial_state: unknown, meta: RevisionMeta): { project: Project; revision: Revision } {
    const project_id = `proj_${crypto.randomUUID().replace(/-/g, "")}`;
    const revision_id = `rev_${crypto.randomUUID().replace(/-/g, "")}`;
    const created_at = new Date().toISOString();
    const content_hash = this.hash_state(initial_state);

    const project: Project = { project_id, created_at, latest_revision_id: revision_id };
    const revision: Revision = {
      revision_id,
      project_id,
      created_at,
      kitchen_state: initial_state,
      content_hash,
      meta
    };

    this.projects.set(project_id, project);
    this.revisions.set(project_id, [revision]);
    this.quotes.set(project_id, []);
    this.orders.set(project_id, []);
    void this.persist(project_id);

    return { project, revision };
  }

  get_project(project_id: string): Project | null {
    return this.projects.get(project_id) ?? null;
  }

  get_revision(project_id: string, revision_id: string): Revision | null {
    const list = this.revisions.get(project_id) ?? [];
    return list.find((rev) => rev.revision_id === revision_id) ?? null;
  }

  list_revisions(project_id: string): Revision[] {
    return this.revisions.get(project_id) ?? [];
  }

  create_revision(project_id: string, kitchen_state: unknown, parent_revision_id: string, meta: RevisionMeta): Revision | null {
    const project = this.projects.get(project_id);
    if (!project) return null;

    const revision_id = `rev_${crypto.randomUUID().replace(/-/g, "")}`;
    const created_at = new Date().toISOString();
    const content_hash = this.hash_state(kitchen_state);
    const revision: Revision = {
      revision_id,
      project_id,
      created_at,
      kitchen_state,
      content_hash,
      parent_revision_id,
      meta
    };

    const list = this.revisions.get(project_id) ?? [];
    list.push(revision);
    this.revisions.set(project_id, list);
    project.latest_revision_id = revision_id;
    this.projects.set(project_id, project);

    void this.persist(project_id);

    return revision;
  }

  create_quote(project_id: string, revision_id: string, quote: Omit<Quote, "quote_id" | "project_id" | "revision_id" | "created_at">): Quote | null {
    const project = this.projects.get(project_id);
    if (!project) return null;
    const revision = this.get_revision(project_id, revision_id);
    if (!revision) return null;

    const quote_id = `quote_${crypto.randomUUID().replace(/-/g, "")}`;
    const created_at = new Date().toISOString();
    const stored: Quote = {
      quote_id,
      project_id,
      revision_id,
      created_at,
      ruleset_version: quote.ruleset_version,
      currency: quote.currency,
      total: quote.total,
      items: quote.items,
      meta: quote.meta
    };

    const list = this.quotes.get(project_id) ?? [];
    list.push(stored);
    this.quotes.set(project_id, list);
    void this.persist(project_id);

    return stored;
  }

  get_quote(project_id: string, quote_id: string): Quote | null {
    const list = this.quotes.get(project_id) ?? [];
    return list.find((q) => q.quote_id === quote_id) ?? null;
  }

  list_quotes(project_id: string): Quote[] {
    return this.quotes.get(project_id) ?? [];
  }

  create_order(args: {
    project_id: string;
    revision_id: string;
    quote: Quote;
    contact: Order["contact"];
    address: Order["address"];
  }): Order | null {
    const project = this.projects.get(args.project_id);
    if (!project) return null;
    const revision = this.get_revision(args.project_id, args.revision_id);
    if (!revision) return null;

    const order_id = `order_${crypto.randomUUID().replace(/-/g, "")}`;
    const created_at = new Date().toISOString();
    const order: Order = {
      order_id,
      project_id: args.project_id,
      revision_id: args.revision_id,
      quote_id: args.quote.quote_id,
      created_at,
      status: "confirmed",
      quote: args.quote,
      contact: args.contact,
      address: args.address
    };

    const list = this.orders.get(args.project_id) ?? [];
    list.push(order);
    this.orders.set(args.project_id, list);
    void this.persist(args.project_id);

    return order;
  }

  get_order(project_id: string, order_id: string): Order | null {
    const list = this.orders.get(project_id) ?? [];
    return list.find((o) => o.order_id === order_id) ?? null;
  }

  private async persist(project_id: string): Promise<void> {
    if (!this.persist_path) return;
    const project = this.projects.get(project_id);
    if (!project) return;
    const revisions = this.revisions.get(project_id) ?? [];
    const quotes = this.quotes.get(project_id) ?? [];
    const orders = this.orders.get(project_id) ?? [];
    const snapshot: ProjectSnapshot = { project, revisions, quotes, orders };

    await mkdir(this.persist_path, { recursive: true });
    const file_path = path.join(this.persist_path, `${project_id}.json`);
    await writeFile(file_path, JSON.stringify(snapshot, null, 2));
  }

  private hash_state(state: unknown): string {
    const json = JSON.stringify(state);
    return createHash("sha256").update(json).digest("hex");
  }
}

export function create_store(): InMemoryStore {
  const persist_path = process.env.PLANFORGE_PERSIST_PATH ?? null;
  return new InMemoryStore(persist_path && persist_path.length > 0 ? persist_path : null);
}
