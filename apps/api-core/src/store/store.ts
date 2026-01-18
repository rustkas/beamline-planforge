import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { canonical_json_stringify } from "./hash";

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

export type QuoteDiagnostic = {
  plugin_id: string;
  ok: boolean;
  added_items: number;
  added_adjustments: number;
  errors: string[];
  warnings: string[];
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
  diagnostics?: QuoteDiagnostic[];
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
  idempotency_key?: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  delivery: {
    line1: string;
    city: string;
    country: string;
  };
};

export type Session = {
  session_id: string;
  project_id: string;
  created_at: string;
  last_revision_id: string;
};

export type SessionMessage = {
  message_id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
};

export type SessionProposal = {
  proposal_id: string;
  session_id: string;
  revision_id: string;
  variant_index: number;
  patch: Record<string, unknown>;
  rationale: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  explanation_text?: string;
  created_at: string;
};

export class InMemoryStore {
  private projects = new Map<string, Project>();
  private revisions = new Map<string, Revision[]>();
  private quotes = new Map<string, Quote[]>();
  private orders = new Map<string, Order[]>();
  private order_idempotency = new Map<string, Order>();
  private sessions = new Map<string, Session>();
  private session_messages = new Map<string, SessionMessage[]>();
  private session_proposals = new Map<string, SessionProposal[]>();
  private persist_path: string | null;

  constructor(persist_path: string | null) {
    this.persist_path = persist_path;
  }

  async create_project(initial_state: unknown, meta: RevisionMeta): Promise<{ project: Project; revision: Revision }> {
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

  async get_project(project_id: string): Promise<Project | null> {
    return this.projects.get(project_id) ?? null;
  }

  async get_revision(project_id: string, revision_id: string): Promise<Revision | null> {
    const list = this.revisions.get(project_id) ?? [];
    return list.find((rev) => rev.revision_id === revision_id) ?? null;
  }

  async list_revisions(project_id: string): Promise<Revision[]> {
    return this.revisions.get(project_id) ?? [];
  }

  async create_revision(
    project_id: string,
    kitchen_state: unknown,
    parent_revision_id: string,
    meta: RevisionMeta
  ): Promise<Revision | null> {
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

  async create_quote(
    project_id: string,
    revision_id: string,
    quote: Omit<Quote, "quote_id" | "project_id" | "revision_id" | "created_at">
  ): Promise<Quote | null> {
    const project = this.projects.get(project_id);
    if (!project) return null;
    const revision = await this.get_revision(project_id, revision_id);
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
      diagnostics: quote.diagnostics,
      meta: quote.meta
    };

    const list = this.quotes.get(project_id) ?? [];
    list.push(stored);
    this.quotes.set(project_id, list);
    void this.persist(project_id);

    return stored;
  }

  async get_quote(project_id: string, quote_id: string): Promise<Quote | null> {
    const list = this.quotes.get(project_id) ?? [];
    return list.find((q) => q.quote_id === quote_id) ?? null;
  }

  async list_quotes(project_id: string): Promise<Quote[]> {
    return this.quotes.get(project_id) ?? [];
  }

  async find_quote(quote_id: string): Promise<Quote | null> {
    for (const [project_id, list] of this.quotes.entries()) {
      const found = list.find((q) => q.quote_id === quote_id);
      if (found) return found;
    }
    return null;
  }

  async create_order(args: {
    project_id: string;
    revision_id: string;
    quote: Quote;
    customer: Order["customer"];
    delivery: Order["delivery"];
    idempotency_key?: string;
  }): Promise<Order | null> {
    const project = this.projects.get(args.project_id);
    if (!project) return null;
    const revision = await this.get_revision(args.project_id, args.revision_id);
    if (!revision) return null;

    if (args.idempotency_key) {
      const existing = this.order_idempotency.get(args.idempotency_key);
      if (existing) return existing;
    }

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
      idempotency_key: args.idempotency_key,
      customer: args.customer,
      delivery: args.delivery
    };

    const list = this.orders.get(args.project_id) ?? [];
    list.push(order);
    this.orders.set(args.project_id, list);
    if (args.idempotency_key) {
      this.order_idempotency.set(args.idempotency_key, order);
    }
    void this.persist(args.project_id);

    return order;
  }

