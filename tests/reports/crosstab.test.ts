import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultDocument,
  renderReportHtml,
  validateReportDocument,
} from "../../src/reports/index.js";

function matrixDocument() {
  const document = createDefaultDocument({ id: "matrix", title: "Matriks" });
  document.bands = [
    {
      id: "band-body",
      kind: "detail",
      height: 40,
      elements: [
        {
          id: "el-crosstab",
          type: "crosstab",
          box: { x: 0, y: 0, width: 170, height: 30 },
          props: {
            rowKey: "branch",
            columnKey: "month",
            valueKey: "amount",
            rowLabel: "Cabang",
            aggregate: "sum",
          },
          bindings: { path: "matrix" },
        },
      ],
    },
  ];
  return document;
}

test("crosstab aggregates rows by column with totals", () => {
  const document = matrixDocument();
  assert.equal(validateReportDocument(document).ok, true);
  const html = renderReportHtml(document, {
    data: {
      matrix: [
        { branch: "A", month: "Jan", amount: 100 },
        { branch: "A", month: "Feb", amount: 50 },
        { branch: "B", month: "Jan", amount: 40 },
      ],
    },
  });
  assert.match(html, /el-crosstab/);
  assert.match(html, /Cabang/);
  assert.match(html, /Jan/);
  assert.match(html, /Feb/);
  assert.match(html, /190,00/);
  assert.match(html, /140,00/);
  assert.match(html, /90,00/);
});

test("crosstab supports count aggregation and escapes labels", () => {
  const document = matrixDocument();
  const element = document.bands[0].elements[0]!;
  element.props.aggregate = "count";
  element.props.rowLabel = "<b>Cabang</b>";
  const html = renderReportHtml(document, {
    data: {
      matrix: [
        { branch: "A", month: "Jan", amount: 1 },
        { branch: "A", month: "Jan", amount: 1 },
      ],
    },
  });
  assert.match(html, /2,00/);
  assert.ok(!html.includes("<b>Cabang</b>"));
});
