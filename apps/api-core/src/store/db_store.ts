import type { DbClient } from "../storage/db";
import { canonical_json_stringify } from "./hash";
import { createHash } from "node:crypto";
import type {
  Money,
  Order,
  Project,
  Quote,
  QuoteItem,
  Revision,
  RevisionMeta
} from "./store";
import { list_modules, MODULES_CATALOG_VERSION } from "../catalog/catalog";

function hash_state(state: unknown): string {
  const json = canonical_json_stringify(state);
  return createHash("sha256").update(json).digest("hex");
}

export class DbStore {
  constructor(private readonly db: DbClient) {}

  async seed_catalog(): Promise<void> {
    const items = list_modules();
    for (const item of items) {
      await this.db`
        INSERT INTO catalog_items (id, kind, title, price, catalog_version)
        VALUES (${item.id}, ${"module"}, ${item.title}, ${item.price}, ${MODULES_CATALOG_VERSION})
        ON CONFLICT (id) DO NOTHING
      `;
    }
  }

  async create_project(initial_state: unknown, meta: RevisionMeta): Promise<{ project: Project; revision: Revision }> {
    const project_id = `proj_${crypto.randomUUID().replace(/-/g, "")}`;
    const revision_id = `rev_${crypto.randomUUID().replace(/-/g, "")}`;
    const created_at = new Date().toISOString();
    const content_hash = hash_state(initial_state);

    await this.db`
      INSERT INTO projects (project_id, created_at, latest_revision_id)
      VALUES (${project_id}, ${created_at}, ${revision_id})
    `;

    await this.db`
      INSERT INTO revisions (revision_id, project_id, created_at, kitchen_state, content_hash, parent_revision_id, meta)
      VALUES (${revision_id}, ${project_id}, ${created_at}, ${initial_state}, ${content_hash}, ${null}, ${meta})
    `;

    return {
      project: { project_id, created_at, latest_revision_id: revision_id },
      revision: {
        revision_id,
        project_id,
        created_at,
        kitchen_state: initial_state,
        content_hash,
        meta
      }
    };
  }

  async get_project(project_id: string): Promise<Project | null> {
    const rows = await this.db<Project[]>`
      SELECT project_id, created_at, latest_revision_id
      FROM projects
      WHERE project_id = ${project_id}
    `;
    return rows[0] ?? null;
  }

  async get_revision(project_id: string, revision_id: string): Promise<Revision | null> {
    const rows = await this.db<Revision[]>`
      SELECT revision_id, project_id, created_at, kitchen_state, content_hash, parent_revision_id, meta
      FROM revisions
      WHERE project_id = ${project_id} AND revision_id = ${revision_id}
    `;
    return rows[0] ?? null;
  }

  async list_revisions(project_id: string): Promise<Revision[]> {
    return await this.db<Revision[]>`
      SELECT revision_id, project_id, created_at, kitchen_state, content_hash, parent_revision_id, meta
      FROM revisions
      WHERE project_id = ${project_id}
      ORDER BY created_at ASC
    `;
  }

  async create_revision(
    project_id: string,
    kitchen_state: unknown,
    parent_revision_id: string,
    meta: RevisionMeta
  ): Promise<Revision | null> {
    const project = await this.get_project(project_id);
    if (!project) return null;

    const revision_id = `rev_${crypto.randomUUID().replace(/-/g, "")}`;
    const created_at = new Date().toISOString();
    const content_hash = hash_state(kitchen_state);

    await this.db`
      INSERT INTO revisions (revision_id, project_id, created_at, kitchen_state, content_hash, parent_revision_id, meta)
      VALUES (${revision_id}, ${project_id}, ${created_at}, ${kitchen_state}, ${content_hash}, ${parent_revision_id}, ${meta})
    `;

    await this.db`
      UPDATE projects SET latest_revision_id = ${revision_id} WHERE project_id = ${project_id}
    `;

    return {
      revision_id,
      project_id,
      created_at,
      kitchen_state,
      content_hash,
      parent_revision_id,
      meta
    };
  }

  async create_quote(
    project_id: string,
    revision_id: string,
    quote: Omit<Quote, "quote_id" | "project_id" | "revision_id" | "created_at">
  ): Promise<Quote | null> {
    const project = await this.get_project(project_id);
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

    await this.db`
      INSERT INTO quotes (quote_id, project_id, revision_id, created_at, ruleset_version, currency, total, items, diagnostics, meta)
      VALUES (
        ${quote_id},
        ${project_id},
        ${revision_id},
        ${created_at},
        ${stored.ruleset_version},
        ${stored.currency},
        ${stored.total},
        ${stored.items},
        ${stored.diagnostics ?? null},
        ${stored.meta ?? null}
      )
    `;

    return stored;
  }

  async get_quote(project_id: string, quote_id: string): Promise<Quote | null> {
    const rows = await this.db<Quote[]>`
      SELECT quote_id, project_id, revision_id, created_at, ruleset_version, currency, total, items, diagnostics, meta
      FROM quotes
      WHERE project_id = ${project_id} AND quote_id = ${quote_id}
    `;
    return rows[0] ?? null;
  }

  async find_quote(quote_id: string): Promise<Quote | null> {
    const rows = await this.db<Quote[]>`
      SELECT quote_id, project_id, revision_id, created_at, ruleset_version, currency, total, items, diagnostics, meta
      FROM quotes
      WHERE quote_id = ${quote_id}
    `;
    return rows[0] ?? null;
  }

  async list_quotes(project_id: string): Promise<Quote[]> {
    return await this.db<Quote[]>`
      SELECT quote_id, project_id, revision_id, created_at, ruleset_version, currency, total, items, diagnostics, meta
      FROM quotes
      WHERE project_id = ${project_id}
      ORDER BY created_at ASC
    `;
  }

  async create_order(args: {
    project_id: string;
    revision_id: string;
    quote: Quote;
    customer: Order["customer"];
    delivery: Order["delivery"];
    idempotency_key?: string;
  }): Promise<Order | null> {
    const project = await this.get_project(args.project_id);
    if (!project) return null;
    const revision = await this.get_revision(args.project_id, args.revision_id);
    if (!revision) return null;

    if (args.idempotency_key) {
      const existing = await this.db<Order[]>`
        SELECT order_id, project_id, revision_id, quote_id, created_at, status, quote, idempotency_key, customer, delivery
        FROM orders
        WHERE idempotency_key = ${args.idempotency_key}
      `;
      if (existing[0]) return existing[0];
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

    await this.db`
      INSERT INTO orders (order_id, project_id, revision_id, quote_id, created_at, status, quote, idempotency_key, customer, delivery)
      VALUES (
        ${order.order_id},
        ${order.project_id},
        ${order.revision_id},
        ${order.quote_id},
        ${order.created_at},
        ${order.status},
        ${order.quote},
        ${order.idempotency_key ?? null},
        ${order.customer},
        ${order.delivery}
      )
    `;

    return order;
  }

  async get_order(project_id: string, order_id: string): Promise<Order | null> {
    const rows = await this.db<Order[]>`
      SELECT order_id, project_id, revision_id, quote_id, created_at, status, quote, idempotency_key, customer, delivery
      FROM orders
      WHERE project_id = ${project_id} AND order_id = ${order_id}
    `;
    return rows[0] ?? null;
  }

  async find_order(order_id: string): Promise<Order | null> {
    const rows = await this.db<Order[]>`
      SELECT order_id, project_id, revision_id, quote_id, created_at, status, quote, idempotency_key, customer, delivery
      FROM orders
      WHERE order_id = ${order_id}
    `;
    return rows[0] ?? null;
  }
}
