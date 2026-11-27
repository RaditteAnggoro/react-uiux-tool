import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { inspectYrf, yrfPageLayout, type YrfInspection, type YrfObjectRef } from "../../../../src/reports/formats/yrf/inspect";
import { appendYrfObject, applyYrfChanges, moveYrfObject, parseYrfPath, removeYrfObject, setYrfObjectScalar, valueAtPath, type YrfChange } from "../../../../src/reports/formats/yrf/patch";
import { hasYrfScriptField, isYrfLocalField } from "../../../../src/reports/formats/yrf/capabilities";
import "./yrf-inspector.css";
import ReportHelp from "./ReportHelp";
import CanvasRulers from "./CanvasRulers";
import ReportDialog from "./ReportDialog";
import { revealJsonObject } from "./code-location";

const BarcodePreview = lazy(() => import("./BarcodePreview"));

interface YrfInspectorProps {
  token: string;
  language: "en" | "id";
  onBack: () => void;
  onExit: () => void;
  initialPath?: string;
}

interface BrowseEntry {
  name: string;
  path: string;
  absolute: string;
  kind: "native" | "yrf";
  size: number;
}

interface BrowseResult {
  root: string;
  entries: BrowseEntry[];
  suggestions: Array<{ path: string }>;
}

interface OpenResult {
  file: string;
  hash: string;
  inspection: YrfInspection;
  source?: string;
}

interface ChangeView {
  path: string;
  before: string | number;
  after: string | number;
}

function dedupeChanges<T extends { objectPath: string; field: string }>(list: T[]): T[] {
  const map = new Map<string, T>();
  for (const change of list) map.set(`${change.objectPath}.${change.field}`, change);
  return [...map.values()];
}

interface ChangeInput {
  objectPath: string;
  field: string;
  expected: string | number;
  value: string | number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function geometryFields(object: YrfObjectRef, box: Box): Array<[string, number, number]> {
  const line = object.lineEndpoints;
  if (line) return [
    ["x1", line.x1, line.x1 <= line.x2 ? box.x : box.x + box.width],
    ["x2", line.x2, line.x1 <= line.x2 ? box.x + box.width : box.x],
    ["y1", line.y1, line.y1 <= line.y2 ? box.y : box.y + box.height],
    ["y2", line.y2, line.y1 <= line.y2 ? box.y + box.height : box.y],
  ];
  return [["left", object.box.x, box.x], ["top", object.box.y, box.y], ["width", object.box.width, box.width], ["height", object.box.height, box.height]];
}

const YRF_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type YrfHandle = (typeof YRF_HANDLES)[number];

function parseStyleDeclarations(raw: string | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!raw) return map;
  for (const part of raw.split(";")) {
    const separator = part.indexOf(":");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (key && value) map[key] = value;
  }
  return map;
}

function serializeStyleDeclarations(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
}

function findObject(inspection: YrfInspection, path: string): YrfObjectRef | null {
  for (const band of [
    ...inspection.sideBands,
    ...inspection.pages.flatMap((page) => page.bands),
  ]) {
    const found = band.objects.find((object) => object.path === path);
    if (found) return found;
  }
  return null;
}

const dict = {
  en: {
    title: "WaiReport (.yrf)",
    back: "Back to native reports",
    path: "YRF file path",
    open: "Open .yrf",
    create: "+ New .yrf",
    createTitle: "Create experimental .yrf",
    createHint:
      "The producer is inferred from three local samples. Verify the result with the licensed vendor renderer before business use.",
    createAck: "I understand this output is experimental and I will validate it.",
    template: "Template",
    createAction: "Create file",
    cancel: "Cancel",
    warnings: "Warnings",
    structure: "Structure",
    noObjects: "No objects",
    geometry: "Geometry (raw units, unverified)",
    caption: "Caption",
    dataField: "Data field",
    selectHint: "Click an object on the page or in Structure to edit it. Drag to move; use the handles to resize.",
    noGeometry: "This object does not have editable left/top/width/height properties.",
    scriptProtected: "This object contains a vendor script and cannot be removed visually.",
    palette: "Palette",
    addLabel: "Text",
    addTextbox: "Field",
    addShape: "Box",
    addLine: "Line",
    addImage: "Image",
    addTable: "Table layout",
    addForm: "Form layout",
    importImage: "Import image",
    imageHint: "PNG, JPEG or WebP, up to 2 MiB. Stored in the YRF copy; check the result in WaiReport.",
    imageError: "Choose a PNG, JPEG or WebP image up to 2 MiB that fits within the report size limit.",
    layoutHint: "Table and form layouts add individual fields and lines. They do not configure repeating data.",
    paletteHint: "Drag onto a band or click to add to the selected band.",
    objectProperties: "Object properties",
    stylesGroup: "Styles",
    styleTitle: "Style",
    styleHeading: "Heading",
    styleBody: "Body",
    styleBold: "Bold",
    styleItalic: "Italic",
    styleUnderline: "Underline",
    styleCenter: "Center",
    styleMuted: "Muted",
    styleDanger: "Danger",
    styleSize: "Font size",
    styleColor: "Text colour",
    fillColor: "Fill color",
    borderColor: "Border color",
    grid: "Grid",
    ruler: "Ruler",
    rawUnits: "raw units",
    styleAlign: "Alignment",
    multiSelected: "{count} objects selected",
    layers: "Layers",
    layersHint: "Topmost first; select a row to edit that object.",
    alignment: "Alignment",
    bringFront: "Bring to Front",
    sendBack: "Send to Back",
    moveLayerUp: "Up one layer",
    moveLayerDown: "Down one layer",
    alignLeft: "Align left",
    alignCenterH: "Center horizontally",
    alignRight: "Align right",
    alignTop: "Align top",
    alignMiddleV: "Center vertically",
    alignBottom: "Align bottom",
    alignQueued: "Alignment staged; Save copy to apply",

    objectPropertiesHint: "Edit a value and leave the field to apply it to the draft.",
    removeObject: "Remove object",
    saveReport: "Save report",
    exit: "Exit",
    textGroup: "Text and data",
    shapeGroup: "Shapes",
    preview: "Preview change",
    saveCopy: "Save copy",
    saveOriginal: "Save",
    undoDraft: "Undo YRF draft change",
    redoDraft: "Redo YRF draft change",
    saveToOriginal: "Save original",
    resizeLeftPanel: "Resize .yrf structure panel",
    resizeRightPanel: "Resize .yrf properties panel",
    overwriteConfirm: "Overwrite the original .yrf file? A timestamped .bak file is written beside it.",
    updatedOriginal: "Original updated",
    savedOriginal: "Saved original",
    saveOriginalLimited: "This save path supports scalar edits only.",
    saveDraftHint: "Write this draft to the opened original.",
    before: "Before",
    after: "After",
    saved: "Copy saved",
    created: "Created",
    readonlyNote:
      "Save updates the opened original after checking its hash. WaiReport rendering and creation remain experimental.",
    empty: "Choose a .yrf file to inspect. Nothing is executed.",
    experimental: "Experimental write",
    designApprox: "Design (approximate)",
    codeReadonly: "Code",
    codeLine: "Selected object · line {line}",
    unsavedTitle: "Unsaved YRF changes",
    unsavedHint: "Save to the opened file, discard the changes, or cancel.",
    discard: "Discard changes",
    codeHint: "Vendor source is displayed as text.",
    editSource: "Edit source",
    applySource: "Apply & save copy",
    sourceNote:
      "Save updates the opened file. Save copy creates a separate .edited file with the same validation.",
    folder: "Folder",
    noFiles: "No .yrf files in this folder.",
    chooseFolder: "Choose folder",
    manualPath: "Enter path manually",
    unsupported: "Protected format properties",
    localPage: "Design page",
    openLinkedYrf: "Open linked YRF",
    barcodeValueMissing: "Barcode value unavailable in Design",
    pageOverflow: "Sections exceed the paper height in this preview.",
    noChanges: "No changes to save",
  },
  id: {
    title: "WaiReport (.yrf)",
    back: "Kembali ke laporan native",
    path: "Path file YRF",
    open: "Buka .yrf",
    create: "+ .yrf baru",
    createTitle: "Buat .yrf eksperimental",
    createHint:
      "Producer ini diturunkan dari tiga sample lokal. Verifikasi hasilnya dengan renderer vendor berlisensi sebelum dipakai bisnis.",
    createAck: "Saya paham output ini eksperimental dan akan memverifikasinya.",
    template: "Template",
    createAction: "Buat file",
    cancel: "Batal",
    warnings: "Peringatan",
    structure: "Struktur",
    noObjects: "Tidak ada objek",
    geometry: "Geometri (unit mentah, belum terverifikasi)",
    caption: "Teks",
    dataField: "Field data",
    selectHint: "Klik objek pada halaman atau Struktur untuk mengedit. Tarik untuk memindahkan; tarik handle untuk mengubah ukuran.",
    noGeometry: "Objek ini tidak memiliki properti left/top/width/height yang dapat diedit.",
    scriptProtected: "Objek ini berisi skrip vendor dan tidak dapat dihapus secara visual.",
    palette: "Palet",
    addLabel: "Teks",
    addTextbox: "Field",
    addShape: "Kotak",
    addLine: "Garis",
    addImage: "Gambar",
    addTable: "Layout tabel",
    addForm: "Layout form",
    importImage: "Import gambar",
    imageHint: "PNG, JPEG atau WebP, maksimal 2 MiB. Gambar disimpan dalam salinan YRF; periksa hasilnya di WaiReport.",
    imageError: "Pilih gambar PNG, JPEG atau WebP maksimal 2 MiB yang tidak melebihi batas ukuran report.",
    layoutHint: "Layout tabel dan form menambahkan field dan garis terpisah. Data berulang belum dikonfigurasi.",
    paletteHint: "Tarik ke band atau klik untuk menambah ke band terpilih.",
    objectProperties: "Properti objek",
    stylesGroup: "Gaya",
    styleTitle: "Gaya",
    styleHeading: "Judul",
    styleBody: "Isi",
    styleBold: "Tebal",
    styleItalic: "Miring",
    styleUnderline: "Garis bawah",
    styleCenter: "Tengah",
    styleMuted: "Redup",
    styleDanger: "Bahaya",
    styleSize: "Ukuran font",
    styleColor: "Warna teks",
    fillColor: "Warna isi",
    borderColor: "Warna garis",
    grid: "Grid",
    ruler: "Penggaris",
    rawUnits: "unit mentah",
    styleAlign: "Perataan",
    multiSelected: "{count} objek dipilih",
    layers: "Lapisan",
    layersHint: "Paling atas lebih dulu; pilih baris untuk mengedit objek.",
    alignment: "Perataan",
    bringFront: "Bawa ke depan",
    sendBack: "Kirim ke belakang",
    moveLayerUp: "Naik satu lapisan",
    moveLayerDown: "Turun satu lapisan",
    alignLeft: "Rata kiri",
    alignCenterH: "Tengah horizontal",
    alignRight: "Rata kanan",
    alignTop: "Rata atas",
    alignMiddleV: "Tengah vertikal",
    alignBottom: "Rata bawah",
    alignQueued: "Perataan disiapkan; simpan salinan untuk menerapkan",

    objectPropertiesHint: "Ubah nilai lalu pindah dari kolom untuk menerapkannya ke draft.",
    removeObject: "Hapus objek",
    saveReport: "Simpan laporan",
    exit: "Keluar",
    textGroup: "Teks dan data",
    shapeGroup: "Bentuk",
    preview: "Pratinjau perubahan",
    saveCopy: "Simpan salinan",
    saveOriginal: "Simpan",
    undoDraft: "Urungkan perubahan draft YRF",
    redoDraft: "Ulangi perubahan draft YRF",
    saveToOriginal: "Simpan ke asli",
    resizeLeftPanel: "Ubah lebar panel struktur .yrf",
    resizeRightPanel: "Ubah lebar panel properti .yrf",
    overwriteConfirm: "Timpa file .yrf asli? File .bak bertanda waktu akan ditulis di sampingnya.",
    updatedOriginal: "File asli diperbarui",
    savedOriginal: "File asli tersimpan",
    saveOriginalLimited: "Jalur simpan ini hanya mendukung edit nilai skalar.",
    saveDraftHint: "Tulis draft ini ke file asli yang dibuka.",
    before: "Sebelum",
    after: "Sesudah",
    saved: "Salinan tersimpan",
    created: "Dibuat",
    readonlyNote:
      "Simpan memperbarui file asli yang dibuka setelah pemeriksaan hash. Hasil render WaiReport dan pembuatan file masih eksperimental.",
    empty: "Pilih file .yrf untuk diperiksa. Tidak ada yang dieksekusi.",
    experimental: "Tulis eksperimental",
    designApprox: "Desain (perkiraan)",
    codeReadonly: "Kode",
    codeLine: "Objek terpilih · baris {line}",
    unsavedTitle: "Perubahan YRF belum disimpan",
    unsavedHint: "Simpan ke file yang dibuka, buang perubahan, atau batal.",
    discard: "Buang perubahan",
    codeHint: "Sumber vendor ditampilkan sebagai teks.",
    editSource: "Edit sumber",
    applySource: "Terapkan & simpan salinan",
    sourceNote:
      "Simpan memperbarui file yang dibuka. Simpan salinan membuat file .edited terpisah dengan validasi yang sama.",
    folder: "Folder",
    noFiles: "Tidak ada file .yrf di folder ini.",
    chooseFolder: "Pilih folder",
    manualPath: "Masukkan path manual",
    unsupported: "Properti format dilindungi",
    localPage: "Halaman desain",
    openLinkedYrf: "Buka YRF tertaut",
    barcodeValueMissing: "Nilai barcode belum tersedia di Desain",
    pageOverflow: "Bagian laporan melebihi tinggi kertas pada pratinjau ini.",
    noChanges: "Tidak ada perubahan untuk disimpan",
  },
} as const;

