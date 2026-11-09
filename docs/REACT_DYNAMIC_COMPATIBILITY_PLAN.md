# Rencana kompatibilitas React/TypeScript dinamis

Status: **rencana kerja; belum seluruhnya diterapkan**. Sasaran adalah semua skenario yang secara eksplisit didukung lulus pemeriksaan, dan setiap skenario yang belum dapat dibuktikan aman ditolak dengan alasan yang bisa ditindaklanjuti. Tidak ada tes yang dapat membuktikan nol bug untuk semua project, dependensi, data, browser, dan perilaku React yang mungkin.

Review 25 issue dan daftar pending 9 November tersedia di [Issue review 2026-11-09](ISSUE_REVIEW_2026-11-09.md). Prioritas pertama adalah integritas hasil insert (ISS-013); status sebagian dan belum direproduksi belum dianggap selesai. Issue Report Studio dicatat juga agar tidak hilang dari antrean.

## Ukuran dan cakupan

- Buat inventaris versi fixture yang dapat direproduksi: React JS/TS, Vite, CRA dan Next (Pages/App), CSS global, CSS Modules, Tailwind, CSS-in-JS, komponen majemuk, alias dan barrel exports. Tentukan versi dan status runtime/inspect-only untuk setiap fixture.
- Di project pengguna, inventaris setiap komponen palette dan satu sampel menu per modul bisnis yang tersedia, termasuk CH11, AW, LA, LN dan DM. Simpan **jumlah dan status**, bukan source atau data rahasia, di laporan lokal. Daftar menu dan komponen diambil ulang saat analisis, bukan diasumsikan tetap.
- Untuk setiap kombinasi **komponen × target × skenario data × viewport × OS** yang dinyatakan didukung, catat hasil: lulus, gagal, diblokir dengan alasan, atau belum diuji. Persentase adalah `lulus / jumlah skenario yang dinyatakan didukung`; hitung blocked dan belum diuji terpisah, jangan keluarkan dari laporan.
- Target rilis untuk cakupan yang dideklarasikan: **100% skenario didukung lulus**, **0 P0/P1 terbuka**, **100% kasus yang sengaja tidak didukung menghasilkan alasan**, dan **0 perubahan file di luar target pada pengujian isolasi**. Semua angka harus menyebut versi commit, tanggal, OS dan fixture. Ini bukan klaim bebas bug universal.

## P0 — Baseline dan perlindungan target

**Masuk:** versi tool dan project diketahui. **Keluar:** inventaris dan reproduksi tersimpan, tanpa modifikasi project asli.

1. Salin project uji ke direktori sementara; catat hash seluruh file sebelum dan setelah setiap percobaan. Jangan sertakan kredensial, data nasabah, backend produksi, atau aset vendor dalam repo.
2. Uji pilih container, drag, klik palette, copy, undo, konflik hash, tab, komponen berulang, perubahan eksternal, symlink dan traversal. Bandingkan target sebenarnya dengan target yang dipilih, termasuk kasus beberapa instance identik.
3. Kasus target ambigu, komponen tanpa kontrak, kebutuhan provider/data yang tidak diketahui, atau proyek gagal dimuat harus berhenti dan menampilkan alasan. Pastikan tidak ada source yang ditulis.
4. **Bukti:** laporan jumlah setiap status dan tes regresi per kerusakan; satu pun perubahan tak terkait atau target salah memblokir fase berikutnya.

## P1 — Kontrak komponen dan struktur

**Bergantung:** P0. **Keluar:** daftar kemampuan dan tes kontrak untuk setiap pola yang dinyatakan didukung.

1. Tangani props dan callback TypeScript melalui symbol/type resolution, optional/default, union, inheritance, generics, `memo`/`forwardRef`, named/default exports dan barrel. Untuk JavaScript, bedakan bukti deklarasi/default/penggunaan dari dugaan. Jangan menganggap nama destructuring lokal sebagai nama prop publik.
2. Identifikasi parent–wrapper–child dan impor yang benar menggunakan identitas binding, bukan hanya nama. Uji Form.Field/Form.Button, compound generik, array/fragment, conditional, `.map`, spread, portal dan render prop. Skenario yang dapat memengaruhi lebih dari satu instance tetap diblokir sampai cakupannya jelas.
3. Tampilkan prop wajib, pilihan default yang terbukti, kebutuhan wrapper, dan alasan unavailable. Pengguna memilih nilai; jangan membuat handler atau nilai bisnis secara spekulatif. Simpan `id`/`name` unik dan jaga referensi.
4. **Bukti:** satu tes positif dan negatif per pola, tes benturan nama/impor, dan source diff hanya pada lokasi yang disetujui. Status unknown tidak dihitung sebagai supported.

