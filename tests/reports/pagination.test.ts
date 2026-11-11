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

test("split table rows and headings match the allocated HTML/PDF page positions", async () => {
  const { exportReport } = await import("../../src/reports/index.js");
  const document = buildTemplate("invoice");
  const data = { invoice: {}, lines: rows(120) };
  const pages = paginateReport(document, { data });
  const placements = pages.flatMap((page) => page.bands.filter((entry) => entry.band.id === "band-lines"));
  assert.equal(placements.flatMap((entry) => entry.rows ?? []).length, 120);
  for (const page of pages) {
    const ordered = [...page.bands].sort((a, b) => a.y - b.y);
    for (let i = 1; i < ordered.length; i++) assert.ok(ordered[i]!.y >= ordered[i - 1]!.y + ordered[i - 1]!.height - 0.001, "bands do not overlap");
  }
  const html = renderReportHtml(document, { data });
  assert.equal((html.match(/Baris \d+/g) ?? []).length, 120);
  for (const entry of placements) assert.ok(html.includes(`top:${document.page.margins.top + entry.y}mm;height:${entry.height}mm`));
  const pdf = Buffer.from(exportReport(document, "pdf", data).bytes).toString("latin1");
  assert.equal((pdf.match(/\(Baris \d+\)/g) ?? []).length, 120);
  assert.equal((pdf.match(/\(Deskripsi\)/g) ?? []).length, placements.length);
});

test("large synthetic report maintains row order over at least 23 pages", () => {
  const document = buildTemplate("invoice");
  const input = rows(1000);
  const pages = paginateReport(document, { data: { lines: input } });
  assert.ok(pages.length >= 23);
  const output = pages.flatMap((page) => page.bands.filter((entry) => entry.band.id === "band-lines").flatMap((entry) => entry.rows ?? []));
  assert.deepEqual(output, input);
  assert.ok(pages.every((page) => page.bands.some((entry) => entry.band.kind === "pageHeader") && page.bands.some((entry) => entry.band.kind === "pageFooter")));
});

test("table header can be shown only on first placement without losing rows", async () => {
  const { exportReport } = await import("../../src/reports/index.js");
  const document = buildTemplate("invoice");
  const table = document.bands.flatMap((band) => band.elements).find((element) => element.type === "table")!;
  table.props.headerRepeat = false;
  const data = { lines: rows(100) };
  const placements = paginateReport(document, { data }).flatMap((page) => page.bands.filter((entry) => entry.band.id === "band-lines"));
  assert.ok(placements.length > 1);
  assert.equal(placements[0]?.showTableHeader, true);
  assert.ok(placements.slice(1).every((entry) => entry.showTableHeader === false));
  assert.equal(placements.flatMap((entry) => entry.rows ?? []).length, 100);
  const html = renderReportHtml(document, { data });
  assert.equal((html.match(/>Deskripsi<\/th>/g) ?? []).length, 1);
  const pdf = Buffer.from(exportReport(document, "pdf", data).bytes).toString("latin1");
  assert.equal((pdf.match(/\(Deskripsi\)/g) ?? []).length, 1);
});

test("grouped headings reserve two rows and repeat in HTML and PDF", async () => {
  const { exportReport } = await import("../../src/reports/index.js");
  const document = buildTemplate("invoice");
  const table = document.bands.flatMap((band) => band.elements).find((element) => element.type === "table")!;
  const columns = table.props.columns as Array<Record<string, unknown>>;
  columns[1]!.headerGroup = "Vehicle";
  columns[2]!.headerGroup = "Vehicle";
  const data = { lines: rows(90) };
  const placements = paginateReport(document, { data }).flatMap((page) => page.bands.filter((entry) => entry.band.id === "band-lines"));
  assert.ok(placements.length > 1);
  assert.equal(placements.flatMap((entry) => entry.rows ?? []).length, 90);
  for (const entry of placements) assert.equal(entry.height, 12 + (entry.rows?.length ?? 0) * 7);
  const html = renderReportHtml(document, { data });
  assert.equal((html.match(/colspan="2"[^>]*>Vehicle<\/th>/g) ?? []).length, placements.length);
  assert.equal((html.match(/rowspan="2"/g) ?? []).length, 2 * placements.length);
  const pdf = Buffer.from(exportReport(document, "pdf", data).bytes).toString("latin1");
  assert.equal((pdf.match(/\(Vehicle\)/g) ?? []).length, placements.length);
});

