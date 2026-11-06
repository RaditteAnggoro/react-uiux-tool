# YRF schema findings (read-only inspection)

Status: **UNVERIFIED / inspection only**, 2026-11-06. No vendor code was executed and
no sample content is committed to this repository. All `.yrf` editing remains locked.

## What was inspected

Local vendor folder provided by the operator (path intentionally relative here):

```text
<operator-local>/waiReport/
  waiReport.js, waiReportAgent.js, waiReportDist.js, waiRepCore.js, …
  Samples/BandSample.yrf   (9,527 bytes)
  Samples/FA14.yrf        (30,065 bytes)
  Samples/voucher.yrf     (33,742 bytes)
```

Inspection was byte reads plus bounded JSON structure walks. No sample was copied,
rewritten, uploaded, or rendered.

## Observed structure (all three samples)

| Observation | BandSample | FA14 | voucher |
| --- | --- | --- | --- |
| Encoding | UTF-8, no BOM | UTF-8, no BOM | UTF-8, no BOM |
| Root keys | `waiReportForm, pageSetting, styles, script, vbScript, layout` | same | same (no `vbScript`) |
| `waiReportForm.version` | `1.0.0` | `1.0.0` | `1.0.0` |
| `waiReportForm.license` | empty | empty | empty |
| `pageSetting.paper.type` | `A4` | `A4` | `A4` |
| `pageSetting.paper.width × height` | 2320 × 3308 | 2889 × 4085 | 2166 × 3063 |
| `pageSetting.orientation` | `0` | `1` | `0` |
| `styles` entries | 0 | 4 | 4 |
| `layout.pages` | 1 page, 5 bands | 1 page, 5 bands | 1 page, 3 bands |
| Band `type` values | pageHeader, groupHeader, detail, groupFooter, pageFooter | same | pageHeader, detail, pageFooter |
| Object `type` values | `label` | `shape, line, label, textbox, AR.XML` | `shape, line, label, textbox, AR.XML, rtf` |
| Layout sides | `reportHeader`, `reportFooter` present | present | present |

Object geometry keys observed: `type, name, left, top, width, height` plus optional
`caption` and border style/colour keys. Bands carry `script` hooks
(`OnFormat`, `OnBeforePrint`, `OnAfterPrint`) that are frequently empty strings.

## Unit mapping — explicitly unverified

All three files declare `paper.type: "A4"` yet use three different numeric extents
(2320×3308, 2889×4085, 2166×3063). The aspect ratios are consistent with A4, so the
numbers are device-relative rather than a single absolute unit. **Do not convert these
numbers to millimetres, style them as CSS pixels, or write them back under an assumed
scale.** Any geometry mapping needs a documented scale source plus golden output.

## What the shipped inspector does

`/api/reports/yrf/open` returns the band/object tree, raw geometry, caption text,
unknown kinds, and script-field warnings without executing anything. Caption edits
for `label`/`textbox` objects go through a single-span patcher that verifies every
other string span is unchanged, then writes a sibling `*.edited.yrf` copy with hash
conflict checks. `.yrf` creation returns `403 YRF_CREATE_BLOCKED`.

## Experimental write path

Opening a `.yrf` in the inspector allows caption and geometry (`left`, `top`, `width`,
`height`) edits for any object, applied as source-span patches that verify every other
scalar is unchanged, then saved to a sibling copy. `.yrf` creation from a native
template is available after an explicit acknowledgement checkbox and is derived from
the structure of the three samples only (11 units/mm approximation). Neither path is
validated against the vendor renderer yet.

## Consequences for the product

1. `.yrf` stays **read-only**: no import-to-RDM, no generic save, no guessed keys.
2. The inspector may show raw numbers and an explicitly *approximate* canvas only.
3. A source-span patcher, if ever built, may touch only verified literal fields with an
   expected old value, original SHA-256, and a copy-only save.
4. `voucher.yrf` remains blocked even for read-write experiments until its own golden
   and financial-invariant audit exists.
5. Scripts and `AR.XML`/`rtf` objects stay opaque and are never executed.

## Open questions (evidence gates)

1. What produces the differing extents for identical paper types (DPI setting, editor
   zoom, per-file scale)? Unverified.
2. Are `script`/`vbScript` hooks required for correct rendering, or optional? Unverified.
3. What is the authoritative API of the shipped runtime? Not inspected; do not guess.
4. What licence permits embedding, modification, and redistribution? See
   `YRF_RUNTIME_LICENSE_CHECKLIST.md` — unresolved.
