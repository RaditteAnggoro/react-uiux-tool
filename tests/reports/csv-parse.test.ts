import { test } from "node:test";
import assert from "node:assert/strict";
import { csvToRecords, parseCsv } from "../../src/reports/index.js";

test("CSV parsing handles quotes, CRLF and BOM", () => {
  const text = '\uFEFFname,amount\r\n"PT, Contoh",1250.50\r\n"Line ""A""",10\r\n';
  const parsed = parseCsv(text);
  assert.deepEqual(parsed.headers, ["name", "amount"]);
  assert.deepEqual(parsed.rows, [
    ["PT, Contoh", "1250.50"],
    ['Line "A"', "10"],
  ]);
  const records = csvToRecords(text);
  assert.equal(records[0]!.name, "PT, Contoh");
  assert.equal(records[1]!.name, 'Line "A"');
});

test("CSV parser rejects malformed input", () => {
  assert.throws(() => parseCsv('a,b\n"unterminated,2'), /Unterminated/);
  assert.throws(() => parseCsv('a,b\nx"y,2'), /Unexpected quote/);
  assert.throws(() => parseCsv(""), /no header/);
  assert.throws(() => parseCsv("a\n1\n2\n3", 2), /row limit/);
});
