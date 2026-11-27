# Temuan skema YRF

Tabel berikut mencatat inspeksi awal pada 6 November 2026. Dukungan saat ini ada di bagian terakhir.

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
numbers are device-relative rather than a single absolute unit. **Keep existing dimensions in raw units.** The local canvas scales them for display and preserves values on Save. New experimental output uses a documented approximation.

## Dukungan Studio yang teruji

- Design memilih halaman eksplisit dan menempatkan report header/footer di halaman pertama/terakhir. Peringatan tinggi berasal dari jumlah tinggi bagian pada skala mentah lokal. Studio tidak menghitung pengulangan data atau pagination vendor.
- `AR.DataControl` dan `AR.XML` mengizinkan flag visibilitas yang sudah ada. `AR.XML` juga mengizinkan pola recordset. URL sumber tetap dilindungi dan Studio tidak membaca XML vendor.
- `AR.Barcode`, `rtf` dan `subReport` mengizinkan geometri mentah yang sudah ada. Payload hex lama `AR.Barcode` tetap hanya baca. Objek eksplisit `barcode` berjenis Code 128 dan `qrcode` punya nilai literal yang dapat diedit dan dirender di Design. `rtf` dengan teks polos tetap dapat diedit. RTF standar menampilkan gaya bold, italic, dan underline secara baca-saja. `subReport` menerima nama `.rpx` atau `.yrf` satu segmen. Tombol **Buka YRF tertaut** membuka `.yrf` di folder yang sama. Pratinjau RTF mengikuti subset kontrol karakter dan baris dari dokumentasi format. [Microsoft TOM RTF](https://learn.microsoft.com/en-us/windows/win32/controls/about-text-object-model)
- Save dan Save copy memeriksa hash, JSON dengan key unik, script dan properti format yang dilindungi. Tidak ada script vendor yang dijalankan. Pembuatan eksperimental dari native menyalin nama field sederhana ke `dataField` dan meninggalkan sumber data serta komponen lanjutan.
- Audit baca-saja terhadap 167 file Wai mencoba 106 perubahan di memori dengan hasil SHA-256 sumber yang sama. Berkas sintetis menguji beberapa halaman serta Save dan Save copy. Akurasi cetak vendor berada di luar cakupan preview lokal.

Untuk lisensi dan batas distribusi runtime, lihat [YRF runtime license checklist](YRF_RUNTIME_LICENSE_CHECKLIST.md).
