import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STYLE_FAMILIES,
  TEMPLATE_CATALOG,
  buildTemplate,
  getTemplate,
  serializeReport,
  validateReportDocument,
} from "../../src/reports/index.js";

test("every catalog template builds a valid document", () => {
  for (const template of TEMPLATE_CATALOG) {
    const document = template.build();
    const result = validateReportDocument(document);
    assert.equal(result.ok, true, `${template.id}: ${JSON.stringify(result.errors)}`);
    assert.ok(document.title.length > 0);
    assert.ok(document.bands.length > 0);
  }
});

test("the catalog covers core business, dashboard, thermal and label templates", () => {
  assert.deepEqual(
    TEMPLATE_CATALOG.map((template) => template.id),
    ["blank", "invoice", "loanSchedule", "statement", "dashboard", "aging", "allocation", "voucher", "collection", "thermalReceipt", "label", "receipt"],
  );
  assert.equal(getTemplate("nope"), null);
});

test("invoice binds datasets and a repeating line-item table", () => {
  const document = buildTemplate("invoice");
  assert.ok(document.datasets.some((dataset) => dataset.id === "invoice"));
  assert.ok(document.datasets.some((dataset) => dataset.id === "lines"));
  const table = document.bands
    .flatMap((band) => band.elements)
    .find((element) => element.type === "table");
  assert.ok(table);
  assert.equal(table?.bindings?.path, "lines");
  const columns = table?.props.columns as Array<{ key: string }>;
  assert.deepEqual(
    columns.map((column) => column.key),
    ["description", "quantity", "unitPrice", "amount"],
  );
  assert.ok(document.bands.some((band) => band.kind === "summary"));
  assert.ok(document.bands.some((band) => band.kind === "pageFooter" && band.repeat));
});

test("the grouped statement pairs group header and footer on the same key", () => {
  const document = buildTemplate("statement");
  const header = document.bands.find((band) => band.kind === "groupHeader");
  const footer = document.bands.find((band) => band.kind === "groupFooter");
  assert.ok(header);
  assert.ok(footer);
  assert.equal(header?.groupBy, "accounts.contractNumber");
  assert.equal(footer?.groupBy, header?.groupBy);
  assert.ok(document.parameters.some((parameter) => parameter.required));
});

test("style families are distinct and can be swapped per template", () => {
  const primaries = new Set(
    Object.values(STYLE_FAMILIES).map((family) => family.colors.primary),
  );
  assert.equal(primaries.size, 3, "three distinct style families");

  const document = buildTemplate("invoice", "minimalMono", "en-US");
  assert.equal(document.locale, "en-US");
  const tokens = document.styleTokens as { family: string };
  assert.equal(tokens.family, "minimalMono");
});

test("template rendering is deterministic across builds", () => {
  const first = serializeReport(buildTemplate("statement"));
  const second = serializeReport(buildTemplate("statement"));
  assert.equal(first, second);
});

test("unknown templates fail loudly instead of returning a blank report", () => {
  assert.throws(() => buildTemplate("missing-template"), /Unknown report template/);
});