async function post<T>(token: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "X-UIUX-Token": token } : {}) },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(typeof data.error === "string" ? data.error : `HTTP ${response.status}`);
    (error as Error & { code?: string }).code = typeof data.code === "string" ? data.code : undefined;
    throw error;
  }
  return data as T;
}

export default function YrfInspector({ token, language, onBack, onExit, initialPath }: YrfInspectorProps) {
  const tr = dict[language];
  const [filePath, setFilePath] = useState("");
  const [report, setReport] = useState<OpenResult | null>(null);
  const [zoom, setZoom] = useState(1);
  const [narrowPanel, setNarrowPanel] = useState<"canvas" | "palette" | "properties">("canvas");
  const [showGrid, setShowGrid] = useState(false);
  const [showRuler, setShowRuler] = useState(false);
  const [selected, setSelected] = useState<YrfObjectRef | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = Number(localStorage.getItem("uiux-yrf-left-width"));
    return saved >= 230 && saved <= 520 ? saved : 290;
  });
  const [rightWidth, setRightWidth] = useState(() => {
    const saved = Number(localStorage.getItem("uiux-yrf-right-width"));
    return saved >= 230 && saved <= 520 ? saved : 280;
  });
  useEffect(() => {
    try {
      localStorage.setItem("uiux-yrf-left-width", String(leftWidth));
      localStorage.setItem("uiux-yrf-right-width", String(rightWidth));
    } catch {
      // Width preferences are best-effort.
    }
  }, [leftWidth, rightWidth]);
  const startPanelResize = (side: "left" | "right", event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftWidth : rightWidth;
    const move = (moveEvent: PointerEvent) => {
      const delta = side === "left" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      const next = Math.max(230, Math.min(520, startWidth + delta));
      if (side === "left") setLeftWidth(next);
      else setRightWidth(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const [pageIndex, setPageIndex] = useState(0);
  const [expandedBands, setExpandedBands] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selected) {
      if (selectedPaths.length === 1) setSelectedPaths([]);
      return;
    }
    if (!selectedPaths.includes(selected.path)) setSelectedPaths([selected.path]);
  }, [selected, selectedPaths]);
  const [caption, setCaption] = useState("");
  const [dataField, setDataField] = useState("");
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const [geometry, setGeometry] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [pending, setPending] = useState<ChangeView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [createPath, setCreatePath] = useState("");
  const [createTemplate, setCreateTemplate] = useState("invoice");
  const [acknowledged, setAcknowledged] = useState(false);
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [browseError, setBrowseError] = useState("");
  const [panel, setPanel] = useState<"design" | "code">("design");
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const [codeEditing, setCodeEditing] = useState(false);
  const codeArea = useRef<HTMLTextAreaElement>(null);
  const [codeLine, setCodeLine] = useState<number | null>(null);
  useLayoutEffect(() => {
    const path = selected?.path;
    setCodeLine(panel === "code" && path && codeArea.current ? revealJsonObject(codeArea.current, { path }) : null);
  }, [panel, report?.source, selected?.path]);
  const [codeError, setCodeError] = useState("");
  const [geometryChanges, setGeometryChanges] = useState<Record<string, Box>>({});
  const [draftChanges, setDraftChanges] = useState<Record<string, ChangeInput>>({});
  const [structuralDraft, setStructuralDraft] = useState<string | null>(null);
  const [history, setHistory] = useState<{ past: ReturnType<typeof snapshotDraft>[]; future: ReturnType<typeof snapshotDraft>[] }>({ past: [], future: [] });
  const editingDraftField = useRef<string | null>(null);
  const imageTarget = useRef({ file: "", path: "" });
  imageTarget.current = { file: report?.file ?? "", path: selected?.path ?? "" };
  const imageUpdate = useRef<(value: string) => void>(() => {});
  const [leaveAction, setLeaveAction] = useState<{ run: () => void } | null>(null);
  const gestureRef = useRef<{
    pointerId: number;
    mode: "move" | "resize";
    path: string;
    handle?: YrfHandle;
    startX: number;
    startY: number;
    box: Box;
    latest: Box;
    before: ReturnType<typeof snapshotDraft>;
  } | null>(null);

  function snapshotDraft() {
    return { report, selected, selectedPaths, caption, dataField, geometry, draftChanges, geometryChanges, structuralDraft };
  }

  const restoreDraft = (state: ReturnType<typeof snapshotDraft>) => {
    setReport(state.report);
    setSelected(state.selected);
    setSelectedPaths(state.selectedPaths);
    setCaption(state.caption);
    setDataField(state.dataField);
    setGeometry(state.geometry);
    setDraftChanges(state.draftChanges);
    setGeometryChanges(state.geometryChanges);
    setStructuralDraft(state.structuralDraft);
    setPending([]);
    setError("");
    setMessage("");
  };
  const pushHistory = (before = snapshotDraft()) =>
    setHistory(current => ({ past: [...current.past, before].slice(-20), future: [] }));
  const resetHistory = () => {
    setHistory({ past: [], future: [] });
    editingDraftField.current = null;
  };
  const changeDraftField = (name: string, change: () => void) => {
    if (editingDraftField.current !== name) {
      pushHistory();
      editingDraftField.current = name;
    }
    change();
  };
  const finishDraftField = () => { editingDraftField.current = null; };
  const stepHistory = (redo: boolean) => {
    if (busy || panel !== "design" || gestureRef.current || leaveAction) return;
    const target = (redo ? history.future : history.past).at(-1);
    if (!target) return;
    const current = snapshotDraft();
    setHistory(redo
      ? { past: [...history.past, current], future: history.future.slice(0, -1) }
      : { past: history.past.slice(0, -1), future: [...history.future, current] });
    restoreDraft(target);
    finishDraftField();
  };

  useEffect(() => {
    const onHistoryKey = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.key.toLowerCase() !== "z") return;
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,[contenteditable]")) return;
      if (panel !== "design" || leaveAction || busy || !(event.shiftKey ? history.future.length : history.past.length)) return;
      event.preventDefault();
      stepHistory(event.shiftKey);
    };
    window.addEventListener("keydown", onHistoryKey);
    return () => window.removeEventListener("keydown", onHistoryKey);
  });

  const loadBrowse = async () => {
    try {
      const result = await fetch(`/api/reports/browse?format=yrf`, {
        headers: token ? { "X-UIUX-Token": token } : {},
      });
      if (!result.ok) throw new Error(`HTTP ${result.status}`);
      setBrowse((await result.json()) as BrowseResult);
      setBrowseError("");
    } catch {
      setBrowse(null);
    }
  };

  const chooseFolder = async () => {
    setBusy(true);
    try {
      const picked = await post<{ path: string }>(token, "pick-directory", {});
      if (picked.path) {
        await post(token, "reports/root", { path: picked.path });
        await loadBrowse();
      }
    } catch (caught) {
      setBrowseError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialPath) {
      setFilePath(initialPath);
      void open(initialPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPath]);

  const open = async (target = filePath.trim(), sibling?: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await post<OpenResult>(token, "reports/yrf/open", { path: target, sibling });
      resetHistory();
      setReport(result);
      setFilePath(result.file);
      const firstPage = result.inspection.pages[0]?.bands ?? [];
      const firstBand = firstPage.find(band => band.objects.some(object => object.editableCaption));
      const first = firstBand?.objects.find(object => object.editableCaption);
      setSelectedPaths([]);
      setExpandedBands(firstBand ? new Set([firstBand.path]) : new Set());
      setSelected(first ?? null);
      setCaption(first?.caption ?? "");
      setDataField(first?.dataField ?? "");
      setGeometry({ left: first?.box.x ?? 0, top: first?.box.y ?? 0, width: first?.box.width ?? 0, height: first?.box.height ?? 0 });
      setPending([]);
      setCreating(false);
      setCodeDraft(null);
      setCodeEditing(false);
      setCodeError("");
      setDraftChanges({});
      setGeometryChanges({});
      setStructuralDraft(null);
    } catch (caught) {
      setError((caught as Error).message);
      if (!sibling) setReport(null);
    } finally {
      setBusy(false);
    }
  };

  const selectObject = (object: YrfObjectRef, additive = false) => {
    let nextPaths: string[];
    if (additive) {
      nextPaths = selectedPaths.includes(object.path)
        ? selectedPaths.filter((path) => path !== object.path)
        : [...selectedPaths, object.path];
      if (nextPaths.length === 0) nextPaths = [object.path];
    } else {
      nextPaths = [object.path];
    }
    if (selected && selected.path !== object.path) flushCurrentChanges();
    setSelectedPaths(nextPaths);
    if (additive && !nextPaths.includes(object.path)) return;
    const focused = nextPaths.includes(object.path) ? object : null;
    if (!focused || selected?.path === focused.path) return;
    const target = focused;
    setSelected(target);
    const value = (field: string, fallback: string | number) =>
      draftChanges[`${target.path}.${field}`]?.value ?? fallback;
    const box = draftBox(target);
    setCaption(String(value(target.textField ?? "caption", target.caption ?? "")));
    setDataField(String(value("dataField", target.dataField ?? "")));
    setGeometry({ left: Number(value("left", box.x)), top: Number(value("top", box.y)), width: Number(value("width", box.width)), height: Number(value("height", box.height)) });
    setPending([]);
    setMessage("");
  };

  const draftBox = (object: YrfObjectRef): Box => {
    const current = geometryChanges[object.path] ?? object.box;
    const line = object.lineEndpoints;
    if (!line) return current;
    const value = (field: "x1" | "x2" | "y1" | "y2") => Number(draftChanges[`${object.path}.${field}`]?.value ?? line[field]);
    if (!["x1", "x2", "y1", "y2"].some((field) => draftChanges[`${object.path}.${field}`])) return current;
    const x1 = value("x1"), x2 = value("x2"), y1 = value("y1"), y2 = value("y2");
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  };

  const pageLayout = report ? yrfPageLayout(report.inspection, pageIndex) : null;
  const bands = pageLayout?.placements.map(({ band }) => band) ?? [];
  const layerGroups = bands.filter(band => band.objects.length > 0);
  useEffect(() => { setPageIndex(0); }, [report?.file]);

  const changes = useMemo(() => {
    if (!selected) return [];
    const list: Array<{ objectPath: string; field: string; expected: string | number; value: string | number }> = [];
    const textField = selected.textField;
    if (textField && (caption !== (selected.caption ?? "") || draftChanges[`${selected.path}.${textField}`])) {
      list.push({ objectPath: selected.path, field: textField, expected: selected.caption ?? "", value: caption });
    }
    if (selected.dataField !== null && (dataField !== selected.dataField || draftChanges[`${selected.path}.dataField`])) {
      list.push({ objectPath: selected.path, field: "dataField", expected: selected.dataField, value: dataField });
    }
    const box = { x: geometry.left, y: geometry.top, width: geometry.width, height: geometry.height };
    for (const [field, original, next] of selected.editableGeometry ? geometryFields(selected, box) : []) {
      if (Number.isFinite(next) && (next !== original || draftChanges[`${selected.path}.${field}`] || geometryChanges[selected.path])) {
        list.push({ objectPath: selected.path, field, expected: original, value: next });
      }
    }
    return list;
  }, [caption, dataField, geometry, selected, draftChanges, geometryChanges]);

  const preview = async () => {
    if (!report || !selected) return;
    if (pendingAll.length === 0 && !structuralDraft) {
      setError(tr.noChanges);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (structuralDraft) {
        const result = pendingAll.length ? applyYrfChanges(structuralDraft, pendingAll as YrfChange[]) : null;
        if (result && !result.ok) throw new Error(result.error);
        const before = inspectYrf(report.source ?? "").inspection;
        const after = inspectYrf(result?.ok ? result.text : structuralDraft).inspection;
        if (!before || !after) throw new Error("Unable to compare report structure");
        const bands = (inspection: YrfInspection) => [...inspection.pages.flatMap((page) => page.bands), ...inspection.sideBands];
        const describe = (object: YrfObjectRef) => `${object.kind} · ${object.name}${object.caption !== null ? ` · ${object.caption.slice(0, 256)}` : ""}${object.dataField ? ` · ${object.dataField.slice(0, 256)}` : ""} · (${object.box.x}, ${object.box.y}, ${object.box.width}, ${object.box.height})${object.style ? ` · ${object.style.slice(0, 256)}` : ""}${Object.entries(object.localFields).map(([key, value]) => ` · ${key}=${value.slice(0, 256)}`).join("")}`;
        const previous = new Map(bands(before).map((band) => [band.path, band.objects.map(describe).join("\n")]));
        const current = new Map(bands(after).map((band) => [band.path, band.objects.map(describe).join("\n")]));
        const structureChanges = [...new Set([...previous.keys(), ...current.keys()])].flatMap((path) => {
          const oldList = previous.get(path) ?? "";
          const newList = current.get(path) ?? "";
          return oldList === newList ? [] : [{ path: `${path}.objects`, before: oldList || "—", after: newList || "—" }];
        });
        setPending([...structureChanges, ...(result?.ok ? result.changes : [])]);
        setMessage("");
        return;
      }
      const result = await post<{ changes: ChangeView[] }>(token, "reports/yrf/patch", {
        path: report.file,
        expectedHash: report.hash,
        changes: pendingAll,
      });
      setPending(result.changes);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const geometryPatchChanges = useMemo(() => {
    if (!report) return [];
    const list: Array<{ objectPath: string; field: string; expected: number; value: number }> = [];
    for (const [path, box] of Object.entries(geometryChanges)) {
      const original = findObject(report.inspection, path);
      if (!original) continue;
      for (const [field, expected, value] of geometryFields(original, box)) {
        if (value !== expected) list.push({ objectPath: path, field, expected, value });
      }
    }
    return list;
  }, [geometryChanges, report]);

  const pendingAll = useMemo(
    () => dedupeChanges([...Object.values(draftChanges), ...geometryPatchChanges, ...changes]).filter((change) => change.expected !== change.value),
    [draftChanges, geometryPatchChanges, changes],
  );

  const codeDirty = codeEditing && codeDraft !== report?.source;
  const dirty = pendingAll.length > 0 || codeDirty || structuralDraft !== null;

  const selectedObjects = useMemo(
    () =>
      report
        ? selectedPaths
            .map((path) => findObject(report.inspection, path))
            .filter((object): object is YrfObjectRef => object !== null)
        : [],
    [report, selectedPaths],
  );

  const alignSelected = (mode: "left" | "right" | "centerH" | "top" | "bottom" | "middleV") => {
    if (!report || selectedObjects.length < 2 || selectedObjects.some(object => !object.editableGeometry)) return;
    pushHistory();
    const boxes = selectedObjects.map((object) => draftBox(object));
    const minX = Math.min(...boxes.map((box) => box.x));
    const maxRight = Math.max(...boxes.map((box) => box.x + box.width));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxBottom = Math.max(...boxes.map((box) => box.y + box.height));
    const centerX = boxes.reduce((sum, box) => sum + box.x + box.width / 2, 0) / boxes.length;
    const centerY = boxes.reduce((sum, box) => sum + box.y + box.height / 2, 0) / boxes.length;
    setGeometryChanges((current) => {
      const next = { ...current };
      selectedObjects.forEach((object, index) => {
        const box = { ...boxes[index]! };
        if (mode === "left") box.x = minX;
        if (mode === "right") box.x = maxRight - box.width;
        if (mode === "centerH") box.x = Math.round(centerX - box.width / 2);
        if (mode === "top") box.y = minY;
        if (mode === "bottom") box.y = maxBottom - box.height;
        if (mode === "middleV") box.y = Math.round(centerY - box.height / 2);
        next[object.path] = box;
      });
      return next;
    });
    setError("");
    setMessage(tr.alignQueued);
  };

  const updateSelectedStyle = (updates: Record<string, string | null>) => {
    if (!selected?.supported) return;
    const base = parseStyleDeclarations(
      String(draftChanges[`${selected.path}.style`]?.value ?? selected.style ?? ""),
    );
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") delete base[key];
      else base[key] = value;
    }
    setObjectProperty("style", serializeStyleDeclarations(base));
  };

  const scalarProperties = useMemo(() => {
    if (!selected || !report?.source) return [];
    try {
      const object = valueAtPath(JSON.parse((structuralDraft ?? report.source).replace(/^\uFEFF/, "")), parseYrfPath(selected.path));
      if (!object || typeof object !== "object" || Array.isArray(object)) return [];
      const skip = new Set(["type", "caption", "dataField", "left", "top", "width", "height", ...(selected.kind !== "AR.Barcode" ? ["text"] : []), ...(selected.kind === "image" ? ["data"] : [])]);
      return Object.entries(object).filter(([key, value]) => !skip.has(key) && !hasYrfScriptField(key) && /^[A-Za-z_$][\w$-]*$/.test(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) as Array<[string, string | number | boolean]>;
    } catch { return []; }
  }, [selected, report, structuralDraft]);

  const flushCurrentChanges = () => {
    if (changes.length === 0) return;
    setDraftChanges((current) => {
      const next = { ...current };
      for (const change of changes) next[`${change.objectPath}.${change.field}`] = change;
      return next;
    });
  };

  const attemptLeave = (run: () => void) => {
    if (dirty) setLeaveAction({ run });
    else run();
  };

  const discardDrafts = () => {
    resetHistory();
    setDraftChanges({});
    setGeometryChanges({});
    if (structuralDraft && report?.source) {
      const original = inspectYrf(report.source, report.hash);
      if (original.inspection) setReport({ ...report, inspection: original.inspection });
      setSelected(null);
    }
    setStructuralDraft(null);
    setCodeEditing(false);
    setCodeDraft(null);
    setCodeError("");
    if (selected) {
      setCaption(selected.caption ?? "");
      setDataField(selected.dataField ?? "");
      setGeometry({ left: selected.box.x, top: selected.box.y, width: selected.box.width, height: selected.box.height });
    }
  };

  const saveSourceDraft = async (asCopy = false): Promise<boolean> => {
    if (!report?.source) return false;
    const base = codeEditing && codeDraft !== null ? codeDraft : structuralDraft ?? report.source;
    const patched = !codeEditing && pendingAll.length
      ? applyYrfChanges(base, pendingAll as YrfChange[])
      : { ok: true as const, text: base };
    if (!patched.ok) {
      const failure = "error" in patched ? patched.error : undefined;
      setError(failure || "Invalid YRF structure");
      return false;
    }
    setBusy(true);
    setError("");
    setCodeError("");
    setMessage("");
    try {
      const result = await post<{
        file: string;
        hash: string;
        source: string;
        inspection: YrfInspection;
      }>(token, asCopy ? "reports/yrf/source" : "reports/yrf/save-source", {
        path: report.file,
        expectedHash: report.hash,
        ...(asCopy ? { text: patched.text } : { source: patched.text, approved: true }),
      });
      resetHistory();
      setReport({
        file: result.file,
        hash: result.hash,
        inspection: result.inspection,
        source: result.source,
      });
      setFilePath(result.file);
      setStructuralDraft(null);
      setDraftChanges({});
      setGeometryChanges({});
      setPending([]);
      setCodeEditing(false);
      setCodeDraft(null);
      const nextSelected = selected && findObject(result.inspection, selected.path);
      setSelected(nextSelected);
      setSelectedPaths(nextSelected ? [nextSelected.path] : []);
      if (nextSelected) {
        setCaption(nextSelected.caption ?? "");
        setDataField(nextSelected.dataField ?? "");
        const { x, y, width, height } = nextSelected.box;
        setGeometry({ left: x, top: y, width, height });
      }
      setPanel("design");
      setMessage(`${asCopy ? tr.saved : tr.updatedOriginal}: ${result.file}`);
      return true;
    } catch (caught) {
      setError((caught as Error).message);
      if (codeEditing) setCodeError((caught as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveAll = async (): Promise<boolean> => {
    return saveSourceDraft();
  };

  const addObject = (kind: "label" | "textbox" | "shape" | "line" | "image" | "table" | "form", bandPath?: string, position?: { x: number; y: number }) => {
    if (!report?.source) return;
    try {
      const base = structuralDraft ?? report.source;
      const patched = pendingAll.length ? applyYrfChanges(base, pendingAll as YrfChange[]) : null;
      if (patched && !patched.ok) throw new Error(patched.error);
      const source = patched?.ok ? patched.text : base;
      const target = bandPath ?? selected?.path.replace(/\.objects\[\d+\]$/, "") ?? report.inspection.pages[pageIndex]?.bands[0]?.path;
      if (!target) throw new Error("No report band is available");
      const names = new Set(report.inspection.pages.flatMap((page) => page.bands.flatMap((band) => band.objects.map((object) => object.name))).concat(report.inspection.sideBands.flatMap((band) => band.objects.map((object) => object.name))));
      const left = Math.max(0, Math.round(position?.x ?? 80)), top = Math.max(0, Math.round(position?.y ?? 40));
      const layout = kind === "table" ? [
        { type: "label", left, top, width: 250, height: 80, caption: "Column 1" },
        { type: "label", left: left + 250, top, width: 250, height: 80, caption: "Column 2" },
        { type: "textbox", left, top: top + 80, width: 250, height: 80, text: "", dataField: "" },
        { type: "textbox", left: left + 250, top: top + 80, width: 250, height: 80, text: "", dataField: "" },
        { type: "line", x1: left, y1: top + 80, x2: left + 500, y2: top + 80 },
      ] : kind === "form" ? [
        { type: "label", left, top, width: 200, height: 80, caption: "Field" },
        { type: "textbox", left: left + 210, top, width: 290, height: 80, text: "", dataField: "" },
      ] : [{ type: kind, ...(kind === "line" ? { x1: left, y1: top, x2: left + 500, y2: top } : { left, top, width: 500, height: kind === "image" ? 300 : 100 }), ...(kind === "label" ? { caption: "Text" } : kind === "textbox" ? { text: "", dataField: "" } : kind === "image" ? { data: "" } : {}) }];
      let result = { text: source, objectPath: "" };
      for (const object of layout) {
        let index = 1;
        while (names.has(`${object.type}${index}`)) index += 1;
        const name = `${object.type}${index}`;
        names.add(name);
        result = appendYrfObject(result.text, target, { ...object, name });
      }
      const inspected = inspectYrf(result.text, report.hash);
      if (!inspected.inspection) throw new Error(inspected.error ?? "Invalid report");
      pushHistory();
      setStructuralDraft(result.text);
      setReport({ ...report, inspection: inspected.inspection });
      const added = findObject(inspected.inspection, result.objectPath);
      setSelected(added);
      setCaption(added?.caption ?? "");
      setDataField(added?.dataField ?? "");
      setGeometry({ left: added?.box.x ?? 0, top: added?.box.y ?? 0, width: added?.box.width ?? 0, height: added?.box.height ?? 0 });
      setDraftChanges({}); setGeometryChanges({}); setPending([]); setError("");
    } catch (caught) { setError((caught as Error).message); }
  };

  const setObjectProperty = (field: string, value: string | number | boolean) => {
    if (!report?.source || !selected || selected.hasScript || hasYrfScriptField(field)) return;
    try {
      const base = structuralDraft ?? report.source;
      const patched = pendingAll.length ? applyYrfChanges(base, pendingAll as YrfChange[]) : null;
      if (patched && !patched.ok) throw new Error(patched.error);
      const next = setYrfObjectScalar(patched?.ok ? patched.text : base, selected.path, field, value);
      const inspected = inspectYrf(next, report.hash);
      if (!inspected.inspection) throw new Error(inspected.error ?? "Invalid report");
      const updated = findObject(inspected.inspection, selected.path);
      pushHistory();
      setStructuralDraft(next); setReport({ ...report, inspection: inspected.inspection }); setSelected(updated);
      if (updated) {
        setCaption(updated.caption ?? ""); setDataField(updated.dataField ?? "");
        setGeometry({ left: updated.box.x, top: updated.box.y, width: updated.box.width, height: updated.box.height });
      }
      setDraftChanges({}); setGeometryChanges({}); setPending([]); setError("");
    } catch (caught) { setError((caught as Error).message); }
  };
  imageUpdate.current = (value) => setObjectProperty("data", value);
  const importImage = (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) { setError(tr.imageError); return; }
    const target = { ...imageTarget.current };
    const reader = new FileReader();
    reader.onload = () => {
      if (target.file !== imageTarget.current.file || target.path !== imageTarget.current.path) return;
      if (typeof reader.result !== "string" || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(reader.result)) { setError(tr.imageError); return; }
      imageUpdate.current(reader.result);
    };
    reader.onerror = () => setError(tr.imageError);
    reader.readAsDataURL(file);
  };

  const moveObjectLayer = (position: "front" | "back" | "up" | "down") => {
    if (!report?.source || !selected) return;
    try {
      const base = structuralDraft ?? report.source;
      const patched = pendingAll.length ? applyYrfChanges(base, pendingAll as YrfChange[]) : null;
      if (patched && !patched.ok) throw new Error(patched.error ?? "Invalid YRF structure");
      const result = moveYrfObject(patched?.ok ? patched.text : base, selected.path, position);
      const inspected = inspectYrf(result.text, report.hash);
      if (!inspected.ok || !inspected.inspection) throw new Error(inspected.error ?? "Invalid YRF structure");
      pushHistory();
      setStructuralDraft(result.text);
      setReport({ ...report, inspection: inspected.inspection });
      const updated = findObject(inspected.inspection, result.objectPath);
      setSelected(updated);
      setSelectedPaths([result.objectPath]);
      if (updated) {
        setCaption(updated.caption ?? "");
        setDataField(updated.dataField ?? "");
        setGeometry({ left: updated.box.x, top: updated.box.y, width: updated.box.width, height: updated.box.height });
      }
      setDraftChanges({});
      setGeometryChanges({});
      setPending([]);
      setError("");
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const removeObject = () => {
    if (!report?.source || !selected?.supported || selected.hasScript) return;
    try {
      const base = structuralDraft ?? report.source;
      const patched = pendingAll.length ? applyYrfChanges(base, pendingAll as YrfChange[]) : null;
      if (patched && !patched.ok) throw new Error(patched.error);
      const next = removeYrfObject(patched?.ok ? patched.text : base, selected.path);
      const inspected = inspectYrf(next, report.hash);
      if (!inspected.inspection) throw new Error(inspected.error ?? "Invalid report");
      const first = inspected.inspection.pages.flatMap((page) => page.bands.flatMap((band) => band.objects)).find((object) => object.editableCaption) ?? null;
      pushHistory();
      setStructuralDraft(next); setReport({ ...report, inspection: inspected.inspection }); setSelected(first);
      setCaption(first?.caption ?? ""); setDataField(first?.dataField ?? "");
      setGeometry({ left: first?.box.x ?? 0, top: first?.box.y ?? 0, width: first?.box.width ?? 0, height: first?.box.height ?? 0 });
      setDraftChanges({}); setGeometryChanges({}); setPending([]); setError("");
    } catch (caught) { setError((caught as Error).message); }
  };

  const scaleFor = (source: YrfInspection) =>
    source.paper.width > 0 ? 640 / source.paper.width * zoom : 0.25 * zoom;

  const beginGesture = (
    object: YrfObjectRef,
    event: React.PointerEvent,
    mode: "move" | "resize",
    handle?: YrfHandle,
  ) => {
    if (!object.editableGeometry || !report || !event.isPrimary || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    if (selected?.path !== object.path) selectObject(object);
    const previousBox = draftBox(object);
    const box = selected?.path === object.path
      ? { x: geometry.left, y: geometry.top, width: geometry.width, height: geometry.height }
      : {
          x: Number(draftChanges[`${object.path}.left`]?.value ?? previousBox.x),
          y: Number(draftChanges[`${object.path}.top`]?.value ?? previousBox.y),
          width: Number(draftChanges[`${object.path}.width`]?.value ?? previousBox.width),
          height: Number(draftChanges[`${object.path}.height`]?.value ?? previousBox.height),
        };
    gestureRef.current = {
      pointerId: event.pointerId,
      mode,
      path: object.path,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      box: { ...box },
      latest: box,
      before: snapshotDraft(),
    };

  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || !report) return;
      const scale = scaleFor(report.inspection);
      if (!scale) return;
      const dx = (event.clientX - gesture.startX) / scale;
      const dy = (event.clientY - gesture.startY) / scale;

      const round = (value: number) => Math.round(value);
      let box: Box = { ...gesture.box };
      if (gesture.mode === "move") {
        box = {
          ...box,
          x: Math.max(0, round(gesture.box.x + dx)),
          y: Math.max(0, round(gesture.box.y + dy)),
        };
      } else {
        const handle = gesture.handle ?? "se";
        if (handle.includes("e")) box.width = Math.max(2, round(gesture.box.width + dx));
        if (handle.includes("s")) box.height = Math.max(2, round(gesture.box.height + dy));
        if (handle.includes("w")) {
          box.x = Math.max(0, Math.min(round(gesture.box.x + dx), gesture.box.x + gesture.box.width - 2));
          box.width = gesture.box.x + gesture.box.width - box.x;
        }
        if (handle.includes("n")) {
          box.y = Math.max(0, Math.min(round(gesture.box.y + dy), gesture.box.y + gesture.box.height - 2));
          box.height = gesture.box.y + gesture.box.height - box.y;
        }
      }
      gesture.latest = box;
      setGeometryChanges((current) => ({ ...current, [gesture.path]: box }));
      setGeometry({ left: box.x, top: box.y, width: box.width, height: box.height });
    };
    const up = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (gesture?.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      if (gesture && (gesture.latest.x !== gesture.box.x || gesture.latest.y !== gesture.box.y ||
        gesture.latest.width !== gesture.box.width || gesture.latest.height !== gesture.box.height)) {
        pushHistory(gesture.before);
      } else if (gesture && gesture.latest !== gesture.box) {
        restoreDraft(gesture.before);
      }
    };
    const cancel = (event: KeyboardEvent | PointerEvent) => {
      if ("key" in event && event.key !== "Escape") return;
      const gesture = gestureRef.current;
      if (!gesture || ("pointerId" in event && gesture.pointerId !== event.pointerId)) return;
      gestureRef.current = null;
      restoreDraft(gesture.before);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", cancel);
    };
  }, [report, geometryChanges, zoom]);

  const createFile = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ file: string; hash: string; source: string; inspection: YrfInspection; warnings: string[] }>(
        token,
        "reports/yrf/create",
        {
          templateId: createTemplate,
          locale: language === "id" ? "id-ID" : "en-US",
          file: createPath.trim(),
          acknowledge: acknowledged,
        },
      );
      resetHistory();
      setReport({ file: result.file, hash: result.hash, source: result.source,
        inspection: { ...result.inspection, warnings: [...new Set(result.warnings)] } });
      setFilePath(result.file);
      setSelected(null);
      setPending([]);
      setCreating(false);
      setMessage(`${tr.created}: ${result.file}`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inspection = report?.inspection;
  const scale = inspection ? scaleFor(inspection) : 0.25 * zoom;
  const rulerStep = inspection ? Math.max(1, Math.round(inspection.paper.width / 1000) * 100) : 100;
  useEffect(() => {
    const band = bands.find((item) => item.objects.some((object) => object.path === selected?.path));
    if (band) setExpandedBands((current) => current.has(band.path) ? current : new Set([...current, band.path]));
  }, [selected?.path, report?.file]);

  return (
    <div className="yrf">
      <header className="yrf-bar">
        <button className="yrf-ghost" onClick={() => attemptLeave(onBack)}>
          ← {tr.back}
        </button>
        <button className="yrf-exit" onClick={() => attemptLeave(onExit)}>
          <span aria-hidden="true">↪</span> {tr.exit}
        </button>
        <strong>{tr.title}</strong>
        <ReportHelp language={language} yrf />
        <button className="yrf-ghost" disabled={busy} onClick={() => void chooseFolder()}>
          {tr.chooseFolder}
        </button>
        <input
          className="yrf-path"
          aria-label={tr.path}
          placeholder="/path/to/report.yrf"
          value={filePath}
          onChange={(event) => setFilePath(event.target.value)}
        />
        <button
          className="yrf-primary"
          disabled={busy || !filePath.trim()}
          onClick={() => attemptLeave(() => void open())}
        >
          {tr.open}
        </button>
        <div className="yrf-tabs">
          <button
            className={panel === "design" ? "on" : ""}
            onClick={() => {
              const showDesign = () => { setCodeEditing(false); setCodeDraft(null); setPanel("design"); };
              if (codeDirty) attemptLeave(showDesign);
              else showDesign();
            }}
          >
            {tr.designApprox}
          </button>
          <button className={panel === "code" ? "on" : ""} onClick={() => (pendingAll.length || structuralDraft) ? attemptLeave(() => setPanel("code")) : setPanel("code")}>
            {tr.codeReadonly}
          </button>
        </div>
        {inspection && panel === "design" && <>
          <button className="yrf-ghost" aria-label={tr.undoDraft} title={tr.undoDraft} disabled={busy || history.past.length === 0} onClick={() => stepHistory(false)}>↶</button>
          <button className="yrf-ghost" aria-label={tr.redoDraft} title={tr.redoDraft} disabled={busy || history.future.length === 0} onClick={() => stepHistory(true)}>↷</button>
        </>}
        <button className="yrf-ghost" onClick={() => setCreating((value) => !value)}>
          {tr.create}
        </button>
        {inspection && (
          <button className="yrf-primary" disabled={busy || !dirty} title={tr.saveDraftHint} onClick={() => void saveAll()}>
            {tr.saveOriginal}
          </button>
        )}
      </header>
      {inspection && panel === "design" && (
        <nav className="yrf-panel-controls" aria-label={language === "id" ? "Panel editor" : "Editor panels"}>
          <button className="yrf-ghost" aria-pressed={narrowPanel === "canvas"} onClick={() => setNarrowPanel("canvas")}>
            {language === "id" ? "Kanvas" : "Canvas"}
          </button>
          <button className="yrf-ghost" aria-pressed={narrowPanel === "palette"} onClick={() => setNarrowPanel("palette")}>
            {language === "id" ? "Palet dan struktur" : "Palette and structure"}
          </button>
          <button className="yrf-ghost" aria-pressed={narrowPanel === "properties"} onClick={() => setNarrowPanel("properties")}>
            {language === "id" ? "Properti" : "Properties"}
          </button>
        </nav>
      )}

      {error && <div className="yrf-alert bad">{error}</div>}
      {message && <div className="yrf-alert ok">{message}</div>}

      {creating && (
        <div className="yrf-create">
          <strong>{tr.createTitle}</strong>
          <p className="yrf-hint">{tr.createHint}</p>
          <div className="yrf-create-row">
            <label className="yrf-field">
              <span>{tr.template}</span>
              <select value={createTemplate} onChange={(event) => setCreateTemplate(event.target.value)}>
                {["invoice", "blank", "statement", "receipt", "loanSchedule", "aging", "collection", "voucher", "vehicleCollateral"].map(
                  (template) => (
                    <option key={template} value={template}>
                      {template === "vehicleCollateral" ? language === "id" ? "Formulir agunan kendaraan" : "Vehicle collateral form" : template}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="yrf-field grow">
              <span>{tr.path}</span>
              <input
                aria-label="New .yrf path"
                value={createPath}
                placeholder="/path/to/new-report.yrf"
                onChange={(event) => setCreatePath(event.target.value)}
              />
            </label>
          </div>
          <label className="yrf-ack">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>{tr.createAck}</span>
          </label>
          <div className="yrf-actions">
            <button onClick={() => setCreating(false)}>{tr.cancel}</button>
            <button
              className="yrf-primary"
              disabled={busy || !acknowledged || !createPath.trim()}
              onClick={() => attemptLeave(() => void createFile())}
            >
              {tr.createAction}
            </button>
          </div>
        </div>
      )}

      {(browse || browseError) && !inspection && (
        <div className="yrf-browse">
          {browseError && <p className="yrf-hint">{browseError}</p>}
          {browse && (
            <>
              <p className="yrf-hint">{tr.folder}: {browse.root}</p>
              {browse.entries.length === 0 ? (
                <p className="yrf-hint">{tr.noFiles}</p>
              ) : (
                <ul className="yrf-tree">
                  {browse.entries.map((entry) => (
                    <li key={entry.absolute}>
                      <button onClick={() => attemptLeave(() => void open(entry.absolute))}>
                        {entry.path}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {inspection && panel === "code" ? (
        <div className="yrf-code">
          <div className="yrf-code-head">
            <span>{tr.codeHint} {codeLine !== null && <strong>{tr.codeLine.replace("{line}", String(codeLine))}</strong>}</span>
            <div className="yrf-actions">
              {!codeEditing ? (
                <button
                  className="yrf-primary"
                  onClick={() => {
                    setCodeDraft(report?.source ?? "");
                    setCodeEditing(true);
                    setCodeError("");
                  }}
                >
                  {tr.editSource}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setCodeEditing(false);
                      setCodeDraft(null);
                      setCodeError("");
                    }}
                  >
                    {tr.cancel}
                  </button>
                  <button
                    className="yrf-primary"
                    disabled={busy || codeDraft === null || codeDraft === report?.source}
                    onClick={() => void saveSourceDraft(true)}
                  >
                    {tr.saveCopy}
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            className="yrf-code-area"
            ref={codeArea}
            wrap="off"
            readOnly={!codeEditing}
            spellCheck={false}
            value={codeDraft ?? report?.source ?? ""}
            aria-label={tr.codeReadonly}
            onChange={(event) => {
              setCodeDraft(event.target.value);
              setCodeLine(null);
            }}
          />
          {codeError && <p className="yrf-hint" style={{ color: "var(--error)" }}>{codeError}</p>}
          <p className="yrf-hint">{tr.sourceNote}</p>
        </div>
      ) : !inspection ? (
        <div className="yrf-empty">
          <h2>{tr.title}</h2>
          <p>{tr.empty}</p>
          <p className="yrf-hint">{tr.readonlyNote}</p>
        </div>
      ) : (
        <div
          className={`yrf-body yrf-panel-${narrowPanel}`}
          style={{
            ["--yrf-left-width" as string]: `${leftWidth}px`,
            ["--yrf-right-width" as string]: `${rightWidth}px`,
          }}
        >
          <aside className="yrf-left">
            <h3>{tr.palette}</h3>
            <p className="yrf-hint">{tr.paletteHint}</p>
            {([ [tr.textGroup, [["label", tr.addLabel, "T"], ["textbox", tr.addTextbox, "▤"], ["table", tr.addTable, "▦"], ["form", tr.addForm, "☷"]]], [tr.shapeGroup, [["shape", tr.addShape, "□"], ["line", tr.addLine, "╱"], ["image", tr.addImage, "▧"]]] ] as const).map(([group, items]) => (
              <details className="yrf-palette-group" key={group} open><summary>{group}</summary><div className="yrf-palette">
                {items.map(([kind, label, icon]) => <button key={kind} draggable onClick={() => addObject(kind)} onDragStart={(event) => { event.dataTransfer.setData("application/x-yrf-object", kind); event.dataTransfer.effectAllowed = "copy"; }}><span className="yrf-palette-icon" aria-hidden="true">{icon}</span>{label}</button>)}
              </div></details>
            ))}
            <p className="yrf-hint">{tr.layoutHint}</p>
            <details className="yrf-palette-group" open>
              <summary>{tr.stylesGroup}</summary>
              <div className="yrf-style-chips">
                {(
                  [
                    ["heading", tr.styleHeading, { "font-weight": "bold", "font-size": "14pt" }],
                    ["body", tr.styleBody, { "font-weight": "normal", "font-size": "9pt" }],
                    ["bold", tr.styleBold, { "font-weight": "bold" }],
                    ["italic", tr.styleItalic, { "font-style": "italic" }],
                    ["underline", tr.styleUnderline, { "text-decoration": "underline" }],
                    ["center", tr.styleCenter, { "text-align": "center" }],
                    ["muted", tr.styleMuted, { color: "#6b7280" }],
                    ["danger", tr.styleDanger, { color: "#b91c1c" }],
                  ] as const
                ).map(([key, label, updates]) => (
                  <button
                    key={key}
                    disabled={!selected?.supported}
                    onClick={() => updateSelectedStyle({ ...updates })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </details>
            <h3>{tr.structure}</h3>
            {inspection.warnings.length > 0 && (
              <div className="yrf-warnings">
                <strong>{tr.warnings}</strong>
                <ul>
                  {inspection.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="yrf-tree">
              {bands.map((band) => (
                <li key={band.path}>
                  <details className="yrf-band-tree" open={expandedBands.has(band.path)} onToggle={(event) => {
                    const isOpen = event.currentTarget.open;
                    setExpandedBands((current) => {
                      if (current.has(band.path) === isOpen) return current;
                      const next = new Set(current);
                      if (isOpen) next.add(band.path); else next.delete(band.path);
                      return next;
                    });
                  }}><summary className="yrf-band-label">{band.type} · {band.objects.length}</summary>
                  <ul>
                    {band.objects.length === 0 && <li className="yrf-hint">{tr.noObjects}</li>}
                    {band.objects.map((object) => (
                      <li key={object.path}>
                        <button
                          className={selected?.path === object.path ? "on" : ""}
                          onClick={(event) => selectObject(object, event.shiftKey || event.metaKey || event.ctrlKey)}
                        >
                          {object.kind} · {object.name || object.path.split(".").pop()}
                        </button>
                      </li>
                    ))}
                  </ul>
                  </details>
                </li>
              ))}
            </ul>
          </aside>
          <div
            className="yrf-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label={tr.resizeLeftPanel}
            tabIndex={0}
            onPointerDown={(event) => startPanelResize("left", event)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setLeftWidth((value) => Math.max(230, value - 16));
              if (event.key === "ArrowRight") setLeftWidth((value) => Math.min(520, value + 16));
            }}
          />

          <main className="yrf-canvas-wrap">
            <div className="yrf-note">{tr.selectHint} {tr.readonlyNote}</div>
            <div className="yrf-view-controls"><button type="button" className="yrf-ghost" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))}>−</button><span>{Math.round(zoom * 100)}%</span><button type="button" className="yrf-ghost" aria-label="Zoom in" disabled={zoom >= 1.6} onClick={() => setZoom((value) => Math.min(1.6, Math.round((value + 0.1) * 10) / 10))}>+</button><button type="button" className="yrf-ghost" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}>{tr.grid}</button><button type="button" className="yrf-ghost" aria-pressed={showRuler} onClick={() => setShowRuler((value) => !value)}>{tr.ruler}</button></div>
            {inspection.pages.length > 1 && <label className="yrf-page-selector">{tr.localPage}
              <select value={pageIndex} onChange={event => {
                flushCurrentChanges();
                setPageIndex(Number(event.target.value));
                setSelected(null);
                setSelectedPaths([]);
                setPending([]);
              }}>
                {inspection.pages.map(page => <option key={page.path} value={page.index}>{page.index + 1}</option>)}
              </select>
            </label>}
            {pageLayout?.overflow && <p className="yrf-note" role="status">{tr.pageOverflow}</p>}
            {selectedPaths.length > 1 && (
              <div className="yrf-align-bar">
                <span>{tr.multiSelected.replace("{count}", String(selectedPaths.length))}</span>
                {(
                  [
                    ["left", tr.alignLeft],
                    ["centerH", tr.alignCenterH],
                    ["right", tr.alignRight],
                    ["top", tr.alignTop],
                    ["middleV", tr.alignMiddleV],
                    ["bottom", tr.alignBottom],
                  ] as const
                ).map(([mode, label]) => (
                  <button key={mode} disabled={selectedObjects.some(object => !object.editableGeometry)} onClick={() => alignSelected(mode)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div
              className="yrf-page"
              style={{
                width: inspection.paper.width * scale,
                height: inspection.paper.height * scale,
                backgroundImage: showGrid ? "linear-gradient(to right, #94a3b855 1px, transparent 1px), linear-gradient(to bottom, #94a3b855 1px, transparent 1px)" : undefined,
                backgroundSize: showGrid ? `${rulerStep * scale}px ${rulerStep * scale}px` : undefined,
              }}
            >
              {showRuler && <CanvasRulers width={inspection.paper.width} height={inspection.paper.height} scale={scale} step={rulerStep} unit={tr.rawUnits} />}
              {pageLayout?.placements.map(({ band, top }) => (
                    <div
                      key={band.path}
                      className="yrf-band"
                      style={{ top: top * scale, height: band.height * scale }}
                      onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-yrf-object")) event.preventDefault(); }}
                      onDrop={(event) => {
                        const kind = event.dataTransfer.getData("application/x-yrf-object");
                        if (kind !== "label" && kind !== "textbox" && kind !== "shape" && kind !== "line" && kind !== "image" && kind !== "table" && kind !== "form") return;
                        event.preventDefault();
                        const rect = event.currentTarget.getBoundingClientRect();
                        addObject(kind, band.path, { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale });
                      }}
                    >
                      {band.objects.map((object) => {
                        const box = geometryChanges[object.path] ?? object.box;
                        return (
                          <button
                            key={object.path}
                            className={`yrf-object kind-${object.kind
                              .replace(/[^A-Za-z0-9-]/g, "-")
                              .toLowerCase()} ${selectedPaths.includes(object.path) ? "on" : ""} ${object.editableGeometry ? "movable" : ""}`}
                            style={(() => {
                              const declarations = parseStyleDeclarations(
                                String(draftChanges[`${object.path}.style`]?.value ?? object.style ?? ""),
                              );
                              const fontSize = declarations["font-size"]
                                ? `${Math.max(5, parseFloat(declarations["font-size"]) * 1.333)}px`
                                : undefined;
                              return {
                                left: box.x * scale,
                                top: box.y * scale,
                                width: Math.max(6, box.width * scale),
                                height: Math.max(4, box.height * scale),
                                fontWeight: declarations["font-weight"],
                                fontStyle: declarations["font-style"],
                                textDecoration: declarations["text-decoration"],
                                color: declarations.color,
                                backgroundColor: declarations["background-color"],
                                borderColor: declarations["border-color"],
                                borderStyle: declarations["border-color"] ? "solid" : undefined,
                                textAlign: declarations["text-align"] as never,
                                fontSize,
                              };
                            })()}
                            onPointerDown={(event) => beginGesture(object, event, "move")}
                            onClick={(event) => selectObject(object, event.shiftKey || event.metaKey || event.ctrlKey)}
                            onDoubleClick={() => { selectObject(object); if (object.editableCaption) requestAnimationFrame(() => captionRef.current?.focus()); }}
                            title={`${object.kind} ${object.name}`}
                          >
                            {object.barcodeKind ? <Suspense fallback={null}>
                              <BarcodePreview kind={object.barcodeKind} value={object.localFields.value ?? ""} missing={tr.barcodeValueMissing} />
                            </Suspense> : !object.supported && object.capability !== "visual" &&
                              <span className="yrf-local-preview">{object.localRichText?.map((run, index) => <span className="yrf-rich-run" key={index}
                                style={{ fontWeight: run.bold ? 700 : undefined, fontStyle: run.italic ? "italic" : undefined,
                                  textDecoration: run.underline ? "underline" : undefined }}>{run.text}</span>) ?? (object.localPreviewText || object.kind)}</span>}
                            {object.kind === "image" && object.imageData ? <img src={object.imageData} alt="" draggable={false} /> : (object.caption !== null || (object.path === selected?.path && object.editableCaption)) && <span>{object.path === selected?.path ? caption : String(draftChanges[`${object.path}.${object.textField ?? "caption"}`]?.value ?? object.caption ?? "")}</span>}
                          </button>
                        );
                      })}
                      {selected && selectedPaths.length === 1 && selected.editableGeometry &&
                        band.objects.some((object) => object.path === selected.path) &&
                        (() => {
                          const box = geometryChanges[selected.path] ?? selected.box;
                          return (
                            <div
                              className="yrf-handles"
                              style={{
                                left: box.x * scale,
                                top: box.y * scale,
                                width: Math.max(6, box.width * scale),
                                height: Math.max(4, box.height * scale),
                              }}
                            >
                              {YRF_HANDLES.map((handle) => (
                                <span
                                  key={handle}
                                  className={`yrf-handle ${handle}`}
                                  data-yrf-handle={handle}
                                  onPointerDown={(event) =>
                                    beginGesture(selected, event, "resize", handle)
                                  }
                                />
                              ))}
                            </div>
                          );
                        })()}
                    </div>
              ))}
            </div>
          </main>
          <div
            className="yrf-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label={tr.resizeRightPanel}
            tabIndex={0}
            onPointerDown={(event) => startPanelResize("right", event)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setRightWidth((value) => Math.min(520, value + 16));
              if (event.key === "ArrowRight") setRightWidth((value) => Math.max(230, value - 16));
            }}
          />

          <aside className="yrf-right">
            <h3>{tr.geometry}</h3>
            {!selected ? (
              <p className="yrf-hint">{tr.selectHint}</p>
            ) : (
              <>
                <p className="yrf-meta">
                  {selected.kind} · {selected.name}
                </p>
                {report && selected.kind === "subReport" && /\.yrf$/i.test(selected.localFields.reportName ?? "") &&
                  <button type="button" className="yrf-ghost" disabled={busy}
                    onClick={() => attemptLeave(() => void open(report.file, selected.localFields.reportName))}>
                    {tr.openLinkedYrf}
                  </button>}
                {selected.kind === "image" && <label className="yrf-field"><span>{tr.importImage}</span><input aria-label={tr.importImage} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { importImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /><small className="yrf-hint">{tr.imageHint}</small></label>}
                {!selected.supported && !selected.hasScript && (
                  <p className="yrf-hint">
                    {tr.unsupported} · {selected.kind}
                  </p>
                )}
                {!selected.editableGeometry && <p className="yrf-hint">{tr.noGeometry}</p>}
                {selected.hasScript && <p className="yrf-hint">{tr.scriptProtected}</p>}
                <div className="yrf-grid">
                  {(["left", "top", "width", "height"] as const).map((field) => (
                    <label className="yrf-field" key={field}>
                      <span>{field}</span>
                      <input
                        type="number"
                        disabled={!selected.editableGeometry}
                        value={geometry[field]}
                        onChange={event => {
                          const value = Number(event.target.value);
                          changeDraftField(field, () => setGeometry(current => ({ ...current, [field]: value })));
                        }}
                        onBlur={finishDraftField}
                      />
                    </label>
                  ))}
                </div>
                <label className="yrf-field">
                  <span>{tr.caption}</span>
                  <textarea
                    ref={captionRef}
                    rows={3}
                    value={caption}
                    disabled={!selected.supported || !selected.editableCaption}
                    onChange={event => changeDraftField("caption", () => setCaption(event.target.value))}
                    onBlur={finishDraftField}
                  />
                </label>
                {selected.dataField !== null && (
                  <label className="yrf-field">
                    <span>{tr.dataField}</span>
                    <input value={dataField} disabled={!selected.supported} onChange={event => changeDraftField("dataField", () => setDataField(event.target.value))} onBlur={finishDraftField} />
                  </label>
                )}
                {selected && (
                  <>
                    <h3>{tr.styleTitle}</h3>
                    {(() => {
                      const styleMap = parseStyleDeclarations(
                        String(draftChanges[`${selected.path}.style`]?.value ?? selected.style ?? ""),
                      );
                      return (
                        <fieldset className="yrf-style-controls" disabled={!selected.supported} aria-label={tr.styleTitle}>
                          <button
                            aria-pressed={styleMap["font-weight"] === "bold"}
                            className={styleMap["font-weight"] === "bold" ? "on" : ""}
                            onClick={() =>
                              updateSelectedStyle({
                                "font-weight": styleMap["font-weight"] === "bold" ? "normal" : "bold",
                              })
                            }
                          >
                            B
                          </button>
                          <button
                            aria-pressed={styleMap["font-style"] === "italic"}
                            className={styleMap["font-style"] === "italic" ? "on" : ""}
                            onClick={() =>
                              updateSelectedStyle({
                                "font-style": styleMap["font-style"] === "italic" ? "normal" : "italic",
                              })
                            }
                          >
                            I
                          </button>
                          <button
                            aria-pressed={styleMap["text-decoration"] === "underline"}
                            className={styleMap["text-decoration"] === "underline" ? "on" : ""}
                            onClick={() =>
                              updateSelectedStyle({
                                "text-decoration":
                                  styleMap["text-decoration"] === "underline" ? "none" : "underline",
                              })
                            }
                          >
                            U
                          </button>
                          <input
                            aria-label={tr.styleSize}
                            className="yrf-style-size"
                            type="number"
                            step={0.5}
                            value={parseFloat(styleMap["font-size"] ?? "9") || 9}
                            onChange={(event) =>
                              updateSelectedStyle({ "font-size": `${Number(event.target.value)}pt` })
                            }
                          />
                          <label className="yrf-color-field">
                            <span>{tr.styleColor}</span>
                            <input
                              aria-label={tr.styleColor}
                              type="color"
                              value={
                                /^#[0-9A-Fa-f]{6}$/.test(styleMap.color ?? "") ? styleMap.color! : "#111827"
                              }
                              onChange={(event) => updateSelectedStyle({ color: event.target.value })}
                            />
                          </label>
                          <label className="yrf-color-field">
                            <span>{tr.fillColor}</span>
                            <input aria-label={tr.fillColor} type="color" value={/^#[0-9A-Fa-f]{6}$/.test(styleMap["background-color"] ?? "") ? styleMap["background-color"] : "#ffffff"} onChange={(event) => updateSelectedStyle({ "background-color": event.target.value })} />
                          </label>
                          <label className="yrf-color-field">
                            <span>{tr.borderColor}</span>
                            <input aria-label={tr.borderColor} type="color" value={/^#[0-9A-Fa-f]{6}$/.test(styleMap["border-color"] ?? "") ? styleMap["border-color"] : "#cbd5e1"} onChange={(event) => updateSelectedStyle({ "border-color": event.target.value })} />
                          </label>
                          <select
                            aria-label={tr.styleAlign}
                            value={styleMap["text-align"] ?? "left"}
                            onChange={(event) => updateSelectedStyle({ "text-align": event.target.value })}
                          >
                            <option value="left">{tr.alignLeft}</option>
                            <option value="center">{tr.alignCenterH}</option>
                            <option value="right">{tr.alignRight}</option>
                          </select>
                        </fieldset>
                      );
                    })()}
                  </>
                )}
                <h3>{tr.layers}</h3>
                <p className="yrf-hint">{tr.layersHint}</p>
                <div className="yrf-layer-list" role="listbox" aria-label={tr.layers}>
                  {layerGroups.map((band) => (
                    <div className="yrf-layer-group" key={band.path}>
                      <strong>{band.type}</strong>
                      {band.objects.slice().reverse().map((object) => (
                        <button
                          type="button"
                          key={object.path}
                          aria-pressed={selected?.path === object.path}
                          className={selected?.path === object.path ? "on" : ""}
                          onClick={() => selectObject(object)}
                          title={`${object.kind} · ${object.name}`}
                        >
                          <span aria-hidden="true">{object.kind === "label" ? "T" : object.kind === "textbox" ? "▤" : object.kind === "line" ? "╱" : object.kind === "image" ? "▧" : "□"}</span>
                          {object.kind} · {object.name}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="yrf-layer-actions" aria-label={tr.layers}>
                  <button disabled={!selected.supported || selected.hasScript} onClick={() => moveObjectLayer("front")}>{tr.bringFront}</button>
                  <button disabled={!selected.supported || selected.hasScript} onClick={() => moveObjectLayer("up")}>{tr.moveLayerUp}</button>
                  <button disabled={!selected.supported || selected.hasScript} onClick={() => moveObjectLayer("down")}>{tr.moveLayerDown}</button>
                  <button disabled={!selected.supported || selected.hasScript} onClick={() => moveObjectLayer("back")}>{tr.sendBack}</button>
                </div>
                {scalarProperties.length > 0 && <>
                  <h3>{tr.objectProperties}</h3>
                  <p className="yrf-hint">{tr.objectPropertiesHint}</p>
                  {scalarProperties.map(([key, value]) => {
                    const editable = selected.supported || !selected.hasScript && isYrfLocalField(selected.kind, key, value, selected.barcodeKind);
                    const readValue = (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                      const next = typeof value === "number" ? Number(event.currentTarget.value) : event.currentTarget.value;
                      if (next !== value) setObjectProperty(key, next);
                    };
                    return <label className="yrf-field" key={`${selected.path}.${key}.${value}`}>
                      <span>{key}</span>
                      {typeof value === "boolean" ? <select disabled={!editable} aria-label={key} value={String(value)} onChange={event => setObjectProperty(key, event.target.value === "true")}><option value="true">true</option><option value="false">false</option></select>
                        : editable && key === "visible" && !selected.supported ? <select aria-label={key} value={String(value)} onChange={event => setObjectProperty(key, event.target.value)}><option value="0">0</option><option value="1">1</option></select>
                        : selected.kind === "rtf" && key === "data" ? <textarea readOnly={!editable} aria-label={key} rows={3} maxLength={4000} defaultValue={String(value)} onBlur={readValue} />
                        : <input disabled={!editable} aria-label={key} type={typeof value === "number" ? "number" : "text"} defaultValue={String(value)} onBlur={readValue} />}
                    </label>;
                  })}
                </>}
                <button className="yrf-remove" disabled={!selected.supported || selected.hasScript} title={selected.hasScript ? tr.scriptProtected : !selected.supported ? tr.unsupported : undefined} onClick={removeObject}>{tr.removeObject}</button>

                {pending.length > 0 && (
                  <div className="yrf-diff">
                    {pending.map((change) => (
                      <div key={`${change.path}-${change.before}`}>
                        <strong>{change.path.split(".").slice(-2).join(".")}</strong>
                        <pre>
                          {tr.before}: {String(change.before)}
                          {"  →  "}
                          {tr.after}: {String(change.after)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      )}
      {leaveAction && (
        <ReportDialog className="yrf-modal-card" label={tr.unsavedTitle} onCancel={() => { if (!busy) setLeaveAction(null); }}>
            <h3>{tr.unsavedTitle}</h3>
            <p>{tr.unsavedHint}</p>
            <div className="yrf-actions">
              <button autoFocus disabled={busy} onClick={() => setLeaveAction(null)}>{tr.cancel}</button>
              <button
                onClick={() => {
                  const run = leaveAction.run;
                  setLeaveAction(null);
                  discardDrafts();
                  run();
                }}
              >
                {tr.discard}
              </button>
              <button
                className="yrf-primary"
                disabled={busy}
                onClick={() => {
                  const run = leaveAction.run;
                  void saveAll().then((ok) => {
                    if (!ok) return;
                    setLeaveAction(null);
                    run();
                  });
                }}
              >
                  {tr.saveOriginal}
              </button>
            </div>
        </ReportDialog>
      )}
    </div>
  );
}
