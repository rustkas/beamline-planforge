type Patch = {
  ops: Array<{
    op: "add" | "replace";
    path: string;
    value: unknown;
  }>;
  reason: string;
  source: "user";
};

export type material_patch_result = {
  patch: Patch;
  object_id: string;
  object_index: number;
};

function find_object_index(state: any, object_id: string): number {
  const objects = state?.layout?.objects;
  if (!Array.isArray(objects)) return -1;
  return objects.findIndex((obj: any) => obj?.id === object_id);
}

export function build_material_patch(args: {
  kitchen_state: any;
  object_id: string;
  slot: string;
  value: string;
}): material_patch_result | null {
  const index = find_object_index(args.kitchen_state, args.object_id);
  if (index < 0) return null;
  const obj = args.kitchen_state?.layout?.objects?.[index];
  const current = obj?.material_slots ?? {};
  const op: "add" | "replace" = Object.prototype.hasOwnProperty.call(current, args.slot)
    ? "replace"
    : "add";

  return {
    patch: {
      ops: [
        {
          op,
          path: `/layout/objects/${index}/material_slots/${args.slot}`,
          value: args.value
        }
      ],
      reason: `Set material ${args.slot} to ${args.value}`,
      source: "user"
    },
    object_id: args.object_id,
    object_index: index
  };
}
