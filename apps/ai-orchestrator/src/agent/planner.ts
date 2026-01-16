import type { proposed_patch } from "@planforge/plugin-sdk";

export type PlanResult =
  | { ok: true; patch: proposed_patch; message: string }
  | { ok: false; error: string };

function parse_number(value: string): number | null {
  const normalized = value.replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return Math.round(num);
}

function extract_first_object_x(state: any): number | null {
  const x = state?.layout?.objects?.[0]?.transform_mm?.position_mm?.x;
  return typeof x === "number" ? x : null;
}

export function plan_patch(command: string, kitchen_state: unknown): PlanResult {
  const state = kitchen_state as any;
  const current_x = extract_first_object_x(state);
  if (current_x === null) {
    return { ok: false, error: "First object X not found" };
  }

  const patterns: Array<{ regex: RegExp; mode: "set" | "delta" }> = [
    { regex: /move first object x to\s*([+-]?\d+(?:[.,]\d+)?)/i, mode: "set" },
    { regex: /set first object x\s*([+-]?\d+(?:[.,]\d+)?)/i, mode: "set" },
    { regex: /move first object x by\s*([+-]?\d+(?:[.,]\d+)?)/i, mode: "delta" },
    { regex: /поставь x\s*([+-]?\d+(?:[.,]\d+)?)/i, mode: "set" },
    { regex: /сдвинь x на\s*([+-]?\d+(?:[.,]\d+)?)/i, mode: "delta" },
    { regex: /сдвинь первый модуль на x\s*([+-]?\d+(?:[.,]\d+)?)/i, mode: "set" }
  ];

  for (const entry of patterns) {
    const match = command.match(entry.regex);
    if (!match) continue;
    const parsed = parse_number(match[1]);
    if (parsed === null) {
      return { ok: false, error: "Invalid number in command" };
    }

    const target = entry.mode === "delta" ? current_x + parsed : parsed;
    const patch: proposed_patch = {
      ops: [
        {
          op: "replace",
          path: "/layout/objects/0/transform_mm/position_mm/x",
          value: target
        }
      ],
      reason: `Set first object X to ${target}`,
      source: "agent"
    };

    return { ok: true, patch, message: patch.reason ?? "" };
  }

  return { ok: false, error: "Command not understood" };
}