## P2 — Styling dan layout

**Bergantung:** P0–P1. **Keluar:** fidelity ditentukan per stack dan komponen, bukan berdasarkan warna saja.

1. Ukur computed style untuk komponen asli dan hasil insert pada konteks setara: font, warna, border, ukuran, visibility, flex/grid dan posisi. Uji CSS global, CSS Modules, variabel/theme, style inline, Tailwind, CSS-in-JS, stylesheet bertingkat dan varian yang konflik.
2. Rekam bounding box elemen yang sudah ada sebelum/sesudah; jika elemen lain bergeser di luar toleransi yang ditetapkan per fixture, perlakukan sebagai gagal dan tampilkan diff. Toleransi visual harus disepakati per fixture; jangan sembunyikan perubahan yang disengaja pengguna.
3. Untuk style yang bergantung plugin/config/provider yang belum dimuat, tampilkan preview tidak setara dan hentikan klaim bahwa style tervalidasi. Jangan mengeksekusi konfigurasi project tanpa approval preview yang berlaku.
4. **Bukti:** tes computed style, screenshot before/after dan layout per fixture di desktop, tablet, mobile; Chromium, Firefox, WebKit bila tersedia. Tuliskan stack/OS yang tidak diuji.

## P3 — Data, event dan konteks

**Bergantung:** P0–P1. **Keluar:** setiap binding yang didukung memiliki tipe, sumber, dan hasil yang diverifikasi.

1. Uji nilai statis, controlled/uncontrolled, pilihan kosong, array/object, perubahan state, validasi, event yang sudah ada, nested provider dan loading/error. Verifikasi juga perilaku setelah save, reload, dan undo.
2. Sediakan konfigurasi prop/binding yang memeriksa tipe dan cakupan, serta data contoh lokal yang tidak mengakses layanan produksi. Nilai, identitas, handler, dan hak akses tidak boleh dikarang atau disalin diam-diam.
3. Kasus yang memerlukan autentikasi, layanan eksternal, mutasi finansial, atau fungsi baru harus ditandai belum diuji/diblokir sampai fixture dan otorisasi yang tepat tersedia.
4. **Bukti:** tes alur yang membuktikan perubahan data dan event sesuai harapan, plus tes negatif nilai hilang, salah tipe, handler tak ada dan data kosong.

## P4 — Verifikasi lintas platform dan rilis

**Bergantung:** P1–P3. **Keluar:** matrix release dapat direproduksi dan semua gate lulus.

1. Jalankan `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run docs:check`, dan checks terkait lain pada versi final. Jalankan CI macOS, Windows dan Linux dengan versi Node yang didukung; verifikasi separator, CRLF, permission, symlink dan locking di OS sebenarnya.
2. Jalankan smoke test project bisnis pada **salinan** dengan jaringan terkendali dan skenario CH11/AW/LA/LN/DM yang tersedia. Rekam target, source diff, visual, status event/data dan undo, tanpa menyimpan data bisnis sensitif.
3. Setiap kegagalan/flaky dicatat sebagai gagal sampai akar masalah ditangani dan rerun bersih; tidak mengubah assertion hanya agar hijau. Audit performa dengan project kecil dan besar dan ukur waktu/kapasitas, bukan menetapkan target angka tanpa baseline.
4. Perbarui `COMPATIBILITY_MATRIX.md`, `KNOWN_LIMITATIONS.md` dan panduan EN/ID berdasarkan bukti. Siapkan rollback, catat perubahan file, dan ulangi tes pada commit final.

## Status awal dan urutan kerja

- **Sudah ada, perlu diperluas:** wrapper langsung yang unik dari source, penolakan pola ambigu, sebagian props TS dan JSX statis, serta contoh tes styling dan menu. Ini belum membuktikan kesetaraan perilaku seluruh komponen.
- **Pertama:** selesaikan inventaris P0 dan perbaiki kesalahan kontrak yang dapat direproduksi. Lanjutkan P1 → P2/P3 → P4 setelah bukti fase sebelumnya tersedia.
- **Belum diklaim:** semua 571 komponen, semua menu, semua style, Windows runtime, browser lintas platform, Next runtime, sistem data produksi, atau 100% bebas bug.

