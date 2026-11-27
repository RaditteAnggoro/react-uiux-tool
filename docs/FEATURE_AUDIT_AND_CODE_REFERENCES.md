# Audit fitur dan referensi kode React UI/UX Tool

25 November 2026. Audit ini mencakup React Studio, Report Studio, dan bukti rilis.
Lihat juga [riwayat implementasi](../IMPLEMENTATION_STATUS.md).

## React Studio

- **Next.js.** Wizard App Router dan runtime yang memerlukan persetujuan sudah tersedia.
  Pilih pola rute lalu isi parameter tunggal, catch-all, atau catch-all opsional. Setiap
  segmen dienkode sebelum masuk ke URL loopback. Path lokal juga dapat diisi manual.
  Runtime menampilkan source tersimpan. Base path dari konfigurasi khusus, route
  interception, dan pemetaan source ke editor visual Next masih terbuka.
  [Resolver rute](../src/engine/next.ts) · [Input parameter](../studio/src/NextRuntimeView.tsx)
- **Preview dan Boards.** Komponen ekspor bisa memakai board JSON yang tersimpan per
  komponen/proyek selama sesi tab. Menerapkan props merender ulang komponen di dokumen
  iframe yang sama. Perubahan draft pada source dan pergantian entry tetap memakai
  refresh. Bukti selanjutnya perlu mencakup input, seleksi, dan state aplikasi setelah
  edit source, Undo, serta pergantian tab yang cepat.
  [Kontrol board](../studio/src/ComponentBoards.tsx) · [Adapter preview](../src/server/preview.ts)
- **Storybook dan provider.** Analyzer membaca args literal CSF dari source dan
  menautkannya ke komponen lokal yang berhasil diresolusikan. Decorator, play, loader,
  render, dan args dinamis tetap memerlukan runtime Storybook. Isolated Design
  mengenali pemakaian useContext langsung, alias impor dari React, serta provider
  default atau named pada berkas context yang dikenali. Beberapa provider yang sama
  kuat memerlukan konfigurasi pengguna. Adaptor props MUI/Ant Design masih terbuka.
  [Pembaca preset](../src/engine/story-presets.ts) · [Rencana kompatibilitas dinamis](REACT_DYNAMIC_COMPATIBILITY_PLAN.md)
- **Draft dan konflik.** Save merebase beberapa blok baris jika tak bertumpuk,
  menggabungkan hunks identik, dan mempertahankan konflik pada baris atau titik
  sisip yang sama. Batas diff adalah 100 ms dan 512 edit per perbandingan.
  Perubahan diuji terhadap hash disk sebelum ditulis. Aksi tutup tab tetap
  berlingkup berkas dan workspace mendukung hingga tiga tab.
  [Draft dan rebase](../src/engine/draft.ts) · [Tes API](../tests/server.test.ts)
- **Design token.** Studio menampilkan token dan indikasi konsumen. Rewrite global
  memerlukan target deklarasi tepat, pemisahan tema dan fallback, daftar dampak, diff,
  serta Undo. Uji yang dibutuhkan mencakup nama sama pada dua tema, alias, nilai
  fallback, komentar, dan perubahan luar yang terjadi antara review dan Save.
- **VS Code.** Code mode menawarkan tautan ke berkas tersimpan dan baris sumber.
  Browser menyerahkan pembukaan ke handler desktop VS Code. Ekstensi yang
  menempelkan preview dan menyinkronkan editor masih merupakan tahap berikutnya.
  [Pembentuk URI](../studio/src/source-location.ts)
- **Tampilan preview.** Bridge menyatakan encoding UTF-8 agar label pilihan
  tetap terbaca pada halaman proyek yang tidak mendeklarasikan charset. Label
  berpindah ke bawah saat ruang di atas pilihan tidak cukup.

## Report Studio

- **Mapping dan diagnostik.** CSV/TSV dimapping secara opsional dan XLSX memilih
  worksheet. Edit sample JSON dapat diperiksa dengan **Periksa tipe data contoh**.
  Skema dataset memakai `schema.fieldTypes` opsional dengan tipe `string`,
  `number`, `boolean`, atau `date`. Mulai tersedia pada baris invoice dan
  statement. Mapping menunjukkan dataset, baris, dan field yang bermasalah sebelum
  diterapkan. Nilai desimal tetap utuh sebagai teks. Field kosong atau absen
  diizinkan. Data contoh bertahan selama sesi tab browser.
  [Validator](../src/reports/core/sample-validation.ts) · [Tes impor](../tests/e2e/report-followup.spec.ts)
