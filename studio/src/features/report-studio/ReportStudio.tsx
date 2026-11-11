import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PageOrientation,
  PageSizeName,
  ReportBand,
  ReportDocumentV1,
  ReportElement,
} from "../../../../src/reports/core/types";
import { reportEn, reportId, type ReportKey } from "./i18n";
import "./report-studio.css";
import YrfInspector from "./YrfInspector";
import ReportHelp from "./ReportHelp";
import CanvasRulers from "./CanvasRulers";
import TableStructureEditor from "./TableStructureEditor";
import TableRulesEditor from "./TableRulesEditor";
import { tableHeaderGroups, tableHeaderMatrix, tableHeaderTextColor } from "../../../../src/reports/core/table";
import { csvToRecords } from "../../../../src/reports/core/data";
import { imagePosition } from "../../../../src/reports/core/image-position";

const MM_TO_PX = 96 / 25.4;
const MIN_ELEMENT_MM = 2;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type ResizeHandle = (typeof HANDLES)[number];
const PT_TO_PX = 96 / 72;

interface TemplateInfo {
  id: string;
  name: { en: string; id: string };
  description: { en: string; id: string };
  styleFamily: string;
}

interface FormatInfo {
  id: string;
  label: string;
  extensions: string[];
  phase: string;
  fidelity: string;
  operations: Record<string, string>;
  notes: string;
}

interface StudioState {
  root: string | null;
  context: string | null;
  formats?: FormatInfo[];
  source: string | null;
  files: string[];
  templates: TemplateInfo[];
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
  truncated: boolean;
  suggestions: Array<{ path: string }>;
}

interface Issue {
  code: string;
  path?: string;
  message: string;
}

interface OpenResult {
  file: string;
  hash: string;
  document: ReportDocumentV1;
  warnings: Issue[];
}

interface PreviewResult {
  html: string;
  warnings: Issue[];
}

export interface ReportStudioProps {
  token: string;
  language: "en" | "id";
  onExit: () => void;
  context?: "home" | "project";
}

async function request<T>(token: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-UIUX-Token": token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(
      typeof data.error === "string" ? data.error : `HTTP ${response.status}`,
    ) as Error & { code?: string };
    error.code = typeof data.code === "string" ? data.code : undefined;
    throw error;
  }
  return data as T;
}

function issues(list: Issue[] | undefined): string[] {
  return (list ?? []).map((issue) => `${issue.path ?? ""} ${issue.message}`.trim());
}

