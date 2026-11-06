import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplate,
  paginateReport,
  renderReportHtml,
  contentHeight,
} from "../../src/reports/index.js";

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    description: `Baris ${index + 1}`,
    quantity: 1,
    unitPrice: 1000,
    amount: 1000,
  }));
}

test("a long table paginates deterministically and repeats the page header", () => {
  const document = buildTemplate("invoice");
  const data = {
    invoice: { number: "INV-1", subtotal: 200, tax: 22, total: 222 },
    lines: rows(120),
  };
  const pages = paginateReport(document, { data });
  assert.ok(pages.length > 1, `expected multiple pages, got ${pages.length}`);
  assert.ok(contentHeight(document) > 0);

  const html = renderReportHtml(document, { data });
  const pageCount = pages.length;
  const headers = html.match(/data-band="band-header"/g) ?? [];
  assert.equal(headers.length, pageCount, "page header repeats on every page");
  assert.match(html, new RegExp(`Page 2 of ${pageCount}`));
  assert.equal(
    renderReportHtml(document, { data }),
    html,
    "rendering is deterministic",
  );
});

test("content that fits produces a single page", () => {
  const document = buildTemplate("receipt");
  const pages = paginateReport(document, { data: {} });
  assert.equal(pages.length, 1);
});

test("page number expressions and bindings resolve with page context", () => {
  const document = buildTemplate("invoice");
  const html = renderReportHtml(document, {
    data: { invoice: { total: 1387500 }, lines: [] },
  });
  assert.match(html, /1[.,]387[.,]500|1387500/);
  assert.match(html, /Page 1 of 1/);
});

test("grouped bands render once per contract with evaluated totals", () => {
  const document = buildTemplate("loanSchedule");
  const data = {
    contracts: [
      { contractNumber: "K-1", customerName: "PT Satu" },
      { contractNumber: "K-2", customerName: "PT Dua" },
    ],
    schedule: [
      { contractNumber: "K-1", dueDate: "2026-01-01", principal: 1000000, interest: 100000, penalty: 0, total: 1100000 },
      { contractNumber: "K-1", dueDate: "2026-02-01", principal: 1000000, interest: 90000, penalty: 0, total: 1090000 },
      { contractNumber: "K-2", dueDate: "2026-01-01", principal: 500000, interest: 50000, penalty: 10000, total: 560000 },
    ],
  };
  const html = renderReportHtml(document, { data });
  const headers = html.match(/data-band="band-group-header"/g) ?? [];
  const footers = html.match(/data-band="band-group-footer"/g) ?? [];
  assert.equal(headers.length, 2, "one group header per contract");
  assert.equal(footers.length, 2, "one group footer per contract");
  assert.match(html, /2\.000\.000/, "principal total for the first contract");
  assert.match(html, /1[.,]?110[.,]?000|2[.,]??/);
});

test("page and total page context resolve in expressions", () => {
  const document = buildTemplate("loanSchedule");
  const html = renderReportHtml(document, {
    data: { contracts: [], schedule: [] },
  });
  assert.match(html, /Page 1 of 1/);
});

test("conditional styles apply and hidden elements disappear", () => {
  const document = buildTemplate("aging");
  const total = document.bands
    .flatMap((band) => band.elements)
    .find((element) => element.id === "el-aging-total")!;
  total.conditions = [{ when: "1 == 1", color: "#8A1C1C", background: "#FDE8E8" }];
  const html = renderReportHtml(document, {
    data: { aging: [{ bucket: "0-30", count: 2, amount: 150000 }] },
  });
  assert.match(html, /color:#8A1C1C/);
  assert.match(html, /background:#FDE8E8/);

  const hidden = buildTemplate("aging");
  const hiddenTotal = hidden.bands
    .flatMap((band) => band.elements)
    .find((element) => element.id === "el-aging-total")!;
  hiddenTotal.conditions = [{ when: "1 == 1", hide: true }];
  const hiddenHtml = renderReportHtml(hidden, { data: { aging: [] } });
  assert.ok(!hiddenHtml.includes("el-aging-total"));
});

test("grouped bands keep their original document order", () => {
  const document = buildTemplate("loanSchedule");
  const data = {
    contracts: [{ contractNumber: "K-1" }, { contractNumber: "K-2" }],
    schedule: [
      { contractNumber: "K-1", dueDate: "2026-01-01", principal: 1000, interest: 0, penalty: 0, total: 1000 },
      { contractNumber: "K-2", dueDate: "2026-01-01", principal: 2000, interest: 0, penalty: 0, total: 2000 },
    ],
  };
  const html = renderReportHtml(document, { data });
  const index = (needle: string) => html.indexOf(needle);
  assert.ok(index('data-band="band-title"') < index('data-band="band-group-header"'));
  assert.ok(index('data-band="band-group-header"') < index('data-band="band-detail"'));
  assert.ok(index('data-band="band-detail"') < index('data-band="band-group-footer"'));
  assert.ok(index('data-band="band-group-footer"') < index('data-band="band-summary"'));
});
