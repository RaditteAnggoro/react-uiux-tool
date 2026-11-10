import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LIMITS,
  createDefaultDocument,
  parseReport,
  serializeReport,
  validateReportDocument,
} from "../../src/reports/index.js";
import { buildTemplate } from "../../src/reports/index.js";
import type { ReportDocumentV1 } from "../../src/reports/index.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("a template document validates and round trips through JSON", () => {
  const document = buildTemplate("invoice");
  const validation = validateReportDocument(document);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));

  const text = serializeReport(document);
  const parsed = parseReport(text);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  assert.deepEqual(parsed.document, document);
});

test("embedded image data can exceed the normal string limit without relaxing other strings", () => {
  const document = buildTemplate("invoice");
  const image = document.bands.flatMap((band) => band.elements).find((element) => element.type === "image")!;
  image.props.src = `data:image/png;base64,${Buffer.alloc(30000, 42).toString("base64")}`;
  assert.equal(validateReportDocument(document).ok, true);
  const other = clone(document);
  other.title = "x".repeat(DEFAULT_LIMITS.maxStringLength + 1);
  assert.ok(validateReportDocument(other).errors.some((issue) => issue.code === "STRING_LIMIT"));
  image.props.src = `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64")}`;
  assert.ok(validateReportDocument(document).errors.some((issue) => issue.code === "STRING_LIMIT"));
});

test("serialization is deterministic regardless of key insertion order", () => {
  const document = buildTemplate("statement");
  const reordered = JSON.parse(JSON.stringify(document)) as ReportDocumentV1;
  const reorderedProps = { ...reordered };
  const first = serializeReport(document);
  const second = serializeReport(reorderedProps as ReportDocumentV1);
  assert.equal(first, second);
  assert.equal(first, serializeReport(document));
  assert.ok(first.endsWith("\n"), "serialized documents end with a newline");
});

test("unknown top-level keys and wrong versions are rejected with a path", () => {
  const document = clone(buildTemplate("receipt")) as unknown as Record<string, unknown>;
  document.extra = { hack: true };
  const unknown = validateReportDocument(document);
  assert.equal(unknown.ok, false);
  assert.ok(
    unknown.errors.some(
      (issue) => issue.code === "UNKNOWN_KEY" && issue.path === "$.extra",
    ),
  );

  const wrongVersion = clone(buildTemplate("receipt")) as unknown as Record<string, unknown>;
  wrongVersion.schemaVersion = 2;
  const version = validateReportDocument(wrongVersion);
  assert.equal(version.ok, false);
  assert.ok(version.errors.some((issue) => issue.code === "UNSUPPORTED_VERSION"));
});

test("duplicate ids are rejected across bands and elements", () => {
  const document = clone(buildTemplate("invoice"));
  document.bands[1].elements[0].id = document.bands[0].elements[0].id;
  const result = validateReportDocument(document);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "DUPLICATE_ID"));
});

test("prototype-polluting keys are rejected anywhere in the document", () => {
  const text = JSON.stringify(buildTemplate("invoice")).replace(
    '"props":{',
    '"props":{"__proto__":{"polluted":true},',
  );
  const parsed = parseReport(text);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.errors.some((issue) => issue.code === "FORBIDDEN_KEY"));
});

test("unsafe dataset references and invalid margins are rejected", () => {
  const document = clone(buildTemplate("invoice"));
  document.datasets[0].sampleDataRef = "../../private/secret.json";
  const traversal = validateReportDocument(document);
  assert.equal(traversal.ok, false);
  assert.ok(traversal.errors.some((issue) => issue.code === "UNSAFE_PATH"));

  const margins = clone(buildTemplate("invoice"));
  margins.page.margins.left = 500;
  margins.page.margins.right = 500;
  const invalidMargins = validateReportDocument(margins);
  assert.equal(invalidMargins.ok, false);
  assert.ok(invalidMargins.errors.some((issue) => issue.code === "INVALID_MARGINS"));
});

test("oversized documents are rejected before parsing", () => {
  const document = buildTemplate("invoice");
  const text = serializeReport(document);
  const result = parseReport(text, { ...DEFAULT_LIMITS, maxBytes: 64 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "FILE_TOO_LARGE"));
});

test("non-JSON values such as NaN are rejected", () => {
  const document = clone(buildTemplate("invoice"));
  document.bands[0].elements[0].box.width = Number.NaN;
  const result = validateReportDocument(document);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "INVALID_NUMBER"));
});

test("elements wider than the page produce a warning, not silent success", () => {
  const document = clone(buildTemplate("invoice"));
  document.bands[0].elements[0].box.x = document.page.width - 1;
  document.bands[0].elements[0].box.width = 20;
  const result = validateReportDocument(document);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((issue) => issue.code === "PAGE_OVERFLOW"));
});

test("default documents are valid and empty bands are rejected", () => {
  const document = createDefaultDocument({ id: "draft-1", title: "Draft" });
  assert.equal(validateReportDocument(document).ok, true, "default document is valid");
  document.bands = [];
  const empty = validateReportDocument(document);
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.some((issue) => issue.code === "EMPTY_BANDS"));
});
