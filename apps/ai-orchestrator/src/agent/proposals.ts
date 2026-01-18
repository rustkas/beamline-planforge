import type { proposed_patch, violation } from "@planforge/plugin-sdk";

export type proposal_variant = {
  variant_index: number;
  layout_type: "linear" | "l_shape" | "u_shape";
  patch: proposed_patch;
  rationale: Record<string, unknown>;
  metrics: Record<string, unknown>;
  explanation_text?: string;
  violations?: violation[];
};

type layout_object = {
  id: string;
  dims_mm?: { width?: number; depth?: number };
  transform_mm?: { position_mm?: { x?: number; y?: number } };
};

type room_size = { width?: number; depth?: number };

type kitchen_state = {
  room?: { size_mm?: room_size };
  layout?: { objects?: layout_object[] };
};

const GAP_MM = 50;

function get_objects(state: kitchen_state): layout_object[] {
  const objects = state.layout?.objects;
  return Array.isArray(objects) ? objects : [];
}

function dims(obj: layout_object): { width: number; depth: number } {
  return {
    width: typeof obj.dims_mm?.width === "number" ? obj.dims_mm.width : 600,
    depth: typeof obj.dims_mm?.depth === "number" ? obj.dims_mm.depth : 600
  };
}

function position_patch_ops(objects: layout_object[], positions: Array<{ x: number; y: number }>): proposed_patch {
  const ops = objects.map((obj, index) => ({
    op: "replace" as const,
    path: `/layout/objects/${index}/transform_mm/position_mm/x`,
    value: Math.round(positions[index]?.x ?? 0)
  }));

  for (let i = 0; i < objects.length; i += 1) {
    ops.push({
      op: "replace" as const,
      path: `/layout/objects/${i}/transform_mm/position_mm/y`,
      value: Math.round(positions[i]?.y ?? 0)
    });
  }

  return { ops, reason: "layout proposal", source: "agent" };
}

function linear_positions(objects: layout_object[]): Array<{ x: number; y: number }> {
  let cursor = 0;
  return objects.map((obj) => {
    const { width } = dims(obj);
    const pos = { x: cursor, y: 0 };
    cursor += width + GAP_MM;
    return pos;
  });
}

function l_shape_positions(objects: layout_object[]): Array<{ x: number; y: number }> {
  const split = Math.max(1, Math.floor(objects.length / 2));
  const first = objects.slice(0, split);
  const second = objects.slice(split);

  let cursor_x = 0;
  const positions: Array<{ x: number; y: number }> = [];
  for (const obj of first) {
    const { width } = dims(obj);
    positions.push({ x: cursor_x, y: 0 });
    cursor_x += width + GAP_MM;
  }

  let cursor_y = GAP_MM;
  for (const obj of second) {
    const { depth } = dims(obj);
    positions.push({ x: 0, y: cursor_y });
    cursor_y += depth + GAP_MM;
  }

  return positions;
}

function u_shape_positions(objects: layout_object[], room_depth: number): Array<{ x: number; y: number }> {
  const third = Math.max(1, Math.floor(objects.length / 3));
  const first = objects.slice(0, third);
  const second = objects.slice(third, third * 2);
  const third_group = objects.slice(third * 2);

  let cursor_x = 0;
  const positions: Array<{ x: number; y: number }> = [];
  for (const obj of first) {
    const { width } = dims(obj);
    positions.push({ x: cursor_x, y: 0 });
    cursor_x += width + GAP_MM;
  }

  let cursor_y = GAP_MM;
  for (const obj of second) {
    const { depth } = dims(obj);
    positions.push({ x: 0, y: cursor_y });
    cursor_y += depth + GAP_MM;
  }

  let cursor_x_far = 0;
  const far_y = Math.max(0, room_depth - 700);
  for (const obj of third_group) {
    const { width } = dims(obj);
    positions.push({ x: cursor_x_far, y: far_y });
    cursor_x_far += width + GAP_MM;
  }

  return positions;
}

function unique_by_patch(variants: proposal_variant[]): proposal_variant[] {
  const seen = new Set<string>();
  const out: proposal_variant[] = [];
  for (const variant of variants) {
    const key = JSON.stringify(variant.patch.ops);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(variant);
  }
  return out;
}

export function build_variants(state: kitchen_state): proposal_variant[] {
  const objects = get_objects(state);
  const room = state.room?.size_mm;
  const room_depth = typeof room?.depth === "number" ? room.depth : 2600;

  if (objects.length === 0) return [];

  const variants: proposal_variant[] = [];

  const linear = linear_positions(objects);
  variants.push({
    variant_index: 0,
    layout_type: "linear",
    patch: position_patch_ops(objects, linear),
    rationale: { layout_type: "linear", placements: linear },
    metrics: { layout_type: "linear", object_count: objects.length }
  });

  const lshape = l_shape_positions(objects);
  variants.push({
    variant_index: 1,
    layout_type: "l_shape",
    patch: position_patch_ops(objects, lshape),
    rationale: { layout_type: "l_shape", placements: lshape },
    metrics: { layout_type: "l_shape", object_count: objects.length }
  });

  if (objects.length >= 3) {
    const ushape = u_shape_positions(objects, room_depth);
    variants.push({
      variant_index: 2,
      layout_type: "u_shape",
      patch: position_patch_ops(objects, ushape),
      rationale: { layout_type: "u_shape", placements: ushape },
      metrics: { layout_type: "u_shape", object_count: objects.length }
    });
  }

  return unique_by_patch(variants);
}
