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

**Status:** Selesai pada kode/dokumentasi/fixture menyatakan ruang lingkup bukti yang disebut, bukan pengujian pada semua project. Selesai = perilaku dan bukti yang relevan telah diperiksa; Sebagian =
ada penanganan tetapi masih ada bagian dari laporan yang belum terbukti atau belum
ditangani; Terbuka = masalah masih tampak di kode; Perlu reproduksi = bukti saat ini
tidak cukup untuk menyatakan penyebab atau status perbaikan. Jangan tutup suatu
issue hanya berdasarkan nama tes atau inventaris statis.

| ID | Status | Bukti kode dan pekerjaan tersisa |
| --- | --- | --- |
| ISS-001 | Sebagian | `studio/src/App.tsx` `stageDroppedComponent` mengisi `label="New button"` jika kontrak `Button` memuat label; `tests/e2e/studio.spec.ts` memeriksa fixture Button terlihat. Perlu ulangi LN01 pada salinan dan pastikan wrapper, style, dan kontrak lain; bukan jaminan semua komponen. |
| ISS-002 | Terbuka | `knownType` di `src/engine/patches.ts` masih menolak prop baru bertipe `unknown` jika bukan prop primitif yang dikenali. Perbaikan `unknown` yang disebut dokumen tidak tampak pada working tree ini; uji Button JS dan penolakan tipe yang tidak aman. `className`/`title` ditangani pada ISS-007. |
| ISS-003 | Terbuka | `App.tsx` menampilkan `styleOrigins` sebagai `div`, tanpa aksi untuk mengisi editor style. Tambah aksi hanya untuk origin inline yang dapat diedit; beri penjelasan untuk origin lain. |
| ISS-004 | Sebagian | `editElement` meminta konfirmasi sebelum mengubah implementasi bersama; tes browser memeriksa konfirmasi. Perlu tes hit target dan fanout pada LN01 dan helper yang dilaporkan, termasuk tidak ada perubahan saat batal. |
| ISS-005 | Sebagian | `designModulePath` menormalisasi separator dan `tests/server.test.ts` memeriksa contoh path Windows/Unix. Implementasi saat ini masih memakai virtual `.jsx`, berbeda dari perbaikan `.js` dalam laporan; tes transform dan Design di Windows sebenarnya perlu dijalankan pada build ini, juga audit path lain. |
| ISS-006 | Terbuka | `createPatch` masih mengklasifikasikan exported non-route sebagai shared, termasuk saat 0 penggunaan terindeks. Perlu model cakupan screen/dynamic usage dengan bukti, tanpa menghilangkan konfirmasi edit bersama. |
| ISS-007 | Sebagian | Saran Props komponen custom sekarang memakai kontrak dan prop yang sudah ada, bukan daftar atribut HTML umum. Penerusan prop yang tidak dideklarasikan tetap memerlukan bukti; input bebas masih dapat ditolak dengan alasan. |
| ISS-008 | Selesai pada kode | Daftar Props dan saran nama tidak lagi menampilkan `style` atau `style.*`; properti inline tetap tersedia melalui tab Style. |
| ISS-009 | Sebagian | `tests/e2e/report-studio.spec.ts` memeriksa klik baris YRF membuka inspector dan menampilkan peringatan pada folder fixture. Perlu uji jalur dari project dan `public/rpt` bersarang di Windows, termasuk path dan file yang benar. |
| ISS-010 | Sebagian | Default khusus Button dan penolakan prop wajib yang terbukti ada, tetapi sintesis/konfigurasi semua prop komponen lain belum umum. Selaraskan klaim dan panduan dengan kontrak yang benar-benar didukung. |
| ISS-011 | Terbuka | Source React masih inspect-only; pesan alasan dan jalur edit eksternal yang jelas perlu ditinjau pada prop yang tidak didukung. |
| ISS-012 | Terbuka | Analyzer masih melaporkan setiap source non-UTF-8 yang terlewati. Pertahankan perlindungan encoding, tetapi kelompokkan/beri konteks warning tanpa menyembunyikan file yang tidak dianalisis. |
| ISS-013 | Perlu reproduksi | Laporan menyatakan insert hilang setelah Props/Events; tes undo dan edit lain tidak membuktikan alur ini. Prioritas tertinggi: reproduksi pada salinan LN02 dan fixture, periksa isi/hash setelah setiap respons, konflik dan undo; perbaiki penyebab sebelum menyatakan aman. |
| ISS-014 | Sebagian | Paragraph baru diberi teks awal `New paragraph` sehingga dapat terlihat dan diedit; elemen kosong yang sudah ada serta seleksi otomatis hasil insert basic masih perlu ditangani/diuji. |
| ISS-015 | Sebagian | Preview mencari sebagian provider dan ada fixture provider langsung, tetapi itu tidak membuktikan konteks CM12. Penolakan target dinamis dan kegagalan harness harus dibedakan serta drop yang ditolak harus memberi alasan; uji CM12 pada salinan. |
| ISS-016 | Perlu reproduksi | Fixture provider yang berhasil tidak menguji CM12 crash → LN02 atau Refresh. Tambah tes transisi error lalu screen lain, termasuk pesan dan iframe yang benar. |
| ISS-017 | Terbuka | Penyisipan inside pada `patches.ts` memakai offset closing tag dan menyisipkan markup langsung. Pertahankan newline/indentasi yang sesuai, termasuk CRLF dan JSX satu baris, dengan diff minimal. |
| ISS-018 | Terbuka | Review New Project menampilkan `plan.dependencies`, tetapi bukan `devDependencies` atau daftar `commands`; penjelasan styling dan default folder juga perlu diperiksa. Verifikasi Windows path dan teks per bahasa tanpa menjalankan instalasi. |
| ISS-019 | Terbuka | `src/server/index.ts` menolak POST lain dengan `BUSY` selama `mutationBusy`. Rancang feedback/retry untuk aksi yang aman tanpa melemahkan serialisasi mutasi; uji aksi tidak hilang dan tidak dijalankan dua kali. |
| ISS-020 | Selesai pada fixture | Project non-demo tidak lagi menampilkan board demo, tombol pembuatan, atau aksi board; mode demo tetap memiliki board. Perlu smoke test project bisnis. |
| ISS-021 | Terbuka | Label opsi formatting masih hardcoded Inggris dan template invoice berisi teks Indonesia. Tentukan cakupan terjemahan dengan mempertahankan istilah Inggris umum yang memang dipilih pengguna; selaraskan EN/ID dan uji kedua bahasa. |
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
