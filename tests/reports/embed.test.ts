import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMBED_USAGE,
  REPORT_SDK_VERSION,
  createEmptyReport,
  createReport,
  exportDocument,
  listTemplates,
  parseDocument,
  renderReport,
  serializeDocument,
  validateDocument,
} from "../../src/reports/embed.js";

test("embedded SDK lists templates and builds a valid report", () => {
  assert.equal(REPORT_SDK_VERSION, "0.1.0");
  const templates = listTemplates();
  assert.ok(templates.some((template) => template.id === "invoice"));
  const document = createReport("invoice", { locale: "en-US" });
  assert.equal(document.kind, "react-uiux-report");
  assert.equal(document.locale, "en-US");
  assert.equal(validateDocument(document).ok, true);
  assert.equal(validateDocument(createEmptyReport()).ok, true);
});

test("embedded SDK renders and exports without network or filesystem", async () => {
  const document = createReport("receipt");
  const data = { payment: { reference: "PAY-1", amount: 125000 } };
  const html = renderReport(document, data);
  assert.match(html, /BUKTI PEMBAYARAN/);
  assert.match(html, /125[.,]000/);

  const csv = await exportDocument(document, "csv", data);
  assert.match(csv.filename, /\.csv$/);
  assert.ok(EMBED_USAGE.browserSafeFormats.includes("html"));
  assert.ok(EMBED_USAGE.serverOnlyFormats.includes("pdf"));
});

test("embedded SDK round trips serialized documents and rejects unknown templates", () => {
  const document = createReport("statement");
  const text = serializeDocument(document);
  const parsed = parseDocument(text);
  assert.equal(parsed.title, document.title);
  assert.throws(() => createReport("does-not-exist"), /Unknown report template/);

  assert.throws(() => parseDocument("{}"), /kind|schemaVersion/);
});

test("the documented package subpath exposes the built SDK", async () => {
  const { existsSync } = await import("node:fs");
  if (!existsSync("dist/reports/embed.js")) {
    // Build first: npm run build. The package subpath is a build artifact.
    return;
  }
  const sdk = (await import("react-uiux-tool/reports")) as Record<string, unknown>;
  for (const name of [
    "createReport",
    "renderReport",
    "exportDocument",
    "validateDocument",
    "listTemplates",
  ]) {
    assert.equal(typeof sdk[name], "function", `${name} must be exported by the package subpath`);
  }
});
