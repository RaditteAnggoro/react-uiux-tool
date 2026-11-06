import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplate,
  renderChartSvg,
  renderReportHtml,
  validateReportDocument,
} from "../../src/reports/index.js";

test("dashboard template renders a deterministic SVG chart", () => {
  const document = buildTemplate("dashboard");
  assert.equal(validateReportDocument(document).ok, true);
  const html = renderReportHtml(document);
  assert.match(html, /<svg /);
  assert.match(html, /Jan/);
  assert.match(html, /Volume per bulan/);
  assert.equal(html, renderReportHtml(document));
});

test("chart labels are escaped and never become markup", () => {
  const document = buildTemplate("dashboard");
  const chart = document.bands
    .flatMap((band) => band.elements)
    .find((element) => element.type === "chart")!;
  chart.props.labels = ["<b>Q1</b>", "Q2"];
  const html = renderReportHtml(document);
  assert.ok(!html.includes("<b>Q1</b>"));
  assert.match(html, /&lt;b&gt;Q1&lt;\/b&gt;/);
});

test("pie and line charts produce valid SVG geometry", () => {
  const pie = renderChartSvg({
    type: "pie",
    labels: ["A", "B"],
    series: [{ label: "S", values: [3, 1] }],
    width: 100,
    height: 60,
  });
  assert.match(pie, /<path d="M /);
  const line = renderChartSvg({
    type: "line",
    labels: ["A", "B"],
    series: [{ label: "S", values: [3, 1] }],
    width: 100,
    height: 60,
  });
  assert.match(line, /<polyline points=/);
  assert.match(line, /<circle /);
});
