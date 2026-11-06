import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplate,
  renderReportHtml,
} from "../../src/reports/index.js";

const sampleData = {
  invoice: {
    number: "INV-2026-0001",
    issuedAt: "2026-11-06",
    customerName: "PT Contoh Sintetis",
    subtotal: 1250000,
    tax: 137500,
    total: 1387500,
  },
  lines: [
    { description: "Jasa implementasi", quantity: 1, unitPrice: 1250000, amount: 1250000 },
  ],
};

test("rendered HTML declares the page size and margins from the document", () => {
  const document = buildTemplate("invoice");
  const html = renderReportHtml(document);
  assert.match(html, /@page \{ size: 210mm 297mm; margin: 0; \}/);
  assert.match(html, /padding: 16mm 16mm 16mm 16mm/);
  assert.match(html, /<title>Invoice \/ Faktur<\/title>/);
});

test("sample rows and totals appear in the rendered table", () => {
  const html = renderReportHtml(buildTemplate("invoice"), { data: sampleData });
  assert.match(html, /INV-2026-0001/);
  assert.match(html, /Jasa implementasi/);
  assert.match(html, /1[.,]250[.,]000/);
  assert.match(html, /1387500|1[.,]387[.,]500/);
});

test("document text is escaped and never becomes executable markup", () => {
  const document = buildTemplate("receipt");
  const title = document.bands[0].elements[0];
  title.props.text = "<script>alert('xss')</script>";
  const html = renderReportHtml(document);
  assert.ok(!html.includes("<script>alert"), "raw script tag must not appear");
  assert.match(html, /&lt;script&gt;alert\(&#39;xss&#39;\)&lt;\/script&gt;/);
});

test("unsafe image sources render as an empty accessible placeholder", () => {
  const document = buildTemplate("invoice");
  const logo = document.bands[0].elements[0];
  logo.props.src = "javascript:alert(1)";
  const html = renderReportHtml(document);
  assert.ok(!html.includes("javascript:"), "unsafe URL must not be emitted");
  assert.match(html, /el-image-empty/);
  assert.match(html, /role="img"/);
});

test("embedded base64 images are allowed", () => {
  const document = buildTemplate("invoice");
  const logo = document.bands[0].elements[0];
  logo.props.src = "data:image/png;base64,iVBORw0KGgo=";
  const html = renderReportHtml(document);
  assert.match(html, /<img alt="Company logo" src="data:image\/png;base64,iVBORw0KGgo="/);
});

test("rendering is deterministic", () => {
  const document = buildTemplate("statement");
  assert.equal(
    renderReportHtml(document, { data: {} }),
    renderReportHtml(document, { data: {} }),
  );
});

test("font values cannot inject attributes into exported HTML", () => {
  const document = buildTemplate("invoice");
  const title = document.bands[0].elements.find((element) => element.id === "el-title")!;
  title.props.font = 'x" onmouseover="alert(1)" data-x="';
  const html = renderReportHtml(document);
  assert.ok(!html.includes("onmouseover="), "no injected attribute survives");
  assert.ok(!html.includes('data-x="'), "no injected data attribute survives");
  assert.match(html, /font-family:x onmouseover/);
});

test("palette formatting renders underline, strikethrough, borders, rotation and lists", () => {
  const document = buildTemplate("receipt");
  const title = document.bands[0].elements[0]!;
  title.props.underline = true;
  title.props.strike = true;
  title.props.borderWidth = 0.5;
  title.props.borderColor = "#112233";
  title.props.rotation = 8;
  title.props.text = "Baris satu\nBaris dua";
  title.props.list = "number";
  const html = renderReportHtml(document);
  assert.match(html, /text-decoration:underline line-through/);
  assert.match(html, /border:0\.5mm solid #112233/);
  assert.match(html, /transform:rotate\(8deg\)/);
  assert.match(html, /1\. Baris satu\n2\. Baris dua|1\. Baris satu/);
  assert.match(html, /2\. Baris dua/);
});

test("text wrapping respects the chosen setting in HTML output", () => {
  const document = buildTemplate("receipt");
  const title = document.bands[0].elements[0]!;
  title.props.wrap = false;
  const html = renderReportHtml(document);
  const tag = html.match(new RegExp(`<div class="el el-text" data-id="${title.id}"[^>]*>`))?.[0];
  assert.ok(tag);
  assert.match(tag, /white-space:pre(?:;|\")/);
  assert.doesNotMatch(tag, /white-space:pre-wrap/);
});
