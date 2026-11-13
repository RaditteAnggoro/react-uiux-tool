import { useEffect, useRef, useState } from "react";

type Topic = { title: string; intro: string; steps: string[]; note?: string };

/** Local, bilingual guidance shared by both report workspaces. */
export default function ReportHelp({ language, yrf = false }: { language: "en" | "id"; yrf?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const id = language === "id";
  const title = id ? "Panduan report" : "Report guide";
  const dismiss = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); dismiss(); }
      if (event.key === "Tab" && dialog.current) {
        const controls = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [open]);
  const topics: Topic[] = id ? [
    { title: "Mulai", intro: "Dari folder sampai hasil akhir", steps: ["Pilih folder report, lalu buka report dari daftar atau buat report baru dari template.", "Gunakan Structure di kiri untuk memilih bagian atau objek. Klik tanda panah untuk membuka dan menutup kelompok.", "Canvas di tengah adalah tempat menyusun report. Gunakan Zoom, Grid, dan Penggaris untuk merapikan; panel kanan mengatur objek yang dipilih.", yrf ? "Untuk YRF, gunakan satu tombol Simpan. File asli yang dibuka diperbarui in-place dengan cek konflik hash; canvas tetap perkiraan." : "Isi Sample data bila diperlukan, lalu periksa Preview sebelum Save atau Export."] },
    { title: "Tambah dan atur objek", intro: "Susun isi report di canvas", steps: ["Pilih band atau bagian tujuan di Structure. Klik objek di palette atau tarik dan lepas ke band pada halaman.", "Klik objek pada halaman atau Structure untuk memilihnya. Tarik objek untuk memindahkan; tarik handle di sisi atau sudut untuk mengubah ukuran.", "Gunakan panel kanan untuk mengisi teks, posisi, ukuran, warna, font, dan properti lain yang tersedia.", "Gunakan Undo jika tersedia. Pada tabel native, isi grup judul yang sama pada kolom bersebelahan dan atur pengulangan header. Layout tabel YRF tetap statis."] },
    { title: "Gambar dan tampilan", intro: "Tambahkan gambar dan rapikan desain", steps: ["Tambahkan Image atau Gambar dari palette, lalu pilih file gambar menggunakan kontrol import di panel Properties. Pada YRF, gambar disimpan di salinan.", "Pilih gambar pada canvas untuk memindahkan atau mengubah ukurannya; atur opsi tampilan yang tersedia di Properties.", "Atur warna, garis, dan teks pada objek yang mendukungnya. Periksa Preview untuk melihat hasilnya."] },
    { title: "Data dan parameter", intro: "Coba report dengan data contoh", steps: ["Pada report native, isi Sample data sebagai JSON atau gunakan Import data untuk CSV/JSON.", "Pilih tabel dan atur dataset yang tersedia di Properties. Gunakan data contoh untuk memeriksa baris dan total.", "Tambahkan parameter melalui bagian Parameters di panel kiri jika diperlukan. Fitur binding dan pengulangan bergantung pada kemampuan format dan report.", "Jika JSON tidak valid, perbaiki pesan kesalahan sebelum Preview atau Export."] },
    { title: "Format & kompatibilitas", intro: "Apa yang bisa dibuka, diedit, dan diekspor", steps: ["Native .report.json: buat, buka, edit, preview, Simpan in-place dan ekspor PDF/HTML/CSV/XLSX/DOCX. PDF memakai font terbatas dan menampilkan peringatan fidelity.", "Eksperimental .yrf: buka file existing, edit caption, data field, geometri, style, struktur dan code sebagai draft, lalu Simpan ke file yang sama. Objek vendor unknown/scripted tetap dilindungi.", "Satuan geometri YRF belum terverifikasi dan render hanya perkiraan, bukan output WaiReport tervalidasi vendor. Verifikasi manual bila diperlukan.", "Format export memakai engine report yang sama, tetapi sebagian fitur tabel/gaya lanjutan bisa disederhanakan; baca peringatan saat export."] },
    { title: "Code, simpan dan export", intro: "Periksa hasil sebelum digunakan", steps: ["Gunakan Design untuk menyusun dan Code untuk melihat atau mengubah sumber yang didukung. Terapkan atau buang draft Code sebelum menyimpan.", "Untuk report native, gunakan Preview, Save, atau Export. Perhatikan peringatan format dan periksa hasilnya.", "Untuk YRF, gunakan satu tombol Simpan; file asli diperbarui in-place dengan cek konflik. Verifikasi vendor/output tetap manual."], note: "Tampilan dan satuan YRF masih perkiraan; hasil vendor dan kesesuaian semua format export belum terverifikasi." },
  ] : [
    { title: "Getting started", intro: "From a folder to a finished report", steps: ["Choose a report folder, then open a report from the list or create one from a template.", "Use Structure on the left to select a section or object. Click its arrow to expand or collapse a group.", "Arrange the report on the canvas in the middle. Use Zoom, Grid and Ruler to align objects; the right panel shows settings for the selected object.", yrf ? "For YRF, use the single Save. It updates the opened original in place with a content-hash conflict check; the canvas remains approximate." : "Enter Sample data if needed, then check Preview before Save or Export."] },
    { title: "Add and arrange", intro: "Place objects on the canvas", steps: ["Select a destination band in Structure. Click an item in the palette or drag and drop it onto the band on the page.", "Select an object on the page or in Structure. Drag it to move; drag an edge or corner handle to resize.", "Use the right panel to edit text, position, size, colors, fonts and other available properties.", "Use Undo when available. For native tables, set the same header group on adjacent columns and choose whether headings repeat. YRF table layouts remain static."] },
    { title: "Images and styling", intro: "Add an image and refine your layout", steps: ["Add Image from the palette and choose an image file using the import control in Properties. In YRF, the image is saved in the copy.", "Select the image on the canvas to move or resize it; adjust the available display settings in Properties.", "Set colors, borders and text on objects that support them. Check Preview to see the result."] },
    { title: "Data and parameters", intro: "Try your report with sample data", steps: ["In a native report, enter Sample data as JSON or use Import data for CSV/JSON.", "Select a table and configure its available dataset in Properties. Check rows and totals using sample data.", "Add parameters in the Parameters section on the left when needed. Binding and repetition depend on the report and format capabilities.", "If JSON is invalid, fix the message before Preview or Export."] },
    { title: "Formats & compatibility", intro: "What this workspace can open, edit and export", steps: ["Native .report.json: create, open, edit, preview, Save in place and export PDF/HTML/CSV/XLSX/DOCX. PDF keeps limited fonts and emits fidelity warnings.", "Experimental .yrf: open an existing file, edit supported captions, data fields, geometry, style, structure and code in draft, then Save to the same file. Unknown/scripted vendor objects stay protected.", "YRF canvas geometry units are unverified and the rendering is approximate, not a vendor-verified WaiReport output. Verify copies manually when needed.", "Export formats share the report engine but some advanced table/rich-style features may be simplified; read the warning shown at export time."] },
    { title: "Code, save and export", intro: "Check the result before use", steps: ["Use Design to arrange and Code to view or edit supported source. Apply or discard a Code draft before saving.", "For native reports, use Preview, Save or Export. Read format warnings and inspect the result.", "For YRF, use the single Save; the opened original is updated in place with a conflict check. Vendor/output verification remains manual."], note: "YRF layout and units remain approximate; vendor output and parity across export formats have not been verified." },
  ];
  const topic = topics[active]!;
  return <>
    <button ref={trigger} className="rs-help-button" type="button" onClick={() => { setActive(0); setOpen(true); }} aria-label={title}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.7 9.3a2.4 2.4 0 0 1 4.7.7c0 1.7-2.4 2-2.4 3.7M12 17h.01" strokeLinecap="round"/></svg>
      <span>{title}</span>
    </button>
    {open && <div className="rs-help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section ref={dialog} className="rs-help-dialog" role="dialog" aria-modal="true" aria-labelledby="rs-help-title">
        <header className="rs-help-header"><div><span className="rs-help-eyebrow">REPORT STUDIO</span><h2 id="rs-help-title">{title}</h2><p>{id ? "Panduan praktis untuk membuat dan mengubah report" : "A practical guide to creating and editing reports"}</p></div>
          <button ref={close} className="rs-help-close" type="button" onClick={dismiss} aria-label={id ? "Tutup" : "Close"}>×</button></header>
        <div className="rs-help-layout"><nav className="rs-help-nav" aria-label={id ? "Topik panduan" : "Guide topics"}>{topics.map((item, index) => <button key={item.title} type="button" className={active === index ? "active" : ""} aria-current={active === index ? "page" : undefined} onClick={() => setActive(index)}><span>{String(index + 1).padStart(2, "0")}</span>{item.title}</button>)}</nav>
          <article className="rs-help-content"><span className="rs-help-count">{id ? "TOPIK" : "TOPIC"} {active + 1} / {topics.length}</span><h3>{topic.title}</h3><p>{topic.intro}</p><ol>{topic.steps.map((step) => <li key={step}>{step}</li>)}</ol>{topic.note && <div className="rs-help-note">{topic.note}</div>}</article></div>
        <footer className="rs-help-footer"><span>{id ? "Panduan tersedia tanpa internet" : "Available offline"}</span><div><button type="button" disabled={active === 0} onClick={() => setActive(active - 1)}>{id ? "Sebelumnya" : "Previous"}</button><button className="rs-help-next" type="button" onClick={() => active === topics.length - 1 ? dismiss() : setActive(active + 1)}>{active === topics.length - 1 ? (id ? "Selesai" : "Done") : (id ? "Selanjutnya" : "Next")}</button></div></footer>
      </section>
    </div>}
  </>;
}