test("table merges refer to the original row and do not repeat on each page", () => {
  const document = buildTemplate("invoice");
  const table = document.bands.flatMap((band) => band.elements).find((element) => element.type === "table")!;
  table.props.merges = [{ row: 0, col: 0, colSpan: 2, rowSpan: 2 }];
  const data = { lines: rows(90) };
  const html = renderReportHtml(document, { data });
  assert.equal((html.match(/<td colspan="2" rowspan="2"/g) ?? []).length, 1);
  assert.equal((html.match(/>Baris 3<\/td>/g) ?? []).length, 1);
  assert.equal((html.match(/>Baris 90<\/td>/g) ?? []).length, 1);
});

test("a row merge that fits on a fresh page is kept together", () => {
  const document = buildTemplate("invoice");
  const table = document.bands.flatMap((band) => band.elements).find((element) => element.type === "table")!;
  const data = { lines: rows(90) };
  const before = paginateReport(document, { data }).flatMap((page) => page.bands.filter((entry) => entry.band.id === "band-lines"));
  const boundary = before[0]!.rows!.length;
  table.props.merges = [{ row: boundary - 1, col: 0, colSpan: 1, rowSpan: 2 }];
  const after = paginateReport(document, { data }).flatMap((page) => page.bands.filter((entry) => entry.band.id === "band-lines"));
  assert.equal(after[0]!.rows!.length, boundary - 1);
  assert.equal(after[1]!.rowOffset, boundary - 1);
  assert.ok(after[1]!.rows!.length >= 2);
  assert.match(renderReportHtml(document, { data }), /rowspan="2"/);
});

test("dedicated narrative flows across pages without dropping or duplicating words", async () => {
  const { exportReport } = await import("../../src/reports/index.js");
  const document = buildTemplate("invoice");
  const words = Array.from({ length: 800 }, (_, index) => `ITEM${index.toString().padStart(4, "0")}`);
  document.bands.splice(1, 0, { id: "band-narrative-test", kind: "detail", height: 20, elements: [{ id: "narrative-test", type: "text", box: { x: 0, y: 0, width: 120, height: 20 }, props: { text: words.join(" "), fontSize: 9, flowText: true } }] });
  const pages = paginateReport(document, { data: {} });
  const fragments = pages.flatMap((page) => page.bands.filter((entry) => entry.band.id === "band-narrative-test"));
  assert.ok(fragments.length > 1);
  assert.deepEqual(fragments.flatMap((entry) => entry.textFragment!.split(/\s+/)), words);
  const html = renderReportHtml(document, { data: {} });
  const pdf = Buffer.from(exportReport(document, "pdf", {}).bytes).toString("latin1");
  for (const word of words) {
    assert.equal(html.split(word).length - 1, 1, `HTML ${word}`);
    assert.equal(pdf.split(word).length - 1, 1, `PDF ${word}`);
  }
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

test("conditional field color and hiding agree between HTML and PDF", async () => {
  const { exportReport } = await import("../../src/reports/index.js");
  const document = buildTemplate("invoice");
  const title = document.bands.flatMap((band) => band.elements).find((element) => element.type === "text")!;
  title.props.text = "CONDITION_PROBE";
  title.conditions = [{ when: "invoice.total > 100", color: "#123456", background: "#aabbcc" }];
  const data = { invoice: { total: 150 } };
  assert.match(renderReportHtml(document, { data }), /color:#123456;background:#aabbcc/);
  const pdf = Buffer.from(exportReport(document, "pdf", data).bytes).toString("latin1");
  assert.match(pdf, /0\.071 0\.204 0\.337 rg/);
  assert.match(pdf, /0\.667 0\.733 0\.800 rg/);
  title.conditions = [{ when: "invoice.total > 100", hide: true }];
  assert.doesNotMatch(renderReportHtml(document, { data }), /CONDITION_PROBE/);
  assert.doesNotMatch(Buffer.from(exportReport(document, "pdf", data).bytes).toString("latin1"), /CONDITION_PROBE/);
});

test("table row conditional colors use the current row in HTML and PDF", async () => {
  const { exportReport } = await import("../../src/reports/index.js");
  const document = buildTemplate("invoice");
  const table = document.bands.flatMap((band) => band.elements).find((element) => element.type === "table")!;
  table.props.rowCondition = { when: "row.amount < 0", color: "#123456", background: "#aabbcc" };
  const data = { lines: [{ description: "NEGATIVE", amount: -1 }, { description: "POSITIVE", amount: 1 }] };
  const html = renderReportHtml(document, { data });
  assert.match(html, /color:#123456;background:#aabbcc[^>]*>NEGATIVE/);
  assert.doesNotMatch(html, /color:#123456;background:#aabbcc[^>]*>POSITIVE/);
  const pdf = Buffer.from(exportReport(document, "pdf", data).bytes).toString("latin1");
  assert.match(pdf, /0\.071 0\.204 0\.337 rg/);
  assert.match(pdf, /0\.667 0\.733 0\.800 rg/);
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
