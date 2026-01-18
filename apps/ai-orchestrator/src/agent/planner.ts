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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function room_size(state: any): { width: number; depth: number } | null {
  const size = state?.room?.size_mm;
  if (!size || typeof size.width !== "number" || typeof size.depth !== "number") return null;
  return { width: size.width, depth: size.depth };
}

function find_object_by_tag(state: any, tag: string): { index: number; obj: any } | null {
  const objects = state?.layout?.objects;
  if (!Array.isArray(objects)) return null;
  for (let i = 0; i < objects.length; i += 1) {
    const tags = objects[i]?.tags;
    if (Array.isArray(tags) && tags.includes(tag)) {
      return { index: i, obj: objects[i] };
    }
  }
  return null;
}

function object_dims(obj: any): { width: number; depth: number } | null {
  const dims = obj?.dims_mm;
  if (!dims || typeof dims.width !== "number" || typeof dims.depth !== "number") return null;
  return { width: dims.width, depth: dims.depth };
}

function find_opening(state: any, kind: "door" | "window"): any | null {
  const openings = state?.room?.openings;
  if (!Array.isArray(openings)) return null;
  return openings.find((o) => o?.kind === kind) ?? null;
}

function find_utility(state: any, kind: string): any | null {
  const utilities = state?.room?.utilities;
  if (!Array.isArray(utilities)) return null;
  return utilities.find((u) => u?.kind === kind) ?? null;
}

function position_for_wall(args: {
  wall_id: string;
  offset: number;
  obj: any;
  room: { width: number; depth: number };
}): { x: number; y: number } | null {
  const dims = object_dims(args.obj);
  if (!dims) return null;
  const wall = args.wall_id;
  if (wall === "north") {
    return { x: clamp(args.offset, 0, args.room.width - dims.width), y: args.room.depth - dims.depth };
  }
  if (wall === "south") {
    return { x: clamp(args.offset, 0, args.room.width - dims.width), y: 0 };
  }
  if (wall === "west") {
    return { x: 0, y: clamp(args.offset, 0, args.room.depth - dims.depth) };
  }
  if (wall === "east") {
    return { x: args.room.width - dims.width, y: clamp(args.offset, 0, args.room.depth - dims.depth) };
  }
  return null;
}

export function plan_patch(command: string, kitchen_state: unknown): PlanResult {
  const state = kitchen_state as any;
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
    const current_x = extract_first_object_x(state);
    if (current_x === null) {
      return { ok: false, error: "First object X not found" };
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

  if (/move sink near window/i.test(command) || /сдвинь мойку/i.test(command)) {
    const sink = find_object_by_tag(state, "sink");
    const window = find_opening(state, "window");
    const room = room_size(state);
    if (!sink || !window || !room) return { ok: false, error: "Missing sink or window" };
    const pos = position_for_wall({ wall_id: window.wall_id ?? "south", offset: window.offset_mm ?? 0, obj: sink.obj, room });
    if (!pos) return { ok: false, error: "Unable to place sink near window" };
    const patch: proposed_patch = {
      ops: [
        { op: "replace", path: `/layout/objects/${sink.index}/transform_mm/position_mm/x`, value: pos.x },
        { op: "replace", path: `/layout/objects/${sink.index}/transform_mm/position_mm/y`, value: pos.y }
      ],
      reason: "Moved sink near window",
      source: "agent"
    };
    return { ok: true, patch, message: patch.reason ?? "" };
  }

  if (/move hob near vent/i.test(command) || /сдвинь варочную/i.test(command)) {
    const hob = find_object_by_tag(state, "hob");
    const vent = find_utility(state, "vent");
    const room = room_size(state);
    if (!hob || !vent || !room) return { ok: false, error: "Missing hob or vent" };
    let pos: { x: number; y: number } | null = null;
    if (vent.wall_id) {
      pos = position_for_wall({ wall_id: vent.wall_id, offset: vent.offset_mm ?? 0, obj: hob.obj, room });
    } else if (vent.position_mm) {
      const dims = object_dims(hob.obj);
      if (!dims) return { ok: false, error: "Hob dimensions missing" };
      pos = {
        x: clamp(vent.position_mm.x ?? 0, 0, room.width - dims.width),
        y: clamp(vent.position_mm.y ?? 0, 0, room.depth - dims.depth)
      };
    }
    if (!pos) return { ok: false, error: "Unable to place hob near vent" };
    const patch: proposed_patch = {
      ops: [
        { op: "replace", path: `/layout/objects/${hob.index}/transform_mm/position_mm/x`, value: pos.x },
        { op: "replace", path: `/layout/objects/${hob.index}/transform_mm/position_mm/y`, value: pos.y }
      ],
      reason: "Moved hob near vent",
      source: "agent"
    };
    return { ok: true, patch, message: patch.reason ?? "" };
  }

  if (/increase passage/i.test(command) || /увеличь проход/i.test(command)) {
    const room = room_size(state);
    const objects = state?.layout?.objects;
    if (!room || !Array.isArray(objects)) return { ok: false, error: "Missing room or objects" };
    const ops: proposed_patch["ops"] = [];
    for (let i = 0; i < objects.length; i += 1) {
      const obj = objects[i];
      const dims = object_dims(obj);
      if (!dims) continue;
      const current_y = obj?.transform_mm?.position_mm?.y;
      if (typeof current_y !== "number") continue;
      const target_y = current_y === 0 ? clamp(200, 0, room.depth - dims.depth) : current_y;
      if (target_y !== current_y) {
        ops.push({
          op: "replace",
          path: `/layout/objects/${i}/transform_mm/position_mm/y`,
          value: target_y
        });
      }
    }
    if (ops.length === 0) return { ok: false, error: "No passage increase possible" };
    const patch: proposed_patch = {
      ops,
      reason: "Increased passage clearance",
      source: "agent"
    };
    return { ok: true, patch, message: patch.reason ?? "" };
  }

  if (/remove upper cabinets/i.test(command) || /убери верхние шкафы/i.test(command)) {
    const objects = state?.layout?.objects;
    if (!Array.isArray(objects)) return { ok: false, error: "No objects found" };
    const filtered = objects.filter((obj: any) => !(Array.isArray(obj?.tags) && obj.tags.includes("upper")));
    if (filtered.length === objects.length) {
      return { ok: false, error: "No upper cabinets found" };
    }
    const patch: proposed_patch = {
      ops: [
        {
          op: "replace",
          path: "/layout/objects",
          value: filtered
        }
      ],
      reason: "Removed upper cabinets",
      source: "agent"
    };
    return { ok: true, patch, message: patch.reason ?? "" };
  }

  return { ok: false, error: "Command not understood" };
}
