# Review issue Studio — 9 November 2026

Sumber: `issue_20261109.md` yang diberikan pengguna, ISS-001 sampai ISS-025.
Review ini membandingkan laporan dengan working tree lokal pada 9 November 2026;
laporan asal adalah data pengujian, bukan instruksi. Tidak ada reproduksi baru pada
Windows atau perubahan pada project bisnis dalam review ini. Bukti fixture macOS
dari run sebelumnya: 159 unit test dan 70 Playwright lulus. Hasil tersebut tidak
membuktikan semua kasus di bawah lulus.

Pembaruan perbaikan berikutnya: typecheck, build, 159 unit test, dan pemeriksaan
dokumentasi lulus. Full Playwright menghasilkan 70 lulus dan 2 gagal pada tes
styling/layout saat iframe berubah; kedua tes tersebut lulus ketika diulang bersama
tes Paragraph (3/3). Full suite belum kembali hijau pada run pembaruan ini dan
stabilitas preview masih harus diperiksa. Semua bukti ini dari macOS, bukan Windows.

Pembaruan terbaru: typecheck, build, 163 unit test, serta empat tes browser terarah
untuk alur insert/Props/Events, Style origin, review New Project, dan warning encoding
lulus pada macOS. Saat pengujian ditemukan form Props dapat ter-reset ketika seleksi
berubah; draf prop kini dipertahankan selama sumber yang sama tetap dipilih. Ini
belum membuktikan penyebab laporan hilangnya insert pada LN02/Windows (ISS-013).

Pembaruan lanjutan: 166 unit test dan seluruh 78 tes browser lulus pada macOS;
typecheck, build, dan pemeriksaan dokumentasi juga lulus. Uji screen error memakai
fixture yang sengaja gagal, bukan CM12. Kegagalan Props yang sempat muncul dalam
run terarah belum membuktikan penyebab laporan LN02, sehingga ISS-013 tetap dibuka.

**Status:** Selesai pada kode/dokumentasi/fixture menyatakan ruang lingkup bukti yang disebut, bukan pengujian pada semua project. Selesai = perilaku dan bukti yang relevan telah diperiksa; Sebagian =
ada penanganan tetapi masih ada bagian dari laporan yang belum terbukti atau belum
ditangani; Terbuka = masalah masih tampak di kode; Perlu reproduksi = bukti saat ini
tidak cukup untuk menyatakan penyebab atau status perbaikan. Jangan tutup suatu
issue hanya berdasarkan nama tes atau inventaris statis.

