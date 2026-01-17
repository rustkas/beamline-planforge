import { createHash } from "node:crypto";

type money = { currency: string; amount: number };

export type export_artifact = {
  id: string;
  kind: "inline";
  name: string;
  mime: string;
  sha256: string;
  content?: unknown;
  bytes_base64?: string;
};

function sha256_hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function to_base64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

function build_bom(items: Array<{ catalog_item_id: string; qty: number }>): Array<{ sku: string; qty: number }> {
  return items.map((it) => ({ sku: it.catalog_item_id, qty: it.qty }));
}

function build_cut_list(items: Array<{ catalog_item_id: string; dims_mm: { width: number; depth: number; height: number } }>): string {
  const header = "sku,width_mm,depth_mm,height_mm";
  const rows = items.map((it) => `${it.catalog_item_id},${it.dims_mm.width},${it.dims_mm.depth},${it.dims_mm.height}`);
  return [header, ...rows].join("\n");
}

export function generate_exports(args: {
  kitchen_state: any;
  quote?: { currency: string; total: money; items: Array<{ code: string; title: string; amount: money }> };
}): export_artifact[] {
  const objects = Array.isArray(args.kitchen_state?.layout?.objects) ? args.kitchen_state.layout.objects : [];
  const catalog_items = objects.map((obj: any) => ({
    id: obj.id,
    catalog_item_id: obj.catalog_item_id,
    dims_mm: obj.dims_mm,
    material_slots: obj.material_slots ?? {}
  }));

  const client_spec = {
    project_id: args.kitchen_state?.project?.project_id ?? "unknown",
    revision_id: args.kitchen_state?.project?.revision_id ?? "unknown",
    room: args.kitchen_state?.room?.size_mm ?? {},
    modules: catalog_items.map((it: any) => ({
      id: it.id,
      sku: it.catalog_item_id,
      dims_mm: it.dims_mm,
      materials: it.material_slots
    })),
    quote: args.quote ?? null
  };

  const production_spec = {
    modules: catalog_items.map((it: any) => ({
      id: it.id,
      sku: it.catalog_item_id,
      dims_mm: it.dims_mm,
      material_slots: it.material_slots
    }))
  };

  const bom_items = build_bom(
    catalog_items.map((it: any) => ({ catalog_item_id: it.catalog_item_id, qty: 1 }))
  );
  const cut_list_csv = build_cut_list(
    catalog_items.map((it: any) => ({
      catalog_item_id: it.catalog_item_id,
      dims_mm: it.dims_mm
    }))
  );

  const json_client = JSON.stringify(client_spec);
  const json_production = JSON.stringify(production_spec);
  const json_bom = JSON.stringify({ items: bom_items });

  const pdf_stub = `PlanForge PDF stub\nProject: ${client_spec.project_id}\nRevision: ${client_spec.revision_id}\n`;

  return [
    {
      id: "client_spec",
      kind: "inline",
      name: "client_spec.json",
      mime: "application/json",
      sha256: sha256_hex(json_client),
      content: client_spec
    },
    {
      id: "production_spec",
      kind: "inline",
      name: "production_spec.json",
      mime: "application/json",
      sha256: sha256_hex(json_production),
      content: production_spec
    },
    {
      id: "bom",
      kind: "inline",
      name: "bom.json",
      mime: "application/json",
      sha256: sha256_hex(json_bom),
      content: { items: bom_items }
    },
    {
      id: "cut_list",
      kind: "inline",
      name: "cut_list.csv",
      mime: "text/csv",
      sha256: sha256_hex(cut_list_csv),
      content: cut_list_csv
    },
    {
      id: "pdf_stub",
      kind: "inline",
      name: "project.pdf",
      mime: "application/pdf",
      sha256: sha256_hex(pdf_stub),
      bytes_base64: to_base64(pdf_stub)
    }
  ];
}
