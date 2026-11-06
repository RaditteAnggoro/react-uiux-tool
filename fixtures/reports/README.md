# Synthetic report fixtures

Everything in this folder is **synthetic**. Names, accounts, and amounts are
invented for tests. No customer, contract, or vendor data belongs here.

| File | Purpose |
| --- | --- |
| `invoice.report.json` | Native RDM v1 invoice template with `invoice` + `lines` datasets. |
| `statement.report.json` | Grouped account statement with group header/footer. |
| `invoice.data.json` | Sample rows; `subtotal + tax === total`. |
| `statement.data.json` | Sample rows ending at balance `4,250,000`. |

Rules:

1. Fixtures are the canonical serialization of `src/reports/core/templates.ts`.
   Regenerate them with the same builder instead of hand editing.
2. They must always parse, validate, and reserialize byte-identically.
3. Currency and dates are synthetic; Indonesian formatting is intentional.
4. Proprietary `.yrf` samples never live here; they stay outside the repository.
