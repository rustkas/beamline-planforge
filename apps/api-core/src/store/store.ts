import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type RevisionMeta = {
  source: "user" | "agent" | "plugin" | "system";
  reason?: string;
};

export type Revision = {
  revision_id: string;
  project_id: string;
  created_at: string;
  kitchen_state: unknown;
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
};

export class InMemoryStore {
  private projects = new Map<string, Project>();
  private revisions = new Map<string, Revision[]>();
  private persist_path: string | null;

  constructor(persist_path: string | null) {
    this.persist_path = persist_path;
  }

  create_project(initial_state: unknown, meta: RevisionMeta): { project: Project; revision: Revision } {
    const project_id = `proj_${crypto.randomUUID().replace(/-/g, "")}`;
    const revision_id = `rev_${crypto.randomUUID().replace(/-/g, "")}`;
    const created_at = new Date().toISOString();

    const project: Project = { project_id, created_at, latest_revision_id: revision_id };
    const revision: Revision = {
      revision_id,
      project_id,
      created_at,
      kitchen_state: initial_state,
      meta
    };

    this.projects.set(project_id, project);
    this.revisions.set(project_id, [revision]);
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
    const revision: Revision = {
      revision_id,
      project_id,
      created_at,
      kitchen_state,
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

  private async persist(project_id: string): Promise<void> {
    if (!this.persist_path) return;
    const project = this.projects.get(project_id);
    if (!project) return;
    const revisions = this.revisions.get(project_id) ?? [];
    const snapshot: ProjectSnapshot = { project, revisions };

    await mkdir(this.persist_path, { recursive: true });
    const file_path = path.join(this.persist_path, `${project_id}.json`);
    await writeFile(file_path, JSON.stringify(snapshot, null, 2));
  }
}

export function create_store(): InMemoryStore {
  const persist_path = process.env.PLANFORGE_PERSIST_PATH ?? null;
  return new InMemoryStore(persist_path && persist_path.length > 0 ? persist_path : null);
}
