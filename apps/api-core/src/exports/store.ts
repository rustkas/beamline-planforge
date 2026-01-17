import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type export_artifact_input = {
  id: string;
  name: string;
  mime: string;
  sha256: string;
  kind?: string;
  content?: unknown;
  bytes_base64?: string;
  url?: string;
};

export type stored_artifact = {
  id: string;
  name: string;
  mime: string;
  sha256: string;
  size: number;
  download_url?: string;
  url?: string;
};

export type stored_export = {
  export_id: string;
  project_id: string;
  revision_id: string;
  created_at: string;
  artifacts: stored_artifact[];
};

type stored_file = {
  path: string;
  mime: string;
};

const DEFAULT_EXPORTS_DIR = path.join(os.tmpdir(), "planforge-exports");

function export_dir(export_id: string): string {
  return path.join(process.env.EXPORTS_DIR ?? DEFAULT_EXPORTS_DIR, export_id);
}

function to_bytes(artifact: export_artifact_input): Uint8Array | null {
  if (artifact.bytes_base64) {
    return new Uint8Array(Buffer.from(artifact.bytes_base64, "base64"));
  }
  if (typeof artifact.content === "string") {
    return new Uint8Array(Buffer.from(artifact.content, "utf8"));
  }
  if (artifact.content !== undefined) {
    const json = JSON.stringify(artifact.content);
    return new Uint8Array(Buffer.from(json, "utf8"));
  }
  return null;
}

export class ExportStore {
  private exports = new Map<string, stored_export>();
  private files = new Map<string, Map<string, stored_file>>();

  async save_export(args: {
    export_id: string;
    project_id: string;
    revision_id: string;
    artifacts: export_artifact_input[];
  }): Promise<stored_export> {
    const created_at = new Date().toISOString();
    const dir = export_dir(args.export_id);
    await mkdir(dir, { recursive: true });

    const stored_artifacts: stored_artifact[] = [];
    const file_index = new Map<string, stored_file>();

    for (const artifact of args.artifacts) {
      if (artifact.url && !artifact.bytes_base64 && artifact.content === undefined) {
        stored_artifacts.push({
          id: artifact.id,
          name: artifact.name,
          mime: artifact.mime,
          sha256: artifact.sha256,
          size: 0,
          url: artifact.url
        });
        continue;
      }

      const bytes = to_bytes(artifact);
      if (!bytes) continue;

      const filename = `${artifact.id}`;
      const file_path = path.join(dir, filename);
      await writeFile(file_path, bytes);

      stored_artifacts.push({
        id: artifact.id,
        name: artifact.name,
        mime: artifact.mime,
        sha256: artifact.sha256,
        size: bytes.length,
        download_url: `/exports/${args.export_id}/artifacts/${artifact.id}`
      });
      file_index.set(artifact.id, { path: file_path, mime: artifact.mime });
    }

    const stored: stored_export = {
      export_id: args.export_id,
      project_id: args.project_id,
      revision_id: args.revision_id,
      created_at,
      artifacts: stored_artifacts
    };
    this.exports.set(args.export_id, stored);
    this.files.set(args.export_id, file_index);
    return stored;
  }

  get_export(export_id: string): stored_export | null {
    return this.exports.get(export_id) ?? null;
  }

  async get_artifact(export_id: string, artifact_id: string): Promise<{
    ok: boolean;
    status: number;
    bytes?: Uint8Array;
    mime?: string;
  }> {
    const file_index = this.files.get(export_id);
    if (!file_index) return { ok: false, status: 404 };
    const stored = file_index.get(artifact_id);
    if (!stored) return { ok: false, status: 404 };

    try {
      const info = await stat(stored.path);
      if (!info.isFile()) return { ok: false, status: 404 };
      const bytes = await readFile(stored.path);
      return { ok: true, status: 200, bytes: new Uint8Array(bytes), mime: stored.mime };
    } catch {
      return { ok: false, status: 404 };
    }
  }
}
