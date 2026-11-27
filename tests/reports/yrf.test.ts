import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  applyYrfChanges,
  setYrfObjectScalar,
  collectStringSpans,
  parseYrfPath,
  previewYrfPatch,
} from "../../src/reports/formats/yrf/patch.js";
import { yrfRichText } from "../../src/reports/formats/yrf/rich-text.js";
import { inspectYrf, yrfPageLayout } from "../../src/reports/formats/yrf/inspect.js";
import { createYrfFromNative } from "../../src/reports/formats/yrf/create.js";
import { buildTemplate } from "../../src/reports/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, "..", "..", "fixtures", "reports", "synthetic", "yrf", "minimal.yrf");

async function fixture(): Promise<string> {
  return readFile(fixturePath, "utf8");
}

test("inspection is read-only and reports structure without executing scripts", async () => {
  const result = inspectYrf(await fixture());
  assert.equal(result.ok, true);
  const inspection = result.inspection!;
  assert.equal(inspection.version, "1.0.0");
  assert.deepEqual(inspection.paper, { type: "A4", width: 2320, height: 3308 });
  assert.equal(inspection.pages.length, 1);
  assert.equal(inspection.pages[0]!.bands.length, 3);
  assert.equal(inspection.objectCount, 5);
  assert.ok(inspection.warnings.some((warning) => /units are unverified/.test(warning)));
  assert.ok(inspection.warnings.some((warning) => /Save copy keeps the original/.test(warning)));
});

test("unknown object kinds and script fields are surfaced, never run", async () => {
  const base = JSON.parse(await fixture());
  base.layout.pages[0].bands[1].objects.push({
    type: "mysteryWidget",
    name: "x",
    left: 0,
    top: 0,
    width: 10,
    height: 10,
  });
  base.layout.pages[0].bands[1].script = { OnFormat: "some vendor code" };
  const result = inspectYrf(JSON.stringify(base));
  assert.equal(result.ok, true);
  assert.deepEqual(result.inspection!.unknownKeys, ["mysteryWidget"]);
  assert.ok(result.inspection!.scriptFields.length > 0);
  assert.ok(result.inspection!.warnings.some((warning) => /never executed/.test(warning)));
});

test("rejects files that are not WaiReport JSON", () => {
  assert.equal(inspectYrf("not json").ok, false);
  assert.equal(inspectYrf(JSON.stringify({ hello: "world" })).ok, false);
});

test("the inspector distinguishes opaque corpus capabilities and preserves BOM compatibility", async () => {
  const document = JSON.parse(await fixture());
  const objects = document.layout.pages[0].bands[0].objects;
  const kinds = ["AR.DataControl", "AR.XML", "AR.Barcode", "rtf", "subReport"];
  objects.push(...kinds.map(type => ({ type, vendor: { unknown: true } })));
  const result = inspectYrf("\uFEFF" + JSON.stringify(document)).inspection!;
  assert.deepEqual(result.pages[0]!.bands[0]!.objects.slice(-5).map(({ supported, capability }) => [supported, capability]),
    [[false, "data-control"], [false, "xml"], [false, "barcode"], [false, "rich-text"], [false, "subreport"]]);
});

