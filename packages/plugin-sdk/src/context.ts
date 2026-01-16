import type { planforge_version, plugin_id, project_id, revision_id } from "./types";

export interface host_context {
  host_version: planforge_version;
  plugin_id: plugin_id;
  project_id?: project_id;
  revision_id?: revision_id;
  locale?: string;
}