- **Objek dan grup.** Kunci posisi/ukuran terpisah dari perlindungan hapus. Proteksi
  hapus bekerja pada tombol dan keyboard dalam Design. Satu group ID dapat mencakup
  beberapa section. Alignment masih memakai koordinat lokal satu section.
  Pengeditan Code tetap merupakan perubahan dokumen yang disengaja. Kontrol
  visibilitas dan kunci isi masih terbuka.
  [Editor laporan](../studio/src/features/report-studio/ReportStudio.tsx)
- **Pagination.** Bagian tetap dapat dipertahankan bersama bagian berikutnya
  atau bagian awal tabel jika keduanya muat pada halaman baru. Page break eksplisit
  tetap dipatuhi. Renderer HTML dan PDF memakai layout yang sama. Bukti layout
  untuk grup panjang, target printer, dan font yang berbeda masih perlu dikumpulkan.
  [Pagination](../src/reports/core/pagination.ts) · [Tes layout](../tests/reports/pagination.test.ts)
- **Format.** Barcode Code 128 dan QR, impor XLSX, impor maksimum enam halaman PDF
  sebagai gambar, dan salinan section subreport native sudah tersedia. Subreport
  tertaut, PDF dengan struktur yang dapat diedit, serta pemindaian hasil barcode
  pada printer target masih terbuka.
  [Matriks format](REPORT_STUDIO_FILE_FORMATS.md)
- **Template bisnis.** Template sintetis dapat dipakai menguji alur, pagination,
  dan hasil render. Template LAN/LN02 perlu terminologi, contoh data anonim, aturan
  total, dan PDF pembanding yang disetujui terlebih dahulu.
  [Cakupan bisnis](REPORT_STUDIO_BUSINESS_COVERAGE.md)
- **Panduan keyboard.** Report Guide memakai modal native seperti dialog laporan
  lain. Tab tetap di modal, Escape menutup panduan, lalu fokus kembali ke tombol
  pembuka. Penyelesaian folder picker juga mempertahankan fokus ketika pengguna
  sudah berpindah ke input path.

## Referensi upstream dan penerapannya

