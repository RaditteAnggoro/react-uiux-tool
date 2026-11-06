import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  collectStringSpans,
  parseYrfPath,
  previewYrfPatch,
} from "../../src/reports/formats/yrf/patch.js";
import { inspectYrf } from "../../src/reports/formats/yrf/inspect.js";
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
  assert.ok(inspection.warnings.some((warning) => /saves a copy/.test(warning)));
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
  if (!result.ok) assert.match(result.error, /Duplicate property/);
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
