import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capabilityOf,
  formatForFilename,
  getFormat,
  isEditableFormat,
  listFormats,
} from "../../src/reports/index.js";

test("only the native project format is editable", () => {
  const editable = listFormats().filter((format) => isEditableFormat(format.id));
  assert.deepEqual(
    editable.map((format) => format.id),
    ["native-json"],
  );
});

test("the vendor YRF format is read-only and never rewritten", () => {
  const descriptor = getFormat("yrf");
  assert.ok(descriptor);
  assert.equal(descriptor.operations.open, "readonly");
  assert.match(descriptor.notes, /original is never rewritten/);
  assert.equal(descriptor.operations.edit, "unsupported");
  assert.equal(descriptor.operations.create, "unsupported");
  assert.equal(descriptor.operations.export, "unsupported");
  assert.equal(capabilityOf("yrf", "edit"), "unsupported");
});

test("rendered and tabular outputs are not advertised as editable sources", () => {
  for (const id of ["pdf", "html", "xlsx", "csv", "docx"]) {
    const descriptor = getFormat(id);
    assert.ok(descriptor, `format ${id} is declared`);
    assert.notEqual(
      descriptor.operations.edit,
      "editable",
      `${id} must not claim editability`,
    );
    assert.notEqual(descriptor.operations.create, "editable");
  }
});

test("unknown report templates are explicitly unsupported, never silently converted", () => {
  for (const id of ["jrxml", "rdl", "rpt"]) {
    const descriptor = getFormat(id);
    assert.ok(descriptor, `${id} is declared`);
    for (const operation of ["create", "open", "edit", "export"] as const) {
      assert.equal(descriptor.operations[operation], "unsupported");
    }
    assert.match(descriptor.notes, /unsupported|No adapter/i);
  }
});

test("filename matching prefers the longest extension", () => {
  assert.equal(formatForFilename("invoice.report.json")?.id, "native-json");
  assert.equal(formatForFilename("INVOICE.REPORT.JSON")?.id, "native-json");
  assert.equal(formatForFilename("fa11.yrf")?.id, "yrf");
  assert.equal(formatForFilename("data.csv")?.id, "csv");
  assert.equal(formatForFilename("book.xlsx")?.id, "xlsx");
  assert.equal(formatForFilename("notes.txt"), null);
});

test("every format declares a phase and a note", () => {
  for (const format of listFormats()) {
    assert.ok(format.phase.length > 0);
    assert.ok(format.notes.length > 10);
    assert.ok(format.extensions.length > 0);
  }
});
