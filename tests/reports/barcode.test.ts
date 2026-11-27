import { test } from "node:test";
import assert from "node:assert/strict";
import * as bwipReference from "@bwip-js/generic";
import { buildTemplate, exportReport, renderReportHtml, validateReportDocument } from "../../src/reports/index.js";
import { reportBarcode } from "../../src/reports/core/barcode.js";
import type { ReportElement } from "../../src/reports/core/types.js";

test("Code 128 and QR share geometry across HTML and PDF and keep quiet zones", () => {
  const report = buildTemplate("blank");
  const element: ReportElement = { id: "stock-code", type: "barcode", box: { x: 4, y: 2, width: 65, height: 20 },
    props: { barcodeKind: "code128", barcodeValue: "STOCK-0123" } };
  report.bands[0]!.elements.push(element);
  const symbol = reportBarcode(element)!;
  assert.equal(symbol.rects[0]!.x, 10);
  assert.ok(symbol.width - Math.max(...symbol.rects.map(rect => rect.x + rect.width)) >= 10);
  assert.match(renderReportHtml(report), /aria-label="Code 128"/);
  for (const barcodeKind of ["code128", "qrcode"]) {
    element.props.barcodeKind = barcodeKind;
    assert.equal(validateReportDocument(report).ok, true);
    const result = exportReport(report, "pdf");
    assert.match(Buffer.from(result.bytes).toString("latin1"), /q 0 g[\s\S]* re f/);
  }
  const matrix = reportBarcode(element)!;
  assert.equal(matrix.width, matrix.height);
  assert.equal(matrix.rects[0]!.x, 4);
  assert.equal(matrix.rects[0]!.y, 4);
  assert.match(renderReportHtml(report), /aria-label="QR Code"/);
});

test("selective barcode encoders preserve the raw bar and QR module geometry", () => {
  const bwip = (bwipReference as unknown as { default: { raw: typeof bwipReference.raw } }).default;
  const cases = [
    ["code128", "0000123456"],
    ["code128", "ABCDEFGHIJKLMNOPQRSTUVWXYZ!?{} 0123456789".repeat(2).slice(0, 80)],
    ["qrcode", "TEST 123"],
    ["qrcode", "Ω café 東京 😀"],
    ["qrcode", "😀".repeat(64)],
  ] as const;
  for (const [kind, value] of cases) {
    const element: ReportElement = { id: "check", type: "barcode", box: { x: 4, y: 2, width: 65, height: 20 },
      props: { barcodeKind: kind, barcodeValue: value } };
    const actual = reportBarcode(element)!;
    assert.ok(actual, kind);
    const raw = bwip.raw({ bcid: kind, text: value })[0]!;
    if ("sbs" in raw) {
      let x = 10;
      const bars = raw.sbs.flatMap((width, index) => {
        const start = x;
        x += width;
        return index % 2 ? [] : [{ x: start, y: 0, width, height: 1 }];
      });
      assert.deepEqual(actual.rects, bars);
      assert.equal(actual.width, x + 10);
    } else {
      assert.equal(actual.width, raw.pixx + 8);
      assert.equal(actual.height, raw.pixy + 8);
      const modules = Array.from({ length: actual.width * actual.height }, () => 0);
      for (const rect of actual.rects) modules.fill(1, rect.y * actual.width + rect.x, rect.y * actual.width + rect.x + rect.width);
      const expected = modules.map((_, index) => {
        const x = index % actual.width - 4;
        const y = Math.floor(index / actual.width) - 4;
        return x >= 0 && x < raw.pixx && y >= 0 && y < raw.pixy ? raw.pixs[y * raw.pixx + x] : 0;
      });
      assert.deepEqual(modules, expected);
    }
  }
});

test("barcodes validate literals and report invalid data bindings before export", () => {
  const report = buildTemplate("blank");
  const element: ReportElement = { id: "item-code", type: "barcode", box: { x: 0, y: 0, width: 50, height: 15 },
    props: { barcodeKind: "code128", barcodeValue: "Ω" } };
  report.bands[0]!.elements.push(element);
  assert.ok(validateReportDocument(report).errors.some(issue => issue.code === "INVALID_BARCODE"));
  element.bindings = { path: "item.number" };
  assert.equal(validateReportDocument(report).ok, true);
  assert.ok(exportReport(report, "pdf").warnings.some(warning => warning.includes("bound value is missing")));
  assert.match(renderReportHtml(report, { data: { item: { number: "A-100" } } }), /aria-label="Code 128"/);
});
