import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildTemplate,
  exportCsv,
  renderReportHtml,
  exportReport,
  validateReportDocument,
} from "../../src/reports/index.js";
import { startStudio } from "../../src/server/index.js";
import { inflateRawSync } from "node:zlib";

const data = {
  invoice: {
    number: "INV-1",
    customerName: "PT Contoh",
    subtotal: 100,
    tax: 11,
    total: 111,
  },
  lines: [
    { description: "Jasa", quantity: 1, unitPrice: 100, amount: 100 },
    { description: "=1+1", quantity: 1, unitPrice: 0, amount: 0 },
  ],
};

test("parameter defaults and sample overrides resolve consistently in HTML and PDF", () => {
  const document = buildTemplate("invoice");
  document.parameters = [{ id: "customer", type: "string", required: false, defaultValue: "Default customer" }];
  const field = document.bands.flatMap((band) => band.elements).find((element) => element.type === "field")!;
  field.bindings = { path: "parameters.customer" };
  delete field.props.expression;
  for (const [sample, expected] of [[{}, "Default customer"], [{ parameters: { customer: "Override customer" } }, "Override customer"]] as const) {
    assert.match(renderReportHtml(document, { data: sample }), new RegExp(expected));
    assert.match(Buffer.from(exportReport(document, "pdf", sample).bytes).toString("latin1"), new RegExp(expected));
  }
  field.props.expression = "parameters.customer";
  assert.match(renderReportHtml(document, { data: {} }), /Default customer/);
  assert.match(Buffer.from(exportReport(document, "pdf", {}).bytes).toString("latin1"), /Default customer/);
});

test("export warns for missing or incorrectly typed parameters without showing their values", () => {
  const document = buildTemplate("invoice");
  document.parameters = [{ id: "amount", type: "number", required: true }, { id: "day", type: "date", required: false }];
  const missing = exportReport(document, "pdf");
  assert.ok(missing.warnings.some((warning) => warning.includes("Required parameter amount")));
  const invalid = exportReport(document, "pdf", { parameters: { amount: "not a number", day: "2026-02-30" } });
  assert.equal(invalid.warnings.filter((warning) => warning.includes("must be")).length, 2);
  assert.ok(invalid.warnings.every((warning) => !warning.includes("not a number")));
  const valid = exportReport(document, "pdf", { parameters: { amount: "123.45", day: "2026-02-28" } });
  assert.ok(valid.warnings.every((warning) => !warning.includes("$.parameters")));
});

test("financial table uses separate PDF cells and exact formatted values", () => {
  const document = buildTemplate("invoice");
  document.locale = "id-ID";
  const table = document.bands.flatMap((band) => band.elements).find((element) => element.type === "table")!;
  table.box.width = 30;
  table.props.columns = [
    { key: "name", label: "Item", width: 50 },
    { key: "amount", label: "Amount", width: 100, align: "right", format: "decimal", decimals: 2 },
  ];
  table.props.tableHeaderColor = "#112233";
  const sample = { lines: [{ name: "A", amount: "9007199254740993.555" }] };
  const pdf = exportReport(document, "pdf", sample);
  const content = Buffer.from(pdf.bytes).toString("latin1");
  assert.match(content, /\(9\.007\.199\.254\.740\.993,56\)/);
  assert.match(content, /0\.067 0\.133 0\.200 rg/);
  assert.match(content, / re S Q/);
  assert.match(renderReportHtml(document, { data: sample }), /9\.007\.199\.254\.740\.993,56/);
  assert.ok(pdf.warnings.some((warning) => /table cell\(s\) may be clipped/.test(warning)));
});