test("local YRF layout handles distinct pages and preserves everything outside approved slots", async () => {
  const document = JSON.parse(await fixture());
  const box = { left: 10, top: 12, width: 120, height: 40 };
  document.layout.pages.push({ bands: [{ type: "detail", height: 4000, objects: [
    { ...box, type: "AR.DataControl", visible: "0", lockType: "1" },
    { ...box, type: "AR.XML", visible: "0", fileURL: "leave.xml", recordsetPattern: "/records/row" },
    { ...box, type: "AR.Barcode", text: "opaque payload", 0: "x" },
    { ...box, type: "rtf", data: "First\nSecond" },
    { ...box, type: "subReport", reportName: "detail.yrf" },
    { ...box, type: "rtf", data: "Keep", onBeforePrint: "fixture hook" },
  ] }] });
  const text = "\uFEFF" + JSON.stringify(document, null, 2).replaceAll("\n", "\r\n");
  const layout = inspectYrf(text).inspection!;
  assert.equal(yrfPageLayout(layout, 0).placements[0]?.band.type, "reportHeader");
  const second = yrfPageLayout(layout, 1);
  assert.deepEqual(second.placements.map(({ band, top }) => [band.type, top]), [["detail", 0], ["reportFooter", 4000]]);
  assert.equal(second.overflow, true);
  const refs = second.placements[0]!.band.objects;
  assert.deepEqual(refs.map(item => item.editableGeometry), [false, false, true, true, true, false]);
  assert.equal(refs[3]?.localPreviewText, "First\nSecond");
  assert.equal(refs[4]?.localPreviewText, "detail.yrf");

  const at = (index: number) => `layout.pages[1].bands[0].objects[${index}]`;
  const result = applyYrfChanges(text, [{ objectPath: at(2), field: "left", expected: 10, value: 18 }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const [{ start, end }] = result.changes as [{ start: number; end: number }];
  assert.equal(result.text, text.slice(0, start) + "18" + text.slice(end));
  const changed = setYrfObjectScalar(result.text, at(3), "data", "Updated Ω");
  assert.equal(inspectYrf(changed).inspection!.pages[1]?.bands[0]?.objects[3]?.localPreviewText, "Updated Ω");
  assert.throws(() => setYrfObjectScalar(changed, at(1), "fileURL", "elsewhere.xml"), /Unsupported/);
  assert.throws(() => setYrfObjectScalar(changed, at(3), "data", "<img src=x>"), /Unsupported/);
  assert.throws(() => setYrfObjectScalar(changed, at(4), "reportName", "../detail.yrf"), /Unsupported/);
  assert.throws(() => setYrfObjectScalar(changed, at(5), "data", "Do not edit"), /script/);
});

test("the YRF writer and inspector share explicit Code 128 and QR values", () => {
  const doc = buildTemplate("blank");
  doc.bands[0]!.elements.push(
    { id: "bars", type: "barcode", box: { x: 10, y: 8, width: 40, height: 8 },
      props: { barcodeKind: "code128", barcodeValue: "STOCK-001" } },
    { id: "qr", type: "barcode", box: { x: 80, y: 8, width: 20, height: 20 },
      props: { barcodeKind: "qrcode", barcodeValue: "Ω" }, bindings: { path: "stock.code" } },
  );
  const created = createYrfFromNative(doc);
  assert.equal(created.ok, true);
  const text = created.text!;
  const objects = inspectYrf(text).inspection!.pages[0]!.bands[0]!.objects;
  assert.deepEqual(objects.map(({ barcodeKind, localFields }) => [barcodeKind, localFields.value]),
    [["code128", "STOCK-001"], ["qrcode", "Ω"]]);
  const changed = setYrfObjectScalar(text, objects[0]!.path, "value", "STOCK-002");
  assert.equal(changed, text.replace("STOCK-001", "STOCK-002"));
  assert.throws(() => setYrfObjectScalar(text, objects[0]!.path, "value", "Ω"), /Unsupported/);
  assert.throws(() => setYrfObjectScalar(text, objects[0]!.path, "formatType", "ean13"), /Unsupported/);
  assert.match(text, /"dataField": "stock.code"/);
});

test("rich text previews only bounded RTF text and supported character styling", () => {
  const rtf = "{\\rtf1\\ansi\\ansicpg1252{\\fonttbl{\\f0 Hidden font;}}" +
    "Plain {\\b Bold {\\i Both}\\b0 italics off} \\ul under\\ulnone\\par " +
    "\\uc1\\u937? \\'e9 \\{literal\\}{\\pict 123}{\\*\\destination hidden}}";
  const runs = yrfRichText(rtf)!;
  assert.equal(runs.map(run => run.text).join(""), "Plain Bold Bothitalics off under\nΩ é {literal}");
  assert.ok(runs.some(run => run.text === "Both" && run.bold && run.italic));
  assert.ok(runs.some(run => run.text === "under" && run.underline));
  assert.equal(yrfRichText("{\\rtf1 malformed"), null);
  assert.equal(yrfRichText("{\\rtf1\\ansicpg65001 unsupported}"), null);
  assert.equal(yrfRichText("{\\rtf1 " + "A".repeat(16_000) + "}"), null);
});

test("patch changes exactly one span and preserves everything else", async () => {
  const original = await fixture();
  const result = previewYrfPatch({
    text: original,
    objectPath: "layout.pages[0].bands[0].objects[0].caption",
    expectedCaption: "Kop Halaman",
    caption: "Kop Halaman Baru",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.text.length, original.length + 5);
  const before = original.slice(0, result.change.start);
  const after = original.slice(result.change.end);
  assert.equal(result.text.slice(0, result.change.start), before);
  assert.equal(result.text.slice(result.change.start + JSON.stringify("Kop Halaman Baru").length), after);

  const spansBefore = collectStringSpans(original);
  const spansAfter = collectStringSpans(result.text);
  assert.equal(spansBefore.length, spansAfter.length);
  spansBefore.forEach((span, index) => {
    if (span.path === result.change.path) return;
    assert.equal(spansAfter[index]!.value, span.value);
  });
});

test("no-op caption patch is byte-identical and stale captions are refused", async () => {
  const original = await fixture();
  const same = previewYrfPatch({
    text: original,
    objectPath: "layout.pages[0].bands[0].objects[0].caption",
    expectedCaption: "Kop Halaman",
    caption: "Kop Halaman",
  });
  assert.equal(same.ok, true);
  if (same.ok) assert.equal(same.text, original);

  const stale = previewYrfPatch({
    text: original,
    objectPath: "layout.pages[0].bands[0].objects[0].caption",
    expectedCaption: "Caption Lama",
    caption: "Baru",
  });
  assert.equal(stale.ok, false);

  const missing = previewYrfPatch({
    text: original,
    objectPath: "layout.pages[0].bands[0].objects[9].caption",
    expectedCaption: "x",
    caption: "y",
  });
  assert.equal(missing.ok, false);
});

test("paths parse into segments", () => {
  assert.deepEqual(parseYrfPath("layout.pages[0].bands[2].objects[1].caption"), [
    "layout",
    "pages",
    0,
    "bands",
    2,
    "objects",
    1,
    "caption",
  ]);
});

test("experimental creation produces an inspectable, clearly warned .yrf", () => {
  const created = createYrfFromNative(buildTemplate("invoice"));
  assert.equal(created.ok, true);
  assert.ok(created.warnings.some((warning) => /Experimental output/.test(warning)));
  const inspected = inspectYrf(created.text!);
  assert.equal(inspected.ok, true);
  assert.ok(inspected.inspection!.objectCount > 0);
  assert.equal(inspected.inspection!.pages.length, 1);
});

test("geometry patches are allowlisted and preserve every other scalar", async () => {
  const original = await fixture();
  const result = previewYrfPatch({
    text: original,
    objectPath: "layout.pages[0].bands[0].objects[0]",
    expectedCaption: "Kop Halaman",
    caption: "Kop Halaman",
  });
  assert.equal(result.ok, true);

  const { applyYrfChanges } = await import("../../src/reports/formats/yrf/patch.js");
  const patched = applyYrfChanges(original, [
    { objectPath: "layout.pages[0].bands[0].objects[0]", field: "left", expected: 80, value: 120 },
    { objectPath: "layout.pages[0].bands[0].objects[0]", field: "width", expected: 1200, value: 900 },
  ]);
  assert.equal(patched.ok, true);
  if (!patched.ok) return;
  assert.equal(patched.changes.length, 2);
  const parsed = JSON.parse(patched.text);
  assert.equal(parsed.layout.pages[0].bands[0].objects[0].left, 120);
  assert.equal(parsed.layout.pages[0].bands[0].objects[0].width, 900);
  assert.equal(parsed.layout.pages[0].bands[0].objects[0].caption, "Kop Halaman");

  const forbidden = applyYrfChanges(original, [
    { objectPath: "layout.pages[0].bands[0].objects[0]", field: "type" as never, expected: "label", value: "shape" },
  ]);
  assert.equal(forbidden.ok, false);
  const paper = JSON.parse(original).pageSetting.paper;
  assert.equal(applyYrfChanges(original, [{ objectPath: "pageSetting.paper", field: "width", expected: paper.width, value: -100 }]).ok, false);
  assert.equal(applyYrfChanges(original, [{ objectPath: "layout.pages[0].bands[0].objects[0]", field: "width", expected: 1200, value: -1 }]).ok, false);
  const unknown = JSON.parse(original);
  unknown.layout.pages[0].bands[0].objects[0].type = "AR.XML";
  assert.equal(applyYrfChanges(JSON.stringify(unknown), [{ objectPath: "layout.pages[0].bands[0].objects[0]", field: "caption", expected: "Kop Halaman", value: "Changed" }]).ok, false);
});

test("BOM, CRLF and Unicode survive a caption patch byte-for-byte outside the span", async () => {
  const original = await fixture();
  const withBom = `\uFEFF${original.replace(/\n/g, "\r\n")}`;
  const result = previewYrfPatch({
    text: withBom,
    objectPath: "layout.pages[0].bands[0].objects[0]",
    expectedCaption: "Kop Halaman",
    caption: "Kop — ✓ Nusantara",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.text.startsWith("\uFEFF"), "BOM stays");
  assert.equal((result.text.match(/\r\n/g) ?? []).length, (withBom.match(/\r\n/g) ?? []).length);
  const parsed = JSON.parse(result.text.replace(/^\uFEFF/, ""));
  assert.equal(parsed.layout.pages[0].bands[0].objects[0].caption, "Kop — ✓ Nusantara");
});

test("duplicate JSON keys are refused instead of guessed", async () => {
  const original = await fixture();
  const duplicated = original.replace(
    '"caption": "Kop Halaman"',
    '"caption": "Kop Halaman", "caption": "Duplikat"',
  );
  const result = previewYrfPatch({
    text: duplicated,
    objectPath: "layout.pages[0].bands[0].objects[0]",
    expectedCaption: "Kop Halaman",
    caption: "Baru",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Duplicate JSON key/);
});

test("unknown vendor fields survive a patch", async () => {
  const original = await fixture();
  const enriched = original.replace(
    '"caption": "Kop Halaman"',
    '"caption": "Kop Halaman", "vendorUnknown": { "a": 1, "nested": ["x"] }',
  );
  const result = previewYrfPatch({
    text: enriched,
    objectPath: "layout.pages[0].bands[0].objects[0]",
    expectedCaption: "Kop Halaman",
    caption: "Kop Baru",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const parsed = JSON.parse(result.text);
  assert.deepEqual(parsed.layout.pages[0].bands[0].objects[0].vendorUnknown, {
    a: 1,
    nested: ["x"],
  });
});

test("textbox text and dataField can be edited without changing other source", async () => {
  const base = JSON.parse(await fixture());
  const object = base.layout.pages[0].bands[1].objects[0];
  delete object.caption;
  object.text = "";
  object.dataField = "invoice.number";
  const original = JSON.stringify(base, null, 2);
  const inspected = inspectYrf(original).inspection!;
  const ref = inspected.pages[0]!.bands[1]!.objects[0]!;
  assert.equal(ref.textField, "text");
  assert.equal(ref.editableCaption, true);
  assert.equal(ref.dataField, "invoice.number");
  const { applyYrfChanges } = await import("../../src/reports/formats/yrf/patch.js");
  const target = "layout.pages[0].bands[1].objects[0]";
  const result = applyYrfChanges(original, [
    { objectPath: target, field: "text", expected: "", value: "Nama" },
    { objectPath: target, field: "dataField", expected: "invoice.number", value: "invoice.name" },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.text, original.replace('"text": ""', '"text": "Nama"').replace('"dataField": "invoice.number"', '"dataField": "invoice.name"'));
  assert.equal(applyYrfChanges(original, [{ objectPath: "layout.pages[0].bands[0].objects[0]", field: "dataField", expected: "", value: "x" }]).ok, false);
});

test("adding an object preserves existing bytes and rejects ambiguous band paths", async () => {
  const { appendYrfObject } = await import("../../src/reports/formats/yrf/patch.js");
  const original = await fixture();
  const result = appendYrfObject(original, "layout.pages[0].bands[0]", { type: "label", name: "label1", left: 50, top: 30, width: 100, height: 30, caption: "New" });
  assert.equal(result.objectPath, "layout.pages[0].bands[0].objects[1]");
  assert.equal(JSON.parse(result.text).layout.pages[0].bands[0].objects[1].caption, "New");
  assert.equal(result.text.replace(',{"type":"label","name":"label1","left":50,"top":30,"width":100,"height":30,"caption":"New"}', ''), original);
  assert.throws(() => appendYrfObject(original, "pageSetting", {}));
});

test("YRF image data can be added or replaced without changing other objects", async () => {
  const { appendYrfObject, setYrfObjectScalar } = await import("../../src/reports/formats/yrf/patch.js");
  const original = await fixture();
  const inserted = appendYrfObject(original, "layout.pages[0].bands[0]", { type: "image", name: "img", left: 0, top: 0, width: 100, height: 100 });
  const data = `data:image/png;base64,${"A".repeat(6000)}`;
  const updated = setYrfObjectScalar(inserted.text, inserted.objectPath, "data", data);
  assert.equal(inspectYrf(updated).inspection?.pages[0]?.bands[0]?.objects[1]?.imageData, data);
  assert.equal(updated.replace(`,\"data\":${JSON.stringify(data)}`, ""), inserted.text);
  assert.throws(() => setYrfObjectScalar(updated, inserted.objectPath, "data", "x".repeat(5000)));
});

test("native YRF conversion records hidden objects, static table fidelity, paper and line endpoints", () => {
  const report = buildTemplate("invoice");
  report.page.size = "custom";
  const detail = report.bands.find(band => band.kind === "detail")!;
  detail.elements.push(
    { id: "draw-line", type: "line", box: { x: 2, y: 4, width: 20, height: 1 }, props: {} },
    { id: "embedded-image", type: "image", box: { x: 2, y: 6, width: 10, height: 10 },
      props: { src: "data:image/png;base64,iVBORw0KGgo=" } },
    { id: "hidden-label", type: "text", box: { x: 2, y: 8, width: 10, height: 10 },
      props: { text: "HIDDEN_CONVERSION_SENTINEL", outputHidden: true } },
  );
  const result = createYrfFromNative(report);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some(warning => /hidden from output/.test(warning)));
  assert.ok(result.warnings.some(warning => /static column labels/.test(warning)));
  assert.doesNotMatch(result.text!, /HIDDEN_CONVERSION_SENTINEL/);
  const raw = JSON.parse(result.text!);
  assert.equal(raw.pageSetting.paper.type, "custom");
  assert.equal(raw.layout.reportHeader.type, "reportHeader");
  const band = raw.layout.pages[0].bands.find((band: { name: string }) => band.name === detail.id);
  const line = band.objects.find((entry: { name: string }) => entry.name === "draw-line");
  assert.deepEqual([line.x1, line.y1, line.x2, line.y2], [22, 44, 242, 44]);
  const image = band.objects.find((entry: { name: string }) => entry.name === "embedded-image");
  assert.equal(image.data, "data:image/png;base64,iVBORw0KGgo=");
});

test("YRF endpoint line geometry and other object scalars preserve unrelated source", async () => {
  const { applyYrfChanges, setYrfObjectScalar } = await import("../../src/reports/formats/yrf/patch.js");
  const document = JSON.parse(await fixture());
  const line = document.layout.pages[0].bands[1].objects[1];
  delete line.left; delete line.top; delete line.width; delete line.height;
  Object.assign(line, { x1: 80, y1: 160, x2: 600, y2: 160, style: "color:blue", visible: true });
  const source = JSON.stringify(document, null, 2);
  const path = "layout.pages[0].bands[1].objects[1]";
  const selected = inspectYrf(source).inspection!.pages[0]!.bands[1]!.objects[1]!;
  assert.equal(selected.editableGeometry, true);
  assert.deepEqual(selected.box, { x: 80, y: 160, width: 520, height: 0 });
  const changed = applyYrfChanges(source, [
    { objectPath: path, field: "x1", expected: 80, value: 100 },
    { objectPath: path, field: "x2", expected: 600, value: 620 },
  ]);
  assert.equal(changed.ok, true);
  if (!changed.ok) return;
  const styled = setYrfObjectScalar(setYrfObjectScalar(changed.text, path, "style", "color:red"), path, "visible", false);
  const edited = JSON.parse(styled).layout.pages[0].bands[1].objects[1];
  assert.equal(edited.x1, 100); assert.equal(edited.x2, 620); assert.equal(edited.style, "color:red");
  assert.equal(edited.visible, false);
  assert.throws(() => setYrfObjectScalar(source, path, "type", "label"));
});

test("remove object preserves the other objects and handles first, middle, and last", async () => {
  const { removeYrfObject } = await import("../../src/reports/formats/yrf/patch.js");
  const document = JSON.parse(await fixture());
  const objects = document.layout.pages[0].bands[1].objects;
  objects.push({ type: "label", name: "third", caption: "Third" });
  const source = JSON.stringify(document, null, 2);
  for (let index = 0; index < objects.length; index++) {
    const next = removeYrfObject(source, `layout.pages[0].bands[1].objects[${index}]`);
    assert.deepEqual(JSON.parse(next).layout.pages[0].bands[1].objects, objects.filter((_: unknown, i: number) => i !== index));
    assert.equal(JSON.parse(next).waiReportForm.version, document.waiReportForm.version);
  }
  assert.throws(() => removeYrfObject(source, "pageSetting.paper"));
});

test("visual YRF changes reject unsupported objects and script fields", async () => {
  const { removeYrfObject, setYrfObjectScalar } = await import("../../src/reports/formats/yrf/patch.js");
  const document = JSON.parse(await fixture());
  document.layout.pages[0].bands[0].objects.push({ type: "rtf", name: "unknown", style: "color:red" });
  document.layout.pages[0].bands[0].objects[0].script = "inert";
  const source = JSON.stringify(document);
  const supported = "layout.pages[0].bands[0].objects[0]";
  const unknown = "layout.pages[0].bands[0].objects[1]";
  assert.throws(() => setYrfObjectScalar(source, unknown, "style", "color:blue"), /Unsupported/);
  assert.throws(() => setYrfObjectScalar(source, supported, "script", "changed"), /script/);
  assert.throws(() => removeYrfObject(source, unknown), /Unsupported/);
  assert.throws(() => removeYrfObject(source, supported), /scripted/);
  delete document.layout.pages[0].bands[0].objects[0].script;
  document.layout.pages[0].bands[0].objects[0].description = "description stays editable";
  const normal = JSON.stringify(document);
  assert.match(setYrfObjectScalar(normal, supported, "description", "updated"), /updated/);
  assert.doesNotThrow(() => removeYrfObject(normal, supported));
});
