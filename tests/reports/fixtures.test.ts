import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  parseReport,
  renderReportHtml,
  serializeReport,
} from "../../src/reports/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  path.join(here, "..", "..", "fixtures", "reports", "synthetic", name);

async function readText(name: string): Promise<string> {
  return readFile(fixture(name), "utf8");
}

test("committed fixtures parse and reserialize byte-identically", async () => {
  for (const name of ["invoice.report.json", "statement.report.json"]) {
    const text = await readText(name);
    const parsed = parseReport(text);
    assert.equal(parsed.ok, true, `${name}: ${JSON.stringify(parsed.errors)}`);
    assert.equal(serializeReport(parsed.document!), text);
  }
});

test("synthetic sample data reconciles with its declared totals", async () => {
  const invoice = JSON.parse(await readText("invoice.data.json")) as {
    invoice: { subtotal: number; tax: number; total: number };
  };
  assert.equal(invoice.invoice.subtotal + invoice.invoice.tax, invoice.invoice.total);

  const statement = JSON.parse(await readText("statement.data.json")) as {
    entries: Array<{ debit: number; credit: number; balance: number }>;
  };
  const last = statement.entries[statement.entries.length - 1];
  assert.equal(last.balance, 4250000);
});

test("fixtures render without executing document content", async () => {
  const text = await readText("invoice.report.json");
  const parsed = parseReport(text);
  assert.equal(parsed.ok, true);
  const html = renderReportHtml(parsed.document!);
  assert.match(html, /Invoice \/ Faktur/);
  assert.ok(!/<script/i.test(html), "renderer must not emit script tags");
});