test("PDF and HTML preserve body merges without hiding later rows", () => {
  const document = buildTemplate("invoice");
  const table = document.bands.flatMap((band) => band.elements).find((element) => element.type === "table")!;
  table.props.columns = [{ key: "a", label: "A" }, { key: "b", label: "B" }];
  table.props.merges = [{ row: 0, col: 0, rowSpan: 2, colSpan: 2 }];
  const sample = { lines: [{ a: "MERGE_ORIGIN", b: "HIDDEN_ONE" }, { a: "HIDDEN_TWO", b: "HIDDEN_THREE" }, { a: "LATER_ROW", b: "LATER_VALUE" }] };
  const html = renderReportHtml(document, { data: sample });
  const pdf = Buffer.from(exportReport(document, "pdf", sample).bytes).toString("latin1");
  assert.match(html, /colspan="2" rowspan="2"/);
  for (const output of [html, pdf]) {
    assert.match(output, /MERGE_ORIGIN/);
    assert.match(output, /LATER_ROW/);
    assert.doesNotMatch(output, /HIDDEN_ONE|HIDDEN_TWO|HIDDEN_THREE/);
  }
});

test("static table rows render without a dataset and bound data takes precedence", () => {
  const document = buildTemplate("invoice");
  const table = document.bands.flatMap((band) => band.elements).find((element) => element.type === "table")!;
  table.props.staticRows = [{ description: "STATIC_ROW", amount: "-1.255" }];
  table.bindings = { path: "" };
  assert.match(renderReportHtml(document, { data: {} }), /STATIC_ROW/);
  assert.match(Buffer.from(exportReport(document, "pdf", {}).bytes).toString("latin1"), /STATIC_ROW/);
  table.bindings = { path: "lines" };
  const output = renderReportHtml(document, { data: { lines: [{ description: "BOUND_ROW" }] } });
  assert.match(output, /BOUND_ROW/);
  assert.doesNotMatch(output, /STATIC_ROW/);
});

test("PDF warns when rich formatting cannot be rendered", () => {
  const document = buildTemplate("invoice");
  const title = document.bands.flatMap((band) => band.elements).find((element) => element.type === "text")!;
  title.props.underline = true;
  title.props.rotation = 5;
  title.props.list = "number";
  const result = exportReport(document, "pdf");
  assert.ok(result.warnings.some((warning) => /underline.*rotation/.test(warning)));
});