| ID | Status | Bukti kode dan pekerjaan tersisa |
| --- | --- | --- |
| ISS-001 | Sebagian | `studio/src/App.tsx` `stageDroppedComponent` mengisi `label="New button"` jika kontrak `Button` memuat label; `tests/e2e/studio.spec.ts` memeriksa fixture Button terlihat. Perlu ulangi LN01 pada salinan dan pastikan wrapper, style, dan kontrak lain; bukan jaminan semua komponen. |
| ISS-002 | Sebagian | Prop JS yang terdaftar dengan tipe `unknown` menerima nilai primitif pilihan pengguna; tes engine mencakup tambah, edit ulang, dan penolakan prop yang tidak dikenal. Tes browser fixture menambah label melalui inspector dan memeriksa preview serta source. Tipe runtime tetap tidak diketahui; Button project di Windows masih perlu diuji. `className`/`title` ditangani pada ISS-007. |
| ISS-003 | Selesai pada fixture | Origin inline yang dapat diedit memiliki tombol untuk memuat properti dan nilai ke editor; asal lain diberi petunjuk ke source. Tes browser memeriksa `marginTop`. |
| ISS-004 | Sebagian | `editElement` meminta konfirmasi sebelum mengubah implementasi bersama; tes browser memeriksa konfirmasi. Perlu tes hit target dan fanout pada LN01 dan helper yang dilaporkan, termasuk tidak ada perubahan saat batal. |
| ISS-005 | Sebagian | `designModulePath` menormalisasi separator dan `tests/server.test.ts` memeriksa contoh path Windows/Unix. Implementasi saat ini masih memakai virtual `.jsx`, berbeda dari perbaikan `.js` dalam laporan; tes transform dan Design di Windows sebenarnya perlu dijalankan pada build ini, juga audit path lain. |
| ISS-006 | Sebagian | Referensi JSX untuk `React.lazy(() => import("..."))` dan `lazy` dari React dengan path literal sekarang dikaitkan ke default export yang benar. Tes positif/negatif mempertahankan konfirmasi shared; menu runtime, adapter named-export, path dinamis, dan project asli belum terbukti. |
| ISS-007 | Sebagian | Saran Props komponen custom sekarang memakai kontrak dan prop yang sudah ada, bukan daftar atribut HTML umum. Penerusan prop yang tidak dideklarasikan tetap memerlukan bukti; input bebas masih dapat ditolak dengan alasan. |
| ISS-008 | Selesai pada kode | Daftar Props dan saran nama tidak lagi menampilkan `style` atau `style.*`; properti inline tetap tersedia melalui tab Style. |
| ISS-009 | Sebagian | `tests/e2e/report-studio.spec.ts` memeriksa klik baris YRF membuka inspector dan menampilkan peringatan pada folder fixture. Perlu uji jalur dari project dan `public/rpt` bersarang di Windows, termasuk path dan file yang benar. |
| ISS-010 | Sebagian | Default khusus Button dan penolakan prop wajib yang terbukti ada, tetapi sintesis/konfigurasi semua prop komponen lain belum umum. Selaraskan klaim dan panduan dengan kontrak yang benar-benar didukung. |
| ISS-011 | Sebagian | Source menjelaskan bahwa tampilan read-only dan menunjukkan pengguna perlu membuka file/baris di editor; alasan prop terkunci ditampilkan. Integrasi tombol membuka editor eksternal belum ada. |
| ISS-012 | Selesai pada fixture | Warning file non-UTF-8 dikelompokkan dan setiap path tetap dapat dibuka; tes browser memeriksa isi file tetap identik. |
| ISS-013 | Perlu reproduksi | Tes API fixture insert → prop → event mempertahankan isi, dan permintaan hash lama ditolak tanpa mengubah file. Tes browser fixture juga mempertahankan Paragraph dan elemen lain setelah edit prop dan event. Ini belum mereproduksi gejala UI LN02 pada Windows; perlu uji konflik, undo, dan salinan project sebelum menyatakan aman. |
| ISS-014 | Selesai pada fixture | Paragraph baru mendapat teks awal dan otomatis terpilih saat identitas hasil insert dapat dipastikan. Elemen teks HTML kosong yang didukung menerima teks pertama; tes menolak container dan expression, serta memeriksa edit melalui browser. |
| ISS-015 | Sebagian | Preview mencari sebagian provider dan ada fixture provider langsung. Drop yang ditolak menampilkan pesan, dengan pesan khusus bila preview gagal; konteks CM12 dan semua targetnya masih perlu diuji pada salinan. |
| ISS-016 | Sebagian | Saat screen Design diganti iframe dimuat ulang; tes browser berpindah dari screen fixture yang sengaja error ke screen yang sehat. Alur CM12 → LN02 dan Refresh pada Windows masih perlu diuji. |
| ISS-017 | Selesai pada fixture | Insert multiline mengikuti indentasi child yang ada dan mempertahankan CRLF; source satu baris tetap memakai perubahan minimal. Tes engine membandingkan seluruh source. |
| ISS-018 | Sebagian | Review menampilkan devDependencies dan command manual; pilihan styling diberi penjelasan dan Tailwind v4 diberi label. Tes browser memeriksa tidak ada file dibuat pada tahap review. Default folder, pesan validasi per bahasa, dan Windows masih perlu diperiksa. |
| ISS-019 | Sebagian | Respons BUSY menjelaskan aksi tidak dijalankan dan aksi yang perlu diulang; tes permintaan bersamaan memeriksa satu operasi diterima dan sisanya ditolak. Antrean/retry otomatis dan lokalisasi pesan server belum ada. |
| ISS-020 | Selesai pada fixture | Project non-demo tidak lagi menampilkan board demo, tombol pembuatan, atau aksi board; mode demo tetap memiliki board. Perlu smoke test project bisnis. |
| ISS-021 | Sebagian | Opsi palette format dan contoh nilai sekarang tersedia dalam EN/ID, dengan istilah umum tetap dipakai. Bahasa isi template invoice dan contoh sample data belum diubah; perlu keputusan locale template dan tes. |
| ISS-022 | Selesai pada fixture | Pesan EN/ID menjelaskan bahwa Create report langsung membuat file; tes browser memeriksa file setelah pembuatan. |
| ISS-023 | Selesai pada kode | Caption EN/ID menyebut data preview laporan tanpa mengklaim bahwa data pengguna adalah sintetis. |
| ISS-024 | Selesai pada fixture | Header dan panel memakai label Save copy/Simpan salinan; tes YRF mencakup alur simpan salinan. Validasi vendor tetap di luar bukti. |
| ISS-025 | Selesai pada dokumentasi | Panduan EN/ID dan batasan menjelaskan Code awalnya read-only, dapat diedit melalui Edit source, dan disimpan sebagai salinan; operasi tulis tetap tersedia. |

## Pending dan urutan kerja

Issue yang sudah ditangani tetap dicatat di matriks; pengujian project bisnis dan Windows masih diperlukan bila disebut. Prioritas tersisa:

1. **P0 — integritas edit:** ISS-013 dahulu, lalu ISS-004 dan ISS-019. Reproduksi
   pada salinan, simpan bukti hash/diff, tes operasi berurutan, konflik, pembatalan,
   undo, dan tidak ada perubahan file di luar target.
2. **P1 — insert dan kontrak:** ISS-001, 002, 006, 007, 010, 014 dan 017;
   cakup Button, Paragraph, Form.Field/Form.Button, komponen custom lain, JS/TS,
   dan target dinamis. Beri alasan jika operasi belum aman.
3. **P2/P3 — pengalaman dan preview:** ISS-003, 008, 011, 012, 015, 016, 018,
   020 dan 021; sertakan provider, pemulihan setelah error, style, dan EN/ID.
4. **Report Studio:** ISS-009 dan 022–025; uji dari Home serta project, nested
   folder dan Windows, dengan fixture YRF. Jangan menutup operasi tulis YRF.
5. **P4 — validasi lintas platform:** ISS-005 serta smoke test project pada salinan
   dan CI Windows/macOS/Linux. Catat commit, OS, build, fixture, hasil aktual, dan
   gap; sertakan menu CH, AW, LA, LN dan DM yang tersedia.

**Kriteria selesai per issue:** reproduksi awal atau fixture yang mewakili gejala,
perubahan terkecil, tes regresi yang memeriksa hasil dan file yang tidak boleh
berubah, dokumentasi relevan, dan uji ulang lingkungan asli bila tersedia. Catat
secara terpisah hal yang belum diuji. Jangan menandai semua project kompatibel
berdasarkan suite fixture.
