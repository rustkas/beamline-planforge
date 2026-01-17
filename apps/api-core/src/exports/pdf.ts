export type pdf_render_mode = "playwright" | "stub";

export async function render_pdf_from_html(html: string): Promise<Uint8Array> {
  const mod = await import("playwright");
  const browser = await mod.chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

function pdf_escape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function render_pdf_stub(lines: string[]): Uint8Array {
  const safe_lines = lines.map((line) => pdf_escape(line));
  const text_lines =
    safe_lines.length > 0
      ? safe_lines.map((line) => `(${line}) Tj T*`).join(" ")
      : "(No content) Tj";

  const content_stream = `BT /F1 12 Tf 72 720 Td 14 TL ${text_lines} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content_stream.length} >>\nstream\n${content_stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let offset = chunks[0].length;

  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(offset);
    const obj = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    chunks.push(obj);
    offset += obj.length;
  }

  const xref_start = offset;
  const xref_lines = ["xref\n0 6\n", "0000000000 65535 f \n"];
  for (let i = 1; i <= objects.length; i += 1) {
    const line = `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    xref_lines.push(line);
  }

  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref_start}\n%%EOF\n`;

  chunks.push(xref_lines.join(""));
  chunks.push(trailer);

  return new Uint8Array(Buffer.from(chunks.join(""), "utf8"));
}