test("box fill and border colors render in both PDF and HTML", () => {
  const document = buildTemplate("invoice");
  document.bands[0]!.elements.push({ id: "color-box", type: "rect", box: { x: 10, y: 2, width: 20, height: 8 }, props: { background: "#aabbcc", borderColor: "#123456", borderWidth: 0.5 } });
  const html = renderReportHtml(document);
  const pdf = Buffer.from(exportReport(document, "pdf").bytes).toString("latin1");
  assert.match(html, /border:0\.5mm solid #123456;background:#aabbcc/);
  assert.match(pdf, /0\.667 0\.733 0\.800 rg .* re f Q/);
  assert.match(pdf, /0\.071 0\.204 0\.337 RG .* re S Q/);
});

test("table body fill and border match configured PDF and HTML colors", () => {
  const document = buildTemplate("invoice");
  const table = document.bands.flatMap((band) => band.elements).find((element) => element.type === "table")!;
  table.props.background = "#aabbcc";
  table.props.tableBorderColor = "#123456";
  table.props.tableBorderWidth = 0.5;
  const pdf = Buffer.from(exportReport(document, "pdf", data).bytes).toString("latin1");
  const html = renderReportHtml(document, { data });
  assert.match(html, /border:0\.5mm solid #123456/);
  assert.match(html, /background:#aabbcc/);
  assert.match(pdf, /0\.667 0\.733 0\.800 rg .* re f Q/);
  assert.match(pdf, /0\.071 0\.204 0\.337 RG .* re S Q/);
});

test("PDF embeds an imported transparent PNG with fit, border and background", () => {
  const document = buildTemplate("invoice");
  const image = document.bands.flatMap((band) => band.elements).find((element) => element.type === "image")!;
  image.props.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  image.props.fit = "cover";
  image.props.background = "#112233";
  image.props.borderColor = "#445566";
  image.props.borderWidth = 1;
  const result = exportReport(document, "pdf");
  const pdf = Buffer.from(result.bytes).toString("latin1");
  assert.match(pdf, /\/Subtype \/Image/);
  assert.match(pdf, /\/SMask \d+ 0 R/);
  assert.match(pdf, /\/Im1 Do/);
  assert.match(pdf, /re W n/);
  assert.match(pdf, /0\.067 0\.133 0\.200 rg/);
  assert.ok(!result.warnings.some((warning) => /image\(s\) could not/.test(warning)));
});

test("image crop position matches HTML and changes the PDF image placement", () => {
  const document = buildTemplate("invoice");
  const image = document.bands.flatMap((band) => band.elements).find((element) => element.type === "image")!;
  image.props.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  image.props.fit = "cover";
  image.box.width = 50;
  image.box.height = 20;
  image.props.positionX = 0;
  image.props.positionY = 0;
  const first = Buffer.from(exportReport(document, "pdf").bytes).toString("latin1").match(/re W n ([^\n]+) cm \/Im1 Do/)?.[1];
  image.props.positionY = 100;
  const second = Buffer.from(exportReport(document, "pdf").bytes).toString("latin1").match(/re W n ([^\n]+) cm \/Im1 Do/)?.[1];
  assert.ok(first && second);
  assert.notEqual(first, second);
  assert.match(renderReportHtml(document), /object-position:0% 100%/);
});

test("PDF reports unsupported images rather than silently dropping them", () => {
  const document = buildTemplate("invoice");
  const image = document.bands.flatMap((band) => band.elements).find((element) => element.type === "image")!;
  image.props.src = "data:image/webp;base64,QUJDRA==";
  const result = exportReport(document, "pdf");
  assert.ok(result.warnings.some((warning) => /image\(s\) could not be rendered/.test(warning)));
});

test("CSV export writes table headers and rows with injection protection", () => {
  const csv = exportCsv(buildTemplate("invoice"), data);
  assert.match(csv, /Deskripsi,Qty,Harga,Jumlah/);
  assert.match(csv, /Jasa,1/);
  assert.match(csv, /'=1\+1/, "formula-leading cell is neutralised");
  assert.equal(csv.includes("\n\n"), false);
});

test("PDF export produces a valid, dependency-free document", () => {
  const result = exportReport(buildTemplate("invoice"), "pdf", data);
  assert.equal(result.filename, "invoice-faktur.pdf");
  assert.equal(result.mime, "application/pdf");
  const text = Buffer.from(result.bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.match(text, /\/Type \/Catalog/);
  assert.match(text, /startxref/);
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.match(text, /INVOICE/);
});

test("HTML export renders the native print document", () => {
  const result = exportReport(buildTemplate("receipt"), "html", {});
  assert.match(result.filename, /\.html$/);
  assert.match(Buffer.from(result.bytes).toString("utf8"), /@page \{ size: 210mm 297mm/);
});

test("XLSX and DOCX exports are valid OOXML zip containers", () => {
  const xlsx = exportReport(buildTemplate("invoice"), "xlsx", data);
  assert.match(xlsx.filename, /\.xlsx$/);
  assert.equal(Buffer.from(xlsx.bytes.subarray(0, 2)).toString("latin1"), "PK");
  const xlsxText = Buffer.from(xlsx.bytes).toString("latin1");
  assert.match(xlsxText, /xl\/worksheets\/sheet1\.xml/);
  assert.match(xlsxText, /\[Content_Types\]\.xml/);

  const docx = exportReport(buildTemplate("invoice"), "docx", data);
  assert.match(docx.filename, /\.docx$/);
  assert.equal(Buffer.from(docx.bytes.subarray(0, 2)).toString("latin1"), "PK");
  const docxText = Buffer.from(docx.bytes).toString("latin1");
  assert.match(docxText, /word\/document\.xml/);
});

test("PDF follows the same pagination as the HTML renderer", () => {
  const document = buildTemplate("loanSchedule");
  const data = {
    contracts: [{ contractNumber: "K-1" }],
    schedule: Array.from({ length: 90 }, (_, index) => ({
      contractNumber: "K-1",
      dueDate: `2026-01-${(index % 28) + 1}`,
      principal: 1000,
      interest: 100,
      penalty: 0,
      total: 1100,
    })),
  };
  const result = exportReport(document, "pdf", data);
  const text = Buffer.from(result.bytes).toString("latin1");
  const count = Number(/\/Count (\d+)/.exec(text)?.[1] ?? "0");
  assert.ok(count > 1, `expected multiple PDF pages, got ${count}`);
  assert.match(text, /Page 2 of \d+/);
});

test("PDF positions the first body band below the page header", () => {
  const document = buildTemplate("invoice");
  const header = document.bands.find((band) => band.kind === "pageHeader")!;
  const body = document.bands.find((band) => band.kind === "reportTitle")!;
  const first = header.elements.find((element) => element.type === "text")!;
  const second = body.elements.find((element) => element.type === "text")!;
  first.box.x = second.box.x = 0;
  first.box.y = second.box.y = 0;
  first.props.text = "HEADER_PROBE";
  second.props.text = "BODY_PROBE";
  const pdf = Buffer.from(exportReport(document, "pdf", {}).bytes).toString("latin1");
  const position = (label: string) => Number(new RegExp(` ([\\d.]+) Td \\(${label}\\)`).exec(pdf)?.[1]);
  assert.ok(position("HEADER_PROBE") > position("BODY_PROBE"));
  assert.ok(position("HEADER_PROBE") - position("BODY_PROBE") >= header.height * 72 / 25.4 - 0.1);
});

test("PDF places each band at its paginated vertical position", () => {
  const result = exportReport(buildTemplate("invoice"), "pdf", data);
  const text = Buffer.from(result.bytes).toString("latin1");
  const positions = [...text.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) Td/g)].map(
    (match) => Number(match[2]),
  );
  const distinct = new Set(positions.map((value) => value.toFixed(2)));
  assert.ok(distinct.size >= 4, `expected distinct baselines, got ${distinct.size}`);
  const sorted = [...distinct].map(Number).sort((a, b) => b - a);
  assert.ok(sorted[0]! - sorted[sorted.length - 1]! > 5, "bands span multiple baselines");
});

test("exports report dropped fidelity explicitly", () => {
  const document = buildTemplate("dashboard");
  const pdf = exportReport(document, "pdf", {});
  assert.ok(pdf.warnings.some((warning) => /chart elements are not rendered/.test(warning)));

  const multiTable = buildTemplate("statement");
  multiTable.bands = multiTable.bands.map((band) =>
    band.id === "band-footer"
      ? {
          ...band,
          elements: [
            ...band.elements,
            {
              id: "el-second-table",
              type: "table",
              box: { x: 0, y: 0, width: 40, height: 10 },
              props: { columns: [{ key: "a", label: "A" }] },
            },
          ],
        }
      : band,
  );
  const xlsx = exportReport(multiTable, "xlsx", {});
  assert.ok(xlsx.warnings.some((warning) => /only the first table/.test(warning)));
});

test("unsupported export formats fail loudly", () => {
  assert.throws(
    () => exportReport(buildTemplate("invoice"), "pptx" as never, data),
    /not implemented/,
  );
});

test("exported documents still validate as native sources", () => {
  const document = buildTemplate("statement");
  const validation = validateReportDocument(document);
  assert.equal(validation.ok, true);
  exportReport(document, "csv", {});
  exportReport(document, "pdf", {});
});

test("report API exports base64 bytes over the session capability", async () => {
  const recentDirectory = await mkdtemp(path.join(os.tmpdir(), "uiux-export-"));
  const reportDirectory = await mkdtemp(path.join(os.tmpdir(), "uiux-export-reports-"));
  const studio = await startStudio({ recentDirectory });
  try {
    const session = (await (await fetch(`${studio.url}/api/session`)).json()) as { token: string };
    const headers = {
      "content-type": "application/json",
      origin: studio.url,
      "x-uiux-token": session.token,
    };
    const call = async (route: string, body: object) => {
      const response = await fetch(`${studio.url}/api/reports/${route}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      return { status: response.status, data: (await response.json()) as any };
    };
    await call("root", { path: reportDirectory });
    const created = await call("create", { templateId: "invoice", file: "invoice.report.json" });
    assert.equal(created.status, 200);

    const exported = await call("export", { document: created.data.document, format: "pdf" });
    assert.equal(exported.status, 200, JSON.stringify(exported.data));
    assert.equal(exported.data.mime, "application/pdf");
    const bytes = Buffer.from(exported.data.base64, "base64");
    assert.ok(bytes.subarray(0, 8).toString("latin1").startsWith("%PDF-1.4"));

    const unsupported = await call("export", { document: created.data.document, format: "pptx" });
    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.data.code, "UNSUPPORTED_FORMAT");
  } finally {
    await studio.close();
    await rm(recentDirectory, { recursive: true, force: true });
    await rm(reportDirectory, { recursive: true, force: true });
  }
});

test("PDF evaluates group expressions like HTML instead of dropping totals", () => {
  const document = buildTemplate("loanSchedule");
  const schedule = [
    { contractNumber: "K-1", dueDate: "2026-01-01", principal: 1000000, interest: 0, penalty: 0, total: 1000000 },
    { contractNumber: "K-1", dueDate: "2026-02-01", principal: 1000000, interest: 0, penalty: 0, total: 1000000 },
  ];
  const data = { contracts: [{ contractNumber: "K-1" }], schedule };
  const html = renderReportHtml(document, { data });
  const pdf = Buffer.from(exportReport(document, "pdf", data).bytes).toString("latin1");
  assert.match(html, /2\.000\.000/);
  assert.match(pdf, /2\.000\.000/, "PDF carries the same formatted group total");
});

test("PDF keeps Latin-1 accents and flags characters it cannot represent", () => {
  const document = buildTemplate("invoice");
  const subtitle = document.bands[0].elements.find((element) => element.id === "el-subtitle")!;
  subtitle.props.text = "Café ✓";
  const result = exportReport(document, "pdf", {});
  const pdf = Buffer.from(result.bytes).toString("latin1");
  assert.match(pdf, /Café/);
  assert.match(pdf, /\?/);
  assert.ok(result.warnings.some((warning) => /Latin-1|latin-1/.test(warning)));
});

test("PDF warns for unsupported characters in rendered field and table data", () => {
  const document = buildTemplate("invoice");
  const result = exportReport(document, "pdf", {
    invoice: { number: "REF-✓", customerName: "Café" },
    lines: [{ description: "Baris ✓", quantity: 1, unitPrice: 2, amount: 2 }],
  });
  const pdf = Buffer.from(result.bytes).toString("latin1");
  assert.match(pdf, /REF-\?/);
  assert.match(pdf, /Baris \?/);
  assert.ok(result.warnings.some((warning) => /2 unsupported character/.test(warning)));
  const safe = exportReport(document, "pdf", { invoice: { number: "REF-1" }, lines: [] });
  assert.ok(!safe.warnings.some((warning) => /unsupported character/.test(warning)));
});

function readZipEntry(zip: Buffer, name: string): string {
  let offset = 0;
  while (offset + 30 <= zip.length) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) break;
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const entryName = zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (entryName === name) {
      return method === 8
        ? inflateRawSync(data).toString("utf8")
        : data.toString("utf8");
    }
    offset = dataStart + compressedSize;
  }
  throw new Error(`zip entry ${name} not found`);
}

test("XLSX keeps numeric-looking identifiers as text", () => {
  const document = buildTemplate("invoice");
  document.datasets = [{ id: "lines" }];
  const data = {
    invoice: {},
    lines: [{ description: "001234", quantity: 1, unitPrice: 5000, amount: 5000 }],
  };
  const xlsx = exportReport(document, "xlsx", data);
  const sheet = readZipEntry(Buffer.from(xlsx.bytes), "xl/worksheets/sheet1.xml");
  assert.match(sheet, />001234</);
  assert.match(sheet, /t="inlineStr"/);
  assert.ok(!/<v>1234<\/v>/.test(sheet));
});
