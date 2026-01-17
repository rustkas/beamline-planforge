import { createHash } from "node:crypto";
import { render_pdf_from_html, render_pdf_stub, type pdf_render_mode } from "./pdf";

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

function sha256_hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function to_base64_bytes(input: Uint8Array): string {
  return Buffer.from(input).toString("base64");
}

function build_bom(items: Array<{ catalog_item_id: string; qty: number }>): Array<{ sku: string; qty: number }> {
  return items.map((it) => ({ sku: it.catalog_item_id, qty: it.qty }));
}

function build_cut_list(items: Array<{ catalog_item_id: string; dims_mm: { width: number; depth: number; height: number } }>): string {
  const header = "sku,width_mm,depth_mm,height_mm";
  const rows = items.map((it) => `${it.catalog_item_id},${it.dims_mm.width},${it.dims_mm.depth},${it.dims_mm.height}`);
  return [header, ...rows].join("\n");
}

function make_export_html(args: { client_spec: any; production_spec: any; bom: any; cut_list: string }): string {
  const { client_spec, production_spec, bom, cut_list } = args;
  return `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8" />\n<title>PlanForge Export</title>\n<style>\n  body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }\n  h1 { font-size: 20px; margin-bottom: 6px; }\n  h2 { font-size: 16px; margin-top: 24px; }\n  pre { background: #f3f4f6; padding: 12px; border-radius: 8px; white-space: pre-wrap; }\n</style>\n</head>\n<body>\n  <h1>PlanForge Project Export</h1>\n  <div><strong>Project:</strong> ${client_spec.project_id}</div>\n  <div><strong>Revision:</strong> ${client_spec.revision_id}</div>\n\n  <h2>Client Spec</h2>\n  <pre>${JSON.stringify(client_spec, null, 2)}</pre>\n\n  <h2>Production Spec</h2>\n  <pre>${JSON.stringify(production_spec, null, 2)}</pre>\n\n  <h2>BOM</h2>\n  <pre>${JSON.stringify(bom, null, 2)}</pre>\n\n  <h2>Cut List</h2>\n  <pre>${cut_list}</pre>\n</body>\n</html>`;
}

async function build_pdf(args: { client_spec: any; production_spec: any; bom: any; cut_list: string }): Promise<Uint8Array> {
  const mode = (process.env.EXPORT_PDF_MODE ?? "playwright") as pdf_render_mode;
  const html = make_export_html(args);
  if (mode === "stub") {
    return render_pdf_stub([
      "PlanForge Project Summary",
      `Project: ${args.client_spec.project_id}`,
      `Revision: ${args.client_spec.revision_id}`
    ]);
  }
  return render_pdf_from_html(html);
}

export async function generate_exports(args: {
  kitchen_state: any;
  quote?: { currency: string; total: money; items: Array<{ code: string; title: string; amount: money }> };
}): Promise<export_artifact[]> {
  const objects = Array.isArray(args.kitchen_state?.layout?.objects) ? args.kitchen_state.layout.objects : [];
  const catalog_items = objects.map((obj: any) => ({
    id: obj.id,
    catalog_item_id: obj.catalog_item_id,
    dims_mm: obj.dims_mm,
    material_slots: obj.material_slots ?? {},
    kind: obj.kind ?? "module"
  }));

  const materials_map = new Map<string, number>();
  for (const obj of catalog_items) {
    if (!obj.material_slots) continue;
    for (const mat of Object.values(obj.material_slots)) {
      if (typeof mat !== "string") continue;
      materials_map.set(mat, (materials_map.get(mat) ?? 0) + 1);
    }
  }

  const materials = [...materials_map.entries()].map(([material_id, qty]) => ({ material_id, qty }));
  const modules = catalog_items.filter((it: any) => it.kind === "module");
  const appliances = catalog_items.filter((it: any) => it.kind === "appliance");

  const client_spec = {
    project_id: args.kitchen_state?.project?.project_id ?? "unknown",
    revision_id: args.kitchen_state?.project?.revision_id ?? "unknown",
    room: args.kitchen_state?.room?.size_mm ?? {},
    modules: modules.map((it: any) => ({
      id: it.id,
      sku: it.catalog_item_id,
      dims_mm: it.dims_mm,
      materials: it.material_slots
    })),
    appliances: appliances.map((it: any) => ({
      id: it.id,
      sku: it.catalog_item_id,
      dims_mm: it.dims_mm
    })),
    materials,
    quote: args.quote ?? null
  };

  const production_spec = {
    project_id: client_spec.project_id,
    revision_id: client_spec.revision_id,
    room: client_spec.room,
    modules: modules.map((it: any) => ({
      id: it.id,
      sku: it.catalog_item_id,
      dims_mm: it.dims_mm,
      material_slots: it.material_slots
    })),
    appliances: appliances.map((it: any) => ({
      id: it.id,
      sku: it.catalog_item_id,
      dims_mm: it.dims_mm
    })),
    materials
  };

  const bom_items = build_bom(
    catalog_items.map((it: any) => ({ catalog_item_id: it.catalog_item_id, qty: 1 }))
  );
  const bom_extended = {
    modules: modules.map((it: any) => ({ sku: it.catalog_item_id, qty: 1, dims_mm: it.dims_mm })),
    appliances: appliances.map((it: any) => ({ sku: it.catalog_item_id, qty: 1 })),
    materials
  };
  const cut_list_csv = build_cut_list(
    modules.map((it: any) => ({
      catalog_item_id: it.catalog_item_id,
      dims_mm: it.dims_mm
    }))
  );

  const json_client = JSON.stringify(client_spec);
  const json_production = JSON.stringify(production_spec);
  const json_bom = JSON.stringify({ items: bom_items, extended: bom_extended });

  const pdf_bytes = await build_pdf({
    client_spec,
    production_spec,
    bom: { items: bom_items, extended: bom_extended },
    cut_list: cut_list_csv
  });
  const pdf_base64 = to_base64_bytes(pdf_bytes);

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
      content: { items: bom_items, extended: bom_extended }
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
      sha256: sha256_hex(pdf_bytes),
      bytes_base64: pdf_base64
    }
  ];
}