  async get_order(project_id: string, order_id: string): Promise<Order | null> {
    const list = this.orders.get(project_id) ?? [];
    return list.find((o) => o.order_id === order_id) ?? null;
  }

  async find_order(order_id: string): Promise<Order | null> {
    for (const list of this.orders.values()) {
      const found = list.find((o) => o.order_id === order_id);
      if (found) return found;
    }
    return null;
  }

  async create_session(project_id: string, revision_id: string): Promise<Session> {
    const session_id = `sess_${crypto.randomUUID().replace(/-/g, "")}`;
    const created_at = new Date().toISOString();
    const session: Session = {
      session_id,
      project_id,
      created_at,
      last_revision_id: revision_id
    };
    this.sessions.set(session_id, session);
    this.session_messages.set(session_id, []);
    this.session_proposals.set(session_id, []);
    return session;
  }

  async get_session(session_id: string): Promise<Session | null> {
    return this.sessions.get(session_id) ?? null;
  }

  async update_session_revision(session_id: string, revision_id: string): Promise<void> {
    const session = this.sessions.get(session_id);
    if (!session) return;
    session.last_revision_id = revision_id;
    this.sessions.set(session_id, session);
  }

  async add_message(session_id: string, message: Omit<SessionMessage, "message_id">): Promise<SessionMessage | null> {
    const session = this.sessions.get(session_id);
    if (!session) return null;
    const message_id = `msg_${crypto.randomUUID().replace(/-/g, "")}`;
    const record: SessionMessage = { message_id, ...message };
    const list = this.session_messages.get(session_id) ?? [];
    list.push(record);
    this.session_messages.set(session_id, list);
    return record;
  }

  async list_messages(session_id: string): Promise<SessionMessage[]> {
    return this.session_messages.get(session_id) ?? [];
  }

  async add_proposals(
    session_id: string,
    revision_id: string,
    proposals: Array<{
      variant_index: number;
      patch: Record<string, unknown>;
      rationale: Record<string, unknown>;
      metrics?: Record<string, unknown>;
      explanation_text?: string;
    }>
  ): Promise<SessionProposal[] | null> {
    const session = this.sessions.get(session_id);
    if (!session) return null;
    const created_at = new Date().toISOString();
    const stored = proposals.map((proposal) => ({
      proposal_id: `prop_${crypto.randomUUID().replace(/-/g, "")}`,
      session_id,
      revision_id,
      variant_index: proposal.variant_index,
      patch: proposal.patch,
      rationale: proposal.rationale,
      metrics: proposal.metrics,
      explanation_text: proposal.explanation_text,
      created_at
    }));
    const list = this.session_proposals.get(session_id) ?? [];
    list.push(...stored);
    this.session_proposals.set(session_id, list);
    return stored;
  }

  async list_proposals(session_id: string): Promise<SessionProposal[]> {
    return this.session_proposals.get(session_id) ?? [];
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
    const json = canonical_json_stringify(state);
    return createHash("sha256").update(json).digest("hex");
  }
}

export type Store = Pick<
  InMemoryStore,
  | "create_project"
  | "get_project"
  | "get_revision"
  | "list_revisions"
  | "create_revision"
  | "create_quote"
  | "get_quote"
  | "find_quote"
  | "list_quotes"
  | "create_order"
  | "get_order"
  | "find_order"
  | "create_session"
  | "get_session"
  | "update_session_revision"
  | "add_message"
  | "list_messages"
  | "add_proposals"
  | "list_proposals"
>;

export async function create_store(): Promise<Store> {
  const database_url = process.env.DATABASE_URL ?? "";
  if (database_url.length > 0) {
    const { connect_db } = await import("../storage/db");
    const { run_migrations } = await import("../storage/migrations");
    const { DbStore } = await import("./db_store");
    const db = connect_db();
    await run_migrations(db);
    const store = new DbStore(db);
    await store.seed_catalog();
    return store;
  }

  const persist_path = process.env.PLANFORGE_PERSIST_PATH ?? null;
  return new InMemoryStore(persist_path && persist_path.length > 0 ? persist_path : null);
}
