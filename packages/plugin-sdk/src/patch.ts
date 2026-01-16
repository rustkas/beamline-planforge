export type patch_op = "add" | "remove" | "replace" | "move" | "copy" | "test";

export interface json_patch_op {
  op: patch_op;
  path: string;
  value?: unknown;
  from?: string;
}

export interface proposed_patch {
  ops: json_patch_op[];
  reason?: string;
  source?: "user" | "agent" | "plugin";
}