export default function ReportStudio({ token, language, onExit, context = "home" }: ReportStudioProps) {
  const dict = language === "id" ? reportId : reportEn;
  const tr = (key: ReportKey) => dict[key];

  const [state, setState] = useState<StudioState | null>(null);
  const [document, setDocument] = useState<ReportDocumentV1 | null>(null);
  const [file, setFile] = useState("");
  const [hash, setHash] = useState("");
  const [savedJson, setSavedJson] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedBand, setSelectedBand] = useState<string | null>(null);
  const [tab, setTab] = useState<"design" | "code" | "preview">("design");
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [showRuler, setShowRuler] = useState(false);
  const [templateId, setTemplateId] = useState("invoice");
  const [styleFamily, setStyleFamily] = useState("corporateNavy");
  const [filename, setFilename] = useState("invoice.report.json");
  const [folder, setFolder] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "csv" | "html" | "xlsx" | "docx">("pdf");
  const [past, setPast] = useState<ReportDocumentV1[]>([]);
  const [future, setFuture] = useState<ReportDocumentV1[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ run: () => void } | null>(null);
  const [sampleJson, setSampleJson] = useState("");
  const [totalPath, setTotalPath] = useState("");
  const [sampleError, setSampleError] = useState("");
  const [mode, setMode] = useState<"native" | "yrf">("native");
  const [yrfInitialPath, setYrfInitialPath] = useState<string>("");
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [codeText, setCodeText] = useState("");
  const [codeErrors, setCodeErrors] = useState<string[]>([]);
  const [codeEdited, setCodeEdited] = useState(false);
  const [overflowCount, setOverflowCount] = useState(0);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageDocumentRef = useRef(document);
  const imageFileRef = useRef(file);
  imageDocumentRef.current = document;
  imageFileRef.current = file;
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [sampleSchema, setSampleSchema] = useState<string>("");
  const [showFormats, setShowFormats] = useState(false);
  const [expandedBands, setExpandedBands] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedId || !document) return;
    const band = document.bands.find((item) => item.elements.some((element) => element.id === selectedId));
    if (band) setExpandedBands(new Set([band.id]));
  }, [selectedId]);
  const [flow, setFlow] = useState<"landing" | "open" | "create">("landing");
  const [reportSearch, setReportSearch] = useState("");
  const [showLeft, setShowLeft] = useState(
    () => typeof window === "undefined" || window.innerWidth > 1100,
  );
  const [showRight, setShowRight] = useState(
    () => typeof window === "undefined" || window.innerWidth > 1100,
  );
  const resizeRef = useRef<{
    snapshot: ReportDocumentV1;
    id: string;
    handle: ResizeHandle;
    startX: number;
    startY: number;
    box: ReportElement["box"];
  } | null>(null);
  const dragRef = useRef<{
    snapshot: ReportDocumentV1;
    id: string;
    ids: string[];
    boxes: Array<{ id: string; box: ReportElement["box"] }>;
    startX: number;
    startY: number;
    box: ReportElement["box"];
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const dirty = (document ? JSON.stringify(document) !== savedJson : false) || codeEdited;

  const canvasData = useMemo<Record<string, unknown> | undefined>(() => {
    if (!sampleJson.trim()) return undefined;
    try {
      const value = JSON.parse(sampleJson) as unknown;
      return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }, [sampleJson]);

  useEffect(() => {
    if (!canvasData) {
      setSampleSchema("");
      return;
    }
    const parts = Object.entries(canvasData).map(([key, value]) => {
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0]) {
        return `${key} (${value.length}): ${Object.keys(value[0] as object).slice(0, 8).join(", ")}`;
      }
      return `${key}: ${Array.isArray(value) ? `array(${value.length})` : typeof value}`;
    });
    setSampleSchema(parts.join(" · "));
  }, [canvasData]);

  const loadBrowse = useCallback(
    async (scopeContext = false) => {
      try {
        const query = scopeContext ? "?format=all&scope=context" : "?format=all";
        const next = await request<BrowseResult>(token, `reports/browse${query}`);
        setBrowse(next);
      } catch {
        setBrowse(null);
      }
    },
    [token],
  );

  const refreshState = useCallback(async () => {
    try {
      const next = await request<StudioState>(token, "reports/state");
      setState(next);
      if (next.root) setFolder(next.root);
      await loadBrowse(!next.root && Boolean(next.context));
    } catch (error) {
      setErrors([(error as Error).message]);
    }
  }, [token]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const call = async <T,>(route: string, body: unknown): Promise<T> => {
    setBusy(true);
    setErrors([]);
    setMessage("");
    try {
      return await request<T>(token, `reports/${route}`, body);
    } finally {
      setBusy(false);
    }
  };

  const adopt = (result: OpenResult) => {
    setDocument(result.document);
    setFile(result.file);
    setHash(result.hash);
    setSavedJson(JSON.stringify(result.document));
    setWarnings(issues(result.warnings));
    selectIds([]);
    setSelectedBand(result.document.bands[0]?.id ?? null);
    setExpandedBands(result.document.bands[0] ? new Set([result.document.bands[0].id]) : new Set());
    setTab("design");
  };

  const useFolderPath = async (target: string) => {
    try {
      const next = await call<StudioState>("root", { path: target });
      setState(next);
      setFolder(next.root ?? target);
      setMessage(`${tr("reportFolder")}: ${next.root ?? target}`);
      setShowLeft(true);
      await loadBrowse(false);
    } catch (error) {
      setErrors([(error as Error).message]);
    }
  };

  const chooseFolder = async () => {
    setBusy(true);
    try {
      const picked = await request<{ path: string; unavailable: boolean }>(
        token,
        "pick-directory",
        {},
      );
      if (picked.path) await useFolderPath(picked.path);
    } catch (error) {
      setErrors([(error as Error).message]);
    } finally {
      setBusy(false);
    }
  };

  const useFolder = async () => {
    if (!folder.trim()) return;
    await useFolderPath(folder.trim());
  };

  const openEntry = async (entry: BrowseEntry) => {
    if (entry.kind === "yrf") {
      setYrfInitialPath(entry.absolute);
      setMode("yrf");
      return;
    }
    if (!state?.root) {
      const directory = entry.absolute.slice(0, entry.absolute.lastIndexOf("/"));
      await useFolderPath(directory);
      await performOpen(entry.name);
      return;
    }
    await performOpen(entry.path);
  };

  const applyCode = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(codeText);
    } catch (error) {
      setCodeErrors([(error as Error).message]);
      return;
    }
    try {
      const result = await request<{ ok: boolean; errors: Issue[] }>(token, "reports/validate", {
        document: parsed,
      });
      if (!result.ok) {
        setCodeErrors(
          result.errors.map((issue) => `${issue.path ?? "$"}: ${issue.message}`),
        );
        return;
      }
      commit(parsed as ReportDocumentV1);
      setCodeErrors([]);
      setCodeEdited(false);
      setMessage(tr("codeApplied"));
    } catch (error) {
      setCodeErrors([(error as Error).message]);
    }
  };

  const performCreate = async () => {
    try {
      const result = await call<OpenResult>("create", {
        templateId,
        file: filename,
        styleFamily,
        locale: language === "id" ? "id-ID" : "en-US",
      });
      adopt(result);
      await loadBrowse(false);
    } catch (error) {
      const typed = error as Error & { code?: string };
      setErrors([typed.code === "FILE_EXISTS" ? tr("exists") : typed.message]);
    }
  };

  const performOpen = async (target: string) => {
    try {
      adopt(await call<OpenResult>("open", { file: target }));
    } catch (error) {
      setErrors([(error as Error).message]);
    }
  };

  const guardUnsaved = (run: () => void) => {
    if (dirty) setConfirmAction({ run });
    else run();
  };

  const createReport = () => guardUnsaved(() => void performCreate());
  const openReport = (target: string) => guardUnsaved(() => void performOpen(target));

  const save = async (): Promise<boolean> => {
    if (!document) return false;
    if (codeEdited) {
      setErrors([tr("applyCodeFirst")]);
      return false;
    }
    try {
      const result = await call<{ hash: string; warnings: Issue[] }>("save", {
        file,
        expectedHash: hash,
        document,
      });
      setHash(result.hash);
      setSavedJson(JSON.stringify(document));
      setWarnings(issues(result.warnings));
      setMessage(tr("saved"));
      await loadBrowse(false);
      return true;
    } catch (error) {
      const typed = error as Error & { code?: string };
      setErrors([typed.code === "CONFLICT" ? tr("conflict") : typed.message]);
      return false;
    }
  };

  const exportDocument = async () => {
    if (!document) return;
    const parsed = parseSampleData();
    if (!parsed.valid) {
      setErrors([tr("fixSampleData")]);
      return;
    }
    try {
      const result = await call<{ file: string; mime: string; base64: string; warnings?: string[] }>("export", {
        document,
        format: exportFormat,
        data: parsed.data ?? {},
      });
      setWarnings(result.warnings ?? []);
      const binary = atob(result.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: result.mime }));
      const link = window.document.createElement("a");
      link.href = url;
      link.download = result.file;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`${tr("exported")}: ${result.file}`);
    } catch (error) {
      setErrors([(error as Error).message]);
    }
  };

  const parseSampleData = (): { valid: boolean; data?: Record<string, unknown> } => {
    if (!sampleJson.trim()) {
      setSampleError("");
      return { valid: true };
    }
    try {
      const value = JSON.parse(sampleJson) as unknown;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(tr("sampleInvalid"));
      }
      setSampleError("");
      return { valid: true, data: value as Record<string, unknown> };
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : tr("sampleInvalid"));
      return { valid: false };
    }
  };

  const refreshPreview = async () => {
    if (!document) return;
    const parsed = parseSampleData();
    if (!parsed.valid) {
      setErrors([tr("fixSampleData")]);
      return;
    }
    try {
      const result = await call<PreviewResult>("preview", {
        document,
        data: parsed.data,
      });
      setPreviewHtml(result.html);
      setWarnings(issues(result.warnings));
      setTab("preview");
    } catch (error) {
      setErrors([(error as Error).message]);
    }
  };

  const selected = useMemo<ReportElement | null>(() => {
    if (!document || !selectedId) return null;
    for (const band of document.bands) {
      const found = band.elements.find((element) => element.id === selectedId);
      if (found) return found;
    }
    return null;
  }, [document, selectedId]);

  const commit = (next: ReportDocumentV1) => {
    if (!document) return;
    setPast((entries) => [...entries.slice(-49), document]);
    setFuture([]);
    setDocument(next);
  };

  const selectIds = (ids: string[]) => {
    setSelectedIds(ids);
    setSelectedId(ids.length ? ids[ids.length - 1]! : null);
  };

  const selectedElements = useMemo(
    () =>
      document
        ? document.bands.flatMap((band) => band.elements).filter((element) => selectedIds.includes(element.id))
        : [],
    [document, selectedIds],
  );
  const selectionSpansBands = !!document && document.bands.filter((band) =>
    band.elements.some((element) => selectedIds.includes(element.id)),
  ).length > 1;

  const selectionIsGroup =
    selectedElements.length > 1 &&
    selectedElements.every(
      (element) => element.groupId && element.groupId === selectedElements[0]?.groupId,
    );

  const alignSelection = (mode: "left" | "right" | "centerH" | "top" | "bottom" | "middleV") => {
    if (!document || selectedElements.length < 2 || selectionSpansBands) return;
    const boxes = selectedElements.map((element) => element.box);
    const minX = Math.min(...boxes.map((box) => box.x));
    const maxRight = Math.max(...boxes.map((box) => box.x + box.width));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxBottom = Math.max(...boxes.map((box) => box.y + box.height));
    const centerX = boxes.reduce((sum, box) => sum + box.x + box.width / 2, 0) / boxes.length;
    const centerY = boxes.reduce((sum, box) => sum + box.y + box.height / 2, 0) / boxes.length;
    commit({
      ...document,
      bands: document.bands.map((band) => ({
        ...band,
        elements: band.elements.map((element) => {
          if (!selectedIds.includes(element.id)) return element;
          const box = { ...element.box };
          if (mode === "left") box.x = minX;
          if (mode === "right") box.x = Math.max(0, maxRight - box.width);
          if (mode === "centerH") box.x = Math.max(0, centerX - box.width / 2);
          if (mode === "top") box.y = minY;
          if (mode === "bottom") box.y = Math.max(0, maxBottom - box.height);
          if (mode === "middleV") box.y = Math.max(0, centerY - box.height / 2);
          return { ...element, box };
        }),
      })),
    });
  };

  const applyPreset = (preset: string) => {
    if (!selected) return;
    const presets: Record<string, Record<string, unknown>> = {
      body: { fontSize: 10, fontWeight: 400, italic: false, list: undefined, color: "#111827" },
      heading1: { fontSize: 18, fontWeight: 700, italic: false },
      heading2: { fontSize: 14, fontWeight: 600, italic: false },
      list: { fontSize: 10, list: "bullet" },
      caption: { fontSize: 8, fontWeight: 400, color: "#6B7280" },
      muted: { color: "#6B7280" },
      danger: { color: "#B91C1C" },
      highlight: { background: "#FEF3C7" },
      card: { background: "#F8FAFC", borderWidth: 0.3, borderColor: "#CBD5E1" },
      tableHeader: { fontWeight: 600, background: "#F1F5F9" },
    };
    const presetProps = presets[preset];
    if (!presetProps) return;
    const next = { ...selected.props };
    for (const [key, value] of Object.entries(presetProps)) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    patchElement({ props: next });
  };

  const moveBand = (bandId: string, direction: -1 | 1) => {
    if (!document) return;
    const index = document.bands.findIndex((band) => band.id === bandId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= document.bands.length) return;
    const bands = [...document.bands];
    const [moved] = bands.splice(index, 1);
    if (!moved) return;
    bands.splice(target, 0, moved);
    commit({ ...document, bands });
  };

  const moveLayer = (bandId: string, elementId: string, direction: -1 | 1) => {
    if (!document) return;
    const bands = document.bands.map((band) => {
      if (band.id !== bandId) return band;
      const index = band.elements.findIndex((item) => item.id === elementId), target = index + direction;
      if (index < 0 || target < 0 || target >= band.elements.length) return band;
      const elements = [...band.elements];
      const [moved] = elements.splice(index, 1);
      elements.splice(target, 0, moved!);
      return { ...band, elements };
    });
    commit({ ...document, bands });
  };

  const groupSelection = () => {
    if (!document || selectedIds.length < 2 || selectionSpansBands) return;
    const groupId = `group-${Date.now().toString(36)}`;
    commit({
      ...document,
      bands: document.bands.map((band) => ({
        ...band,
        elements: band.elements.map((element) =>
          selectedIds.includes(element.id) ? { ...element, groupId } : element,
        ),
      })),
    });
  };

  const ungroupSelection = () => {
    if (!document) return;
    commit({
      ...document,
      bands: document.bands.map((band) => ({
        ...band,
        elements: band.elements.map((element) => {
          if (!selectedIds.includes(element.id)) return element;
          const next = { ...element };
          delete next.groupId;
          return next;
        }),
      })),
    });
  };

  const undo = () => {
    const previous = past.at(-1);
    if (!previous || !document) return;
    setPast((entries) => entries.slice(0, -1));
    setFuture((entries) => [document, ...entries].slice(0, 50));
    setDocument(previous);
  };

  const redo = () => {
    const next = future[0];
    if (!next || !document) return;
    setFuture((entries) => entries.slice(1));
    setPast((entries) => [...entries.slice(-49), document]);
    setDocument(next);
  };

  const patchDocument = (patch: Partial<ReportDocumentV1>) => {
    if (!document) return;
    commit({ ...document, ...patch });
  };

  const patchBand = (bandId: string, patch: Partial<ReportBand>) => {
    if (!document) return;
    commit({
      ...document,
      bands: document.bands.map((band) => (band.id === bandId ? { ...band, ...patch } : band)),
    });
  };

  const patchElement = (patch: Partial<ReportElement>) => {
    if (!document || !selectedId) return;
    commit({
      ...document,
      bands: document.bands.map((band) => ({
        ...band,
        elements: band.elements.map((element) =>
          element.id === selectedId ? { ...element, ...patch } : element,
        ),
      })),
    });
  };

  const patchElementProps = (patch: Record<string, unknown>) => {
    if (!selected) return;
    patchElement({ props: { ...selected.props, ...patch } });
  };

  const patchElementBox = (patch: Partial<ReportElement["box"]>) => {
    if (!selected) return;
    patchElement({ box: { ...selected.box, ...patch } });
  };

  const addElement = (
    type: "text" | "rect" | "line" | "image" | "field" | "table" | "form",
    position?: { x: number; y: number; bandId: string },
  ) => {
    if (!document) return;
    const bandId = position?.bandId ?? selectedBand ?? document.bands[0]?.id;
    const band = document.bands.find((item) => item.id === bandId);
    if (!band) return;
    const x = position?.x ?? 8;
    const y = position?.y ?? 8;
    const base = `el-${type}-${Date.now().toString(36)}`;
    const make = (suffix: string, overrides: Partial<ReportElement>): ReportElement => ({
      id: `${base}${suffix}`,
      type: "text",
      box: { x, y, width: 60, height: 8 },
      props: { text: "Teks baru", fontSize: 9 },
      ...overrides,
    });
    let created: ReportElement[];
    if (type === "form") {
      created = [
        make("label", {
          box: { x, y, width: 60, height: 6 },
          props: { text: "Label", fontSize: 8, fontWeight: 600 },
        }),
        make("field", {
          type: "field",
          box: { x, y: y + 6, width: 60, height: 7 },
          props: { label: "", fontSize: 9 },
          bindings: { path: "" },
        }),
      ];
    } else if (type === "table") {
      created = [
        make("", {
          type: "table",
          box: { x, y, width: 120, height: 30 },
          props: {
            columns: [
              { key: "column1", label: "Kolom 1", width: 60, align: "left" },
              { key: "column2", label: "Kolom 2", width: 60, align: "right" },
            ],
            headerRepeat: true,
            rowHeight: 7,
            emptyText: "",
          },
          bindings: { path: "" },
        }),
      ];
    } else if (type === "field") {
      created = [
        make("", {
          type: "field",
          box: { x, y, width: 60, height: 7 },
          props: { label: "Field", fontSize: 9 },
          bindings: { path: "" },
        }),
      ];
    } else {
      created = [
        make("", {
          type,
          box:
            type === "line"
              ? { x, y, width: 80, height: 0.4 }
              : { x, y, width: 60, height: type === "text" ? 8 : 20 },
          props:
            type === "text"
              ? { text: "Teks baru", fontSize: 9 }
              : type === "line"
                ? { color: "#C7D0DE", strokeWidth: 0.4 }
                : type === "image"
                  ? { src: "", alt: "" }
                  : { strokeWidth: 0.3, color: "#C7D0DE" },
        }),
      ];
    }
    commit({
      ...document,
      bands: document.bands.map((item) =>
        item.id === band.id ? { ...item, elements: [...item.elements, ...created] } : item,
      ),
    });
    selectIds([created[0]!.id]);
    setSelectedBand(band.id);
  };

  const removeElement = () => {
    if (!document || selectedIds.length === 0) return;
    commit({
      ...document,
      bands: document.bands.map((band) => ({
        ...band,
        elements: band.elements.filter((element) => !selectedIds.includes(element.id)),
      })),
    });
    selectIds([]);
  };

  const duplicateSelected = () => {
    if (!document || !selected || !selectedBand) return;
    const copy: ReportElement = {
      ...selected,
      id: `${selected.id}-copy-${Date.now().toString(36)}`,
      box: { ...selected.box, x: selected.box.x + 4, y: selected.box.y + 4 },
      props: { ...selected.props },
    };
    commit({
      ...document,
      bands: document.bands.map((band) =>
        band.id === selectedBand ? { ...band, elements: [...band.elements, copy] } : band,
      ),
    });
    selectIds([copy.id]);
  };

  const withBox = (doc: ReportDocumentV1, id: string, box: ReportElement["box"]): ReportDocumentV1 => ({
    ...doc,
    bands: doc.bands.map((band) => ({
      ...band,
      elements: band.elements.map((element) =>
        element.id === id ? { ...element, box } : element,
      ),
    })),
  });

  const beginDrag = (element: ReportElement, event: React.MouseEvent) => {
    if (!document || editingId) return;
    event.stopPropagation();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const grouped = element.groupId
      ? document.bands
          .flatMap((band) => band.elements)
          .filter((candidate) => candidate.groupId === element.groupId)
          .map((candidate) => candidate.id)
      : [element.id];
    const ids = additive
      ? selectedIds.includes(element.id)
        ? selectedIds
        : [...selectedIds, element.id]
      : selectedIds.includes(element.id)
        ? selectedIds
        : grouped;
    dragRef.current = {
      snapshot: document,
      id: element.id,
      ids,
      startX: event.clientX,
      startY: event.clientY,
      box: { ...element.box },
      boxes: ids.map((id) => {
        const found = document.bands
          .flatMap((band) => band.elements)
          .find((candidate) => candidate.id === id);
        return { id, box: found ? { ...found.box } : { ...element.box } };
      }),
    };
  };

  const beginResize = (element: ReportElement, handle: ResizeHandle, event: React.MouseEvent) => {
    if (!document || editingId) return;
    event.stopPropagation();
    event.preventDefault();
    selectIds([element.id]);
    resizeRef.current = {
      snapshot: document,
      id: element.id,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      box: { ...element.box },
    };
  };

  const setOptionalProp = (key: string, value: string) => {
    if (!selected) return;
    const props = { ...selected.props };
    if (value) props[key] = value;
    else delete props[key];
    patchElement({ props });
  };

  const importImage = (file: File | undefined) => {
    if (!file) return;
    const targetId = selectedId;
    const reportFile = imageFileRef.current;
    if (!targetId || !selected || selected.type !== "image") return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setErrors([tr("imageTypeError")]);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrors([tr("imageSizeError")]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const current = imageDocumentRef.current;
      if (!current || imageFileRef.current !== reportFile) return;
      const target = current.bands.flatMap((band) => band.elements).find((element) => element.id === targetId && element.type === "image");
      if (!target) return;
      const next = { ...current, bands: current.bands.map((band) => ({ ...band, elements: band.elements.map((element) => element.id === targetId ? { ...element, props: { ...element.props, src: String(reader.result), alt: file.name } } : element) })) };
      setPast((entries) => [...entries.slice(-49), current]);
      setFuture([]);
      imageDocumentRef.current = next;
      setDocument(next);
      setErrors([]);
    };
    reader.onerror = () => setErrors([tr("imageTypeError")]);
    reader.readAsDataURL(file);
  };

  const importData = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setErrors([tr("imageSizeError")]);
      return;
    }
    try {
      const tableBound = document?.bands
        .flatMap((band) => band.elements)
        .find(
          (element) =>
            element.type === "table" && typeof element.bindings?.path === "string",
        );
      const dataset =
        (selected?.type === "table" && typeof selected.bindings?.path === "string"
          ? String(selected.bindings.path).split(".")[0]
          : null) ??
        (tableBound ? String(tableBound.bindings?.path).split(".")[0] : null) ??
        document?.datasets[0]?.id ??
        "data";

      let existing: Record<string, unknown> = {};
      try {
        const current = sampleJson.trim() ? (JSON.parse(sampleJson) as unknown) : {};
        if (current && typeof current === "object" && !Array.isArray(current)) {
          existing = current as Record<string, unknown>;
        }
      } catch {
        existing = {};
      }

      const text = await file.text();
      let merged: Record<string, unknown>;
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text) as unknown;
        if (Array.isArray(parsed)) {
          merged = { ...existing, [dataset]: parsed };
        } else if (parsed && typeof parsed === "object") {
          const object = parsed as Record<string, unknown>;
          merged = { ...existing, ...object };
          if (!Array.isArray(merged[dataset])) {
            throw new Error(tr("sampleInvalid"));
          }
        } else {
          throw new Error(tr("sampleInvalid"));
        }
      } else {
        merged = { ...existing, [dataset]: csvToRecords(text) };
      }
      setSampleJson(JSON.stringify(merged, null, 2));
      setSampleError("");
      setMessage(tr("dataImported").replace("{dataset}", dataset));
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : tr("sampleInvalid"));
    }
  };

  const onCanvasKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    const step = event.shiftKey ? 5 : 1;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeElement();
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    if (event.altKey) {
      const delta: Record<string, Partial<ReportElement["box"]>> = {
        ArrowLeft: { width: Math.max(2, selected.box.width - step) },
        ArrowRight: { width: selected.box.width + step },
        ArrowUp: { height: Math.max(2, selected.box.height - step) },
        ArrowDown: { height: selected.box.height + step },
      };
      const patch = delta[event.key];
      if (patch) patchElementBox(patch);
      return;
    }
    if (selectedIds.length > 1) {
      commit({
        ...document!,
        bands: document!.bands.map((band) => ({
          ...band,
          elements: band.elements.map((element) =>
            selectedIds.includes(element.id)
              ? {
                  ...element,
                  box: {
                    ...element.box,
                    x: Math.max(0, element.box.x + move[0]),
                    y: Math.max(0, element.box.y + move[1]),
                  },
                }
              : element,
          ),
        })),
      });
      return;
    }
    patchElementBox({
      x: Math.max(0, selected.box.x + move[0]),
      y: Math.max(0, selected.box.y + move[1]),
    });
  };

  useEffect(() => {
    if (tab !== "design" || !document) {
      setOverflowCount(0);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const node = canvasRef.current;
      if (!node) return;
      let count = 0;
      node.querySelectorAll(".rs-el").forEach((element) => {
        const box = element as HTMLElement;
        if (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1) {
          count += 1;
        }
      });
      setOverflowCount(count);
    });
    return () => cancelAnimationFrame(frame);
  }, [document, tab, zoom]);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || !document) return;
      const factor = MM_TO_PX * zoom;
      const dx = (event.clientX - drag.startX) / factor;
      const dy = (event.clientY - drag.startY) / factor;
      if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) return;
      const snap = (value: number) =>
        event.altKey || !snapToGrid ? Math.round(value * 10) / 10 : Math.round(value);
      const deltaX = snap(dx);
      const deltaY = snap(dy);
      setDocument((current) => {
        if (!current) return current;
        let next = current;
        for (const entry of drag.boxes) {
          const x = Math.min(
            Math.max(0, entry.box.x + deltaX),
            Math.max(0, current.page.width - entry.box.width),
          );
          const y = Math.max(0, entry.box.y + deltaY);
          next = withBox(next, entry.id, { ...entry.box, x, y });
        }
        return next;
      });
    };
    const resize = (event: MouseEvent) => {
      const state = resizeRef.current;
      if (!state || !document) return;
      const factor = MM_TO_PX * zoom;
      const dx = (event.clientX - state.startX) / factor;
      const dy = (event.clientY - state.startY) / factor;
      const snap = (value: number) =>
        event.altKey || !snapToGrid ? Math.round(value * 10) / 10 : Math.round(value);
      const { box, handle } = state;
      let { x, y, width, height } = box;
      if (handle.includes("e")) width = Math.max(MIN_ELEMENT_MM, snap(box.width + dx));
      if (handle.includes("s")) height = Math.max(MIN_ELEMENT_MM, snap(box.height + dy));
      if (handle.includes("w")) {
        x = Math.max(0, Math.min(snap(box.x + dx), box.x + box.width - MIN_ELEMENT_MM));
        width = box.x + box.width - x;
      }
      if (handle.includes("n")) {
        y = Math.max(0, Math.min(snap(box.y + dy), box.y + box.height - MIN_ELEMENT_MM));
        height = box.y + box.height - y;
      }
      if (x + width > document.page.width) {
        width = Math.max(MIN_ELEMENT_MM, document.page.width - x);
      }
      setDocument((current) =>
        current ? withBox(current, state.id, { x, y, width, height }) : current,
      );
    };
    const up = () => {
      const drag = dragRef.current;
      if (drag) {
        dragRef.current = null;
        setPast((entries) => [...entries.slice(-49), drag.snapshot]);
        setFuture([]);
      }
      const state = resizeRef.current;
      if (state) {
        resizeRef.current = null;
        setPast((entries) => [...entries.slice(-49), state.snapshot]);
        setFuture([]);
      }
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const drag = dragRef.current;
      if (drag) {
        dragRef.current = null;
        setDocument(drag.snapshot);
      }
      const state = resizeRef.current;
      if (state) {
        resizeRef.current = null;
        setDocument(state.snapshot);
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", cancel);
    };
  }, [document, zoom, snapToGrid]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (key === "s") {
        event.preventDefault();
        if (dirty) void save();
        return;
      }
      if (key === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (key === "e") {
        event.preventDefault();
        if (selected) setEditingId(selected.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  if (mode === "yrf") {
    return (
      <YrfInspector
        token={token}
        language={language}
        initialPath={yrfInitialPath}
        onExit={() => guardUnsaved(onExit)}
        onBack={() => {
          setMode("native");
          setYrfInitialPath("");
          void loadBrowse();
        }}
      />
    );
  }

  if (!state) {
    return <div className="rs rs-loading">{tr("loading")}</div>;
  }

  const page = document?.page;
  const scale = page ? MM_TO_PX * zoom : MM_TO_PX;

  return (
    <div className="rs">
      <header className="rs-bar">
        <button className="rs-ghost" onClick={() => guardUnsaved(onExit)}>
          ← {tr(context === "project" ? "backToProject" : "back")}
        </button>
        <button
          className="rs-exit"
          aria-label={tr("exit")}
          title={tr("exit")}
          onClick={() => guardUnsaved(onExit)}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v7A1.5 1.5 0 0 0 3.5 13H6" />
            <path d="M10 11l3-3-3-3M13 8H6" />
          </svg>
          {tr("exit")}
        </button>
        <div className="rs-brand">
          <strong>{tr("workspace")}</strong>
          <span>{tr("tagline")}</span>
        </div>
        <ReportHelp language={language} />
        {document && (
          <input
            className="rs-title-input"
            aria-label={tr("reportTitle")}
            value={document.title}
            onChange={(event) => patchDocument({ title: event.target.value })}
          />
        )}
        <div className="rs-bar-actions">
          {document && <span className={`rs-dirty ${dirty ? "on" : ""}`}>{dirty ? tr("unsaved") : tr("saved")}</span>}
          <button
            className="rs-ghost rs-narrow-only"
            aria-pressed={showLeft}
            onClick={() => setShowLeft((value) => !value)}
          >
            {tr("reports")}
          </button>
          <button
            className="rs-ghost rs-narrow-only"
            aria-pressed={showRight}
            onClick={() => setShowRight((value) => !value)}
          >
            {tr("properties")}
          </button>
          <button className="rs-ghost" onClick={() => setShowFormats(true)}>
            {tr("formats")}
          </button>
          <button
            className="rs-ghost"
            onClick={() => {
              setYrfInitialPath("");
              setMode("yrf");
            }}
          >
            {tr("yrfMode")}
          </button>
          <div className="rs-tabs">
            <button className={tab === "design" ? "on" : ""} onClick={() => setTab("design")}>
              {tr("design")}
            </button>
            <button
              className={tab === "code" ? "on" : ""}
              onClick={() => {
                if (!codeEdited) {
                  setCodeText(document ? JSON.stringify(document, null, 2) : "");
                }
                setCodeErrors([]);
                setTab("code");
              }}
            >
              {tr("code")}
            </button>
            <button className={tab === "preview" ? "on" : ""} onClick={() => void refreshPreview()}>
              {tr("preview")}
            </button>
          </div>
          <select
            className="rs-export-select"
            aria-label={tr("export")}
            value={exportFormat}
            onChange={(event) => setExportFormat(event.target.value as "pdf" | "csv" | "html" | "xlsx" | "docx")}
          >
            <option value="pdf">PDF</option>
            <option value="csv">CSV</option>
            <option value="html">HTML</option>
            <option value="xlsx">XLSX</option>
            <option value="docx">DOCX</option>
          </select>
          <button className="rs-ghost" disabled={!document || busy} onClick={() => void exportDocument()}>
            {tr("export")}
          </button>
          <button className="rs-primary" disabled={!document || !dirty || busy} onClick={() => void save()}>
            {tr("save")}
          </button>
        </div>
      </header>

      <div className={`rs-body ${showLeft ? "left-open" : ""} ${showRight ? "right-open" : ""}`}>
        <aside className="rs-left">
          {(flow === "create" || document) && (
          <section>
              <h3>{tr("templates")}</h3>
              {!document && <p className="rs-hint">{tr("templateHint")}</p>}
              <div className="rs-templates">
                {state.templates.map((template) => (
                  <button
                    key={template.id}
                    className={`rs-template ${templateId === template.id ? "on" : ""}`}
                    onClick={() => {
                      setTemplateId(template.id);
                      setStyleFamily(template.styleFamily);
                      setFilename(`${template.id}.report.json`);
                    }}
                  >
                    <strong>{template.name[language]}</strong>
                    <span>{template.description[language]}</span>
                  </button>
                ))}
              </div>
              <label className="rs-field">
                <span>{tr("styleFamily")}</span>
                <select value={styleFamily} onChange={(event) => setStyleFamily(event.target.value)}>
                  <option value="corporateNavy">Corporate Navy</option>
                  <option value="neutralFinance">Neutral Finance</option>
                  <option value="minimalMono">Minimal Monochrome</option>
                </select>
              </label>
              <label className="rs-field">
                <span>{tr("fileName")}</span>
                <input value={filename} onChange={(event) => setFilename(event.target.value)} />
              </label>
              <button className="rs-primary wide" disabled={!state.root || busy} onClick={() => void createReport()}>
                {tr("create")}
              </button>
            </section>

            )}

          <section>
            <h3>{tr("reportFolder")}</h3>
            <p className="rs-folder-path" title={state.root ?? undefined}>
              {state.root ?? tr("notSelected")}
            </p>
            {state.context && (
              <p className="rs-hint">
                {tr("projectContext")}: {state.context}
              </p>
            )}
            <div className="rs-folder-actions">
              <button className="rs-ghost" disabled={busy} onClick={() => void chooseFolder()}>
                {tr("openFolder")}
              </button>
              {browse?.suggestions.map((suggestion) => (
                <button
                  key={suggestion.path}
                  className="rs-ghost"
                  disabled={busy || !state.context}
                  onClick={() => void useFolderPath(`${state.context}/${suggestion.path}`)}
                >
                  {tr("useSuggestion")}: {suggestion.path}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="rs-section-head">
              <h3>{tr("reports")}</h3>
              <button className="rs-ghost" onClick={() => void loadBrowse(false)}>
                {tr("refresh")}
              </button>
            </div>
            <input
              className="rs-search"
              aria-label={tr("searchReports")}
              placeholder={tr("searchReports")}
              value={reportSearch}
              onChange={(event) => setReportSearch(event.target.value)}
            />
            {(() => {
              const entries = (browse?.entries ?? []).filter((entry) =>
                entry.path.toLowerCase().includes(reportSearch.toLowerCase()),
              );
              if (entries.length === 0) {
                return <p className="rs-hint">{reportSearch ? tr("noResults") : tr("noReports")}</p>;
              }
              return (
                <>
                  <p className="rs-hint">
                    {tr("resultsCount").replace("{count}", String(entries.length))}
                  </p>
                  <ul className="rs-files">
                    {entries.map((entry) => (
                      <li key={entry.absolute}>
                        <button
                          className={file === entry.path ? "on" : ""}
                          onClick={() =>
                            guardUnsaved(() => {
                              void openEntry(entry);
                            })
                          }
                        >
                          <span className={`rs-badge kind-${entry.kind}`}>
                            {entry.kind === "yrf" ? "YRF" : "NATIVE"}
                          </span>
                          <span className="rs-report-name">{entry.name}</span>
                          {entry.path !== entry.name && (
                            <small className="rs-report-path">{entry.path}</small>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}
            {browse?.truncated && <p className="rs-hint">{tr("truncated")}</p>}
          </section>

          <section>
            <h3>{tr("sampleData")}</h3>
            <p className="rs-hint">{tr("sampleHint")}</p>
            <textarea
              className="rs-data"
              rows={6}
              spellCheck={false}
              placeholder='{"lines": [{"description": "Contoh", "amount": 1000}]}'
              value={sampleJson}
              onChange={(event) => setSampleJson(event.target.value)}
              onBlur={() => parseSampleData()}
            />
            {sampleError && <p className="rs-hint rs-error">{sampleError}</p>}
            <div className="rs-row-actions">
              <button className="rs-ghost" onClick={() => csvInputRef.current?.click()}>
                {tr("importData")}
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,.json,text/csv,application/json"
                hidden
                onChange={(event) => void importData(event.target.files?.[0])}
              />
            </div>
            {sampleSchema && (
              <p className="rs-hint">
                {tr("schemaPreview")}: {sampleSchema}
              </p>
            )}
          </section>

          {document && (
            <section>
              <h3>{tr("palette")}</h3>
              <details className="rs-palette-group" open>
                <summary>{tr("stylesGroup")}</summary>
                <div className="rs-style-chips">
                  {(
                    [
                      ["heading1", "presetHeading1"],
                      ["heading2", "presetHeading2"],
                      ["body", "presetBody"],
                      ["caption", "presetCaption"],
                      ["muted", "styleMuted"],
                      ["danger", "styleDanger"],
                      ["highlight", "styleHighlight"],
                      ["card", "styleCard"],
                      ["tableHeader", "styleTableHeader"],
                    ] as const
                  ).map(([preset, label]) => (
                    <button
                      key={preset}
                      disabled={!selected}
                      title={selected ? undefined : tr("selectElement")}
                      onClick={() => applyPreset(preset)}
                    >
                      {tr(label)}
                    </button>
                  ))}
                </div>
              </details>
              {(
                [
                  [
                    "paletteBasic",
                    [
                      ["text", "addText", "text"],
                      ["field", "addField", "field"],
                      ["image", "imageAdd", "image"],
                    ],
                  ],
                  [
                    "paletteLayout",
                    [
                      ["form", "addForm", "form"],
                      ["rect", "addBox", "box"],
                      ["line", "addLine", "line"],
                    ],
                  ],
                  ["paletteData", [["table", "addTable", "table"]]],
                ] as const
              ).map(([group, items]) => (
                <details className="rs-palette-group" key={group} open>
                  <summary>{tr(group)}</summary>
                  <div className="rs-palette">
                    {items.map(([type, label, icon]) => (
                      <button
                        key={type}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/rs-element", type);
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => addElement(type)}
                      >
                        <PaletteIcon name={icon} />
                        <span>{tr(label)}</span>
                      </button>
                    ))}
                  </div>
                </details>
              ))}
              <p className="rs-hint">{tr("paletteHint")}</p>
            </section>
          )}

          {document && (
            <section>
              <h3>{tr("parameters")}</h3>
              <ul className="rs-params">
                {document.parameters.map((parameter, parameterIndex) => (
                  <li key={parameterIndex}>
                    <label className="rs-field"><span>{language === "id" ? "Nama parameter" : "Parameter name"}</span><input aria-label={`${language === "id" ? "Nama parameter" : "Parameter name"} ${parameter.id}`} value={parameter.id} onChange={(event) => patchDocument({ parameters: document.parameters.map((item) => item === parameter ? { ...item, id: event.target.value } : item) })} /></label>
                    <label className="rs-field"><span>{language === "id" ? "Tipe parameter" : "Parameter type"}</span><select aria-label={`${language === "id" ? "Tipe parameter" : "Parameter type"} ${parameter.id}`} value={parameter.type} onChange={(event) => patchDocument({ parameters: document.parameters.map((item) => item === parameter ? { id: item.id, required: item.required, type: event.target.value as typeof item.type } : item) })}><option value="string">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="date">Date</option></select></label>
                    <label className="rs-check"><input type="checkbox" checked={parameter.required} onChange={(event) => patchDocument({ parameters: document.parameters.map((item) => item === parameter ? { ...item, required: event.target.checked } : item) })} /><span>{language === "id" ? "Wajib" : "Required"}</span></label>
                    <label className="rs-field"><span>{language === "id" ? "Nilai bawaan" : "Default value"}</span>{parameter.type === "boolean" ? <select aria-label={`${language === "id" ? "Nilai bawaan" : "Default value"} ${parameter.id}`} value={parameter.defaultValue === undefined ? "" : String(parameter.defaultValue)} onChange={(event) => { const value = event.target.value; patchDocument({ parameters: document.parameters.map((item) => item === parameter ? { ...item, defaultValue: value === "" ? undefined : value === "true" } : item) }); }}><option value="">—</option><option value="true">true</option><option value="false">false</option></select> : <input aria-label={`${language === "id" ? "Nilai bawaan" : "Default value"} ${parameter.id}`} type={parameter.type === "date" ? "date" : "text"} value={String(parameter.defaultValue ?? "")} onChange={(event) => { const value = event.target.value; patchDocument({ parameters: document.parameters.map((item) => item === parameter ? { ...item, defaultValue: value === "" ? undefined : value } : item) }); }} />}</label>
                    <button
                      aria-label={`${tr("remove")} ${parameter.id}`}
                      onClick={() =>
                        patchDocument({
                          parameters: document.parameters.filter((item) => item.id !== parameter.id),
                        })
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className="rs-ghost"
                onClick={() =>
                  (() => {
                    const used = new Set(document.parameters.map((item) => item.id));
                    let index = 1;
                    while (used.has(`parameter-${index}`)) index += 1;
                    patchDocument({
                      parameters: [
                        ...document.parameters,
                        { id: `parameter-${index}`, type: "string", required: false },
                      ],
                    });
                  })()
                }
              >
                {tr("addParameter")}
              </button>
              <p className="rs-hint">{language === "id" ? 'Gunakan parameters.nama pada binding atau ekspresi. Isi {"parameters":{"nama":"nilai"}} dalam Sample data untuk mengganti nilai bawaan. Nilai wajib atau tipe yang salah menghasilkan warning saat Preview dan ekspor.' : 'Use parameters.name in a binding or expression. Supply {"parameters":{"name":"value"}} in Sample data to override the default. Missing required values or incorrect types produce a warning in Preview and export.'}</p>
            </section>
          )}

          {document && (
            <section>
              <h3>{tr("structure")}</h3>
              <button type="button" className="rs-ghost" onClick={() => {
                if (!document) return;
                const suffix = Date.now().toString(36);
                const bandId = `band-narrative-${suffix}`;
                const elementId = `el-narrative-${suffix}`;
                const targetIndex = document.bands.findIndex((band) => band.id === selectedBand);
                const band: ReportBand = { id: bandId, kind: "detail", height: 30, elements: [{ id: elementId, type: "text", box: { x: 0, y: 0, width: Math.max(10, document.page.width - document.page.margins.left - document.page.margins.right), height: 30 }, props: { text: language === "id" ? "Tulis narasi di sini." : "Write your narrative here.", fontSize: 9, flowText: true } }] };
                const insertAt = targetIndex >= 0 ? targetIndex + 1 : document.bands.length;
                commit({ ...document, bands: [...document.bands.slice(0, insertAt), band, ...document.bands.slice(insertAt)] });
                setSelectedBand(bandId); setExpandedBands((current) => new Set([...current, bandId])); selectIds([elementId]);
              }}>{tr("addNarrative")}</button>
              <p className="rs-hint">{tr("narrativeHint")}</p>
              <ul className="rs-tree">
                {document.bands.map((band) => (
                  <li key={band.id}>
                    <button
                      className={selectedBand === band.id ? "on" : ""}
                      aria-expanded={expandedBands.has(band.id)}
                      onClick={() => {
                        setSelectedBand(band.id);
                        setExpandedBands((current) => {
                          const next = new Set(current);
                          if (next.has(band.id)) next.delete(band.id);
                          else next.add(band.id);
                          return next;
                        });
                      }}
                    >
                      <span aria-hidden="true">
                        {expandedBands.has(band.id) ? "▾" : "▸"}
                      </span>{" "}
                      {band.label || band.kind} · {band.height}mm
                    </button>
                    <span className="rs-band-controls">
                      <button
                        aria-label={`${tr("moveBandUp")}: ${band.kind}`}
                        disabled={document.bands[0]?.id === band.id}
                        onClick={() => moveBand(band.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`${tr("moveBandDown")}: ${band.kind}`}
                        disabled={document.bands[document.bands.length - 1]?.id === band.id}
                        onClick={() => moveBand(band.id, 1)}
                      >
                        ↓
                      </button>
                    </span>
                    <ul
                      hidden={
                        !expandedBands.has(band.id)
                      }
                    >
                      <li><label className="rs-field"><span>{tr("sectionName")}</span><input aria-label={`${tr("sectionName")}: ${band.id}`} value={band.label ?? ""} onChange={(event) => { const label = event.target.value; if (label.trim()) patchBand(band.id, { label }); else { const { label: _label, ...rest } = band; if (document) commit({ ...document, bands: document.bands.map((item) => item.id === band.id ? rest : item) }); } }} /></label></li>
                      <li>
                        <label className="rs-check">
                          <input
                            type="checkbox"
                            checked={band.pageBreakBefore === true}
                            onChange={(event) => patchBand(band.id, { pageBreakBefore: event.target.checked })}
                          />
                          <span>{tr("pageBreakBefore")}</span>
                        </label>
                      </li>
                      {(band.kind === "pageHeader" || band.kind === "pageFooter") && <li>
                        <label className="rs-check">
                          <input type="checkbox" checked={band.repeat !== false} onChange={(event) => patchBand(band.id, { repeat: event.target.checked })} />
                          <span>{tr("repeat")}</span>
                        </label>
                      </li>}
                      {band.elements.map((element, elementIndex) => (
                        <li key={element.id}>
                          <button
                            className={selectedId === element.id ? "on" : ""}
                            onClick={() => {
                              selectIds([element.id]);
                              setSelectedBand(band.id);
                            }}
                          >
                            {element.id}
                          </button>
                          <span className="rs-band-controls"><button type="button" aria-label={`${tr("moveLayerDown")}: ${element.id}`} disabled={elementIndex === 0} onClick={() => moveLayer(band.id, element.id, -1)}>↓</button><button type="button" aria-label={`${tr("moveLayerUp")}: ${element.id}`} disabled={elementIndex === band.elements.length - 1} onClick={() => moveLayer(band.id, element.id, 1)}>↑</button></span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

            </section>
          )}
        </aside>

        <main className="rs-canvas-wrap">
          {!document ? (
            <div className="rs-empty rs-landing">
              <h2>{tr("startTitle")}</h2>
              <p>{tr("startHint")}</p>
              <div className="rs-landing-actions">
                <button
                  className="rs-landing-card"
                  onClick={() => {
                    setFlow("open");
                    setShowLeft(true);
                    void chooseFolder();
                  }}
                >
                  <strong>{tr("openExistingReport")}</strong>
                  <span>{tr("openExistingHint")}</span>
                </button>
                <button
                  className="rs-landing-card"
                  onClick={() => {
                    setFlow("create");
                    setShowLeft(true);
                  }}
                >
                  <strong>{tr("createNewReport")}</strong>
                  <span>{tr("createNewHint")}</span>
                </button>
              </div>
              {flow === "create" && !state.root && (
                <p className="rs-hint">{tr("chooseFolderFirst")}</p>
              )}
            </div>
          ) : tab === "code" ? (
            <div className="rs-code">
              <div className="rs-code-head">
                <span>{tr("codeHint")}</span>
                <button className="rs-primary" onClick={() => void applyCode()}>
                  {tr("applyCode")}
                </button>
              </div>
              <textarea
                className="rs-code-area"
                spellCheck={false}
                value={codeText}
                onChange={(event) => {
                  setCodeText(event.target.value);
                  setCodeEdited(true);
                }}
              />
              {codeErrors.map((entry) => (
                <p key={entry} className="rs-hint rs-error">
                  {entry}
                </p>
              ))}
            </div>
          ) : tab === "preview" ? (
            <div className="rs-preview">
              <div className="rs-preview-head">
                <span>{tr("previewHint")}</span>
                <button onClick={() => void refreshPreview()}>{tr("refreshPreview")}</button>
              </div>
              <iframe title="report-preview" sandbox="" srcDoc={previewHtml} />
            </div>
          ) : (
            <>
              <div className="rs-toolbar">
                <button
                  className={`rs-ghost ${snapToGrid ? "on" : ""}`}
                  aria-pressed={snapToGrid}
                  title={tr("snapHint")}
                  onClick={() => setSnapToGrid((value) => !value)}
                >
                  {tr("snap")}
                </button>
                <button type="button" className="rs-ghost" aria-label={tr("zoomOut")} disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))}>−</button>
                <label>
                  {tr("zoom")}
                  <input
                    type="range"
                    min={0.5}
                    max={1.6}
                    step={0.1}
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  />
                  <span>{Math.round(zoom * 100)}%</span>
                </label>
                <button type="button" className="rs-ghost" aria-label={tr("zoomIn")} disabled={zoom >= 1.6} onClick={() => setZoom((value) => Math.min(1.6, Math.round((value + 0.1) * 10) / 10))}>+</button>
                <button type="button" className={`rs-ghost ${showGrid ? "on" : ""}`} aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}>{tr("showGrid")}</button>
                <button type="button" className={`rs-ghost ${showRuler ? "on" : ""}`} aria-pressed={showRuler} onClick={() => setShowRuler((value) => !value)}>{tr("showRuler")}</button>
                {page && <span className="rs-hint">{page.size} · {page.width} × {page.height} {document.units}</span>}
                <span className="rs-hint">{file}</span>
              </div>
              <div
                className="rs-canvas"
                ref={canvasRef}
                tabIndex={0}
                onKeyDown={onCanvasKeyDown}
                onMouseDown={() => selectIds([])}
              >
                {page && (
                  <div
                    className="rs-page"
                    style={{
                      width: page.width * scale,
                      minHeight: page.height * scale,
                      padding: `${page.margins.top * scale}px ${page.margins.right * scale}px ${page.margins.bottom * scale}px ${page.margins.left * scale}px`,
                      backgroundImage: showGrid ? "linear-gradient(to right, #94a3b855 1px, transparent 1px), linear-gradient(to bottom, #94a3b855 1px, transparent 1px)" : undefined,
                      backgroundSize: showGrid ? `${10 * scale}px ${10 * scale}px` : undefined,
                    }}
                  >
                    {showRuler && <CanvasRulers width={page.width} height={page.height} scale={scale} step={10} unit={document.units} />}
                    {document.bands.map((band) => (
                      <BandView
                        key={band.id}
                        band={band}
                        scale={scale}
                        selectedId={selectedId}
                        selectedIds={selectedIds}
                        editingId={editingId}
                        onSelect={(id, additive) => {
                          const clicked = band.elements.find((element) => element.id === id);
                          const groupIds = clicked?.groupId
                            ? document.bands.flatMap((item) => item.elements)
                                .filter((element) => element.groupId === clicked.groupId)
                                .map((element) => element.id)
                            : [id];
                          let next: string[];
                          if (additive) {
                            const already = groupIds.every((entry) => selectedIds.includes(entry));
                            next = already
                              ? selectedIds.filter((entry) => !groupIds.includes(entry))
                              : [...selectedIds, ...groupIds.filter((entry) => !selectedIds.includes(entry))];
                          } else {
                            next = groupIds;
                          }
                          selectIds(next);
                          setSelectedBand(band.id);
                        }}
                        onBeginEdit={(id) => setEditingId(id)}
                        onCommitText={(id, value) => {
                          setEditingId(null);
                          if (!document) return;
                          commit({
                            ...document,
                            bands: document.bands.map((item) => ({
                              ...item,
                              elements: item.elements.map((element) =>
                                element.id === id
                                  ? { ...element, props: { ...element.props, text: value } }
                                  : element,
                              ),
                            })),
                          });
                        }}
                        onBeginDrag={beginDrag}
                        onResizeStart={beginResize}
                        onDropElement={(type, x, y, bandId) =>
                          addElement(type, { x, y, bandId })
                        }
                        data={canvasData}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>

        <aside className="rs-right">
          {selectedIds.length > 1 ? (
            <section>
              <h3>{tr("multipleSelection").replace("{count}", String(selectedIds.length))}</h3>
              {selectionSpansBands && <p className="rs-hint">{tr("sameBandRequired")}</p>}
              <div className="rs-align-grid">
                {(
                  [
                    ["left", "alignLeft"],
                    ["centerH", "alignCenterH"],
                    ["right", "alignRight"],
                    ["top", "alignTop"],
                    ["middleV", "alignMiddleV"],
                    ["bottom", "alignBottom"],
                  ] as const
                ).map(([mode, label]) => (
                  <button key={mode} disabled={selectionSpansBands} onClick={() => alignSelection(mode)}>
                    {tr(label)}
                  </button>
                ))}
              </div>
              {selectionIsGroup ? (
                <button className="rs-ghost" onClick={ungroupSelection}>
                  {tr("ungroup")}
                </button>
              ) : (
                <button className="rs-ghost" disabled={selectionSpansBands} onClick={groupSelection}>
                  {tr("group")}
                </button>
              )}
              <button className="rs-ghost danger" onClick={removeElement}>
                {tr("remove")}
              </button>
            </section>
          ) : selected ? (
            <section>
              <h3>{tr("properties")}</h3>
              <p className="rs-hint">
                {selected.type} · {selected.id}
              </p>
              <div className="rs-format-bar">
                <select
                  aria-label={tr("stylePreset")}
                  defaultValue=""
                  onChange={(event) => {
                    applyPreset(event.target.value);
                    event.currentTarget.value = "";
                  }}
                >
                  <option value="">{tr("stylePreset")}</option>
                  <option value="body">{tr("presetBody")}</option>
                  <option value="heading1">{tr("presetHeading1")}</option>
                  <option value="heading2">{tr("presetHeading2")}</option>
                  <option value="list">{tr("presetList")}</option>
                  <option value="caption">{tr("presetCaption")}</option>
                </select>
                <div className="rs-format-row">
                  {(
                    [
                      ["bold", "B", { fontWeight: Number(selected.props.fontWeight ?? 400) >= 600 }],
                      ["italic", "I", { italic: selected.props.italic === true }],
                      ["underline", "U", { underline: selected.props.underline === true }],
                      ["strike", "S", { strike: selected.props.strike === true }],
                    ] as const
                  ).map(([key, label, active]) => (
                    <button
                      key={key}
                      type="button"
                      aria-label={tr(key)}
                      aria-pressed={
                        key === "bold" ? active.fontWeight : (active as Record<string, boolean>)[key]
                      }
                      className={
                        (key === "bold"
                          ? active.fontWeight
                          : (active as Record<string, boolean>)[key])
                          ? "on"
                          : ""
                      }
                      onClick={() => {
                        if (key === "bold") {
                          patchElementProps({
                            fontWeight: Number(selected.props.fontWeight ?? 400) >= 600 ? 400 : 700,
                          });
                        } else if (key === "italic") {
                          patchElementProps({ italic: selected.props.italic !== true });
                        } else if (key === "underline") {
                          patchElementProps({ underline: selected.props.underline !== true });
                        } else {
                          patchElementProps({ strike: selected.props.strike !== true });
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label={tr("bulletList")}
                    aria-pressed={selected.props.list === "bullet"}
                    onClick={() => {
                      const props = { ...selected.props };
                      if (props.list === "bullet") delete props.list;
                      else props.list = "bullet";
                      patchElement({ props });
                    }}
                  >
                    •
                  </button>
                  <button
                    type="button"
                    aria-label={tr("numberList")}
                    aria-pressed={selected.props.list === "number"}
                    onClick={() => {
                      const props = { ...selected.props };
                      if (props.list === "number") delete props.list;
                      else props.list = "number";
                      patchElement({ props });
                    }}
                  >
                    1.
                  </button>
                  <button
                    type="button"
                    aria-label={tr("alignJustify")}
                    aria-pressed={selected.props.align === "justify"}
                    onClick={() => patchElementProps({ align: "justify" })}
                  >
                    ≡
                  </button>
                </div>
                {selected.groupId && (
                  <button className="rs-ghost" onClick={ungroupSelection}>
                    {tr("ungroup")}
                  </button>
                )}
              </div>
              {"text" in selected.props && (
                <label className="rs-field">
                  <span>{tr("content")}</span>
                  <textarea
                    rows={3}
                    value={String(selected.props.text ?? "")}
                    onChange={(event) => patchElementProps({ text: event.target.value })}
                  />
                </label>
              )}
              {"label" in selected.props && (
                <label className="rs-field">
                  <span>{tr("label")}</span>
                  <input
                    value={String(selected.props.label ?? "")}
                    onChange={(event) => patchElementProps({ label: event.target.value })}
                  />
                </label>
              )}
              {selected.type === "field" && (
                <label className="rs-field">
                  <span>{tr("expression")}</span>
                  <input
                    placeholder="SUM(group.principal)"
                    value={String(selected.props.expression ?? "")}
                    onChange={(event) => patchElementProps({ expression: event.target.value })}
                  />
                </label>
              )}
              {selected.type === "field" && canvasData && (() => {
                const paths = Object.entries(canvasData).flatMap(([name, raw]) => {
                  const value = Array.isArray(raw) ? raw[0] : raw;
                  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
                  return Object.keys(value).map((key) => `${name}.${key}`);
                });
                return paths.length ? <label className="rs-field"><span>{tr("chooseSampleField")}</span><select value={paths.includes(String(selected.bindings?.path ?? "")) ? String(selected.bindings?.path) : ""} onChange={(event) => { if (event.target.value) patchElement({ bindings: { ...selected.bindings, path: event.target.value } }); }}><option value="">{tr("chooseSampleField")}</option>{paths.map((path) => <option key={path} value={path}>{path}</option>)}</select></label> : null;
              })()}
              {selected.type === "field" && <section className="rs-total-builder"><h3>{tr("totalBuilder")}</h3><p className="rs-hint">{tr("totalHint")}</p><label className="rs-field"><span>{tr("totalPath")}</span><input value={totalPath} onChange={(event) => setTotalPath(event.target.value)} placeholder="lines.amount" /></label><button className="rs-ghost" type="button" disabled={!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(totalPath)} onClick={() => patchElementProps({ expression: `FORMAT_NUMBER(SUM(${totalPath}), 2)` })}>{tr("totalApply")}</button>{totalPath && !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(totalPath) && <p className="rs-hint rs-error">{tr("totalInvalid")}</p>}</section>}
              <div className="rs-grid2">
                <label className="rs-field">
                  <span>{tr("x")}</span>
                  <input
                    type="number"
                    step={0.5}
                    value={selected.box.x}
                    onChange={(event) => patchElementBox({ x: Number(event.target.value) })}
                  />
                </label>
                <label className="rs-field">
                  <span>{tr("y")}</span>
                  <input
                    type="number"
                    step={0.5}
                    value={selected.box.y}
                    onChange={(event) => patchElementBox({ y: Number(event.target.value) })}
                  />
                </label>
                <label className="rs-field">
                  <span>{tr("width")}</span>
                  <input
                    type="number"
                    step={0.5}
                    value={selected.box.width}
                    onChange={(event) => patchElementBox({ width: Number(event.target.value) })}
                  />
                </label>
                <label className="rs-field">
                  <span>{tr("height")}</span>
                  <input
                    type="number"
                    step={0.5}
                    value={selected.box.height}
                    onChange={(event) => patchElementBox({ height: Number(event.target.value) })}
                  />
                </label>
                <label className="rs-field">
                  <span>{tr("fontSize")}</span>
                  <input
                    type="number"
                    step={0.5}
                    value={Number(selected.props.fontSize ?? 9)}
                    onChange={(event) => patchElementProps({ fontSize: Number(event.target.value) })}
                  />
                </label>
                <label className="rs-field">
                  <span>{tr("color")}</span>
                  <input
                    type="color"
                    value={typeof selected.props.color === "string" ? selected.props.color : "#111827"}
                    onChange={(event) => patchElementProps({ color: event.target.value })}
                  />
                </label>
              </div>
              <label className="rs-field">
                <span>{tr("align")}</span>
                <select
                  value={String(selected.props.align ?? "left")}
                  onChange={(event) => patchElementProps({ align: event.target.value })}
                >
                  <option value="left">{tr("left")}</option>
                  <option value="center">{tr("center")}</option>
                  <option value="right">{tr("right")}</option>
                  <option value="justify">{tr("alignJustify")}</option>
                </select>
              </label>
              <div className="rs-grid2">
                <label className="rs-field">
                  <span>{tr("lineHeight")}</span>
                  <input
                    type="number"
                    step={0.1}
                    value={Number(selected.props.lineHeight ?? 1.3)}
                    onChange={(event) => patchElementProps({ lineHeight: Number(event.target.value) })}
                  />
                </label>
                <label className="rs-field">
                  <span>{tr("letterSpacing")}</span>
                  <input
                    type="number"
                    step={0.1}
                    value={Number(selected.props.letterSpacing ?? 0)}
                    onChange={(event) => patchElementProps({ letterSpacing: Number(event.target.value) })}
                  />
                </label>
                <label className="rs-field">
                  <span>{tr("borderWidth")}</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    value={Number(selected.props.borderWidth ?? 0)}
                    onChange={(event) => patchElementProps({ borderWidth: Number(event.target.value) })}
                  />
                </label>
                <label className="rs-field">
                  <span>{tr("borderColor")}</span>
                  <input
                    type="color"
                    value={
                      typeof selected.props.borderColor === "string" &&
                      /^#[0-9A-Fa-f]{6}$/.test(selected.props.borderColor)
                        ? selected.props.borderColor
                        : "#cbd5e1"
                    }
                    onChange={(event) => patchElementProps({ borderColor: event.target.value, borderWidth: Number(selected.props.borderWidth ?? selected.props.strokeWidth ?? 0) || 0.3 })}
                  />
                </label>
                <label className="rs-field">
                  <span>{tr("rotation")}</span>
                  <input
                    type="number"
                    step={1}
                    value={Number(selected.props.rotation ?? 0)}
                    onChange={(event) => patchElementProps({ rotation: Number(event.target.value) })}
                  />
                </label>
                <label className="rs-check">
                  <input
                    type="checkbox"
                    checked={selected.props.wrap !== false}
                    onChange={(event) => patchElementProps({ wrap: event.target.checked })}
                  />
                  <span>{tr("wrapText")}</span>
                </label>
              </div>
              <label className="rs-field">
                <span>{tr("fontFamily")}</span>
                <input
                  value={String(selected.props.font ?? "")}
                  placeholder="Helvetica, Arial, sans-serif"
                  onChange={(event) => setOptionalProp("font", event.target.value)}
                />
              </label>
              <div className="rs-grid2">
                <label className="rs-field">
                  <span>{tr("fontWeight")}</span>
                  <select
                    value={String(selected.props.fontWeight ?? "400")}
                    onChange={(event) => patchElementProps({ fontWeight: Number(event.target.value) })}
                  >
                    <option value="300">300</option>
                    <option value="400">400</option>
                    <option value="600">600</option>
                    <option value="700">700</option>
                  </select>
                </label>
                <label className="rs-field">
                  <span>{tr("background")}</span>
                  <input
                    type="color"
                    value={
                      typeof selected.props.background === "string" &&
                      /^#[0-9A-Fa-f]{6}$/.test(selected.props.background)
                        ? selected.props.background
                        : "#ffffff"
                    }
                    onChange={(event) => patchElementProps({ background: event.target.value })}
                  />
                </label>
              </div>
              <label className="rs-check">
                <input
                  type="checkbox"
                  checked={selected.props.italic === true}
                  onChange={(event) => patchElementProps({ italic: event.target.checked })}
                />
                <span>{tr("italic")}</span>
              </label>
              {selected.type === "field" && (
                <label className="rs-field">
                  <span>{tr("bindingPath")}</span>
                  <input
                    value={String(selected.bindings?.path ?? "")}
                    onChange={(event) =>
                      patchElement({ bindings: { ...selected.bindings, path: event.target.value } })
                    }
                  />
                </label>
              )}
              {selected.type === "table" && document && document.datasets.length > 0 && (
                <label className="rs-field">
                  <span>{tr("dataset")}</span>
                  <select
                    value={String(selected.bindings?.path ?? "").split(".")[0] ?? ""}
                    onChange={(event) =>
                      patchElement({ bindings: { ...selected.bindings, path: event.target.value } })
                    }
                  >
                    {document.datasets.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>
                        {dataset.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected.type === "table" && (() => {
                const columns = Array.isArray(selected.props.columns) ? selected.props.columns as Array<Record<string, unknown>> : [];
                const setColumn = (index: number, patch: Record<string, unknown>) => patchElementProps({ columns: columns.map((column, i) => i === index ? { ...column, ...patch } : column) });
                return <section className="rs-table-columns"><h3>{tr("tableColumns")}</h3>
                  <label className="rs-field"><span>{tr("bindingPath")}</span><input value={String(selected.bindings?.path ?? "")} onChange={(event) => patchElement({ bindings: { ...selected.bindings, path: event.target.value } })} /></label>
                  <label className="rs-field"><span>{tr("rowHeight")}</span><input type="number" min="2" value={Number(selected.props.rowHeight ?? 7)} onChange={(event) => patchElementProps({ rowHeight: Math.max(2, Number(event.target.value) || 2) })} /></label>
                  <label className="rs-check"><input type="checkbox" checked={selected.props.headerRepeat !== false} onChange={(event) => patchElementProps({ headerRepeat: event.target.checked })} /><span>{tr("repeatTableHeader")}</span></label>
                  <label className="rs-field"><span>{tr("tableHeaderColor")}</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(String(selected.props.tableHeaderColor ?? "")) ? String(selected.props.tableHeaderColor) : "#f1f4f8"} onChange={(event) => patchElementProps({ tableHeaderColor: event.target.value })} /></label>
                  <label className="rs-field"><span>{tr("tableBorderColor")}</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(String(selected.props.tableBorderColor ?? "")) ? String(selected.props.tableBorderColor) : "#bfc9d6"} onChange={(event) => patchElementProps({ tableBorderColor: event.target.value })} /></label>
                  <label className="rs-field"><span>{tr("tableBorderWidth")}</span><input type="number" min="0" max="3" step="0.1" value={Number(selected.props.tableBorderWidth ?? 0.2)} onChange={(event) => patchElementProps({ tableBorderWidth: Math.max(0, Math.min(3, Number(event.target.value) || 0)) })} /></label>
                  {columns.map((column, index) => <fieldset key={index} className="rs-column-settings"><legend>{tr("tableColumns")} {index + 1}</legend>
                    <label className="rs-field"><span>{tr("columnKey")}</span><input aria-label={`${tr("columnKey")} ${index + 1}`} value={String(column.key ?? "")} onChange={(event) => setColumn(index, { key: event.target.value })} /></label>
                    <label className="rs-field"><span>{tr("columnLabel")}</span><input aria-label={`${tr("columnLabel")} ${index + 1}`} value={String(column.label ?? "")} onChange={(event) => setColumn(index, { label: event.target.value })} /></label>
                    <label className="rs-field"><span>{tr("columnGroup")}</span><input aria-label={`${tr("columnGroup")} ${index + 1}`} disabled={Array.isArray(selected.props.headerRows)} value={String(column.headerGroup ?? "")} onChange={(event) => setColumn(index, { headerGroup: event.target.value })} /></label>
                    <label className="rs-field"><span>{tr("columnWidth")}</span><input aria-label={`${tr("columnWidth")} ${index + 1}`} type="number" min="1" value={Number(column.width ?? 1)} onChange={(event) => setColumn(index, { width: Math.max(1, Number(event.target.value) || 1) })} /></label>
                    <label className="rs-field"><span>{tr("columnAlign")}</span><select aria-label={`${tr("columnAlign")} ${index + 1}`} value={String(column.align ?? "left")} onChange={(event) => setColumn(index, { align: event.target.value })}><option value="left">{tr("left")}</option><option value="center">{tr("center")}</option><option value="right">{tr("right")}</option></select></label>
                    <label className="rs-field"><span>{tr("columnFormat")}</span><select aria-label={`${tr("columnFormat")} ${index + 1}`} value={String(column.format ?? (column.currency === true ? "currency" : "text"))} onChange={(event) => setColumn(index, { format: event.target.value, currency: false })}><option value="text">{tr("textFormat")}</option><option value="decimal">{tr("decimalFormat")}</option><option value="currency">{tr("currencyFormat")}</option><option value="percent">{tr("percentFormat")}</option></select></label>
                    <label className="rs-field"><span>{tr("columnDecimals")}</span><input aria-label={`${tr("columnDecimals")} ${index + 1}`} type="number" min="0" max="6" value={Number(column.decimals ?? 2)} onChange={(event) => setColumn(index, { decimals: Math.max(0, Math.min(6, Number(event.target.value) || 0)) })} /></label>
                    <button type="button" className="rs-danger" onClick={() => patchElementProps({ columns: columns.filter((_, i) => i !== index) })}>{tr("removeColumn")} {index + 1}</button>
                  </fieldset>)}
                  <button type="button" className="rs-ghost" onClick={() => { const used = new Set(columns.map((column) => String(column.key ?? ""))); let next = 1; while (used.has(`column${next}`)) next++; patchElementProps({ columns: [...columns, { key: `column${next}`, label: `Column ${next}`, width: 40, align: "left" }] }); }}>{tr("addColumn")}</button>
                  <TableStructureEditor props={selected.props} columns={columns} language={language} onChange={(patch, remove = []) => { const props = { ...selected.props, ...patch }; for (const key of remove) delete props[key]; patchElement({ props }); }} />
                  <TableRulesEditor props={selected.props} language={language} onChange={patchElementProps} />
                  <h3>{tr("staticRows")}</h3>
                  {(Array.isArray(selected.props.staticRows) ? selected.props.staticRows as Array<Record<string, unknown>> : []).map((row, rowIndex, rows) => <fieldset className="rs-column-settings" key={rowIndex}><legend>{tr("addRow")} {rowIndex + 1}</legend>
                    {columns.map((column, columnIndex) => <label className="rs-field" key={columnIndex}><span>{String(column.label || column.key || columnIndex + 1)}</span><input aria-label={`${tr("staticRows")} ${rowIndex + 1} ${String(column.key ?? columnIndex)}`} value={String(row[String(column.key ?? "")] ?? "")} onChange={(event) => patchElementProps({ staticRows: rows.map((item, i) => i === rowIndex ? { ...item, [String(column.key ?? "")]: event.target.value } : item) })} /></label>)}
                    <button type="button" className="rs-danger" onClick={() => patchElementProps({ staticRows: rows.filter((_, i) => i !== rowIndex) })}>{tr("removeRow")} {rowIndex + 1}</button>
                  </fieldset>)}
                  <button type="button" className="rs-ghost" onClick={() => patchElementProps({ staticRows: [...(Array.isArray(selected.props.staticRows) ? selected.props.staticRows : []), {}] })}>{tr("addRow")}</button>

                </section>;
              })()}
              {(selected.type === "text" || selected.type === "field") && (() => {
                const rules = Array.isArray(selected.conditions) ? selected.conditions : [];
                const first = rules[0] && typeof rules[0] === "object" && !Array.isArray(rules[0]) ? rules[0] as Record<string, unknown> : {};
                const update = (patch: Record<string, unknown>) => patchElement({ conditions: [{ ...first, ...patch }, ...rules.slice(1)] });
                return <section className="rs-conditional"><h3>{tr("conditionalStyle")}</h3><p className="rs-hint">{language === "id" ? "Contoh: invoice.total > 1000000. Berlaku pada Preview dan PDF." : "Example: invoice.total > 1000000. Applies to Preview and PDF."}</p>
                  <label className="rs-field"><span>{tr("conditionalWhen")}</span><input value={String(first.when ?? "")} onChange={(event) => update({ when: event.target.value })} placeholder="invoice.total > 1000000" /></label>
                  <label className="rs-field"><span>{tr("conditionalColor")}</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(String(first.color ?? "")) ? String(first.color) : "#111827"} onChange={(event) => update({ color: event.target.value })} /></label>
                  <label className="rs-field"><span>{tr("conditionalFill")}</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(String(first.background ?? "")) ? String(first.background) : "#ffffff"} onChange={(event) => update({ background: event.target.value })} /></label>
                  {rules.length > 0 && <button type="button" className="rs-ghost danger" onClick={() => patchElement({ conditions: rules.slice(1) })}>{tr("conditionalRemove")}</button>}
                </section>;
              })()}
              {selected.type === "image" && (
                <>
                  <label className="rs-field">
                    <span>{tr("imageAlt")}</span>
                    <input
                      value={String(selected.props.alt ?? "")}
                      onChange={(event) => patchElementProps({ alt: event.target.value })}
                    />
                  </label>
                  <label className="rs-field">
                    <span>{tr("imageFit")}</span>
                    <select
                      value={String(selected.props.fit ?? "contain")}
                      onChange={(event) => patchElementProps({ fit: event.target.value })}
                    >
                      <option value="contain">contain</option>
                      <option value="cover">cover</option>
                    </select>
                  </label>
                  <div className="rs-grid2">
                    {([ ["positionX", "imagePositionX"], ["positionY", "imagePositionY"] ] as const).map(([key, label]) => <label className="rs-field" key={key}><span>{tr(label)}</span><input aria-label={tr(label)} type="number" min="0" max="100" value={imagePosition(selected.props[key])} onChange={(event) => patchElementProps({ [key]: imagePosition(event.target.valueAsNumber) })} /></label>)}
                  </div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(event) => { importImage(event.target.files?.[0]); event.currentTarget.value = ""; }}
                  />
                  <button className="rs-ghost" onClick={() => imageInputRef.current?.click()}>
                    {tr("chooseImage")}
                  </button>
                  <p className="rs-hint">{tr("imageImportHint")}</p>
                  {typeof selected.props.src === "string" &&
                    selected.props.src.startsWith("data:image") && (
                      <img className="rs-image-thumb" src={selected.props.src} alt="" />
                    )}
                </>
              )}
              <button className="rs-ghost danger" onClick={removeElement}>
                {tr("remove")}
              </button>
            </section>
          ) : (
            <section>
              <h3>{tr("page")}</h3>
              {document && page ? (
                <>
                  <label className="rs-field">
                    <span>{tr("pageSize")}</span>
                    <select
                      value={page.size}
                      onChange={(event) => {
                        const size = event.target.value as PageSizeName;
                        const presets: Record<string, [number, number]> = {
                          A4: [210, 297],
                          A5: [148, 210],
                          Letter: [215.9, 279.4],
                          Legal: [215.9, 355.6],
                        };
                        const preset = presets[size] ?? [210, 297];
                        const [short, long] = preset;
                        patchDocument({
                          page: {
                            ...page,
                            size,
                            width: page.orientation === "landscape" ? long : short,
                            height: page.orientation === "landscape" ? short : long,
                          },
                        });
                      }}
                    >
                      {["A4", "A5", "Letter", "Legal"].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="rs-field">
                    <span>{tr("orientation")}</span>
                    <select
                      value={page.orientation}
                      onChange={(event) => {
                        const orientation = event.target.value as PageOrientation;
                        patchDocument({
                          page: {
                            ...page,
                            orientation,
                            width: page.height,
                            height: page.width,
                          },
                        });
                      }}
                    >
                      <option value="portrait">{tr("portrait")}</option>
                      <option value="landscape">{tr("landscape")}</option>
                    </select>
                  </label>
                  <div className="rs-grid2">
                    {(["top", "right", "bottom", "left"] as const).map((side) => (
                      <label className="rs-field" key={side}>
                        <span>{side}</span>
                        <input
                          type="number"
                          step={1}
                          value={page.margins[side]}
                          onChange={(event) =>
                            patchDocument({
                              page: {
                                ...page,
                                margins: { ...page.margins, [side]: Number(event.target.value) },
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <p className="rs-hint">{tr("selectElement")}</p>
                </>
              ) : (
                <p className="rs-hint">{tr("emptyDoc")}</p>
              )}
            </section>
          )}
        </aside>
      </div>

      <footer className="rs-status">
        {message && <span className="ok">{message}</span>}
        {errors.map((entry) => (
          <span className="bad" key={entry}>
            {tr("errors")}: {entry}
          </span>
        ))}
        {warnings.map((entry) => (
          <span className="warn" key={entry}>
            {tr("warnings")}: {entry}
          </span>
        ))}
        {overflowCount > 0 && (
          <span className="warn">
            {tr("overflowWarning")}: {overflowCount}
          </span>
        )}
        {!message && errors.length === 0 && warnings.length === 0 && (
          <span className="rs-hint">{state.root ? `${tr("folder")}: ${state.root}` : tr("selectFolderFirst")}</span>
        )}
        <span className="rs-folder">
          <input
            value={folder}
            aria-label={tr("folder")}
            placeholder="/path/to/reports"
            onChange={(event) => setFolder(event.target.value)}
          />
          <button className="rs-ghost" disabled={!folder || busy} onClick={() => void useFolder()}>
            {tr("useFolder")}
          </button>
        </span>
      </footer>
      {showFormats && (
        <div className="rs-modal" role="dialog" aria-modal="true" aria-label={tr("formats")}>
          <div className="rs-modal-card rs-formats">
            <h3>{tr("formats")}</h3>
            <table>
              <thead>
                <tr>
                  <th>{tr("format")}</th>
                  <th>{tr("create")}</th>
                  <th>{tr("open")}</th>
                  <th>{tr("edit")}</th>
                  <th>{tr("export")}</th>
                </tr>
              </thead>
              <tbody>
                {(state.formats ?? []).map((format) => (
                  <tr key={format.id}>
                    <td>
                      {format.label}
                      <small>{format.extensions.join(" ")}</small>
                    </td>
                    {(["create", "open", "edit", "export"] as const).map((operation) => (
                      <td key={operation}>
                        {tr(
                          (
                            {
                              editable: "capEditable",
                              readonly: "capReadonly",
                              "export-only": "capExport",
                              unsupported: "capUnsupported",
                              unknown: "capUnknown",
                            } as const
                          )[format.operations[operation] as string] ?? "capUnknown",
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="rs-modal-actions">
              <button className="rs-primary" onClick={() => setShowFormats(false)}>
                {tr("close")}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmAction && (
        <div className="rs-modal" role="dialog" aria-modal="true" aria-label={tr("unsaved")}>
          <div className="rs-modal-card">
            <h3>{tr("unsaved")}</h3>
            <p>{tr("unsavedHint")}</p>
            <div className="rs-modal-actions">
              <button className="rs-ghost" onClick={() => setConfirmAction(null)}>
                {tr("cancel")}
              </button>
              <button
                className="rs-ghost"
                onClick={() => {
                  const run = confirmAction.run;
                  setConfirmAction(null);
                  run();
                }}
              >
                {tr("discard")}
              </button>
              <button
                className="rs-primary"
                onClick={() => {
                  const run = confirmAction.run;
                  void save().then((ok) => {
                    if (!ok) return;
                    setConfirmAction(null);
                    run();
                  });
                }}
              >
                {tr("saveAndContinue")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaletteIcon({ name }: { name: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "text") {
    return (
      <svg {...common}>
        <path d="M3 3h10M8 3v10M6 13h4" />
      </svg>
    );
  }
  if (name === "field") {
    return (
      <svg {...common}>
        <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
        <path d="M5 10V6.5h1.8M5 8.5h1.8" />
      </svg>
    );
  }
  if (name === "image") {
    return (
      <svg {...common}>
        <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
        <path d="M4 11l3-3 2 2 1.5-1.5L13 11" />
        <circle cx="6" cy="6" r="1" />
      </svg>
    );
  }
  if (name === "form") {
    return (
      <svg {...common}>
        <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
        <path d="M5 6h6M5 9h6" />
      </svg>
    );
  }
  if (name === "box") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="10" height="10" rx="1.5" />
      </svg>
    );
  }
  if (name === "line") {
    return (
      <svg {...common}>
        <path d="M2.5 8h11" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
      <path d="M2.5 6.5h11M6.2 6.5v6M9.8 6.5v6" />
    </svg>
  );
}

function BandView({
  band,
  scale,
  selectedId,
  selectedIds,
  editingId,
  onSelect,
  onBeginEdit,
  onCommitText,
  onBeginDrag,
  onResizeStart,
  onDropElement,
  data,
}: {
  band: ReportBand;
  scale: number;
  selectedId: string | null;
  selectedIds: string[];
  editingId: string | null;
  onSelect: (id: string, additive: boolean) => void;
  onBeginEdit: (id: string) => void;
  onCommitText: (id: string, value: string) => void;
  onBeginDrag: (element: ReportElement, event: React.MouseEvent) => void;
  onResizeStart: (element: ReportElement, handle: ResizeHandle, event: React.MouseEvent) => void;
  onDropElement: (
    type: "text" | "rect" | "line" | "image" | "field" | "table" | "form",
    x: number,
    y: number,
    bandId: string,
  ) => void;
  data?: Record<string, unknown>;
}) {
  return (
    <div
      className={`rs-band rs-band-${band.kind}`}
      style={{ height: band.height * scale }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("text/rs-element")) event.preventDefault();
      }}
      onDrop={(event) => {
        const type = event.dataTransfer.getData("text/rs-element");
        if (!["text", "rect", "line", "image", "field", "table", "form"].includes(type)) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onDropElement(
          type as "text" | "rect" | "line" | "image" | "field" | "table" | "form",
          Math.max(0, Math.round((event.clientX - rect.left) / scale)),
          Math.max(0, Math.round((event.clientY - rect.top) / scale)),
          band.id,
        );
      }}
    >
      {band.elements.map((element) => (
        <div
          key={element.id}
          data-id={element.id}
          className={`rs-el rs-el-${element.type} ${selectedIds.includes(element.id) ? "on" : ""} ${selectedIds.includes(element.id) && !editingId ? "movable" : ""}`}
          style={{
            left: element.box.x * scale,
            top: element.box.y * scale,
            width: element.box.width * scale,
            height: element.box.height * scale,
            boxSizing: "border-box",
            color: typeof element.props.color === "string" ? element.props.color : undefined,
            background:
              typeof element.props.background === "string" ? element.props.background : undefined,
            fontSize: Number(element.props.fontSize ?? 9) * PT_TO_PX * (scale / MM_TO_PX),
            fontFamily: typeof element.props.font === "string" ? element.props.font : undefined,
            fontWeight: typeof element.props.fontWeight === "number" ? element.props.fontWeight : undefined,
            fontStyle: element.props.italic === true ? "italic" : undefined,
            lineHeight: typeof element.props.lineHeight === "number" ? element.props.lineHeight : undefined,
            textAlign:
              element.props.align === "center" ||
              element.props.align === "right" ||
              element.props.align === "justify"
                ? element.props.align
                : "left",
            textDecoration:
              [
                element.props.underline === true ? "underline" : "",
                element.props.strike === true ? "line-through" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined,
            letterSpacing:
              typeof element.props.letterSpacing === "number"
                ? `${element.props.letterSpacing * PT_TO_PX * (scale / MM_TO_PX)}px`
                : undefined,
            border:
              Number(element.props.borderWidth ?? 0) > 0
                ? `${Number(element.props.borderWidth) * scale}px solid ${
                    typeof element.props.borderColor === "string"
                      ? element.props.borderColor
                      : "#CBD5E1"
                  }`
                : undefined,
            transform:
              typeof element.props.rotation === "number" && element.props.rotation !== 0
                ? `rotate(${element.props.rotation}deg)`
                : undefined,
            whiteSpace: element.props.wrap === false ? "pre" : "pre-wrap",
          }}
          onMouseDown={(event) => {
            event.stopPropagation();
            onSelect(element.id, event.shiftKey || event.metaKey || event.ctrlKey);
            if (element.type === "text" && event.detail === 2) return;
            onBeginDrag(element, event);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (element.type === "text") onBeginEdit(element.id);
          }}
        >
          {editingId === element.id && element.type === "text" ? (
            <textarea
              className="rs-inline-edit"
              defaultValue={String(element.props.text ?? "")}
              autoFocus
              onBlur={(event) => onCommitText(element.id, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
                  event.preventDefault();
                  (event.target as HTMLTextAreaElement).blur();
                }
              }}
            />
          ) : (
            <>
          {element.type === "text" &&
            (element.props.list === "bullet" || element.props.list === "number"
              ? String(element.props.text ?? "")
                  .split("\n")
                  .map((line, index) =>
                    `${element.props.list === "bullet" ? "•" : `${index + 1}.`} ${line}`,
                  )
                  .join("\n")
              : String(element.props.text ?? ""))}
          {element.type === "field" && (
            <>
              <em>{String(element.props.label ?? "")}</em>
              <span>{String(element.bindings?.path ?? "")}</span>
            </>
          )}
          {element.type === "table" && (() => {
            const columns = Array.isArray(element.props.columns)
              ? (element.props.columns as Array<Record<string, unknown>>)
              : [];
            const path = typeof element.bindings?.path === "string" ? element.bindings.path : "";
            const dataset = path.split(".")[0] ?? "";
            const rows = Array.isArray((data ?? {})[dataset])
              ? ((data ?? {})[dataset] as Array<Record<string, unknown>>)
              : !path && Array.isArray(element.props.staticRows) ? element.props.staticRows as Array<Record<string, unknown>> : [];
            return (
              <div className="rs-table-stub">
                {(() => {
                  const matrix = tableHeaderMatrix(element.props.headerRows, columns.length);
                  return matrix ? <div className="rs-table-matrix" style={{ display: "grid", gridTemplateColumns: columns.map((column) => `${Number(column.width) > 0 ? Number(column.width) : 1}fr`).join(" "), color: tableHeaderTextColor(element.props.tableHeaderColor), background: String(element.props.tableHeaderColor ?? "#f1f5f9") }}>{matrix.map((cell, index) => <span key={index} style={{ gridColumn: `${cell.column + 1} / span ${cell.colSpan}`, gridRow: `${cell.row + 1} / span ${cell.rowSpan}`, textAlign: cell.align as "left" | "right" | "center", border: `${Math.max(0, Number(element.props.tableBorderWidth ?? 0.2)) * scale}px solid ${String(element.props.tableBorderColor ?? "#bfc9d6")}` }}>{cell.label}</span>)}</div> : <>
                {tableHeaderGroups(columns).some((group) => group.label) && <div className="rs-table-row header" style={{ color: tableHeaderTextColor(element.props.tableHeaderColor), background: String(element.props.tableHeaderColor ?? "#f1f5f9") }}>{tableHeaderGroups(columns).map((group) => <span key={group.start} style={{ flex: columns.slice(group.start, group.start + group.count).reduce((sum, column) => sum + (Number(column.width) > 0 ? Number(column.width) : 1), 0), textAlign: "center" }}>{group.label}</span>)}</div>}
                <div className="rs-table-row header" style={{ color: tableHeaderTextColor(element.props.tableHeaderColor), background: String(element.props.tableHeaderColor ?? "#f1f5f9"), borderColor: String(element.props.tableBorderColor ?? "#bfc9d6") }}>
                  {columns.map((column, index) => (
                    <span key={index} style={{ flex: Number(column.width) > 0 ? Number(column.width) : 1, textAlign: column.align === "right" ? "right" : column.align === "center" ? "center" : "left", border: `${Math.max(0, Number(element.props.tableBorderWidth ?? 0.2)) * scale}px solid ${String(element.props.tableBorderColor ?? "#bfc9d6")}` }}>{String(column.label ?? "")}</span>
                  ))}
                </div>
                </>;
                })()}
                {rows.slice(0, 3).map((row, index) => (
                  <div className="rs-table-row" key={index}>
                    {columns.map((column, columnIndex) => (
                      <span key={columnIndex} style={{ flex: Number(column.width) > 0 ? Number(column.width) : 1, textAlign: column.align === "right" ? "right" : column.align === "center" ? "center" : "left", border: `${Math.max(0, Number(element.props.tableBorderWidth ?? 0.2)) * scale}px solid ${String(element.props.tableBorderColor ?? "#bfc9d6")}` }}>
                        {String(row?.[String(column.key)] ?? "")}
                      </span>
                    ))}
                  </div>
                ))}
                {rows.length === 0 && (
                  <div className="rs-table-row empty">
                    <span>{String(element.props.emptyText ?? "")}</span>
                  </div>
                )}
              </div>
            );
          })()}
          {element.type === "image" &&
            (typeof element.props.src === "string" &&
            /^data:image\/(png|jpeg|webp);base64,/.test(element.props.src) ? (
              <img
                className="rs-image"
                src={element.props.src}
                alt={String(element.props.alt ?? "")}
                style={{ objectFit: element.props.fit === "cover" ? "cover" : "contain", objectPosition: `${imagePosition(element.props.positionX)}% ${imagePosition(element.props.positionY)}%` }}
              />
            ) : (
              <span className="rs-image-stub">{String(element.props.alt || "LOGO")}</span>
            ))}
          {element.type === "chart" && (
            <span className="rs-image-stub">{String(element.props.title ?? "Chart")}</span>
          )}
          {element.type === "pageNumber" && <span>Page 1 of 1</span>}
            </>
          )}
        </div>
      ))}
      {band.elements
        .filter((element) => selectedIds.length === 1 && element.id === selectedId)
        .map((element) => (
          <div
            key={`handles-${element.id}`}
            className="rs-handles"
            style={{
              left: element.box.x * scale,
              top: element.box.y * scale,
              width: element.box.width * scale,
              height: element.box.height * scale,
            }}
          >
            {HANDLES.map((handle) => (
              <span
                key={handle}
                className={`rs-handle ${handle}`}
                data-handle={handle}
                onMouseDown={(event) => onResizeStart(element, handle, event)}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
