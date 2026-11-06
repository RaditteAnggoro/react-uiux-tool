import { test } from "node:test";
import assert from "node:assert/strict";
import {
  add,
  compare,
  divide,
  evaluateExpression,
  formatDecimal,
  multiply,
  parseDecimal,
  roundDecimal,
  toDecimalString,
  toNumber,
} from "../../src/reports/index.js";

test("decimal money arithmetic is exact", () => {
  const sum = add(parseDecimal("0.1", 2), parseDecimal("0.2", 2));
  assert.equal(Number(toDecimalString(sum)), 0.3);
  assert.equal(Number(toDecimalString(multiply(parseDecimal("1250.50"), parseDecimal("3")))), 3751.5);
  assert.equal(toDecimalString(divide(parseDecimal("10"), parseDecimal("3"), 4)), "3.3333");
  assert.equal(toDecimalString(roundDecimal(parseDecimal("1.005", 4), 2)), "1.01");
  assert.equal(compare(parseDecimal("2.50"), parseDecimal("2.5")), 0);
});

test("decimal formatting follows the requested locale", () => {
  const value = parseDecimal("1234567.5", 2);
  assert.match(
    new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2 }).format(1234567.5),
    /1\.234\.567,50/,
  );
  assert.match(formatDecimal(value, { locale: "id-ID" }), /1\.234\.567,50/);
  assert.match(formatDecimal(value, { locale: "en-US" }), /1,234,567\.50/);
});

test("large decimals stay exact and unsafe conversions fail loudly", () => {
  const big = parseDecimal("999999999999999.99", 2);
  assert.equal(toDecimalString(big), "999999999999999.99");
  assert.throws(() => toNumber(big), /too large/);
});

test("division by zero and invalid decimals are rejected", () => {
  assert.throws(() => divide(parseDecimal("1"), parseDecimal("0")), /Division by zero/);
  assert.throws(() => parseDecimal("abc"), /Invalid decimal/);
});

test("expressions evaluate arithmetic with correct precedence", () => {
  const result = evaluateExpression("1 + 2 * 3");
  assert.equal(result.ok, true);
  if (result.ok && result.value && typeof result.value === "object") {
    assert.equal(Number(toDecimalString(result.value)), 7);
  } else {
    assert.fail("expected a decimal result");
  }
});

test("expressions resolve row and dataset paths", () => {
  const context = {
    row: { jumlah: "12", nama: null },
    datasets: { lines: [{ amount: "1000.25" }, { amount: "2500.75" }] },
    locale: "id-ID",
  };
  const big = evaluateExpression("IF(jumlah > 10, 'besar', 'kecil')", context);
  assert.equal(big.ok && big.value, "besar");
  const fallback = evaluateExpression("COALESCE(nama, 'Anonim')", context);
  assert.equal(fallback.ok && fallback.value, "Anonim");
  const total = evaluateExpression("SUM(lines.amount)", context);
  assert.equal(total.ok, true);
  if (total.ok && total.value && typeof total.value === "object") {
    assert.equal(Number(toDecimalString(total.value)), 3501);
  }
});

test("whitelisted functions work and unknown functions are rejected", () => {
  const rounded = evaluateExpression("ROUND(1.005, 2)");
  assert.equal(rounded.ok, true);
  if (rounded.ok && rounded.value && typeof rounded.value === "object") {
    assert.equal(toDecimalString(rounded.value), "1.01");
  }

  const formatted = evaluateExpression("FORMAT_NUMBER(1234567.5, 2)", { locale: "id-ID" });
  assert.equal(formatted.ok, true);
  assert.match(String(formatted.ok ? formatted.value : ""), /1\.234\.567,50/);

  const page = evaluateExpression("PAGE()", { page: 3, totalPages: 9 });
  assert.equal(page.ok && toDecimalString(page.value as never), "3");

  const unknown = evaluateExpression("process.exit(1)");
  assert.equal(unknown.ok, false);
  assert.match(unknown.ok ? "" : unknown.error, /Unknown function/);
});

test("expression failures degrade to errors, never exceptions", () => {
  const division = evaluateExpression("1 / 0");
  assert.equal(division.ok, false);
  assert.match(division.ok ? "" : division.error, /Division by zero/);
  const broken = evaluateExpression("1 +");
  assert.equal(broken.ok, false);
});