### Progres P0

- `npm run compat:inventory -- <folder-project>` menghasilkan inventaris JSON lokal
  yang memisahkan komponen terindeks dari status validasi. Semua komponen dimulai
  sebagai `not-tested`; jumlah usage/dynamic, asal style yang teramati, nama prop
  data, event, dan bukti wrapper bukan bukti keberhasilan runtime. Output berisi
  nama komponen dan path relatif project, jadi simpan hanya di lokasi tepercaya.
- Salinan dengan beberapa identitas, spread, atau referensi ke ID yang diubah kini
  ditolak sampai seluruh identitas dan referensinya dapat ditangani dengan benar.
- Perubahan pada implementasi component bersama memerlukan konfirmasi pengguna;
  membatalkan konfirmasi tidak menulis source. Salinan dengan satu identitas juga
  mempertahankan line ending CRLF.
- Tes isolasi memeriksa file lain tetap byte-identik saat insert dan seluruh file
  kembali identik setelah undo. Penyisipan component yang tidak diketahui ke dalam
  HTML `button`, paragraf, atau heading ditolak untuk menghindari struktur rusak.
- Inventaris read-only pada project bisnis lokal mencatat 577 entri komponen,
  21 kelompok folder menu, dan 5 file terlewati; 577 entri berstatus `not-tested`
  dalam inventaris ini. Angka tersebut bukan jumlah komponen yang lolos pengujian.
- Smoke source pada salinan project mengambil paling banyak satu `Form` dan satu
  `Button` per kelompok folder views: 22 kelompok ditemukan, 17 insert + undo
  lulus, 5 diblokir, 0 gagal. Hash diperiksa untuk file yang terindeks dan package
  file; file terlewati tidak termasuk. Ini bukan tes visual, event, data bisnis,
  semua menu, atau semua komponen. Dijalankan di macOS/Node 24 pada working tree
  yang belum bersih, sehingga bukan bukti CI platform lain.
- Analisis melaporkan ada CSS dengan encoding bukan UTF-8 serta direktori yang
  dikecualikan dari pemindaian; jangan menyimpulkan seluruh style sudah tercakup.
- Pada pemeriksaan read-only berikutnya terhadap 577 entri yang sama, 182 memiliki
  usage yang teramati, 88 memiliki usage dinamis, 334 memiliki bukti asal style,
  45 memiliki nama prop data yang dikenali, dan 107 memiliki event yang dikenali.
  Kategori ini dapat tumpang tindih dan hanya merupakan bukti statis; semuanya tetap
  `not-tested` dalam inventaris, dengan 5 file terlewati.
- P0 belum selesai: pengukuran hash per skenario, pemeriksaan seluruh menu,
  serta smoke test lintas OS dan visual masih diperlukan.

### Bukti fixture yang mulai dikumpulkan untuk P2–P3

- Fixture komponen majemuk memeriksa warna CSS Module dan bounding box komponen
  yang sudah ada sebelum/sesudah insert; hasil ini hanya berlaku untuk fixture itu.
- Preview menampilkan peringatan bila Tailwind terdeteksi karena konfigurasi dan
  plugin project tidak dimuat oleh adapter internal; ini bukan validasi fidelity.
- Fixture event memeriksa binding ke fungsi lokal dan perubahan state di mode
  Interact, serta penghapusan binding melalui undo. Ini bukan verifikasi backend
  atau data bisnis produksi.
- Inspector memberi petunjuk bila component yang menyediakan `value` belum
  memiliki prop `value` pada usage terpilih. Petunjuk ini bukan bukti bahwa data
  salah; uncontrolled/default/spread masih memerlukan pemeriksaan tersendiri.
- Cursor untuk objek terpilih mengikuti kemampuan pindah yang terdeteksi, dan
  delapan handle resize laporan memakai cursor horizontal, vertikal, atau diagonal.
  Pengujian cursor menggunakan fixture; ini tidak membuktikan seluruh komponen dapat
  dipindahkan atau di-resize.
- Kedua fixture merupakan contoh awal, bukan penyelesaian gate P2/P3. Lihat hasil
  tes aktual pada run yang digunakan; jangan menganggap dokumen ini bukti kelulusan.