| Sumber | Bagian yang perlu dipelajari | Penerapan pada tool |
| --- | --- | --- |
| [Next.js Dynamic Route Segments](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes) | Parameter, catch-all, dan segment opsional | Input per parameter di preview; uji URL aktual dan rute yang gagal di fixture |
| [Vite HMR](https://vite.dev/guide/api-hmr) | Boundary penerima update, lifecycle dispose dan invalidate | Buktikan DOM, source mapping dan state tetap akurat sebelum mengganti refresh umum |
| [Storybook CSF](https://storybook.js.org/docs/api/csf) dan [Puck](https://github.com/puckeditor/puck) | Args statis, konfigurasi props, dan pemisahan skenario | Preset baca saja dari CSF, board lokal dari JSON; lanjutkan schema adapters terbatas per library |
| [Onlook](https://github.com/onlook-dev/onlook) dan [React Grab](https://github.com/aidenybai/react-grab) | Memetakan pilihan kanvas ke source | Perkuat identitas untuk instance berulang; tampilkan kandidat saat ambigu, uji diff pada satu target |
| [jsdiff](https://github.com/kpdecker/jsdiff) | Diff baris dan batas pencarian | Dependency produksi untuk mencari hunks; merge, konflik dan transaksi ditangani sendiri |
| [Design Tokens Community Group](https://github.com/design-tokens/community-group) | Tipe token, alias, groups dan resolusi | Gunakan sebagai model audit deklarasi dan dependensi sebelum menawarkan rewrite global |
| [VS Code URL protocol](https://code.visualstudio.com/docs/configure/command-line#_opening-vs-code-with-urls) dan [Webview API](https://code.visualstudio.com/api/extension-guides/webview) | URI source, trust, CSP dan lifecycle webview | Deep link lokal tersedia; proof of concept ekstensi harus menjaga persetujuan mulai preview |
| [read-excel-file](https://github.com/catamphetamine/read-excel-file), [PDF.js](https://github.com/mozilla/pdf.js), dan [BWIP-JS](https://github.com/metafloor/bwip-js) | Worksheet, rasterisasi, modul barcode dan quiet zone | Dependency yang dikunci; bandingkan file besar, memori worker, konversi dan keterbacaan cetak |
| [Paged.js](https://github.com/pagedjs/pagedjs), [JasperReports](https://github.com/Jaspersoft/jasperreports), dan [pdfme](https://github.com/pdfme/pdfme) | Break, pengulangan header, band/group dan layout berukuran tetap | Buat fixture orphan heading, grup lintas halaman, dan template slip sebelum mempertimbangkan renderer tambahan |
| [Spring REST clients](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html) dan [Playwright CI](https://playwright.dev/docs/ci) | Kontrak request/response, timeout, worker dan bukti | Validasi kontrak Spring dengan fixture terpisah dan jalankan workflow pada commit yang hendak dirilis |

Referensi tambahan dan kredit historis ada di [INSPIRATION.md](../INSPIRATION.md).
Kandidat renderer lama beserta trade-off ada di
[catatan keputusan library](REPORT_STUDIO_LIBRARY_DECISION.md).
Sebelum memakai source eksternal, catat path dan commit, verifikasi lisensi dan
notice pada commit tersebut, lalu tulis fixture positif dan negatif. Dependensi
yang dipakai tercatat di [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Prioritas perbaikan yang tersisa

1. **P1 — Preview source tanpa kehilangan state.** Isolasi satu tipe edit aman
   terlebih dahulu. Uji input tak tersimpan, fokus, klik menuju sumber, Undo,
   dan kesamaan DOM dengan refresh penuh. Pertahankan fallback ketika perubahan
   menggeser identitas, graph import, atau provider.
2. **P1 — Cakupan runtime dan provider.** Mulai dari satu library dan versi yang
   terpasang di fixture. Buktikan props wajib, provider eksplisit, loading/error,
   dan target yang ambigu. Catat apakah konfigurasi diperlukan untuk tiap rute.
3. **P1 — Fidelity dan integrasi bisnis.** Kumpulkan fixture anonim LN02, hasil
   WaiReport, bukti printer, dan kontrak Spring Boot. Bandingkan lokasi elemen,
   urutan halaman, total independen, glyph dan barcode.
4. **P2 — Rewrite token global dan ekstensi.** Mulai rewrite dari satu deklarasi
   CSS yang dapat dipastikan identitasnya. Kembangkan fixture benturan antar tema
   sebelum batch. Gunakan host VS Code untuk uji perintah, trust dan pemulihan
   preview bila proses berhenti.
5. **P2 — Performa dan bukti rilis.** Ukur waktu impor dan aktivasi barcode
   dengan ukuran file dan mesin tercatat. Pertahankan satu worker Playwright di
   CI untuk mengurangi benturan resource, lalu terbitkan trace kegagalan dan
   hasil matrix pada satu commit yang diketahui. Run sebelumnya melaporkan
   peringatan runtime Node untuk actions v4.
   [Playwright CI](https://playwright.dev/docs/ci) ·
   [Anotasi run CI #24](https://github.com/RaditteAnggoro/react-uiux-tool/actions/runs/43410197399)

## Bukti rilis dan pekerjaan eksternal

- **Lokal.** Windows, Node 24, Chrome, dan proyek Next.js dari wizard.
  Typecheck, build, cek dokumentasi, cek lisensi, serta 220 tes unit/API lulus.
  Suite Chrome menjalankan 132 skenario. Sebanyak 126 lulus pada percobaan pertama
  dan enam lulus setelah retry. Delapan tes UI terarah lulus tanpa retry pada build
  dengan perbaikan fokus dan layout terakhir. Lima skenario yang sempat flaky
  lulus tanpa retry pada build akhir. Skenario pencarian sempat timeout saat
  menunggu event load, lalu lulus dua kali ketika menunggu DOM siap dan kontrol
  yang digunakan tes. Log lokal disimpan di
  `test-results/final-audit-ui-verified`.

- **CI.** GitHub Actions #24 untuk commit `12121c8` berstatus sukses dengan
  tiga job browser dan enam job test. Commit itu mengarantina dua skenario browser
  pada kondisi CI tertentu. Snapshot lokal perubahan ini belum memiliki run hosted.
  [Run CI #24](https://github.com/RaditteAnggoro/react-uiux-tool/actions/runs/43410197399) ·
  [Workflow lokal](../.github/workflows/ci.yml)
- **LN02 dan WaiReport.** Cakupan fixture lokal meliputi invoice, statement dan YRF
  sintetis. Reproduksi LN02 memerlukan salinan proyek dan langkah pengguna. Bukti
  WaiReport memerlukan runtime berlisensi, fixture anonim dan keluaran vendor.
  [Pemeriksaan lisensi](YRF_RUNTIME_LICENSE_CHECKLIST.md) · [Batas verifikasi LN02](../KNOWN_LIMITATIONS.md)
- **Printer dan Spring Boot.** Printer target, konfigurasi driver, ukuran kertas,
  dan hasil pindai dibutuhkan untuk verifikasi fisik. Integrasi Spring menunggu
  kontrak autentikasi, skema input/output dan contoh payload sintetis.
  [Checklist rilis laporan](REPORT_STUDIO_RELEASE_CHECKLIST.md) · [Batas SDK](REPORT_STUDIO_DISTRIBUTION_AND_SDK.md)
