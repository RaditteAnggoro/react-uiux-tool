import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSampleData } from "../../src/reports/core/sample-validation.js";

test("sample validation reports dataset, record and field while preserving decimal strings", () => {
  const datasets = [{ id: "lines", schema: { fieldTypes: { amount: "number", date: "date", paid: "boolean" } } }];
  const data = { lines: [{ amount: "9007199254740993.12", date: "2024-02-29", paid: false },
    { amount: "oops", date: "2025-02-29", paid: "TRUE" }, 42] };
  assert.deepEqual(validateSampleData(datasets, data, 2), {
    issues: [{ dataset: "lines", row: 2, field: "amount", expected: "number" },
      { dataset: "lines", row: 2, field: "date", expected: "date" }],
    count: 3,
  });
  assert.equal(data.lines[0] && typeof data.lines[0] === "object" && data.lines[0].amount, "9007199254740993.12");
});

test("required fields reject blanks and numeric checks preserve exact decimal strings", () => {
  const datasets = [{ id: "lines", schema: { requiredFields: ["amount", "code"], fieldTypes: { amount: "number" } } }];
  const result = validateSampleData(datasets, {
    lines: [{ amount: "9007199254740993.12", code: "0001" }, { amount: 9007199254740992 }, { code: "  " }],
  });
  assert.deepEqual(result.issues.map(({ row, field, expected }) => [row, field, expected]), [
    [2, "amount", "number"], [2, "code", "required"], [3, "amount", "required"], [3, "code", "required"],
  ]);
});
