import type { severity } from "./types";

export interface violation {
  code: string;
  severity: severity;
  message: string;
  object_ids: string[];
  details?: Record<string, unknown>;
}
