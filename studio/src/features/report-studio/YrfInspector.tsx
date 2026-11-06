import { useEffect, useMemo, useRef, useState } from "react";
import { inspectYrf, type YrfInspection, type YrfObjectRef } from "../../../../src/reports/formats/yrf/inspect";
import { appendYrfObject, applyYrfChanges, parseYrfPath, removeYrfObject, setYrfObjectScalar, valueAtPath, type YrfChange } from "../../../../src/reports/formats/yrf/patch";
import "./yrf-inspector.css";

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
    palette: "Palette",
    addLabel: "Text",
    addTextbox: "Field",
    addShape: "Box",
    addLine: "Line",
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
    styleAlign: "Alignment",
    multiSelected: "{count} objects selected",
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
    before: "Before",
    after: "After",
    saved: "Copy saved",
    created: "Created",
    readonlyNote:
      "Saving always writes a copy; the original file is never rewritten. Creation is experimental and unverified.",
    empty: "Choose a .yrf file to inspect. Nothing is executed.",
    experimental: "Experimental write",
    designApprox: "Design (approximate)",
    codeReadonly: "Code",
    unsavedTitle: "Unsaved YRF changes",
    unsavedHint: "Save them to a copy, discard them, or cancel.",
    discard: "Discard changes",
    codeHint: "Vendor source is never executed. Editing saves a copy, never the original.",
    editSource: "Edit source",
    applySource: "Apply & save copy",
    sourceNote:
      "Applying validates JSON and the WaiReport structure, then writes a sibling .edited copy.",
    folder: "Folder",
    noFiles: "No .yrf files in this folder.",
    chooseFolder: "Choose folder",
    manualPath: "Enter path manually",
    unsupported: "Limited visual controls: unverified vendor object",
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
    palette: "Palet",
    addLabel: "Teks",
    addTextbox: "Field",
    addShape: "Kotak",
    addLine: "Garis",
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
    styleAlign: "Perataan",
    multiSelected: "{count} objek dipilih",
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
    before: "Sebelum",
    after: "Sesudah",
    saved: "Salinan tersimpan",
    created: "Dibuat",
    readonlyNote:
      "Penyimpanan selalu membuat salinan; file asli tidak pernah ditimpa. Pembuatan bersifat eksperimental.",
    empty: "Pilih file .yrf untuk diperiksa. Tidak ada yang dieksekusi.",
    experimental: "Tulis eksperimental",
    designApprox: "Desain (perkiraan)",
    codeReadonly: "Kode",
    unsavedTitle: "Perubahan YRF belum disimpan",
    unsavedHint: "Simpan ke salinan, buang, atau batal.",
    discard: "Buang perubahan",
    codeHint: "Sumber vendor tidak pernah dieksekusi. Edit menyimpan salinan, bukan file asli.",
    editSource: "Edit sumber",
    applySource: "Terapkan & simpan salinan",
    sourceNote:
      "Penerapan memvalidasi JSON dan struktur WaiReport, lalu menulis salinan .edited.",
    folder: "Folder",
    noFiles: "Tidak ada file .yrf di folder ini.",
    chooseFolder: "Pilih folder",
    manualPath: "Masukkan path manual",
    unsupported: "Kontrol visual terbatas: objek vendor belum terverifikasi",
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
  const [selected, setSelected] = useState<YrfObjectRef | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

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
  const [codeError, setCodeError] = useState("");
  const [geometryChanges, setGeometryChanges] = useState<Record<string, Box>>({});
  const [draftChanges, setDraftChanges] = useState<Record<string, ChangeInput>>({});
  const [structuralDraft, setStructuralDraft] = useState<string | null>(null);
  const [leaveAction, setLeaveAction] = useState<{ run: () => void } | null>(null);
  const gestureRef = useRef<{
    mode: "move" | "resize";
    path: string;
    handle?: YrfHandle;
    startX: number;
    startY: number;
    box: Box;
  } | null>(null);

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

  const open = async (target = filePath.trim()) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await post<OpenResult>(token, "reports/yrf/open", { path: target });
      setReport(result);
      setFilePath(result.file);
      const first = result.inspection.pages.flatMap((page) => page.bands.flatMap((band) => band.objects)).find((object) => object.editableCaption);
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
      setReport(null);
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
    const focusPath = additive && !nextPaths.includes(object.path) ? nextPaths[nextPaths.length - 1]! : object.path;
    if (additive && !nextPaths.includes(object.path)) return;
    const focused = nextPaths.includes(object.path) ? object : null;
    if (!focused) return;
    const target = focused;
    setSelected(target);
    void focusPath;
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
    for (const [field, original, next] of geometryFields(selected, { x: geometry.left, y: geometry.top, width: geometry.width, height: geometry.height })) {
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
        setPending(result?.ok ? result.changes : []);
        setMessage(tr.paletteHint);
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
    if (!report || selectedObjects.length < 2) return;
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
    if (!selected) return;
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
      const skip = new Set(["type", "caption", "text", "dataField", "left", "top", "width", "height"]);
      return Object.entries(object).filter(([key, value]) => !skip.has(key) && /^[A-Za-z_$][\w$-]*$/.test(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) as Array<[string, string | number | boolean]>;
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

  const saveAll = async (): Promise<boolean> => {
    if (codeEditing) return applySource();
    return saveCopy();
  };

  const addObject = (kind: "label" | "textbox" | "shape" | "line", bandPath?: string, position?: { x: number; y: number }) => {
    if (!report?.source) return;
    try {
      const base = structuralDraft ?? report.source;
      const patched = pendingAll.length ? applyYrfChanges(base, pendingAll as YrfChange[]) : null;
      if (patched && !patched.ok) throw new Error(patched.error);
      const source = patched?.ok ? patched.text : base;
      const target = bandPath ?? selected?.path.replace(/\.objects\[\d+\]$/, "") ?? report.inspection.pages[0]?.bands[0]?.path;
      if (!target) throw new Error("No report band is available");
      const names = new Set(report.inspection.pages.flatMap((page) => page.bands.flatMap((band) => band.objects.map((object) => object.name))).concat(report.inspection.sideBands.flatMap((band) => band.objects.map((object) => object.name))));
      let index = 1;
      while (names.has(`${kind}${index}`)) index += 1;
      const left = Math.max(0, Math.round(position?.x ?? 80)), top = Math.max(0, Math.round(position?.y ?? 40));
      const object: Record<string, unknown> = {
        type: kind, name: `${kind}${index}`,
        ...(kind === "line" ? { x1: left, y1: top, x2: left + 500, y2: top } : { left, top, width: 500, height: 100 }),
        ...(kind === "label" ? { caption: "Text" } : kind === "textbox" ? { text: "", dataField: "" } : {}),
      };
      const result = appendYrfObject(source, target, object);
      const inspected = inspectYrf(result.text, report.hash);
      if (!inspected.inspection) throw new Error(inspected.error ?? "Invalid report");
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
    if (!report?.source || !selected) return;
    try {
      const base = structuralDraft ?? report.source;
      const patched = pendingAll.length ? applyYrfChanges(base, pendingAll as YrfChange[]) : null;
      if (patched && !patched.ok) throw new Error(patched.error);
      const next = setYrfObjectScalar(patched?.ok ? patched.text : base, selected.path, field, value);
      const inspected = inspectYrf(next, report.hash);
      if (!inspected.inspection) throw new Error(inspected.error ?? "Invalid report");
      const updated = findObject(inspected.inspection, selected.path);
      setStructuralDraft(next); setReport({ ...report, inspection: inspected.inspection }); setSelected(updated);
      if (updated) {
        setCaption(updated.caption ?? ""); setDataField(updated.dataField ?? "");
        setGeometry({ left: updated.box.x, top: updated.box.y, width: updated.box.width, height: updated.box.height });
      }
      setDraftChanges({}); setGeometryChanges({}); setPending([]); setError("");
    } catch (caught) { setError((caught as Error).message); }
  };

  const removeObject = () => {
    if (!report?.source || !selected) return;
    try {
      const base = structuralDraft ?? report.source;
      const patched = pendingAll.length ? applyYrfChanges(base, pendingAll as YrfChange[]) : null;
      if (patched && !patched.ok) throw new Error(patched.error);
      const next = removeYrfObject(patched?.ok ? patched.text : base, selected.path);
      const inspected = inspectYrf(next, report.hash);
      if (!inspected.inspection) throw new Error(inspected.error ?? "Invalid report");
      const first = inspected.inspection.pages.flatMap((page) => page.bands.flatMap((band) => band.objects)).find((object) => object.editableCaption) ?? null;
      setStructuralDraft(next); setReport({ ...report, inspection: inspected.inspection }); setSelected(first);
      setCaption(first?.caption ?? ""); setDataField(first?.dataField ?? "");
      setGeometry({ left: first?.box.x ?? 0, top: first?.box.y ?? 0, width: first?.box.width ?? 0, height: first?.box.height ?? 0 });
      setDraftChanges({}); setGeometryChanges({}); setPending([]); setError("");
    } catch (caught) { setError((caught as Error).message); }
  };

  const saveCopy = async (): Promise<boolean> => {
    if (!report) return false;
    if (pendingAll.length === 0 && !structuralDraft) return false;
    setBusy(true);
    setError("");
    try {
      const draftResult = structuralDraft && pendingAll.length ? applyYrfChanges(structuralDraft, pendingAll as YrfChange[]) : null;
      if (draftResult && !draftResult.ok) throw new Error(draftResult.error);
      const text = structuralDraft ? (draftResult?.ok ? draftResult.text : structuralDraft) : null;
      const result = await post<{
        file: string;
        hash: string;
        source: string;
        inspection: YrfInspection;
        changes: ChangeView[];
      }>(token, text !== null ? "reports/yrf/source" : "reports/yrf/save-copy", {
        path: report.file,
        expectedHash: report.hash,
        ...(text !== null ? { text } : { changes: pendingAll }),
      });
      const previousPath = selected?.path;
      setReport({
        file: result.file,
        hash: result.hash,
        inspection: result.inspection,
        source: result.source,
      });
      setFilePath(result.file);
      const nextSelected = previousPath ? findObject(result.inspection, previousPath) : null;
      setSelected(nextSelected);
      if (nextSelected) {
        setCaption(nextSelected.caption ?? "");
        setDataField(nextSelected.dataField ?? "");
        setGeometry({
          left: nextSelected.box.x,
          top: nextSelected.box.y,
          width: nextSelected.box.width,
          height: nextSelected.box.height,
        });
      }
      setDraftChanges({});
      setGeometryChanges({});
      setStructuralDraft(null);
      setPending(result.changes ?? []);
      setMessage(`${tr.saved}: ${result.file}`);
      return true;
    } catch (caught) {
      setError((caught as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const applySource = async (): Promise<boolean> => {
    if (!report || codeDraft === null) return false;
    setBusy(true);
    setError("");
    setCodeError("");
    try {
      const result = await post<{
        file: string;
        hash: string;
        source: string;
        inspection: YrfInspection;
      }>(token, "reports/yrf/source", {
        path: report.file,
        expectedHash: report.hash,
        text: codeDraft,
      });
      setReport({
        file: result.file,
        hash: result.hash,
        inspection: result.inspection,
        source: result.source,
      });
      setFilePath(result.file);
      setCodeEditing(false);
      setCodeDraft(null);
      setPanel("design");
      setSelected(null);
      setPending([]);
      setMessage(`${tr.saved}: ${result.file}`);
      return true;
    } catch (caught) {
      setCodeError((caught as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const scaleFor = (source: YrfInspection) =>
    source.paper.width > 0 ? 640 / source.paper.width : 0.25;

  const beginGesture = (
    object: YrfObjectRef,
    event: React.MouseEvent,
    mode: "move" | "resize",
    handle?: YrfHandle,
  ) => {
    if (!object.supported || !object.editableGeometry || !report) return;
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
      mode,
      path: object.path,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      box: { ...box },
    };

  };

  useEffect(() => {
    const move = (event: MouseEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || !report) return;
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
      setGeometryChanges((current) => ({ ...current, [gesture.path]: box }));
      setGeometry({ left: box.x, top: box.y, width: box.width, height: box.height });
    };
    const up = () => {
      gestureRef.current = null;
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const gesture = gestureRef.current;
      if (!gesture) return;
      gestureRef.current = null;
      setGeometryChanges((current) => {
        const next = { ...current };
        delete next[gesture.path];
        return next;
      });
      setGeometry({
        left: gesture.box.x,
        top: gesture.box.y,
        width: gesture.box.width,
        height: gesture.box.height,
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", cancel);
    };
  }, [report, geometryChanges]);

  const createFile = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ file: string; hash: string; source: string; inspection: YrfInspection }>(
        token,
        "reports/yrf/create",
        {
          templateId: createTemplate,
          file: createPath.trim(),
          acknowledge: acknowledged,
        },
      );
      setReport({ file: result.file, hash: result.hash, source: result.source, inspection: result.inspection });
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
  const scale = inspection && inspection.paper.width > 0 ? 640 / inspection.paper.width : 0.25;
  const bands = inspection
    ? [
        ...inspection.sideBands.filter((band) => band.path.endsWith("reportHeader")),
        ...(inspection.pages[0]?.bands ?? []),
        ...inspection.sideBands.filter((band) => band.path.endsWith("reportFooter")),
      ]
    : [];

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
        <button className="yrf-ghost" onClick={() => setCreating((value) => !value)}>
          {tr.create}
        </button>
        {inspection && panel === "design" && <button className="yrf-primary" disabled={busy || !dirty} onClick={() => void saveCopy()}>{tr.saveReport}</button>}
      </header>

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
                {["invoice", "statement", "receipt", "loanSchedule", "aging", "collection", "voucher"].map(
                  (template) => (
                    <option key={template} value={template}>
                      {template}
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
            <span>{tr.codeHint}</span>
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
                    disabled={busy}
                    onClick={() => void applySource()}
                  >
                    {tr.applySource}
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            className="yrf-code-area"
            readOnly={!codeEditing}
            spellCheck={false}
            value={codeDraft ?? report?.source ?? ""}
            aria-label={tr.codeReadonly}
            onChange={(event) => setCodeDraft(event.target.value)}
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
        <div className="yrf-body">
          <aside className="yrf-left">
            <h3>{tr.palette}</h3>
            <p className="yrf-hint">{tr.paletteHint}</p>
            {([ [tr.textGroup, [["label", tr.addLabel, "T"], ["textbox", tr.addTextbox, "▤"]]], [tr.shapeGroup, [["shape", tr.addShape, "□"], ["line", tr.addLine, "╱"]]] ] as const).map(([group, items]) => (
              <details className="yrf-palette-group" key={group} open><summary>{group}</summary><div className="yrf-palette">
                {items.map(([kind, label, icon]) => <button key={kind} draggable onClick={() => addObject(kind)} onDragStart={(event) => { event.dataTransfer.setData("application/x-yrf-object", kind); event.dataTransfer.effectAllowed = "copy"; }}><span className="yrf-palette-icon" aria-hidden="true">{icon}</span>{label}</button>)}
              </div></details>
            ))}
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
                    disabled={!selected}
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
                  <details open><summary className="yrf-band-label">{band.type} · {band.objects.length}</summary>
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

          <main className="yrf-canvas-wrap">
            <div className="yrf-note">{tr.selectHint} {tr.readonlyNote}</div>
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
                  <button key={mode} onClick={() => alignSelected(mode)}>
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
              }}
            >
              {(() => {
                let cursor = 0;
                return bands.map((band) => {
                  const top = cursor;
                  cursor += band.height;
                  return (
                    <div
                      key={band.path}
                      className="yrf-band"
                      style={{ top: top * scale, height: band.height * scale }}
                      onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-yrf-object")) event.preventDefault(); }}
                      onDrop={(event) => {
                        const kind = event.dataTransfer.getData("application/x-yrf-object");
                        if (kind !== "label" && kind !== "textbox" && kind !== "shape" && kind !== "line") return;
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
                              .toLowerCase()} ${selectedPaths.includes(object.path) ? "on" : ""}`}
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
                                textAlign: declarations["text-align"] as never,
                                fontSize,
                              };
                            })()}
                            onMouseDown={(event) => beginGesture(object, event, "move")}
                            onClick={(event) => selectObject(object, event.shiftKey || event.metaKey || event.ctrlKey)}
                            onDoubleClick={() => { selectObject(object); if (object.editableCaption) requestAnimationFrame(() => captionRef.current?.focus()); }}
                            title={`${object.kind} ${object.name}`}
                          >
                            {(object.caption !== null || object.path === selected?.path) && <span>{object.path === selected?.path ? caption : String(draftChanges[`${object.path}.${object.textField ?? "caption"}`]?.value ?? object.caption ?? "")}</span>}
                          </button>
                        );
                      })}
                      {selected && selectedPaths.length === 1 && selected.supported && selected.editableGeometry &&
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
                                  onMouseDown={(event) =>
                                    beginGesture(selected, event, "resize", handle)
                                  }
                                />
                              ))}
                            </div>
                          );
                        })()}
                    </div>
                  );
                });
              })()}
            </div>
          </main>

          <aside className="yrf-right">
            <h3>{tr.geometry}</h3>
            {!selected ? (
              <p className="yrf-hint">{tr.selectHint}</p>
            ) : (
              <>
                <p className="yrf-meta">
                  {selected.kind} · {selected.name}
                </p>
                {!selected.supported && (
                  <p className="yrf-hint">
                    {tr.unsupported}: {selected.kind}
                  </p>
                )}
                {!selected.editableGeometry && <p className="yrf-hint">{tr.noGeometry}</p>}
                <div className="yrf-grid">
                  {(["left", "top", "width", "height"] as const).map((field) => (
                    <label className="yrf-field" key={field}>
                      <span>{field}</span>
                      <input
                        type="number"
                        disabled={!selected.supported || !selected.editableGeometry}
                        value={geometry[field]}
                        onChange={(event) =>
                          setGeometry((current) => ({ ...current, [field]: Number(event.target.value) }))
                        }
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
                    onChange={(event) => setCaption(event.target.value)}
                  />
                </label>
                {selected.dataField !== null && (
                  <label className="yrf-field">
                    <span>{tr.dataField}</span>
                    <input value={dataField} onChange={(event) => setDataField(event.target.value)} />
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
                        <div className="yrf-style-controls">
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
                          <input
                            aria-label={tr.styleColor}
                            type="color"
                            value={
                              /^#[0-9A-Fa-f]{6}$/.test(styleMap.color ?? "") ? styleMap.color! : "#111827"
                            }
                            onChange={(event) => updateSelectedStyle({ color: event.target.value })}
                          />
                          <select
                            aria-label={tr.styleAlign}
                            value={styleMap["text-align"] ?? "left"}
                            onChange={(event) => updateSelectedStyle({ "text-align": event.target.value })}
                          >
                            <option value="left">{tr.alignLeft}</option>
                            <option value="center">{tr.alignCenterH}</option>
                            <option value="right">{tr.alignRight}</option>
                          </select>
                        </div>
                      );
                    })()}
                  </>
                )}
                {scalarProperties.length > 0 && <>
                  <h3>{tr.objectProperties}</h3>
                  <p className="yrf-hint">{tr.objectPropertiesHint}</p>
                  {scalarProperties.map(([key, value]) => (
                    <label className="yrf-field" key={`${selected.path}.${key}.${value}`}>
                      <span>{key}</span>
                      {typeof value === "boolean" ? <select aria-label={key} value={String(value)} onChange={(event) => setObjectProperty(key, event.target.value === "true")}><option value="true">true</option><option value="false">false</option></select> : <input aria-label={key} type={typeof value === "number" ? "number" : "text"} defaultValue={String(value)} onBlur={(event) => {
                        const next = typeof value === "number" ? Number(event.currentTarget.value) : event.currentTarget.value;
                        if (next !== value) setObjectProperty(key, next);
                      }} />}
                    </label>
                  ))}
                </>}
                <button className="yrf-remove" onClick={removeObject}>{tr.removeObject}</button>
                <div className="yrf-actions">
                  <button disabled={busy || (pendingAll.length === 0 && !structuralDraft)} onClick={() => void preview()}>
                    {tr.preview}
                  </button>
                  <button
                    className="yrf-primary"
                    disabled={busy || (pendingAll.length === 0 && !structuralDraft)}
                    onClick={() => void saveCopy()}
                  >
                    {tr.saveCopy}
                  </button>
                </div>
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
        <div className="yrf-modal" role="dialog" aria-modal="true" aria-label={tr.unsavedTitle}>
          <div className="yrf-modal-card">
            <h3>{tr.unsavedTitle}</h3>
            <p>{tr.unsavedHint}</p>
            <div className="yrf-actions">
              <button onClick={() => setLeaveAction(null)}>{tr.cancel}</button>
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
                  {pendingAll.length > 0 || structuralDraft ? tr.saveCopy : tr.applySource}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
