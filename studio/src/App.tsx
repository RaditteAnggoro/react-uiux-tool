import {
  Children,
  cloneElement,
  isValidElement,
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DragEvent, ReactNode } from "react";
import type {
  AnalysisReport,
  JsxElement,
  SourcePatch,
  PatchRequest,
} from "../../src/engine/types";
import { api, setProject, setToken } from "./api";
import { en, id, evidenceText, type Key } from "./i18n";
const ReportStudio = lazy(() => import("./features/report-studio/ReportStudio"));
type Screen = "home" | "wizard" | "open" | "analysis" | "studio" | "report";
type ModalName = "language" | "preview" | "about" | "guide" | "review" | "leave-project" | null;
type ProjectTreeEntry = {
  name: string;
  path: string;
  kind: "directory" | "file";
  browsable: boolean;
};
type ProjectTreeResult = {
  entries: ProjectTreeEntry[];
  truncated: boolean;
};
type Preview = {
  url: string;
  kind?: string;
  warnings?: string[];
};
type Board = {
  id: string;
  name: string;
  scenario: string;
};
const NATIVE_EVENTS = [
  "onClick",
  "onDoubleClick",
  "onChange",
  "onInput",
  "onSubmit",
  "onFocus",
  "onBlur",
  "onKeyDown",
  "onKeyUp",
  "onMouseEnter",
  "onMouseLeave",
  "onPointerDown",
  "onPointerUp",
  "onDragStart",
  "onDragOver",
  "onDrop",
  "onScroll",
  "onLoad",
  "onError",
] as const;
const PRIMITIVE_PALETTE: ReadonlyArray<{
  tag: string;
  label: Key;
  icon: string;
}> = [
  { tag: "div", label: "visualContainer", icon: "container" },
  { tag: "button", label: "visualButton", icon: "button-control" },
  { tag: "p", label: "visualParagraph", icon: "paragraph" },
  { tag: "h2", label: "visualHeading", icon: "heading" },
  { tag: "section", label: "visualSection", icon: "section" },
  { tag: "input", label: "visualTextInput", icon: "text-input" },
];
const icons: Record<string, ReactNode> = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
    </>
  ),
  exit: (
    <>
      <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
      <path d="M14 8l4 4-4 4M8 12h10" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7h7l2-3h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M3 8h18" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </>
  ),
  code: (
    <>
      <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 10 5-10 5L2 8Zm-9 10 9 5 9-5m-18 5 9 5 9-5" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18M9 9v12" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 8a2.5 2.5 0 1 1 4.2 1.8c-1.2.7-1.7 1.2-1.7 2.7m0 3.5h.01" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
    </>
  ),
  desktop: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 22h8m-4-5v5" />
    </>
  ),
  undo: (
    <>
      <path d="M4 4v6h6M4 10a8 8 0 1 1 0 7" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 4v6h-6M4 20v-6h6M4 9a8 8 0 0 1 13-5l3 6M4 14l3 6a8 8 0 0 0 13-5" />
    </>
  ),
  file: (
    <>
      <path d="M13 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9Z" />
      <path d="M13 2v7h7m-12 4h8m-8 4h6" />
    </>
  ),
  play: <path d="m8 4 13 8-13 8Z" />,
  stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
  assets: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m3 17 6-6 5 5 3-3 4 4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  container: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <rect x="7" y="8" width="10" height="8" rx="1" />
    </>
  ),
  "button-control": (
    <>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M8 12h8" />
    </>
  ),
  paragraph: (
    <>
      <path d="M15 4H9a4 4 0 0 0 0 8h3" />
      <path d="M12 4v16M16 4v16" />
    </>
  ),
  heading: (
    <>
      <path d="M4 5v14M14 5v14M4 12h10" />
      <path d="m17 10 2-2v11M17 19h4" />
    </>
  ),
  section: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 9v11" />
    </>
  ),
  "text-input": (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M8 9v6M11 9v6M8 12h3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4M17 3v4M3 10h18M7 14h.01M12 14h.01M17 14h.01M7 18h.01M12 18h.01" />
    </>
  ),
  combo: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M16 6v12m-3-7 3 3 3-3" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
    </>
  ),
  form: (
    <>
      <path d="M5 6h4M5 12h4M5 18h4" />
      <rect x="11" y="4" width="8" height="4" rx="1" />
      <rect x="11" y="10" width="8" height="4" rx="1" />
      <rect x="11" y="16" width="8" height="4" rx="1" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.8 20h18.4Z" />
      <path d="M12 9v5m0 3h.01" />
    </>
  ),
  "align-left": (
    <>
      <path d="M4 3v18M8 6h11M8 10h7M8 14h11M8 18h6" />
    </>
  ),
  "align-right": (
    <>
      <path d="M20 3v18M5 6h11M9 10h7M5 14h11M10 18h6" />
    </>
  ),
  "align-top": (
    <>
      <path d="M3 4h18M6 8v11M10 8v7M14 8v11M18 8v6" />
    </>
  ),
  "align-bottom": (
    <>
      <path d="M3 20h18M6 5v11M10 9v7M14 5v11M18 10v6" />
    </>
  ),
};
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name] || icons.code}
    </svg>
  );
}
function componentPaletteIcon(name: string) {
  const value = name.toLowerCase();
  if (/date|month|year|calendar/.test(value)) return "calendar";
  if (/table|grid|list/.test(value)) return "table";
  if (/combo|select|picker|dropdown/.test(value)) return "combo";
  if (/form/.test(value)) return "form";
  if (/button|action/.test(value)) return "button-control";
  if (/alert|notice|message|warning/.test(value)) return "alert";
  if (/file|document|upload/.test(value)) return "file";
  if (/image|avatar|photo/.test(value)) return "assets";
  if (/paragraph|description/.test(value)) return "paragraph";
  if (/heading|title|header/.test(value)) return "heading";
  if (/input|field|text|number|currency|password|search/.test(value))
    return "text-input";
  if (/section|panel|container|layout/.test(value)) return "container";
  return "layers";
}
const BUSINESS_VIEW_DIRECTORIES = new Set([
  "view",
  "views",
  "page",
  "pages",
  "screen",
  "screens",
  "route",
  "routes",
]);
const REUSABLE_COMPONENT_DIRECTORIES = new Set([
  "component",
  "components",
  "ui",
  "shared",
  "common",
  "control",
  "controls",
  "widget",
  "widgets",
  "primitive",
  "primitives",
  "design-system",
  "design_system",
]);
const NON_VISUAL_DIRECTORIES = new Set([
  "context",
  "contexts",
  "provider",
  "providers",
  "hook",
  "hooks",
  "service",
  "services",
  "store",
  "stores",
  "util",
  "utils",
  "lib",
]);
function reusableComponentRank(
  component: AnalysisReport["components"][number],
  routeFiles: Set<string>,
) {
  const file = component.source.file.replaceAll("\\", "/");
  const directories = file.toLowerCase().split("/").slice(0, -1);
  if (
    routeFiles.has(file) ||
    directories.some((directory) => BUSINESS_VIEW_DIRECTORIES.has(directory)) ||
    directories.some((directory) => NON_VISUAL_DIRECTORIES.has(directory)) ||
    /(?:Provider|Context|Router)$/.test(component.name)
  )
    return null;
  if (
    directories.some((directory) =>
      REUSABLE_COMPONENT_DIRECTORIES.has(directory),
    )
  )
    return 0;
  const fileName = file.split("/").at(-1)?.replace(/\.[^.]+$/, "").toLowerCase();
  if (["app", "main", "index", "root", "router"].includes(fileName || ""))
    return null;
  return component.references.length ? 1 : null;
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const fieldId = useId();
  const labelControl = (node: ReactNode): ReactNode => {
    if (!isValidElement<Record<string, any>>(node)) return node;
    if (
      typeof node.type === "string" &&
      ["input", "textarea", "select"].includes(node.type)
    )
      return cloneElement(node, {
        id: node.props.id || fieldId,
        "aria-label": node.props["aria-label"] || label,
        ...(hint ? { "aria-describedby": fieldId + "-hint" } : {}),
      });
    return node.props.children
      ? cloneElement(node, {}, Children.map(node.props.children, labelControl))
      : node;
  };
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {Children.map(children, labelControl)}
      {hint && <small id={fieldId + "-hint"}>{hint}</small>}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
  closeLabel = "Close",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  closeLabel?: string;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const focusables = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,a[href]",
        ) || [],
      ).filter((e) => !e.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function App() {
  const [language, setLanguage] = useState<"en" | "id">(() =>
    localStorage.getItem("uiux-language") === "id" ? "id" : "en",
  );
  const [theme, setTheme] = useState(
    () => localStorage.getItem("uiux-theme") || "light",
  );
  const t = (key: Key) => (language === "id" ? id : en)[key];
  const evidence = (value: string) => evidenceText(value, language);
  const [reportReturn, setReportReturn] = useState<"home" | "studio">("home");
  const [session, setSession] = useState<any>(null),
    [screen, setScreen] = useState<Screen>("home"),
    [modal, setModal] = useState<ModalName>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [previewState, setPreviewState] = useState<
      "stopped" | "starting" | "ready" | "error"
    >("stopped"),
    [patch, setPatch] = useState<SourcePatch | null>(null),
    [designTarget, setDesignTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [pendingInsert, setPendingInsert] = useState(""),
    [draggingPalette, setDraggingPalette] = useState(false),
    [isDemo, setIsDemo] = useState(false);
  const [path, setPath] = useState(""),
    [wizardStep, setWizardStep] = useState(0),
    [plan, setPlan] = useState<any>(null);
  const [form, setForm] = useState({
    parentDirectory: "",
    name: "my-react-app",
    framework: "vite",
    template: "dashboard",
    styling: "css",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [selectedIds, setSelectedIds] = useState<string[]>([]),
    [selectedRects, setSelectedRects] = useState<
      Record<string, { left: number; top: number; width: number; height: number }>
    >({}),
    [leftTab, setLeftTab] = useState<"components" | "tree" | "files">("tree"),
    [nav, setNav] = useState("pages"),
    [search, setSearch] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"canvas" | "navigation" | "inspector">("canvas");
  const [treeChildren, setTreeChildren] = useState<
      Record<string, ProjectTreeEntry[]>
    >({}),
    [treeTruncated, setTreeTruncated] = useState<Set<string>>(new Set()),
    [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set()),
    [treeLoading, setTreeLoading] = useState<Set<string>>(new Set()),
    [guideStep, setGuideStep] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<Key>("props"),
    [bottomTab, setBottomTab] = useState<Key>("analysis"),
    [bottomOpen, setBottomOpen] = useState(true);
  const [mode, setMode] = useState<"design" | "interact" | "code">("design"),
    [viewport, setViewport] = useState("desktop"),
    [zoom, setZoom] = useState(100),
    [route, setRoute] = useState("/");
  const [source, setSource] = useState("");
  const [codeSearchOpen, setCodeSearchOpen] = useState(false);
  const [codeSearch, setCodeSearch] = useState("");
  const [codeMatch, setCodeMatch] = useState(0);
  const codeSearchInput = useRef<HTMLInputElement>(null);
  const codeSource = useRef<HTMLPreElement>(null);
  const codeMatches = useMemo(() => {
    if (!codeSearch) return [];
    const text = source.toLocaleLowerCase(), query = codeSearch.toLocaleLowerCase();
    const matches: number[] = [];
    for (let index = text.indexOf(query); index !== -1 && matches.length < 2000; index = text.indexOf(query, index + query.length)) matches.push(index);
    return matches;
  }, [source, codeSearch]);
  useEffect(() => { setCodeMatch(0); }, [codeSearch, source]);
  useEffect(() => {
    if (codeSearchOpen) codeSearchInput.current?.focus();
  }, [codeSearchOpen]);
  useEffect(() => {
    codeSource.current?.querySelector('[data-current-match="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [codeMatch, codeMatches, codeSearchOpen]);
  useEffect(() => {
    const onFind = (event: KeyboardEvent) => {
      if (screen === "studio" && mode === "code" && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault(); setCodeSearchOpen(true); requestAnimationFrame(() => codeSearchInput.current?.focus());
      }
    };
    window.addEventListener("keydown", onFind);
    return () => window.removeEventListener("keydown", onFind);
  }, [screen, mode]);
  const [copiedElement, setCopiedElement] = useState<JsxElement | null>(null);
  useEffect(() => { setCopiedElement(null); }, [report?.projectRoot]);
  const [textValue, setTextValue] = useState(""),
    [propName, setPropName] = useState("className"),
    [propValue, setPropValue] = useState(""),
    [propValueType, setPropValueType] = useState<
      "string" | "number" | "boolean"
    >("string"),
    [eventName, setEventName] = useState("onClick"),
    [eventHandler, setEventHandler] = useState(""),
    [styleName, setStyleName] = useState("padding"),
    [styleValue, setStyleValue] = useState(""),
    [insertTag, setInsertTag] = useState("button"),
    [insertText, setInsertText] = useState("New button"),
    [insertPropName, setInsertPropName] = useState(""),
    [insertPropValue, setInsertPropValue] = useState(""),
    [insertPropType, setInsertPropType] = useState<
      "string" | "number" | "boolean"
    >("string"),
    [insertEventName, setInsertEventName] = useState(""),
    [insertHandler, setInsertHandler] = useState(""),
    [duplicateIdentity, setDuplicateIdentity] = useState(""),
    [duplicateValue, setDuplicateValue] = useState("");
  const [logs, setLogs] = useState<string[]>([]),
    [sourceChanged, setSourceChanged] = useState(false),
    [watchingIncomplete, setWatchingIncomplete] = useState(false),
    [projectSwitched, setProjectSwitched] = useState(false),
    [checkpoint, setCheckpoint] = useState(false);
  const [boards, setBoards] = useState<Board[]>([
      { id: "button", name: "Button / States", scenario: "default" },
    ]),
    [boardId, setBoardId] = useState("button"),
    [boardNaming, setBoardNaming] = useState<
      "new" | "rename" | "variant" | null
    >(null),
    [boardName, setBoardName] = useState("");
  const [panelWidths, setPanelWidths] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("uiux-panels") || '{"left":252,"right":310}',
      );
    } catch {
      return { left: 252, right: 310 };
    }
  });
  const frame = useRef<HTMLIFrameElement>(null);
  const previewSelections = useRef(
    new Map<string, { elementId: string; instanceIndex: number }>(),
  );
  const pendingUndo = useRef(false);
  const readySelectionToken = useRef(0);
  const allElements = report?.elements || [];
  const elementById = useMemo(
    () => new Map(allElements.map((element) => [element.id, element])),
    [report?.elements],
  );
  const selected = selectedId ? elementById.get(selectedId) || null : null;
  const selectedElements = selectedIds
    .map((id) => elementById.get(id))
    .filter((element): element is JsxElement => !!element);
  const selectedDefinition = selected?.componentId
    ? report?.components.find(
        (component) => component.id === selected.componentId,
      )
    : undefined;
  const ownerDefinition = selected?.ownerComponent
    ? report?.components.find(
        (component) => component.id === selected.ownerComponent,
      )
    : undefined;
  const componentsByFile = useMemo(() => {
    const result = new Map<string, AnalysisReport["components"]>();
    for (const component of report?.components || []) {
      const group = result.get(component.source.file) || [];
      group.push(component);
      result.set(component.source.file, group);
    }
    return result;
  }, [report?.components]);
  const elementsByOwner = useMemo(() => {
    const result = new Map<string, JsxElement[]>();
    for (const element of allElements) {
      if (!element.ownerComponent) continue;
      const group = result.get(element.ownerComponent) || [];
      group.push(element);
      result.set(element.ownerComponent, group);
    }
    return result;
  }, [report?.elements]);
  const duplicateCandidates = useMemo(() => {
    if (!selected) return [];
    const candidates: {
      key: string;
      elementId: string;
      tag: string;
      name: string;
      value: string | number | boolean;
    }[] = [];
    const visit = (element: JsxElement) => {
      for (const prop of element.props)
        if (
          /^(?:id|name|fromName|toName|[A-Za-z_$][\w$]*(?:Id|ID))$/.test(
            prop.name,
          ) &&
          ["string", "number"].includes(typeof prop.value)
        )
          candidates.push({
            key: JSON.stringify([element.id, prop.name]),
            elementId: element.id,
            tag: element.tag,
            name: prop.name,
            value: prop.value as string | number | boolean,
          });
      element.children
        .map((id) => elementById.get(id))
        .filter((child): child is JsxElement => !!child)
        .forEach(visit);
    };
    visit(selected);
    return candidates;
  }, [selectedId, report?.analyzedAt]);
  const currentBoard = boards.find((b) => b.id === boardId);
  const frameUrl = preview?.url ? new URL(route, preview.url) : null;
  if (frameUrl && nav === "boards" && isDemo) {
    frameUrl.searchParams.set("board", "button");
    frameUrl.searchParams.set("scenario", currentBoard?.scenario || "default");
  }
  const frameSrc = frameUrl?.href;
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (preview && previewState === "ready") setPreviewState("ready");
    } finally {
      setBusy(false);
    }
  };
  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 4000);
  };
  const openGuide = () => {
    setGuideStep(0);
    setModal("guide");
  };
  const applyReport = (value: AnalysisReport) => {
    setProject(value.projectRoot);
    const previousElements = new Map(
      (report?.elements || []).map((element) => [element.id, element]),
    );
    const nextElements = new Map(
      value.elements.map((element) => [element.id, element]),
    );
    const identity = (element: JsxElement) =>
      element.props
        .filter(
          (prop) =>
            /^(?:id|name|fromName|toName|[A-Za-z_$][\w$]*(?:Id|ID))$/.test(
              prop.name,
            ) &&
            ["string", "number", "boolean"].includes(typeof prop.value),
        )
        .map((prop) => `${prop.name}:${String(prop.value)}`)
        .sort()
        .join("|");
    const remap = (oldId: string | null) => {
      if (!oldId) return null;
      if (nextElements.has(oldId)) return oldId;
      const previous = previousElements.get(oldId);
      if (!previous) return null;
      const candidates = value.elements.filter(
        (element) =>
          element.source.file === previous.source.file &&
          element.tag === previous.tag,
      );
      const previousIdentity = identity(previous);
      const identified = previousIdentity
        ? candidates.filter(
            (candidate) => identity(candidate) === previousIdentity,
          )
        : [];
      const pool = identified.length ? identified : candidates;
      return (
        pool.sort(
          (left, right) =>
            Math.abs(left.source.start - previous.source.start) -
            Math.abs(right.source.start - previous.source.start),
        )[0]?.id ?? null
      );
    };
    const idRemap = new Map<string, string>();
    const remappedIds = selectedIds
      .map((oldId) => {
        const nextId = remap(oldId);
        if (nextId) idRemap.set(oldId, nextId);
        return nextId;
      })
      .filter((id): id is string => !!id);
    const nextSelectedIds = [...new Set(remappedIds)];
    const nextSelectedId = remap(selectedId);
    if (nextSelectedId && selectedId) idRemap.set(selectedId, nextSelectedId);
    if (idRemap.size) {
      const nextPreviewSelections = new Map<
        string,
        { elementId: string; instanceIndex: number }
      >();
      previewSelections.current.forEach((position, oldId) => {
        const nextId = idRemap.get(oldId);
        if (nextId) nextPreviewSelections.set(nextId, position);
      });
      previewSelections.current = nextPreviewSelections;
      setSelectedRects((current) =>
        Object.fromEntries(
          Object.entries(current).flatMap(([oldId, rect]) => {
            const nextId = idRemap.get(oldId);
            return nextId ? [[nextId, rect]] : [];
          }),
        ),
      );
    }
    setReport(value);
    setSourceChanged(false);
    setSelectedIds(nextSelectedIds);
    setSelectedId(
      nextSelectedId && nextSelectedIds.includes(nextSelectedId)
        ? nextSelectedId
        : nextSelectedIds.at(-1) ?? nextSelectedId,
    );
  };
  const switchLanguage = (value: "en" | "id") => {
    setLanguage(value);
    localStorage.setItem("uiux-language", value);
    document.documentElement.lang = value;
  };
  useEffect(() => {
    document.documentElement.lang = language;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    update();
    media.addEventListener("change", update);
    localStorage.setItem("uiux-theme", theme);
    return () => media.removeEventListener("change", update);
  }, [theme, language]);
  useEffect(() => {
    void act(async () => {
      const value = await api("session");
      setToken(value.token);
      setSession(value);
      setForm((f) => ({
        ...f,
        parentDirectory: value.cwd || value.home || "",
      }));
      if (!localStorage.getItem("uiux-language")) setModal("language");
      if (new URLSearchParams(window.location.search).has("new"))
        setScreen("wizard");
      if (value.initialPath) {
        setPath(value.initialPath);
        applyReport(await api("open", { path: value.initialPath }));
        setScreen("analysis");
      }
    });
  }, []);
  useEffect(() => {
    if (!report) return;
    const timer = window.setInterval(() => {
      api("status")
        .then((value) => {
          setLogs(value.logs || []);
          setSourceChanged(!!value.sourceChanged);
          setWatchingIncomplete(!!value.watchingIncomplete);
          setProjectSwitched(value.projectRoot !== report.projectRoot);
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [report?.projectRoot]);
  useEffect(() => {
    const warn = () => { setSourceChanged(true); setError(t("refreshAfterWriteFailed")); };
    window.addEventListener("uiux:refresh-failed", warn);
    return () => window.removeEventListener("uiux:refresh-failed", warn);
  }, [language]);
  useEffect(() => {
    if (!report) return;
    let active = true;
    setTreeChildren({});
    setTreeTruncated(new Set());
    setExpandedNodes(new Set(["dir:"]));
    setTreeLoading(new Set([""]));
    api<ProjectTreeResult>("tree")
      .then((value) => {
        if (!active) return;
        setTreeChildren({ "": value.entries });
        if (value.truncated) setTreeTruncated(new Set([""]));
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setTreeLoading(new Set()));
    return () => {
      active = false;
    };
  }, [report?.projectRoot]);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        !frame.current ||
        event.source !== frame.current.contentWindow ||
        !preview
      )
        return;
      let origin = "";
      try {
        origin = new URL(preview.url).origin;
      } catch {
        return;
      }
      if (event.origin !== origin) return;
      if (event.data?.type === "uiux:loading") setPreviewState("starting");
      if (event.data?.type === "uiux:ready") {
        readySelectionToken.current += 1;
        sendCanvasSelection(readySelectionToken.current);
      }
      if (event.data?.type === "uiux:selection-applied" && event.data.token === readySelectionToken.current && readySelectionToken.current > 0)
        setPreviewState("ready");
      if (event.data?.type === "uiux:error") {
        setPreviewState("error");
        setError(
          typeof event.data.message === "string"
            ? event.data.message
            : "Preview runtime error",
        );
      }
      if (event.data?.type === "uiux:undo") {
        requestUndo();
        return;
      }
      if (
        [
          "uiux:select",
          "uiux:drop",
          "uiux:nudge",
          "uiux:move",
          "uiux:delete",
        ].includes(event.data?.type) &&
        typeof event.data.elementId === "string"
      ) {
        const sourceElement = report?.elements.find(
          (element) => element.id === event.data.elementId,
        );
        if (sourceElement) {
          let target = sourceElement;
          if (
            designTarget &&
            sourceElement.ownerComponent &&
            sourceElement.ownerComponent !== designTarget
          ) {
            const usages = report!.elements.filter(
              (element) =>
                element.ownerComponent === designTarget &&
                element.componentId === sourceElement.ownerComponent,
            );
            if (usages.length === 1) target = usages[0];
            else {
              if (["div", "section", "form", "fieldset"].includes(sourceElement.tag) && event.data.type === "uiux:select") {
                setSelectedId(null);
                setSelectedIds([]);
                setError(t("ambiguousCanvasTarget"));
                return;
              }
              if (usages.length > 1) {
                const instanceIndex = Number(event.data.instanceIndex);
                if (Number.isInteger(instanceIndex) && instanceIndex >= 0 && usages[instanceIndex]) target = usages[instanceIndex];
              }
            }
          }
          if (event.data.type === "uiux:drop") {
            const selectedTarget = report?.elements.find((element) => element.id === selectedId);
            if (!selectedTarget?.operations.includes("insert")) {
              setError(t("simpleDropError"));
              return;
            }
            target = selectedTarget;
          }
          if (event.data.type === "uiux:select") {
            const rect = event.data.rect;
            const nextRect =
              rect &&
              [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
                ? {
                    left: Number(rect.left),
                    top: Number(rect.top),
                    width: Number(rect.width),
                    height: Number(rect.height),
                  }
                : undefined;
            if (event.data.additive) {
              const next = event.data.selected === false
                ? selectedIds.filter((id) => id !== target.id)
                : [...new Set([...selectedIds, target.id])];
              setSelectedIds(next);
              setSelectedRects((current) => {
                const updated = { ...current };
                if (event.data.selected === false) delete updated[target.id];
                else if (nextRect) updated[target.id] = nextRect;
                return updated;
              });
              if (event.data.selected === false)
                previewSelections.current.delete(target.id);
              else
                previewSelections.current.set(target.id, {
                  elementId: event.data.elementId,
                  instanceIndex: Number(event.data.instanceIndex) || 0,
                });
              setSelectedId(
                event.data.selected === false
                  ? next.at(-1) ?? null
                  : target.id,
              );
            } else {
              previewSelections.current.clear();
              previewSelections.current.set(target.id, {
                elementId: event.data.elementId,
                instanceIndex: Number(event.data.instanceIndex) || 0,
              });
              setSelectedIds([target.id]);
              setSelectedRects(nextRect ? { [target.id]: nextRect } : {});
              setSelectedId(target.id);
            }
          } else {
            previewSelections.current.set(target.id, {
              elementId: event.data.elementId,
              instanceIndex: Number(event.data.instanceIndex) || 0,
            });
            if (!selectedIds.includes(target.id)) setSelectedIds([target.id]);
            setSelectedId(target.id);
          }
          if (event.data.type === "uiux:nudge") {
            const direction = String(event.data.direction);
            if (
              ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                direction,
              )
            )
              nudgeElement(target, direction, event.data.fast ? 8 : 1);
            return;
          }
          if (event.data.type === "uiux:move") {
            const dx = Math.round(Number(event.data.dx));
            const dy = Math.round(Number(event.data.dy));
            if (
              Number.isFinite(dx) &&
              Number.isFinite(dy) &&
              Math.abs(dx) <= 2000 &&
              Math.abs(dy) <= 2000 &&
              (dx || dy)
            )
              moveElementByDelta(target, dx, dy);
            return;
          }
          if (event.data.type === "uiux:delete") {
            removeSelectedElement(target);
            return;
          }
          if (event.data.type === "uiux:drop") {
            if (!target.operations.includes("insert")) {
              setError(t("simpleDropError"));
              return;
            }
            const component = report?.components.find(
              (candidate) => candidate.id === event.data.componentId,
            );
            if (component) stageDroppedComponent(target, component);
            else if (typeof event.data.tag === "string" && event.data.tag)
              stageDroppedElement(target, event.data.tag);
          }
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [
    preview,
    report,
    designTarget,
    language,
    selectedIds,
    selectedId,
    checkpoint,
    busy,
  ]);
  useEffect(() => {
    sendMode();
  }, [mode, preview, frameSrc]);
  useEffect(() => {
    if (preview) setPreviewState("starting");
  }, [frameSrc]);
  useEffect(() => {
    if (!preview || previewState !== "starting") return;
    const timer = window.setTimeout(() => {
      setPreviewState("error");
      setError(t("previewTimeout"));
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [previewState, frameSrc, preview?.url, language]);
  useEffect(() => {
    setSelectedIds((current) => {
      if (!selectedId) return [];
      return current.includes(selectedId) ? current : [selectedId];
    });
  }, [selectedId]);
  useEffect(() => {
    if (!selected) return;
    setTextValue(selected.text || "");
    const firstProp =
      selected.props.find((prop) => prop.editable && prop.name !== "style") ??
      selectedDefinition?.props.find((prop) => !/^on[A-Z]/.test(prop.name));
    const nextPropName = firstProp?.name ?? "className";
    const instanceProp = selected.props.find(
      (prop) => prop.name === nextPropName,
    );
    const contractProp = selectedDefinition?.props.find(
      (prop) => prop.name === nextPropName,
    );
    setPropName(nextPropName);
    setPropValue(
      String(instanceProp?.value ?? contractProp?.defaultValue ?? ""),
    );
    const nextType = contractProp?.type.match(/^(string|number|boolean)$/)?.[1]
      ?? instanceProp?.kind.match(/^(string|number|boolean)$/)?.[1]
      ?? "string";
    setPropValueType(nextType as "string" | "number" | "boolean");
    const firstEvent =
      selected.events[0]?.name ??
      selectedDefinition?.events[0] ??
      (/^[a-z]/.test(selected.tag) ? "onClick" : "");
    setEventName(firstEvent);
    const expression = selected.events.find(
      (event) => event.name === firstEvent,
    )?.expression;
    setEventHandler(
      expression && /^[A-Za-z_$][\w$]*$/.test(expression) ? expression : "",
    );
    void api<{
      source: string;
    }>("source?file=" + encodeURIComponent(selected.source.file))
      .then((value) => setSource(value.source))
      .catch((err) => setError(err.message));
    sendCanvasSelection();
  }, [selectedId, report?.analyzedAt, selectedIds.join("|")]);
  useEffect(() => {
    const candidate = duplicateCandidates[0];
    if (!candidate) {
      setDuplicateIdentity("");
      setDuplicateValue("");
      return;
    }
    setDuplicateIdentity(candidate.key);
    const used = new Set(
      allElements.flatMap((element) =>
        element.props
          .filter((prop) => prop.name === candidate.name)
          .map((prop) => String(prop.value)),
      ),
    );
    if (typeof candidate.value === "number") {
      let next = candidate.value + 1;
      while (used.has(String(next))) next++;
      setDuplicateValue(String(next));
      return;
    }
    const base = `${String(candidate.value)}Copy`;
    let next = base;
    let suffix = 2;
    while (used.has(next)) next = `${base}${suffix++}`;
    setDuplicateValue(next);
  }, [duplicateCandidates]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const tablist = target.closest?.("[role=tablist]");
      if (
        tablist &&
        ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
      ) {
        const tabs = Array.from(
          tablist.querySelectorAll<HTMLButtonElement>("[role=tab]"),
        );
        const index = tabs.indexOf(target as HTMLButtonElement);
        if (index >= 0) {
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    tabs.length) %
                  tabs.length;
          tabs[next]?.focus();
          tabs[next]?.click();
          return;
        }
      }
      const typing =
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (
        !typing &&
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        requestUndo();
        return;
      }
      if (
        !typing &&
        !event.repeat &&
        selected &&
        selectedIds.length <= 1 &&
        ["Delete", "Backspace"].includes(event.key)
      ) {
        event.preventDefault();
        removeSelectedElement(selected);
        return;
      }
      if (
        !typing &&
        mode === "design" &&
        selected &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          event.key,
        )
      ) {
        event.preventDefault();
        nudgeElement(
          selected,
          event.key,
          event.ctrlKey || event.metaKey ? 8 : 1,
        );
        return;
      }
      if (event.key === "Escape") {
        setSelectedId(null);
        setSelectedIds([]);
        setSelectedRects({});
        previewSelections.current.clear();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, selectedId, selectedIds.length, report?.analyzedAt, busy, checkpoint]);
  useEffect(() => {
    if (!busy && checkpoint && pendingUndo.current) {
      pendingUndo.current = false;
      void undo();
    }
  }, [busy, checkpoint]);
  function sendMode() {
    if (preview) {
      frame.current?.contentWindow?.postMessage(
        {
          type: "uiux:mode",
          mode: mode === "interact" ? "interact" : "design",
        },
        new URL(preview.url).origin,
      );
      sendCanvasSelection();
    }
  }
  function sendCanvasSelection(readyToken?: number) {
    if (!preview || !frame.current) return;
    const sourceIds =
      selectedId && !selectedIds.includes(selectedId)
        ? [selectedId]
        : selectedIds;
    const positionFor = (sourceId: string) =>
      previewSelections.current.get(sourceId) || {
        elementId: sourceId,
        instanceIndex: 0,
      };
    frame.current.contentWindow?.postMessage(
      {
        type: "uiux:select-many",
        selections: sourceIds.map(positionFor),
        primary: selectedId ? positionFor(selectedId) : null,
        readyToken,
      },
      new URL(preview.url).origin,
    );
  }
  async function openProject(projectPath = path) {
    await act(async () => {
      const value = await api<AnalysisReport>("open", { path: projectPath });
      applyReport(value);
      setIsDemo(false);
      setPreview(null);
      setDesignTarget(null);
      setPreviewState("stopped");
      setPatch(null);
      setCheckpoint(false);
      setScreen("analysis");
    });
  }
  async function startApprovedPreview() {
    setPreviewState("starting");
    try {
      const value = await api<Preview>("preview/start", { approved: true });
      setPreview(value);
      setDesignTarget(null);
      setModal(null);
      setScreen("studio");
    } catch (err) {
      setPreview(null);
      setDesignTarget(null);
      setPreviewState("error");
      throw err;
    }
  }
  async function browse(target: "open" | "create") {
    await act(async () => {
      const value = await api("pick-directory", {});
      if (value.unavailable) setError(t("pickerUnavailable"));
      if (value.path) {
        if (target === "open") setPath(value.path);
        else setForm((f) => ({ ...f, parentDirectory: value.path }));
      }
    });
  }
  function isSharedImplementation(element: JsxElement) {
    const owner = report?.components.find((component) => component.id === element.ownerComponent);
    const routeOwner = !!owner && !!report?.routes.some((route) => route.file === owner.source.file) && ((owner.name === "App" && owner.references.length <= 1) || !!owner.defaultExported);
    return !!owner && !routeOwner && element.sourceOwnership === "shared-component";
  }
  async function editElement(
    element: JsxElement,
    operation: PatchRequest["operation"],
    extra: Partial<PatchRequest> = {},
  ) {
    const oldIds = new Set(report?.elements.map((candidate) => candidate.id));
    const insertionAnchor = element.source.end;
    const shared = isSharedImplementation(element);
    if (shared && !window.confirm(t("sharedConfirm"))) return;
    if (preview) setPreviewState("starting");
    await act(async () => {
      const value = await api<{
        patch: SourcePatch;
        analysis: AnalysisReport;
      }>("edit", {
        file: element.source.file,
        elementId: element.id,
        expectedHash: element.hash,
        operation,
        scope: shared ? "shared" : "instance",
        confirmScope: shared,
        ...extra,
      });
      applyReport(value.analysis);
      if (operation === "remove") {
        setSelectedId(null);
        setSelectedIds([]);
        setSelectedRects({});
        previewSelections.current.clear();
      }
      if (operation === "insert" && extra.insertComponent) {
        const insertedTag = extra.insertComponent?.name ?? extra.name;
        const candidates = value.analysis.elements.filter(
          (candidate) =>
            candidate.source.file === element.source.file &&
            candidate.tag === insertedTag,
        );
        const inserted =
          candidates.find((candidate) => !oldIds.has(candidate.id)) ??
          candidates.sort(
            (left, right) =>
              Math.abs(left.source.start - insertionAnchor) -
              Math.abs(right.source.start - insertionAnchor),
          )[0];
        if (inserted) {
          setSelectedId(inserted.id);
          setInspectorTab("props");
        }
      }
      setPatch(null);
      setCheckpoint(true);
      if (preview && frame.current) {
        setPreviewState("starting");
        // A focused iframe loses its keyboard listener during reload. Return
        // focus to the studio so Undo remains available while preview restarts.
        if (document.activeElement === frame.current) frame.current.blur();
        frame.current.src = frame.current.src;
      }
      flash(t("savedDirectly"));
    });
  }
  async function stage(
    operation: PatchRequest["operation"],
    extra: Partial<PatchRequest> = {},
  ) {
    if (selected) await editElement(selected, operation, extra);
  }
  function removeSelectedElement(element: JsxElement) {
    if (busy || !element.operations.includes("remove")) return;
    if (window.confirm(t("removeConfirm")))
      void editElement(element, "remove");
  }
  async function discard() {
    await act(async () => {
      await api("discard", {});
      setPatch(null);
      setModal(null);
      flash(t("discarded"));
    });
  }
  async function apply() {
    if (!patch) return;
    await act(async () => {
      const value = await api("apply", { patchId: patch.id, approved: true });
      applyReport(value.analysis);
      setPatch(null);
      setCheckpoint(true);
      setModal(null);
      flash(t("applied"));
    });
  }
  async function undo() {
    if (preview) setPreviewState("starting");
    await act(async () => {
      const value = await api("undo", { approved: true });
      applyReport(value.analysis);
      setCheckpoint(false);
      setPatch(null);
      if (preview && frame.current) {
        setPreviewState("starting");
        frame.current.src = frame.current.src;
      }
      flash(t("undone"));
    });
  }
  function requestUndo() {
    if (busy) {
      pendingUndo.current = true;
      return;
    }
    if (checkpoint) void undo();
  }
  async function createProject() {
    await act(async () => {
      const result = await api("create", { ...form, approved: true });
      applyReport(result.analysis);
      setIsDemo(false);
      setCheckpoint(false);
      setPatch(null);
      setPreview(null);
      setDesignTarget(null);
      setPreviewState("stopped");
      setScreen("analysis");
      setWizardStep(0);
    });
  }
  function resizePanel(side: "left" | "right", delta: number) {
    setPanelWidths((value: any) => {
      const next = {
        ...value,
        [side]: Math.max(
          side === "left" ? 190 : 260,
          Math.min(450, value[side] + delta),
        ),
      };
      localStorage.setItem("uiux-panels", JSON.stringify(next));
      return next;
    });
  }
  function resizeStart(event: React.PointerEvent, side: "left" | "right") {
    event.currentTarget.setPointerCapture(event.pointerId);
    let previous = event.clientX;
    const move = (e: PointerEvent) => {
      const delta = e.clientX - previous;
      previous = e.clientX;
      resizePanel(side, side === "left" ? delta : -delta);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }
  const themeControl = (
    <select
      className="quiet-select theme-select"
      aria-label={t("theme")}
      value={theme}
      onChange={(e) => setTheme(e.target.value)}
    >
      <option value="light">☀ {t("light")}</option>
      <option value="dark">◐ {t("dark")}</option>
      <option value="system">◧ {t("system")}</option>
    </select>
  );
  const languageControl = (
    <select
      className="quiet-select language-select"
      aria-label={t("language")}
      value={language}
      onChange={(e) => switchLanguage(e.target.value as "en" | "id")}
    >
      <option value="en">EN</option>
      <option value="id">ID</option>
    </select>
  );
  const commonHeader = (
    <header className="main-header">
      <button className="brand" onClick={() => setScreen("home")}>
        <span className="brand-icon">
          <Icon name="code" size={21} />
        </span>
        <span>
          React <strong>UI/UX Tool</strong>
        </span>
        <Badge>0.1</Badge>
      </button>
      <div className="header-end">
        <span className="local-indicator">
          <i />
          {t("local")}
        </span>
        {languageControl}
        {themeControl}
        <button
          className="icon-button"
          onClick={openGuide}
          aria-label={t("help")}
        >
          <Icon name="help" />
        </button>
      </div>
    </header>
  );
  const normalizedSearch = search.trim().toLowerCase();
  const projectCatalog = useMemo(() => {
    const routeFiles = new Set(
      (report?.routes || []).map((route) =>
        route.file.replaceAll("\\", "/"),
      ),
    );
    return (report?.components || [])
      .map((component) => ({
        component,
        rank: reusableComponentRank(component, routeFiles),
      }))
      .filter(
        (
          item,
        ): item is {
          component: AnalysisReport["components"][number];
          rank: number;
        } =>
          item.rank !== null &&
          item.component.exported &&
          (!normalizedSearch ||
            item.component.name.toLowerCase().includes(normalizedSearch) ||
            item.component.source.file.toLowerCase().includes(normalizedSearch)),
      )
      .sort(
        (left, right) =>
          left.rank - right.rank ||
          left.component.name.localeCompare(right.component.name) ||
          left.component.source.file.localeCompare(right.component.source.file),
      )
      .map((item) => item.component)
      .slice(0, 120);
  }, [report?.components, report?.routes, normalizedSearch]);
  const insertTypedValue: string | number | boolean =
    insertPropType === "number"
      ? Number(insertPropValue)
      : insertPropType === "boolean"
        ? insertPropValue === "true"
        : insertPropValue;
  const insertConfigurationValid =
    (!insertPropName ||
      (insertPropValue !== "" &&
        (insertPropType !== "number" ||
          Number.isFinite(Number(insertPropValue))))) &&
    ((!insertEventName && !insertHandler) ||
      (!!insertEventName && !!insertHandler));
  const selectedDuplicate = duplicateCandidates.find(
    (candidate) => candidate.key === duplicateIdentity,
  );
  const searchedFiles = useMemo(
    () =>
      normalizedSearch
        ? (report?.files || [])
            .filter((file) =>
              file.file.toLowerCase().includes(normalizedSearch),
            )
            .slice(0, 150)
        : [],
    [normalizedSearch, report?.files],
  );
  const editableSelected =
    selected &&
    selected.editability !== "READ_ONLY" &&
    selected.editability !== "UNRESOLVED" &&
    selected.editability !== "ERROR";
  const propertyContracts = selectedDefinition?.props.filter(
    (prop) => !/^on[A-Z]/.test(prop.name),
  ) ?? [];
  const activeProperty = selected?.props.find(
    (prop) => prop.name === propName,
  );
  const activeContract = propertyContracts.find(
    (prop) => prop.name === propName,
  );
  const activePropertyLocked = !!activeProperty && !activeProperty.editable;
  const availableEvents = [
    ...new Set([
      ...(selected?.events.map((event) => event.name) ?? []),
      ...(selectedDefinition?.events ?? []),
      ...(/^[a-z]/.test(selected?.tag ?? "") ? NATIVE_EVENTS : []),
    ]),
  ];
  const callableOptions = ownerDefinition?.callables ?? [];
  const stateLabel = (state: string) =>
    t(
      state === "EDITABLE"
        ? "editable"
        : state === "LIMITED"
          ? "limited"
          : state === "READ_ONLY"
            ? "readOnly"
            : "unresolved",
    );
  const stateDescription = (state: string) =>
    t(
      state === "EDITABLE"
        ? "editableMeaning"
        : state === "LIMITED"
          ? "limitedMeaning"
          : state === "READ_ONLY"
            ? "readOnlyMeaning"
            : "unresolvedMeaning",
    );
  const toggleExpanded = (key: string) =>
    setExpandedNodes((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleDirectory = (directory: string) => {
    const key = `dir:${directory}`;
    if (expandedNodes.has(key)) {
      toggleExpanded(key);
      return;
    }
    toggleExpanded(key);
    if (treeChildren[directory]) return;
    setTreeLoading((current) => new Set(current).add(directory));
    void api<ProjectTreeResult>("tree?path=" + encodeURIComponent(directory))
      .then((value) => {
        setTreeChildren((current) => ({
          ...current,
          [directory]: value.entries,
        }));
        if (value.truncated)
          setTreeTruncated((current) => new Set(current).add(directory));
      })
      .catch((err) => setError(err.message))
      .finally(() =>
        setTreeLoading((current) => {
          const next = new Set(current);
          next.delete(directory);
          return next;
        }),
      );
  };
  const openSourceFile = (file: string) => {
    setMode("code");
    setInspectorTab("source");
    const first = allElements.find((element) => element.source.file === file);
    setSelectedId(first?.id || null);
    void act(async () => {
      const value = await api<{ source: string }>(
        "source?file=" + encodeURIComponent(file),
      );
      setSource(value.source);
    });
  };
  function stageDroppedElement(element: JsxElement, tag: string) {
    setSelectedId(element.id);
    setPendingInsert(tag);
    const classNames = new Set((report?.elements ?? [])
      .filter((usage) => usage.tag === tag && usage.source.file === element.source.file && !usage.dynamic)
      .flatMap((usage) => usage.props.filter((prop) => prop.name === "className" && prop.kind === "string" && typeof prop.value === "string").map((prop) => prop.value as string)));
    void editElement(element, "insert", {
      name: tag,
      value: tag === "button" ? "New button" : "",
      position: "inside",
      insertProps: classNames.size === 1 ? [{ name: "className", value: [...classNames][0] }] : undefined,
    }).finally(() => setPendingInsert(""));
  }
  function stageDroppedComponent(
    element: JsxElement,
    component: AnalysisReport["components"][number],
  ) {
    setSelectedId(element.id);
    setPendingInsert(component.name);
    const insertProps: NonNullable<PatchRequest["insertProps"]> = [];
    const label = component.props.find((prop) => prop.name === "label" && (!prop.options || prop.options.includes("New button")));
    if (component.name === "Button" && label)
      insertProps.push({ name: "label", value: "New button" });
    // Reuse an unambiguous literal styling choice already used in this file.
    for (const name of ["variant", "size", "className"]) {
      const contract = component.props.find((prop) => prop.name === name);
      if (!contract) continue;
      const values = new Set((report?.elements ?? [])
        .filter((usage) => usage.componentId === component.id && usage.source.file === element.source.file && !usage.dynamic)
        .flatMap((usage) => usage.props.filter((prop) => prop.name === name && prop.kind === "string" && typeof prop.value === "string").map((prop) => prop.value as string)));
      if (values.size === 1) {
        const value = [...values][0];
        if (!contract.options || contract.options.includes(value)) insertProps.push({ name, value });
      }
    }
    void editElement(element, "insert", {
      name: component.name,
      position: "inside",
      insertProps,
      insertComponent: {
        name: component.name,
        sourceFile: component.source.file,
        defaultExported: !!component.defaultExported,
      },
    }).finally(() => setPendingInsert(""));
  }
  function currentOffset(element: JsxElement, property: string) {
    const currentProperty = element.props.find(
      (prop) => prop.name === `style.${property}`,
    );
    const current = Number.parseFloat(
      String(currentProperty?.value ?? currentProperty?.expression ?? "0"),
    );
    return Number.isFinite(current) ? current : 0;
  }
  function applyGroupedPosition(
    group: JsxElement[],
    property: "marginTop" | "marginLeft",
    valueFor: (element: JsxElement) => string,
  ) {
    if (group.some((item) => !item.operations.includes("style"))) {
      setError(t("positionLocked"));
      return;
    }
    if (new Set(group.map((item) => item.source.file)).size > 1) {
      setError(t("groupSameScreen"));
      return;
    }
    if (group.some(isSharedImplementation) && !window.confirm(t("sharedConfirm"))) return;
    if (preview) setPreviewState("starting");
    void act(async () => {
      const items = group.map((item) => {
        const shared = isSharedImplementation(item);
        return {
          file: item.source.file,
          elementId: item.id,
          expectedHash: item.hash,
          name: property,
          value: valueFor(item),
          scope: shared ? "shared" : "instance",
          confirmScope: shared,
        };
      });
      const result = await api<{ analysis: AnalysisReport }>("edit-group", {
        items,
      });
      applyReport(result.analysis);
      setCheckpoint(true);
      if (preview && frame.current) {
        setPreviewState("starting");
        frame.current.src = frame.current.src;
      }
      flash(t("groupMoved"));
    });
  }
  function applyStylePreset(preset: string) {
    if (!selected || busy || !selected.operations.includes("style")) return;
    const presets: Record<string, Array<[string, string | number]>> = {
      heading: [["fontSize", 28], ["fontWeight", 700], ["lineHeight", 1.2]],
      body: [["fontSize", 16], ["fontWeight", 400], ["lineHeight", 1.5]],
      muted: [["color", "#667085"], ["fontSize", 14]],
      accent: [["color", "#635bff"], ["fontWeight", 600]],
      card: [["background", "#ffffff"], ["borderRadius", 12], ["padding", 16]],
      danger: [["color", "#c62828"]],
    };
    const styles = presets[preset];
    if (!styles || !selected.hash) return;
    const target = selected;
    void act(async () => {
      const items = styles.map(([name, value]) => ({
        file: target.source.file,
        elementId: target.id,
        expectedHash: target.hash,
        name,
        value,
        scope: "instance" as const,
        confirmScope: false,
      }));
      const result = await api<{ analysis: AnalysisReport }>("edit-group", { items });
      applyReport(result.analysis);
      setCheckpoint(true);
      flash(t("styleApplied"));
    });
  }

  function nudgeElement(
    element: JsxElement,
    direction: string,
    step: number,
  ) {
    if (busy) return;
    const group =
      selectedIds.length > 1 && selectedIds.includes(element.id)
        ? selectedElements
        : [element];
    const vertical = direction === "ArrowUp" || direction === "ArrowDown";
    const property = vertical ? "marginTop" : "marginLeft";
    const sign =
      direction === "ArrowUp" || direction === "ArrowLeft" ? -1 : 1;
    const valueFor = (item: JsxElement) =>
      `${currentOffset(item, property) + sign * step}px`;
    const value = valueFor(element);
    setStyleName(property);
    setStyleValue(value);
    if (group.length === 1) {
      if (!element.operations.includes("style")) {
        setError(t("positionLocked"));
        return;
      }
      void editElement(element, "style", { name: property, value });
      return;
    }
    applyGroupedPosition(group, property, valueFor);
  }
  function moveElementByDelta(element: JsxElement, dx: number, dy: number) {
    if (busy) return;
    const group =
      selectedIds.length > 1 && selectedIds.includes(element.id)
        ? selectedElements
        : [element];
    if (group.some((item) => !item.operations.includes("style"))) {
      setError(t("positionLocked"));
      return;
    }
    if (new Set(group.map((item) => item.source.file)).size > 1) {
      setError(t("groupSameScreen"));
      return;
    }
    const changes = group.flatMap((item) => [
      ...(dx
        ? [
            {
              element: item,
              name: "marginLeft" as const,
              value: `${currentOffset(item, "marginLeft") + dx}px`,
            },
          ]
        : []),
      ...(dy
        ? [
            {
              element: item,
              name: "marginTop" as const,
              value: `${currentOffset(item, "marginTop") + dy}px`,
            },
          ]
        : []),
    ]);
    if (changes.length === 1) {
      const change = changes[0]!;
      void editElement(change.element, "style", {
        name: change.name,
        value: change.value,
      });
      return;
    }
    if (group.some(isSharedImplementation) && !window.confirm(t("sharedConfirm"))) return;
    if (preview) setPreviewState("starting");
    void act(async () => {
      const items = changes.map(({ element: item, name, value }) => {
        const shared = isSharedImplementation(item);
        return {
          file: item.source.file,
          elementId: item.id,
          expectedHash: item.hash,
          name,
          value,
          scope: shared ? ("shared" as const) : ("instance" as const),
          confirmScope: shared,
        };
      });
      const result = await api<{ analysis: AnalysisReport }>("edit-group", {
        items,
      });
      applyReport(result.analysis);
      setCheckpoint(true);
      if (preview && frame.current) {
        setPreviewState("starting");
        frame.current.src = frame.current.src;
      }
      flash(group.length > 1 ? t("groupMoved") : t("savedDirectly"));
    });
  }
  function alignSelected(
    alignment: "top" | "bottom" | "left" | "right",
  ) {
    if (busy || selectedElements.length < 2) return;
    const measured = selectedElements.map((element) => ({
      element,
      rect: selectedRects[element.id],
    }));
    if (measured.some((item) => !item.rect)) {
      setError(t("selectOnCanvasForAlign"));
      return;
    }
    const vertical = alignment === "top" || alignment === "bottom";
    const property = vertical ? "marginTop" : "marginLeft";
    const edges = measured.map(({ rect }) =>
      alignment === "top"
        ? rect!.top
        : alignment === "bottom"
          ? rect!.top + rect!.height
          : alignment === "left"
            ? rect!.left
            : rect!.left + rect!.width,
    );
    const targetEdge =
      alignment === "top" || alignment === "left"
        ? Math.min(...edges)
        : Math.max(...edges);
    const values = new Map(
      measured.map(({ element }, index) => [
        element.id,
        `${currentOffset(element, property) + targetEdge - edges[index]!}px`,
      ]),
    );
    applyGroupedPosition(
      selectedElements,
      property,
      (element) => values.get(element.id)!,
    );
  }
  function dropPaletteOnCanvas(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingPalette(false);
    const target = selected;
    if (!target?.operations.includes("insert")) {
      setError(t("simpleDropError"));
      return;
    }
    const componentId = event.dataTransfer.getData("uiux/component");
    const tag = event.dataTransfer.getData("uiux/tag");
    const component = report?.components.find(
      (candidate) => candidate.id === componentId,
    );
    if (component) stageDroppedComponent(target, component);
    else if (tag) stageDroppedElement(target, tag);
    else setError(t("simpleDropError"));
  }
  const activateDesignComponent = (
    component: AnalysisReport["components"][number],
  ) => {
    const owned = elementsByOwner.get(component.id) || [];
    if (owned[0]) setSelectedId(owned[0].id);
    if (!component.exported) {
      flash(t("privateDesignComponent"));
      return;
    }
    if (!preview) {
      flash(t("startPreviewForDesign"));
      return;
    }
    void act(async () => {
      await api("preview/design", {
        approved: true,
        file: component.source.file,
        componentName: component.name,
      });
      setDesignTarget(component.id);
      setRoute("/");
      setMode("design");
      setPreviewState("starting");
    });
  };
  const renderElementNode = (element: JsxElement, depth: number): ReactNode => {
    const key = `element:${element.id}`;
    const children = element.children
      .map((id) => elementById.get(id))
      .filter((child): child is JsxElement => !!child);
    const expanded = expandedNodes.has(key);
    return (
      <div key={key}>
        <button
          role="treeitem"
          data-tree-key={key}
          aria-level={depth + 1}
          aria-expanded={children.length ? expanded : undefined}
          aria-selected={selectedIds.includes(element.id)}
          className={`explorer-row ${selectedIds.includes(element.id) ? "selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={(event) => {
            if (event.ctrlKey || event.metaKey) {
              const next = selectedIds.includes(element.id)
                ? selectedIds.filter((id) => id !== element.id)
                : [...selectedIds, element.id];
              setSelectedIds(next);
              setSelectedId(
                next.includes(element.id)
                  ? element.id
                  : next.at(-1) ?? null,
              );
              return;
            }
            setSelectedIds([element.id]);
            setSelectedId(element.id);
            if (children.length) toggleExpanded(key);
          }}
          onDragOver={(event) => {
            if (element.operations.includes("insert")) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            const tag = event.dataTransfer.getData("uiux/tag");
            const componentId = event.dataTransfer.getData("uiux/component");
            const component = report?.components.find(
              (candidate) => candidate.id === componentId,
            );
            if (component) stageDroppedComponent(element, component);
            else if (tag) stageDroppedElement(element, tag);
          }}
        >
          <span className="explorer-chevron">
            {children.length ? (expanded ? "⌄" : "›") : ""}
          </span>
          <Icon
            name={element.editability === "READ_ONLY" ? "lock" : "code"}
            size={13}
          />
          <span className="explorer-name">{element.tag}</span>
          {element.text?.trim() && (
            <small className="explorer-detail">
              {element.text.trim().slice(0, 24)}
            </small>
          )}
        </button>
        {expanded &&
          children.map((child) => renderElementNode(child, depth + 1))}
      </div>
    );
  };
  const renderComponentNode = (
    component: AnalysisReport["components"][number],
    depth: number,
  ): ReactNode => {
    const key = `component:${component.id}`;
    const owned = elementsByOwner.get(component.id) || [];
    const roots = owned.filter((element) => {
      const parent = element.parentId
        ? elementById.get(element.parentId)
        : null;
      return !parent || parent.ownerComponent !== component.id;
    });
    const expanded = expandedNodes.has(key);
    return (
      <div key={key}>
        <button
          role="treeitem"
          data-tree-key={key}
          aria-level={depth + 1}
          aria-expanded={roots.length ? expanded : undefined}
          className="explorer-row component-row"
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => {
            activateDesignComponent(component);
            if (roots.length) toggleExpanded(key);
          }}
        >
          <span className="explorer-chevron">
            {roots.length ? (expanded ? "⌄" : "›") : ""}
          </span>
          <Icon name="layers" size={13} />
          <span className="explorer-name">{component.name}</span>
          <small className="explorer-detail">{roots.length}</small>
        </button>
        {expanded &&
          roots.map((element) => renderElementNode(element, depth + 1))}
      </div>
    );
  };
  const renderFileNode = (
    entry: ProjectTreeEntry,
    depth: number,
  ): ReactNode => {
    const key = `file:${entry.path}`;
    const components = componentsByFile.get(entry.path) || [];
    const expanded = expandedNodes.has(key);
    return (
      <div key={key}>
        <button
          role="treeitem"
          data-tree-key={key}
          aria-level={depth + 1}
          aria-expanded={components.length ? expanded : undefined}
          className="explorer-row file-row"
          style={{ paddingLeft: 8 + depth * 14 }}
          disabled={!entry.browsable}
          onClick={() => {
            openSourceFile(entry.path);
            if (components.length) toggleExpanded(key);
          }}
          title={entry.path}
        >
          <span className="explorer-chevron">
            {components.length ? (expanded ? "⌄" : "›") : ""}
          </span>
          <Icon name="file" size={13} />
          <span className="explorer-name">{entry.name}</span>
          {components.length > 0 && (
            <small className="explorer-detail">{components.length}</small>
          )}
        </button>
        {expanded &&
          components.map((component) =>
            renderComponentNode(component, depth + 1),
          )}
      </div>
    );
  };
  const renderDirectoryNode = (
    entry: ProjectTreeEntry,
    depth: number,
  ): ReactNode => {
    const key = `dir:${entry.path}`;
    const expanded = expandedNodes.has(key);
    const children = treeChildren[entry.path];
    return (
      <div key={key}>
        <button
          role="treeitem"
          data-tree-key={key}
          aria-level={depth + 1}
          aria-expanded={expanded}
          className="explorer-row directory-row"
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => toggleDirectory(entry.path)}
          title={entry.path}
        >
          <span className="explorer-chevron">{expanded ? "⌄" : "›"}</span>
          <Icon name="folder" size={14} />
          <span className="explorer-name">{entry.name}</span>
        </button>
        {expanded && treeLoading.has(entry.path) && (
          <p
            className="explorer-message"
            style={{ paddingLeft: 26 + depth * 14 }}
          >
            {t("loadingProject")}
          </p>
        )}
        {expanded &&
          children?.map((child) =>
            child.kind === "directory"
              ? renderDirectoryNode(child, depth + 1)
              : renderFileNode(child, depth + 1),
          )}
        {expanded && treeTruncated.has(entry.path) && (
          <p
            className="explorer-message"
            style={{ paddingLeft: 26 + depth * 14 }}
          >
            {t("treeLimited")}
          </p>
        )}
      </div>
    );
  };
  const sourceExplorer = (
    <div className="source-explorer" role="tree" aria-label={t("sourceTree")} aria-multiselectable="true" onKeyDown={(event) => {
      const item = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="treeitem"]');
      if (!item) return;
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="treeitem"]:not(:disabled)'));
      const index = items.indexOf(item);
      const key = item.dataset.treeKey;
      const expanded = item.getAttribute("aria-expanded");
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
        items[next]?.focus();
      } else if (event.key === "ArrowRight" && expanded === "true") {
        event.preventDefault();
        const child = key === "dir:" ? items[index + 1] : item.parentElement?.querySelector<HTMLButtonElement>(':scope > div [role="treeitem"]');
        child?.focus();
      } else if ((event.key === "ArrowRight" && expanded === "false") || (event.key === "ArrowLeft" && expanded === "true")) {
        event.preventDefault();
        if (key?.startsWith("dir:") && key !== "dir:") toggleDirectory(key.slice(4));
        else if (key) toggleExpanded(key);
      } else if (event.key === "ArrowLeft") {
        const parent = item.parentElement?.parentElement?.closest("div")?.querySelector<HTMLButtonElement>(':scope > [role="treeitem"]');
        if (parent) { event.preventDefault(); parent.focus(); }
      }
    }}>
      {normalizedSearch ? (
        searchedFiles.length ? (
          searchedFiles.map((file) =>
            renderFileNode(
              {
                name: file.file.split("/").pop() || file.file,
                path: file.file,
                kind: "file",
                browsable: true,
              },
              0,
            ),
          )
        ) : (
          <p className="empty-copy">{t("noResults")}</p>
        )
      ) : (
        <>
          <button
            role="treeitem"
            aria-level={1}
            aria-expanded={expandedNodes.has("dir:")}
            data-tree-key="dir:"
            className="explorer-row project-root-row"
            onClick={() => toggleExpanded("dir:")}
          >
            <span className="explorer-chevron">
              {expandedNodes.has("dir:") ? "⌄" : "›"}
            </span>
            <Icon name="folder" size={14} />
            <span className="explorer-name">{report?.name}</span>
          </button>
          {expandedNodes.has("dir:") && treeLoading.has("") && (
            <p className="explorer-message">{t("loadingProject")}</p>
          )}
          {expandedNodes.has("dir:") &&
            treeChildren[""]?.map((entry) =>
              entry.kind === "directory"
                ? renderDirectoryNode(entry, 1)
                : renderFileNode(entry, 1),
            )}
          {expandedNodes.has("dir:") && treeTruncated.has("") && (
            <p className="explorer-message">{t("treeLimited")}</p>
          )}
        </>
      )}
    </div>
  );
  const guideSteps = [
    {
      title: t("guideIntroTitle"),
      body: t("guideIntroBody"),
      icon: "home",
      action: "start",
      bullets: [],
    },
    {
      title: t("guideNavTitle"),
      body: t("guideNavBody"),
      icon: "layers",
      action: "pages",
      bullets: [t("guideNavPages"), t("guideNavComponents")],
    },
    {
      title: t("guideSetupTitle"),
      body: t("guideSetupBody"),
      icon: "code",
      action: "start",
      bullets: [
        t("guideSetupInstall"),
        t("guideSetupLocal"),
        t("guideSetupStop"),
      ],
    },
    {
      title: t("guideTreeTitle"),
      body: t("guideTreeBody"),
      icon: "folder",
      action: "tree",
      bullets: [t("guideTreeBullet")],
    },
    {
      title: t("guideAnalysisTitle"),
      body: t("guideAnalysisBody"),
      icon: "search",
      action: "analysis",
      bullets: [
        t("guideAnalysisEvidence"),
        t("guideAnalysisRuntime"),
        t("guideAnalysisNext"),
      ],
    },
    {
      title: t("guidePreviewTitle"),
      body: t("guidePreviewBody"),
      icon: "desktop",
      action: "preview",
      bullets: [t("guidePreviewBullet")],
    },
    {
      title: t("guideSelectTitle"),
      body: t("guideSelectBody"),
      icon: "check",
      action: "preview",
      bullets: [
        t("guideSelectVisual"),
        t("guideSelectMultiple"),
        t("guideSelectModes"),
      ],
    },
    {
      title: t("guideDragTitle"),
      body: t("guideDragBody"),
      icon: "layers",
      action: "components",
      bullets: [
        t("guideDragProject"),
        t("guideDragPrimitive"),
        t("guideDragKeyboard"),
      ],
    },
    {
      title: t("guidePropsTitle"),
      body: t("guidePropsBody"),
      icon: "code",
      action: "props",
      bullets: [t("guidePropsTypes"), t("guidePropsControlled")],
    },
    {
      title: t("guideStatusTitle"),
      body: t("guideStatusBody"),
      icon: "lock",
      action: "props",
      bullets: [
        t("guideStatusEditable"),
        t("guideStatusLimited"),
        t("guideStatusReadOnly"),
        t("guideStatusUnresolved"),
      ],
    },
    {
      title: t("guideEventsTitle"),
      body: t("guideEventsBody"),
      icon: "arrow",
      action: "events",
      bullets: [t("guideEventsSafe")],
    },
    {
      title: t("guideCopyTitle"),
      body: t("guideCopyBody"),
      icon: "copy",
      action: "duplicate",
      bullets: [t("guideCopyIdentity")],
    },
    {
      title: t("guideStructureTitle"),
      body: t("guideStructureBody"),
      icon: "board",
      action: "layout",
      bullets: [
        t("guideStructureStyle"),
        t("guideStructureMulti"),
        t("guideStructureInspect"),
      ],
    },
    {
      title: t("guideDirectTitle"),
      body: t("guideDirectBody"),
      icon: "check",
      action: "direct",
      bullets: [t("guideDirectUndo"), t("guideDirectLocked")],
    },
    {
      title: t("guideSafetyTitle"),
      body: t("guideSafetyBody"),
      icon: "lock",
      action: "direct",
      bullets: [
        t("guideSafetyUtf8"),
        t("guideSafetyPreview"),
        t("guideSafetyTroubleshoot"),
      ],
    },
    {
      title: t("guideReviewTitle"),
      body: t("guideReviewBody"),
      icon: "check",
      action: "review",
      bullets: [],
    },
  ];
  function renderAnalysis(compact = false) {
    if (!report) return null;
    return (
      <div
        className={compact ? "analysis-content compact" : "analysis-content"}
      >
        <div className="analysis-stats">
          <div>
            <strong>{report.coverage.elementsEditable}</strong>
            <span>
              <i className="dot green" />
              {t("editable")}
            </span>
          </div>
          <div>
            <strong>{report.coverage.elementsLimited}</strong>
            <span>
              <i className="dot amber" />
              {t("limited")}
            </span>
          </div>
          <div>
            <strong>{report.coverage.elementsReadOnly}</strong>
            <span>
              <i className="dot gray" />
              {t("readOnly")}
            </span>
          </div>
          <div>
            <strong>{report.components.length}</strong>
            <span>{t("components")}</span>
          </div>
        </div>
        <div className="analysis-columns">
          <div>
            <h3>{t("detected")}</h3>
            <dl className="detail-list">
              <div>
                <dt>{t("framework")}</dt>
                <dd>
                  {report.detected.framework}
                  <Badge>{report.detected.router}</Badge>
                </dd>
              </div>
              <div>
                <dt>TypeScript</dt>
                <dd>{report.detected.typescript ? "✓" : "—"}</dd>
              </div>
              <div>
                <dt>{t("styling")}</dt>
                <dd>{report.detected.styling.join(", ") || t("none")}</dd>
              </div>
              <div>
                <dt>{t("libraries")}</dt>
                <dd>
                  {report.detected.componentLibraries.join(", ") || t("none")}
                </dd>
              </div>
              <div>
                <dt>Git</dt>
                <dd>
                  {report.git.available
                    ? `${report.git.branch || ""} ${report.git.dirty ? "· modified" : "· clean"}`
                    : t("unavailable")}
                </dd>
              </div>
            </dl>
          </div>
          <div>
            <h3>{t("coverage")}</h3>
            <p className="coverage-text">
              <strong>{report.coverage.filesInspected}</strong> {t("scanned")}{" "}
              <span>
                · {report.coverage.filesSkipped} {t("skipped")}
              </span>
            </p>
            <div className="coverage-bar">
              <span
                style={{
                  width:
                    report.coverage.filesInspected +
                    report.coverage.filesSkipped
                      ? `${(report.coverage.filesInspected / (report.coverage.filesInspected + report.coverage.filesSkipped)) * 100}%`
                      : "0%",
                }}
              />
            </div>
            <p className="small muted">
              {report.coverage.reasons.map(evidence).join(" · ")}
            </p>
            <h3>{t("build")}</h3>
            <p className="small">{evidence(report.readiness.reason)}</p>
            <p className="small muted">{t("projectTrust")}</p>
          </div>
        </div>
        <div className="analysis-warnings">
          <h3>
            {t("warnings")} <Badge>{report.warnings.length}</Badge>
          </h3>
          {report.warnings.length ? (
            report.warnings.map((warning, index) => (
              <p key={index}>
                <span>△</span>
                {evidence(warning)}
              </p>
            ))
          ) : (
            <p className="muted">{t("noWarnings")}</p>
          )}
        </div>
        {!compact && (
          <div className="analysis-routes">
            <h3>{t("routes")}</h3>
            {report.routes.map((route) => (
              <div className="route-row" key={route.file}>
                <code>{route.path}</code>
                <span>{route.file}</span>
                <Badge>{route.previewState}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  function renderDiff() {
    return patch ? (
      <div className="diff-content">
        <div className="diff-summary">
          <Badge tone="accent">{t("pending")}</Badge>
          <span>{patch.file}</span>
          <Badge>{patch.scope}</Badge>
        </div>
        <dl className="detail-list impact-details">
          <div>
            <dt>{t("requestedScope")}</dt>
            <dd>
              {t(
                patch.scope === "instance"
                  ? "instance"
                  : patch.scope === "shared"
                    ? "shared"
                    : "token",
              )}
            </dd>
          </div>
          <div>
            <dt>{t("actualFiles")}</dt>
            <dd>{patch.impact.files.join(", ")}</dd>
          </div>
          {patch.impact.usageFiles.length > 0 && (
            <div>
              <dt>{t("usageFiles")}</dt>
              <dd>{patch.impact.usageFiles.join(", ")}</dd>
            </div>
          )}
          <div>
            <dt>{t("impact")}</dt>
            <dd>
              {patch.impact.knownUsages} {t("knownUsages")} ·{" "}
              {patch.impact.warning}
            </dd>
          </div>
        </dl>
        {patch.warnings.map((warning, index) => (
          <p className="notice" key={index}>
            {warning}
          </p>
        ))}
        <p className="small muted">{t("validationHint")}</p>
        <pre className="diff-code">
          {patch.diff.split("\n").map((line, index) => (
            <span
              key={index}
              className={
                line.startsWith("+") && !line.startsWith("+++")
                  ? "addition"
                  : line.startsWith("-") && !line.startsWith("---")
                    ? "deletion"
                    : line.startsWith("@@")
                      ? "diff-hunk"
                      : ""
              }
            >
              {line || " "}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>
    ) : (
      <div className="panel-empty">
        <Icon name="code" size={26} />
        <strong>{t("noChanges")}</strong>
        <p>{t("noChangesHint")}</p>
      </div>
    );
  }
  function renderInspector() {
    return (
      <aside className="inspector-panel" style={{ width: panelWidths.right }}>
        <div className="panel-heading">
          <strong>{t("inspector")}</strong>
          <button
            className="icon-button"
            title={t("viewSource")}
            aria-label={t("viewSource")}
            onClick={() => setInspectorTab("source")}
          >
            <Icon name="code" size={16} />
          </button>
        </div>
        <div
          className="inspector-tabs"
          role="tablist"
          aria-label={t("inspector")}
        >
          {(
            [
              "props",
              "style",
              "layout",
              "events",
              "data",
              "a11y",
              "source",
            ] as Key[]
          ).map((tab) => (
            <button
              role="tab"
              aria-selected={inspectorTab === tab}
              className={inspectorTab === tab ? "active" : ""}
              key={tab}
              onClick={() => setInspectorTab(tab)}
            >
              {t(tab)}
            </button>
          ))}
        </div>
        {!selected ? (
          <div className="panel-empty">
            <span className="cursor-symbol">↖</span>
            <strong>{t("selectHint")}</strong>
            <p>{t("scopeHint")}</p>
          </div>
        ) : (
          <div className="inspector-content">
            {selectedDefinition?.props.some((prop) => prop.name === "value") && !selected.props.some((prop) => prop.name === "value") && <p className="small muted" role="status">{t("unboundComponentData")}</p>}
            <div className="selected-heading">
              <span className="node-large">
                <Icon name={editableSelected ? "code" : "lock"} size={20} />
              </span>
              <div>
                <h3>{selected.tag}</h3>
                <span>{selected.ownerComponent || t("sourceElements")}</span>
              </div>
              <Badge tone={editableSelected ? "green" : "neutral"}>
                {stateLabel(selected.editability)}
              </Badge>
              {selectedElements.length > 1 && (
                <Badge tone="purple">
                  {selectedElements.length} {t("selectedCount")}
                </Badge>
              )}
            </div>
            <button
              className="source-location"
              onClick={() => setInspectorTab("source")}
            >
              <Icon name="file" size={13} />
              <span>
                {selected.source.file}:{selected.source.line}
              </span>
              <span>↗</span>
            </button>
            <div className={`edit-status ${selected.editability.toLowerCase()}`}>
              <strong>{stateLabel(selected.editability)}</strong>
              <p>{stateDescription(selected.editability)}</p>
            </div>
            {!editableSelected && (
              <div className="locked-notice">
                <Icon name="lock" size={17} />
                <div>
                  <strong>{t("locked")}</strong>
                  {selected.reasons.map((reason, index) => (
                    <p key={index}>{evidence(reason)}</p>
                  ))}
                </div>
              </div>
            )}
            {inspectorTab === "props" && (
              <>
                <section className="inspector-section">
                  <h4>{t("directSourceMode")}</h4>
                  <p className="small muted">{t("directSourceHint")}</p>
                </section>
                <section className="inspector-section">
                  <h4>{t("text")}</h4>
                  <textarea
                    aria-label={t("text")}
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    disabled={
                      !editableSelected || !selected.operations.includes("text")
                    }
                  />
                  <small className="muted">{t("textHint")}</small>
                  <button
                    className="button full"
                    disabled={
                      busy ||
                      !editableSelected ||
                      !selected.operations.includes("text")
                    }
                    onClick={() => void stage("text", { value: textValue })}
                  >
                    {t("stage")}
                  </button>
                </section>
                <section className="inspector-section">
                  <h4>{t("props")}</h4>
                  {selectedDefinition && (
                    <p className="small muted">
                      {t("componentContract")}: {selectedDefinition.name} ·{" "}
                      {propertyContracts.length} {t("props").toLowerCase()} ·{" "}
                      {selectedDefinition.events.length} {t("events").toLowerCase()}
                    </p>
                  )}
                  {selected.props
                    .filter((prop) => prop.name !== "style")
                    .map((prop) => (
                      <div className="prop-row" key={prop.name}>
                        <code>{prop.name}</code>
                        <span className={prop.editable ? "" : "muted"}>
                          {prop.expression || String(prop.value)}
                        </span>
                        {!prop.editable && <Icon name="lock" size={12} />}
                      </div>
                    ))}
                  <Field label={t("propName")}>
                    <input
                      value={propName}
                      onChange={(e) => {
                        const name = e.target.value;
                        setPropName(name);
                        const instance = selected.props.find(
                          (prop) => prop.name === name,
                        );
                        const contract = propertyContracts.find(
                          (prop) => prop.name === name,
                        );
                        setPropValue(
                          String(instance?.value ?? contract?.defaultValue ?? ""),
                        );
                        const kind =
                          contract?.type.match(/^(string|number|boolean)$/)?.[1] ??
                          instance?.kind.match(/^(string|number|boolean)$/)?.[1] ??
                          "string";
                        setPropValueType(
                          kind as "string" | "number" | "boolean",
                        );
                      }}
                      list="prop-names"
                      disabled={!editableSelected}
                    />
                    <datalist id="prop-names">
                      {[
                        "className",
                        "title",
                        "placeholder",
                        "disabled",
                        "aria-label",
                        ...propertyContracts.map((prop) => prop.name),
                        ...selected.props.map((prop) => prop.name),
                      ].map((name, index) => (
                        <option key={index} value={name} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label={t("valueType")}>
                    <select
                      value={propValueType}
                      onChange={(event) =>
                        setPropValueType(
                          event.target.value as "string" | "number" | "boolean",
                        )
                      }
                      disabled={
                        !editableSelected ||
                        activePropertyLocked ||
                        !!activeContract?.options
                      }
                    >
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                    </select>
                  </Field>
                  <Field label={t("propValue")}>
                    {activeContract?.options?.length ? (
                      <select
                        value={propValue}
                        onChange={(event) => setPropValue(event.target.value)}
                        disabled={!editableSelected || activePropertyLocked}
                      >
                        {!activeContract.options.includes(propValue) && (
                          <option value={propValue}>{propValue || "—"}</option>
                        )}
                        {activeContract.options.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : propValueType === "boolean" ? (
                      <select
                        value={propValue || "false"}
                        onChange={(event) => setPropValue(event.target.value)}
                        disabled={!editableSelected || activePropertyLocked}
                      >
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    ) : (
                      <input
                        type={propValueType === "number" ? "number" : "text"}
                        value={propValue}
                        onChange={(e) => setPropValue(e.target.value)}
                        disabled={!editableSelected || activePropertyLocked}
                      />
                    )}
                  </Field>
                  {activePropertyLocked && (
                    <div className="property-lock-note">
                      <Icon name="lock" size={14} />
                      <div>
                        <strong>{t("valueLockedTitle")}</strong>
                        <p>{t("valueLockedHint")}</p>
                      </div>
                    </div>
                  )}
                  <button
                    className="button full"
                    disabled={
                      busy ||
                      !editableSelected ||
                      activePropertyLocked ||
                      !propName ||
                      (propValueType === "number" &&
                        !Number.isFinite(Number(propValue)))
                    }
                    onClick={() =>
                      void stage("prop", {
                        name: propName,
                        value:
                          propValueType === "boolean"
                            ? propValue === "true"
                            : propValueType === "number"
                              ? Number(propValue)
                              : propValue,
                      })
                    }
                  >
                    {t("stage")}
                  </button>
                </section>
              </>
            )}
            {(inspectorTab === "style" || inspectorTab === "layout") && (
              <>
                {inspectorTab === "layout" && (
                  <section className="inspector-section">
                    <h4>{t("finePosition")}</h4>
                    <p className="small muted">{t("multiSelectHint")}</p>
                    <div className="nudge-pad">
                      <button
                        className="button nudge-up"
                        aria-label={`${t("finePosition")} ↑`}
                        disabled={busy || !selected.operations.includes("style")}
                        onClick={() => nudgeElement(selected, "ArrowUp", 1)}
                      >
                        ↑
                      </button>
                      <button
                        className="button nudge-left"
                        aria-label={`${t("finePosition")} ←`}
                        disabled={busy || !selected.operations.includes("style")}
                        onClick={() => nudgeElement(selected, "ArrowLeft", 1)}
                      >
                        ←
                      </button>
                      <button
                        className="button nudge-center"
                        disabled
                        aria-hidden="true"
                      >
                        •
                      </button>
                      <button
                        className="button nudge-right"
                        aria-label={`${t("finePosition")} →`}
                        disabled={busy || !selected.operations.includes("style")}
                        onClick={() => nudgeElement(selected, "ArrowRight", 1)}
                      >
                        →
                      </button>
                      <button
                        className="button nudge-down"
                        aria-label={`${t("finePosition")} ↓`}
                        disabled={busy || !selected.operations.includes("style")}
                        onClick={() => nudgeElement(selected, "ArrowDown", 1)}
                      >
                        ↓
                      </button>
                    </div>
                    <p className="small muted">{t("finePositionHint")}</p>
                    <div className="alignment-grid">
                      {(
                        [
                          ["left", "alignLeft"],
                          ["right", "alignRight"],
                          ["top", "alignTop"],
                          ["bottom", "alignBottom"],
                        ] as const
                      ).map(([alignment, label]) => (
                        <button
                          key={alignment}
                          className="button"
                          aria-label={t(label)}
                          title={t(label)}
                          disabled={busy || selectedElements.length < 2}
                          onClick={() => alignSelected(alignment)}
                        >
                          <Icon name={`align-${alignment}`} size={16} />
                          <span>{t(label)}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      className="button full danger-quiet selection-delete"
                      disabled={
                        busy ||
                        selectedIds.length > 1 ||
                        !selected.operations.includes("remove")
                      }
                      onClick={() => removeSelectedElement(selected)}
                    >
                      <Icon name="trash" size={15} />
                      <span>{t("deleteSelected")}</span>
                      <kbd>Delete</kbd>
                    </button>
                    <p className="small muted delete-shortcut-hint">
                      {t("deleteShortcutHint")}
                    </p>
                  </section>
                )}
                <section className="inspector-section">
                  <h4>{t("formattingPalette")}</h4>
                  <p className="small muted">{t("formattingPaletteHint")}</p>
                  <Field label={t("formattingChoice")}>
                    <select value={styleName} disabled={!editableSelected || !selected.operations.includes("style")} onChange={(event) => setStyleName(event.target.value)}>
                      {[
                        ["padding", "Padding"], ["fontFamily", "Font family"], ["fontSize", "Font size"],
                        ["fontWeight", "Font weight"], ["fontStyle", "Italic"],
                        ["textDecorationLine", "Underline / strikethrough"], ["color", "Text color"],
                        ["backgroundColor", "Background"], ["letterSpacing", "Letter spacing"],
                        ["lineHeight", "Line height"], ["textAlign", "Alignment"],
                        ["borderWidth", "Border width"], ["borderColor", "Border color"],
                        ["whiteSpace", "Wrap text"], ["transform", "Rotation"],
                      ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label={t("cssValue")}>
                    <input value={styleValue} onChange={(event) => setStyleValue(event.target.value)} disabled={!editableSelected || !selected.operations.includes("style")} placeholder="e.g. 16px, italic, underline" />
                  </Field>
                  <button className="button full" disabled={busy || !editableSelected || !selected.operations.includes("style") || !styleValue.trim()} onClick={() => void stage("style", { name: styleName, value: styleValue })}>{t("stage")}</button>
                </section>
                <section className="inspector-section">
                  <h4>{t("styleOrigin")}</h4>
                  {selected.styleOrigins.length ? (
                    selected.styleOrigins.map((origin, index) => (
                      <div className="origin-row" key={index}>
                        <div>
                          <code>{origin.property}</code>
                          <Badge>{origin.origin}</Badge>
                        </div>
                        <span>{origin.value}</span>
                        <small>
                          {origin.source.file}:{origin.source.line} ·{" "}
                          {origin.confidence} · {origin.scope}
                        </small>
                      </div>
                    ))
                  ) : (
                    <p className="muted small">{t("noStyle")}</p>
                  )}
                </section>
                <section className="inspector-section">
                  <h4>{t("inlineStyle")}</h4>
                  <Field label={t("cssProperty")}>
                    <input
                      value={styleName}
                      onChange={(e) => setStyleName(e.target.value)}
                      placeholder={t("stylePlaceholder")}
                      disabled={!editableSelected}
                    />
                  </Field>
                  <Field label={t("cssValue")}>
                    <input
                      value={styleValue}
                      onChange={(e) => setStyleValue(e.target.value)}
                      placeholder={t("valuePlaceholder")}
                      disabled={!editableSelected}
                    />
                  </Field>
                  <button
                    className="button full"
                    disabled={busy || !editableSelected}
                    onClick={() =>
                      void stage("style", {
                        name: styleName,
                        value: styleValue,
                      })
                    }
                  >
                    {t("stage")}
                  </button>
                  <p className="small muted">{t("pending")}</p>
                </section>
              </>
            )}
            {inspectorTab === "events" && (
              <section className="inspector-section">
                <h4>{t("events")}</h4>
                {selected.events.length ? (
                  selected.events.map((event) => (
                    <div className="event-row" key={event.name}>
                      <code>{event.name}</code>
                      <pre>{event.expression}</pre>
                      <small>{t("componentContract")}</small>
                    </div>
                  ))
                ) : (
                  <p className="muted small">{t("noEvents")}</p>
                )}
                <Field label={t("eventName")}>
                  <select
                    value={eventName}
                    onChange={(event) => {
                      const name = event.target.value;
                      setEventName(name);
                      const expression = selected.events.find(
                        (item) => item.name === name,
                      )?.expression;
                      setEventHandler(
                        expression && /^[A-Za-z_$][\w$]*$/.test(expression)
                          ? expression
                          : "",
                      );
                    }}
                    disabled={!editableSelected || !availableEvents.length}
                  >
                    {!availableEvents.length && <option value="">—</option>}
                    {availableEvents.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t("eventHandler")}>
                  <input
                    value={eventHandler}
                    list="event-handler-names"
                    placeholder="handleChange"
                    onChange={(event) => setEventHandler(event.target.value)}
                    disabled={!editableSelected}
                  />
                  <datalist id="event-handler-names">
                    {callableOptions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </Field>
                {!callableOptions.length && (
                  <p className="small muted">{t("noCallables")}</p>
                )}
                <p className="small muted">{t("eventContractHint")}</p>
                <button
                  className="button full"
                  disabled={
                    busy ||
                    !editableSelected ||
                    !eventName ||
                    !eventHandler
                  }
                  onClick={() =>
                    void stage("event", {
                      name: eventName,
                      value: eventHandler,
                    })
                  }
                >
                  {t("saveEvent")}
                </button>
                <button
                  className="button full"
                  disabled={busy || !editableSelected || !selected.events.some((event) => event.name === eventName && /^[A-Za-z_$][\w$]*$/.test(event.expression))}
                  onClick={() => {
                    if (window.confirm(t("removeEventConfirm")))
                      void stage("remove-event", { name: eventName });
                  }}
                >
                  {t("removeEvent")}
                </button>
                <p className="small muted">{t("methodHint")}</p>
              </section>
            )}
            {inspectorTab === "data" && (
              <section className="inspector-section">
                <h4>{t("behavior")}</h4>
                {selected.behavior.map((value) => (
                  <Badge key={value}>{value}</Badge>
                ))}
                <p className="muted small">{t("noData")}</p>
                <p className="small">
                  {selected.sourceOwnership} · {selected.references.knownCount}{" "}
                  {t("knownUsages")}
                </p>
              </section>
            )}
            {inspectorTab === "a11y" && (
              <section className="inspector-section">
                <h4>{t("a11y")}</h4>
                {selected.props
                  .filter(
                    (prop) =>
                      prop.name.startsWith("aria-") ||
                      ["role", "alt", "title", "tabIndex"].includes(prop.name),
                  )
                  .map((prop) => (
                    <div className="prop-row" key={prop.name}>
                      <code>{prop.name}</code>
                      <span>{String(prop.value || prop.expression)}</span>
                    </div>
                  ))}
                <p className="muted small">{t("codeOwned")}</p>
                <button
                  className="button full"
                  onClick={() => {
                    setInspectorTab("props");
                    setPropName("aria-label");
                    setPropValue("");
                  }}
                >
                  {t("props")} · aria-label
                </button>
              </section>
            )}
            {inspectorTab === "source" && (
              <section className="inspector-section">
                <h4>{t("sourceLocation")}</h4>
                <code className="wrap-code">
                  {selected.source.file}:{selected.source.line}:
                  {selected.source.column}
                </code>
                <button
                  className="button full"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(
                        `${report?.projectRoot}/${selected.source.file}:${selected.source.line}`,
                      )
                      .then(() => flash(t("copied")))
                  }
                >
                  {t("copy")}
                </button>
                <p className="small muted">{t("sourceWarning")}</p>
                <pre className="source-code">{source}</pre>
                <p className="small muted">{t("partialImpact")}</p>
              </section>
            )}
            {(["props", "layout"] as Key[]).includes(inspectorTab) && (
              <section className="inspector-section">
                <h4>{t("structure")}</h4>
                <div className="button-pair">
                  <button
                    className="button"
                    disabled={busy || !selected.operations.includes("move")}
                    onClick={() => void stage("move", { direction: "up" })}
                  >
                    ↑ {t("moveUp")}
                  </button>
                  <button
                    className="button"
                    disabled={busy || !selected.operations.includes("move")}
                    onClick={() => void stage("move", { direction: "down" })}
                  >
                    ↓ {t("moveDown")}
                  </button>
                </div>
                <div className="structure-divider" />
                <h4>{t("duplicateComponent")}</h4>
                {copiedElement && selected.id !== copiedElement.id && (
                  <button className="button full" disabled={busy || !selected.operations.includes("insert")} onClick={() => void editElement(copiedElement, "duplicate", { targetId: selected.id })}>
                    {t("pasteCopiedInside")}
                  </button>
                )}
                {duplicateCandidates.length ? (
                  <>
                    <Field label={t("identityProperty")}>
                      <select
                        value={duplicateIdentity}
                        onChange={(event) => {
                          setDuplicateIdentity(event.target.value);
                          const candidate = duplicateCandidates.find(
                            (item) => item.key === event.target.value,
                          );
                          if (candidate)
                            setDuplicateValue(
                              typeof candidate.value === "number"
                                ? String(candidate.value + 1)
                                : `${candidate.value}Copy`,
                            );
                        }}
                      >
                        {duplicateCandidates.map((candidate) => (
                          <option key={candidate.key} value={candidate.key}>
                            {candidate.tag}.{candidate.name} = {String(candidate.value)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t("newIdentityValue")}>
                      <input
                        value={duplicateValue}
                        onChange={(event) =>
                          setDuplicateValue(event.target.value)
                        }
                      />
                    </Field>
                    <button
                      className="button full"
                      disabled={busy || !selectedDuplicate || !duplicateValue}
                      onClick={() =>
                        selectedDuplicate &&
                        void stage("duplicate", {
                          duplicateProp: {
                            elementId: selectedDuplicate.elementId,
                            name: selectedDuplicate.name,
                            value:
                              typeof selectedDuplicate.value === "number"
                                ? Number(duplicateValue)
                                : duplicateValue,
                          },
                        })
                      }
                    >
                      <Icon name="copy" size={14} />
                      {t("duplicateNow")}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="small muted">{t("duplicateIdentityHint")}</p>
                    <button className="button full" disabled={busy || !selected.operations.includes("duplicate")} onClick={() => void stage("duplicate")}>
                      <Icon name="copy" size={14} /> {t("duplicateNow")}
                    </button>
                    <button className="button full" disabled={busy || !selected.operations.includes("duplicate")} onClick={() => { setCopiedElement(selected); flash(t("copiedSelectDestination")); }}>
                      <Icon name="copy" size={14} /> {t("copyToAnotherArea")}
                    </button>
                  </>
                )}
                <div className="structure-divider" />
                <h4>{t("insertPrimitive")}</h4>
                <Field label={t("insertTag")}>
                  <select
                    value={insertTag}
                    onChange={(e) => setInsertTag(e.target.value)}
                  >
                    {[
                      "div",
                      "section",
                      "p",
                      "h2",
                      "button",
                      "span",
                      "input",
                    ].map((tag) => (
                      <option key={tag}>{tag}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t("insertText")}>
                  <input
                    value={insertText}
                    onChange={(e) => setInsertText(e.target.value)}
                  />
                </Field>
                <div className="insert-config-grid">
                  <Field label={t("insertPropName")}>
                    <input
                      value={insertPropName}
                      placeholder="aria-label"
                      onChange={(e) => setInsertPropName(e.target.value)}
                    />
                  </Field>
                  <Field label={t("insertValueType")}>
                    <select
                      value={insertPropType}
                      onChange={(e) =>
                        setInsertPropType(
                          e.target.value as "string" | "number" | "boolean",
                        )
                      }
                    >
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                    </select>
                  </Field>
                </div>
                {insertPropType === "boolean" ? (
                  <Field label={t("insertPropValue")}>
                    <select
                      value={insertPropValue || "false"}
                      onChange={(e) => setInsertPropValue(e.target.value)}
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  </Field>
                ) : (
                  <Field label={t("insertPropValue")}>
                    <input
                      value={insertPropValue}
                      onChange={(e) => setInsertPropValue(e.target.value)}
                    />
                  </Field>
                )}
                <div className="insert-config-grid">
                  <Field label={t("insertEvent")}>
                    <select
                      value={insertEventName}
                      onChange={(e) => setInsertEventName(e.target.value)}
                    >
                      <option value="">{t("none")}</option>
                      <option value="onClick">onClick</option>
                      <option value="onChange">onChange</option>
                      <option value="onSubmit">onSubmit</option>
                      <option value="onBlur">onBlur</option>
                      <option value="onFocus">onFocus</option>
                    </select>
                  </Field>
                  <Field label={t("insertHandler")}>
                    <input
                      value={insertHandler}
                      placeholder="handleSave"
                      onChange={(e) => setInsertHandler(e.target.value)}
                    />
                  </Field>
                </div>
                <p className="small muted">{t("insertHandlerHint")}</p>
                <button
                  className="button full"
                  disabled={
                    busy ||
                    !selected.operations.includes("insert") ||
                    !insertConfigurationValid
                  }
                  onClick={() =>
                    void stage("insert", {
                      name: insertTag,
                      value: insertText,
                      position: "inside",
                      insertProps: insertPropName
                        ? [
                            {
                              name: insertPropName,
                              value: insertTypedValue,
                            },
                          ]
                        : undefined,
                      insertEvent:
                        insertEventName && insertHandler
                          ? {
                              name: insertEventName,
                              handler: insertHandler,
                            }
                          : undefined,
                    })
                  }
                >
                  <Icon name="plus" size={15} />
                  {t("insert")}
                </button>
                <button
                  className="button full danger-quiet"
                  disabled={busy || !selected.operations.includes("remove")}
                  onClick={() => removeSelectedElement(selected)}
                >
                  <Icon name="trash" size={15} />
                  {t("remove")}
                </button>
              </section>
            )}
          </div>
        )}
      </aside>
    );
  }
  return (
    <div
      className={`app ${screen === "studio" ? "workspace-app" : ""} ${screen === "report" ? "report-app" : ""}`}
    >
      {screen !== "studio" && screen !== "report" && commonHeader}
      {screen === "report" && (
        <Suspense fallback={<div className="rs-loading">{t("loadingHint")}</div>}>
          <ReportStudio
            token={session?.token ?? ""}
            language={language}
            context={reportReturn === "studio" ? "project" : "home"}
            onExit={() => setScreen(reportReturn)}
          />
        </Suspense>
      )}
      {screen === "home" && (
        <main className="home-page">
          <div className="home-intro">
            <div className="eyebrow">
              <span className="small-square" />
              {t("offline")} <span className="eyebrow-separator">/</span> React
              development
            </div>
            <h1>{t("tagline")}</h1>
            <p>{t("intro")}</p>
          </div>
          <button className="guide-front-card" onClick={openGuide}>
            <span className="guide-front-icon">
              <Icon name="help" size={24} />
            </span>
            <span className="guide-front-copy">
              <small>{t("guideFrontEyebrow")}</small>
              <strong>{t("guideFrontTitle")}</strong>
              <span>{t("guideFrontBody")}</span>
              <span className="guide-front-topics">
                <i>{t("guideFrontAnalyze")}</i>
                <i>{t("guideFrontDrag")}</i>
                <i>{t("guideFrontEvents")}</i>
                <i>{t("guideFrontSafety")}</i>
              </span>
            </span>
            <span className="guide-front-action">
              {t("readGuide")}
              <Icon name="arrow" size={16} />
            </span>
          </button>
          <div className="home-actions">
            <button
              className="action-card primary-card"
              onClick={() => {
                setScreen("wizard");
                setWizardStep(0);
              }}
            >
              <span className="action-icon">
                <Icon name="plus" size={24} />
              </span>
              <h2>{t("newProject")}</h2>
              <p>{t("newDescription")}</p>
              <span className="card-bottom">
                React + TypeScript <Icon name="arrow" />
              </span>
            </button>
            <button className="action-card" onClick={() => setScreen("open")}>
              <span className="action-icon">
                <Icon name="folder" size={24} />
              </span>
              <h2>{t("openProject")}</h2>
              <p>{t("openDescription")}</p>
              <span className="card-bottom">
                {t("staticInspection")} <Icon name="arrow" />
              </span>
            </button>
            <button
              className="action-card"
              onClick={() => {
                setReportReturn("home");
                setScreen("report");
              }}
            >
              <span className="action-icon">
                <Icon name="board" size={24} />
              </span>
              <h2>{t("reportStudio")}</h2>
              <p>{t("reportDescription")}</p>
              <span className="card-bottom">
                Native .report.json <Icon name="arrow" />
              </span>
            </button>
          </div>
          <section className="recent-section">
            <div className="section-header">
              <h2>{t("recent")}</h2>
              <span>{session?.recent?.length || 0}</span>
            </div>
            {session?.recent?.length ? (
              session.recent.map((item: any, index: number) => (
                <button
                  className="recent-row"
                  key={index}
                  onClick={() =>
                    void openProject(
                      typeof item === "string"
                        ? item
                        : item.path || item.projectRoot,
                    )
                  }
                >
                  <Icon name="folder" />
                  <span>
                    <strong>
                      {item.name ||
                        (typeof item === "string"
                          ? item.split("/").pop()
                          : (item.path || "").split("/").pop())}
                    </strong>
                    <small>
                      {typeof item === "string"
                        ? item
                        : item.path || item.projectRoot}
                    </small>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              ))
            ) : (
              <div className="recent-empty">
                <Icon name="folder" />
                <span>{t("noRecent")}</span>
              </div>
            )}
          </section>
          <div className="home-footer">
            <span>
              <i className="dot green" />
              {t("localNote")}
            </span>
            <button className="text-button" onClick={openGuide}>
              {t("help")} ↗
            </button>
          </div>
        </main>
      )}
      {screen === "open" && (
        <main className="setup-page">
          <button
            className="text-button back-link"
            onClick={() => setScreen("home")}
          >
            ← {t("home")}
          </button>
          <div className="setup-title">
            <span className="action-icon">
              <Icon name="folder" size={25} />
            </span>
            <h1>{t("openProject")}</h1>
            <p>{t("analysisIntro")}</p>
          </div>
          <div className="setup-card">
            <Field label={t("path")} hint={t("pathHint")}>
              <div className="input-with-button">
                <input
                  autoFocus
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder={session?.cwd || "/path/to/project"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && path) void openProject();
                  }}
                />
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void browse("open")}
                >
                  {t("browse")}
                </button>
              </div>
            </Field>
            <div className="notice">
              <Icon name="lock" />
              <span>
                {t("projectTrust")} {t("noPush")}
              </span>
            </div>
            <div className="setup-footer">
              <button className="button" onClick={() => setScreen("home")}>
                {t("cancel")}
              </button>
              <button
                className="button accent"
                disabled={busy || !path}
                onClick={() => void openProject()}
              >
                {busy ? t("loadingProject") : t("open")}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </div>
        </main>
      )}
      {screen === "wizard" && (
        <main className="setup-page wizard-page">
          <button
            className="text-button back-link"
            onClick={() => setScreen("home")}
          >
            ← {t("home")}
          </button>
          <div className="setup-title">
            <h1>{t("newProject")}</h1>
            <p>{t("createHint")}</p>
          </div>
          <div className="wizard-progress">
            {(["location", "framework", "styling", "review"] as Key[]).map(
              (step, index) => (
                <div
                  key={step}
                  className={
                    index === wizardStep
                      ? "current"
                      : index < wizardStep
                        ? "complete"
                        : ""
                  }
                >
                  <span>
                    {index < wizardStep ? (
                      <Icon name="check" size={14} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <strong>{t(step)}</strong>
                </div>
              ),
            )}
          </div>
          <div className="setup-card">
            {wizardStep === 0 && (
              <>
                <h2>{t("location")}</h2>
                <Field label={t("parentDirectory")}>
                  <div className="input-with-button">
                    <input
                      autoFocus
                      value={form.parentDirectory}
                      onChange={(e) =>
                        setForm({ ...form, parentDirectory: e.target.value })
                      }
                    />
                    <button
                      className="button"
                      onClick={() => void browse("create")}
                      disabled={busy}
                    >
                      {t("browse")}
                    </button>
                  </div>
                </Field>
                <Field label={t("projectName")}>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <div className="path-summary">
                  <span>{t("fullPath")}</span>
                  <code>
                    {form.parentDirectory.replace(/[\\/]$/, "")}/{form.name}
                  </code>
                </div>
              </>
            )}
            {wizardStep === 1 && (
              <>
                <h2>{t("framework")}</h2>
                <div className="choice-grid">
                  <button
                    className={`choice-card ${form.framework === "vite" ? "selected" : ""}`}
                    onClick={() => setForm({ ...form, framework: "vite" })}
                  >
                    <strong>Vite + React</strong>
                    <Badge tone="accent">TypeScript</Badge>
                    <p>{t("viteHint")}</p>
                  </button>
                  <button
                    className={`choice-card ${form.framework === "next" ? "selected" : ""}`}
                    disabled
                    title={t("unsupported")}
                  >
                    <strong>Next.js</strong>
                    <Badge>{t("limited")}</Badge>
                    <p>{t("nextHint")}</p>
                  </button>
                </div>
                <Field label={t("template")}>
                  <select
                    value={form.template}
                    onChange={(e) =>
                      setForm({ ...form, template: e.target.value })
                    }
                  >
                    <option value="blank">{t("blank")}</option>
                    <option value="dashboard">{t("dashboard")}</option>
                    <option value="form">{t("form")}</option>
                    <option value="operations">{t("console")}</option>
                  </select>
                </Field>
              </>
            )}
            {wizardStep === 2 && (
              <>
                <h2>{t("styling")}</h2>
                <Field label={t("styling")}>
                  <select
                    value={form.styling}
                    onChange={(e) =>
                      setForm({ ...form, styling: e.target.value })
                    }
                  >
                    <option value="css">{t("plain")}</option>
                    <option value="css-modules">{t("cssModules")}</option>
                    <option value="tailwind">{t("tailwind")}</option>
                  </select>
                </Field>
                <div className="notice">
                  <Icon name="layers" />
                  <div>
                    <strong>{t("primitives")}</strong>
                    <p>{t("createHint")}</p>
                  </div>
                </div>
              </>
            )}
            {wizardStep === 3 && (
              <>
                <h2>{t("creationPlan")}</h2>
                <div className="path-summary">
                  <span>{t("fullPath")}</span>
                  <code>
                    {plan?.targetDirectory ||
                      `${form.parentDirectory}/${form.name}`}
                  </code>
                </div>
                <dl className="detail-list">
                  <div>
                    <dt>{t("framework")}</dt>
                    <dd>{form.framework} · TypeScript</dd>
                  </div>
                  <div>
                    <dt>{t("template")}</dt>
                    <dd>{form.template}</dd>
                  </div>
                  <div>
                    <dt>{t("styling")}</dt>
                    <dd>{form.styling}</dd>
                  </div>
                  <div>
                    <dt>{t("dependencies")}</dt>
                    <dd>
                      {Object.keys(plan?.dependencies || {}).join(", ") ||
                        "react, react-dom"}
                    </dd>
                  </div>
                </dl>
                {plan?.files && (
                  <details>
                    <summary>
                      {plan.files.length} {t("files")}
                    </summary>
                    <pre className="file-plan">
                      {Array.isArray(plan.files)
                        ? plan.files
                            .map((file: any) =>
                              typeof file === "string" ? file : file.path,
                            )
                            .join("\n")
                        : JSON.stringify(plan.files, null, 2)}
                    </pre>
                  </details>
                )}
                <div className="notice">
                  <Icon name="lock" />
                  <div>
                    <strong>{t("filesOnly")}</strong>
                    <p>{t("noCommands")}</p>
                  </div>
                </div>
                {plan?.warnings?.map((warning: string, index: number) => (
                  <p className="small muted" key={index}>
                    {warning}
                  </p>
                ))}
              </>
            )}
            <div className="setup-footer">
              <button
                className="button"
                onClick={() =>
                  wizardStep ? setWizardStep(wizardStep - 1) : setScreen("home")
                }
              >
                {t("back")}
              </button>
              {wizardStep < 3 ? (
                <button
                  className="button accent"
                  disabled={busy || !form.name || !form.parentDirectory}
                  onClick={() => {
                    if (wizardStep === 2)
                      void act(async () => {
                        setPlan(await api("create/plan", form));
                        setWizardStep(3);
                      });
                    else setWizardStep(wizardStep + 1);
                  }}
                >
                  {t("next")}
                  <Icon name="arrow" size={16} />
                </button>
              ) : (
                <button
                  className="button accent"
                  disabled={busy}
                  onClick={() => void createProject()}
                >
                  {busy ? t("working") : t("create")}
                  <Icon name="check" size={16} />
                </button>
              )}
            </div>
          </div>
        </main>
      )}
      {screen === "analysis" && report && (
        <main className="analysis-page">
          <button
            className="text-button back-link"
            onClick={() => setScreen("home")}
          >
            ← {t("home")}
          </button>
          <div className="analysis-title">
            <div>
              <div className="eyebrow">{t("projectAnalysis")}</div>
              <h1>{report.name}</h1>
              <code>{report.projectRoot}</code>
              <p>{t("analysisIntro")}</p>
            </div>
            <Badge tone="green">
              <Icon name="lock" size={12} />
              {t("staticInspection")}
            </Badge>
          </div>
          <div className="analysis-card">
            {renderAnalysis()}
            <div className="analysis-actionbar">
              <div className="analysis-choice"><button className="button" onClick={() => setScreen("studio")}>
                {t("inspectOnly")}
                <Icon name="arrow" size={16} />
              </button><p>{t("inspectOnlyHint")}</p></div>
              <div className="analysis-choice"><button
                className="button accent"
                disabled={report.readiness.state === "UNSUPPORTED"}
                title={report.readiness.reason}
                onClick={() => {
                  setScreen("studio");
                  setModal("preview");
                }}
              >
                {report.readiness.state === "UNSUPPORTED"
                  ? t("unsupported")
                  : t("startPreview")}
                <Icon name="play" size={15} />
              </button><p>{t("startPreviewHint")}</p></div>
            </div>
          </div>
        </main>
      )}
      {screen === "studio" && report && (
        <>
          <header className="studio-header">
            <button
              className="brand"
              onClick={() => setModal("leave-project")}
              title={t("leaveWorkspace")}
            >
              <span className="brand-icon">
                <Icon name="code" size={20} />
              </span>
              <span>
                React <strong>UI/UX Tool</strong>
              </span>
            </button>
            <span className="header-divider" />
            <button
              className="project-switch"
              onClick={() => setScreen("analysis")}
            >
              <Icon name="folder" size={15} />
              <span>{report.name}</span>
              <span>⌄</span>
            </button>
            <div
              className="mode-control"
              role="tablist"
              aria-label="Editor mode"
            >
              {(["design", "interact", "code"] as const).map((value) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={mode === value}
                  className={mode === value ? "active" : ""}
                  onClick={() => setMode(value)}
                >
                  {t(value)}
                </button>
              ))}
            </div>
            <div className="header-end">
              {languageControl}
              {themeControl}
              <button
                className="icon-button"
                aria-label={t("help")}
                onClick={openGuide}
              >
                <Icon name="help" />
              </button>
            </div>
          </header>
          <div className="mobile-panel-controls" aria-label={t("workspacePanels")}>
            {(["canvas", "inspector"] as const).map((panel) => <button key={panel} className={mobilePanel === panel ? "active" : ""} aria-pressed={mobilePanel === panel} onClick={() => setMobilePanel(panel)}>{t(panel)}</button>)}
          </div>
          <div
            className={`workbench mobile-${mobilePanel}`}
            style={
              {
                "--left-width": `${panelWidths.left}px`,
                "--right-width": `${panelWidths.right}px`,
              } as React.CSSProperties
            }
          >
            <nav className="icon-rail" aria-label={t("project")}>
              <button
                className="rail-button rail-exit"
                title={t("leaveWorkspace")}
                aria-label={t("leaveWorkspace")}
                onClick={() => setModal("leave-project")}
              >
                <Icon name="exit" />
              </button>
              <span className="rail-divider" />
              {[
                ["pages", "file"],
                ["components", "layers"],
                ["boards", "board"],
              ].map(([name, icon]) => (
                <button
                  key={name}
                  className={`rail-button ${nav === name ? "active" : ""}`}
                  title={t(name as Key)}
                  aria-label={t(name as Key)}
                  onClick={() => {
                    setNav(name);
                    setMobilePanel("navigation");
                    if (name === "components") {
                      setLeftTab("components");
                      setMode("design");
                    }
                    if (name === "pages") setLeftTab("tree");
                  }}
                >
                  <Icon name={icon} />
                </button>
              ))}
              <button
                className="rail-button"
                title={t("reportStudio")}
                aria-label={t("reportStudio")}
                onClick={() => {
                  setReportReturn("studio");
                  setScreen("report");
                }}
              >
                <Icon name="file" />
              </button>
              <button
                className="rail-button rail-bottom"
                title={t("help")}
                aria-label={t("help")}
                onClick={openGuide}
              >
                <Icon name="help" />
              </button>
            </nav>
            <aside className="left-panel" style={{ width: panelWidths.left }}>
              <div className="panel-heading">
                <strong>{t(nav as Key)}</strong>
                {nav === "boards" ? (
                  <button
                    className="icon-button"
                    aria-label={t("newBoard")}
                    onClick={() => {
                      setBoardNaming("new");
                      setBoardName("New board");
                    }}
                  >
                    <Icon name="plus" size={16} />
                  </button>
                ) : (
                  <Badge>
                    {nav === "components"
                      ? report.components.length
                      : report.files.length}
                  </Badge>
                )}
              </div>
              {nav === "boards" ? (
                <div className="boards-list">
                  {boards.map((board) => (
                    <button
                      className={`board-item ${board.id === boardId ? "selected" : ""}`}
                      key={board.id}
                      onClick={() => setBoardId(board.id)}
                    >
                      <Icon name="board" size={16} />
                      <span>
                        {board.name}
                        <small>{board.scenario}</small>
                      </span>
                    </button>
                  ))}
                  <p className="small muted">
                    {isDemo ? t("boardHint") : t("boardUnavailable")}
                  </p>
                  {currentBoard && (
                    <>
                      <div className="button-pair">
                        <button
                          className="button"
                          onClick={() => {
                            const newId = crypto.randomUUID();
                            setBoards([
                              ...boards,
                              {
                                ...currentBoard,
                                id: newId,
                                name: currentBoard.name + " copy",
                              },
                            ]);
                            setBoardId(newId);
                          }}
                        >
                          {t("duplicate")}
                        </button>
                        <button
                          className="button"
                          onClick={() => {
                            setBoardNaming("rename");
                            setBoardName(currentBoard.name);
                          }}
                        >
                          {t("rename")}
                        </button>
                      </div>
                      <button
                        className="button full"
                        onClick={() => {
                          setBoardNaming("variant");
                          setBoardName(
                            (currentBoard?.name || "Board") + " variant",
                          );
                        }}
                      >
                        {t("addVariant")}
                      </button>
                      <button
                        className="button full danger-quiet"
                        onClick={() => {
                          if (window.confirm(t("deleteConfirm"))) {
                            const nextBoards = boards.filter(
                              (b) => b.id !== boardId,
                            );
                            setBoards(nextBoards);
                            setBoardId(nextBoards[0]?.id || "");
                          }
                        }}
                      >
                        {t("deleteBoard")}
                      </button>
                      <button
                        className="button full"
                        onClick={() => {
                          setBoards(
                            boards.map((b) =>
                              b.id === boardId
                                ? { ...b, scenario: "default" }
                                : b,
                            ),
                          );
                          setSelectedId(
                            report.elements.find((e) => e.tag === "button")
                              ?.id || null,
                          );
                          setInspectorTab("source");
                        }}
                      >
                        {t("viewSource")}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {nav === "pages" && (
                    <div
                      className="left-tabs"
                      role="tablist"
                      aria-label={t("pages")}
                    >
                      {(["tree", "files"] as const).map((tab) => (
                        <button
                          role="tab"
                          aria-selected={leftTab === tab}
                          key={tab}
                          className={leftTab === tab ? "active" : ""}
                          onClick={() => setLeftTab(tab)}
                        >
                          {t(tab)}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="search-wrap">
                    <Icon name="search" size={15} />
                    <input
                      aria-label={nav === "components" ? t("search") : t("sourceSearch")}
                      placeholder={nav === "components" ? t("search") : t("sourceSearch")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <span>⌕</span>
                  </div>
                  {nav === "pages" && leftTab === "files" ? (
                    <div className="file-list">
                      {report.files
                        .filter((file) =>
                          file.file
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((file) => (
                          <button
                            key={file.file}
                            className="file-item"
                            onClick={() => openSourceFile(file.file)}
                          >
                            <Icon name="file" size={14} />
                            <span>{file.file}</span>
                          </button>
                        ))}
                    </div>
                  ) : (
                    <>
                      {nav === "components" && (
                        <div className="component-palette">
                          <details className="style-presets">
                            <summary className="list-section-label">{t("stylePresets")}</summary>
                            <div className="style-preset-chips">
                              {(
                                [
                                  "heading",
                                  "body",
                                  "muted",
                                  "accent",
                                  "card",
                                  "danger",
                                ] as const
                              ).map((preset) => (
                                <button
                                  key={preset}
                                  disabled={
                                    busy ||
                                    !selected ||
                                    !selected.operations.includes("style")
                                  }
                                  title={t("stylePresetHint")}
                                  onClick={() => applyStylePreset(preset)}
                                >
                                  {t(`preset_${preset}` as Key)}
                                </button>
                              ))}
                            </div>
                          </details>
                          <div
                            className={`component-drop-target ${selected?.operations.includes("insert") ? "ready" : ""}`}
                            onDragOver={(event) => {
                              if (selected?.operations.includes("insert"))
                                event.preventDefault();
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (!selected?.operations.includes("insert")) return;
                              const tag = event.dataTransfer.getData("uiux/tag");
                              const componentId = event.dataTransfer.getData(
                                "uiux/component",
                              );
                              const component = report.components.find(
                                (candidate) => candidate.id === componentId,
                              );
                              if (component)
                                stageDroppedComponent(selected, component);
                              else if (tag) stageDroppedElement(selected, tag);
                            }}
                          >
                            <Icon name="plus" size={16} />
                            <div>
                              <strong>{t("selectedInsertTarget")}</strong>
                              {pendingInsert ? (
                                <>
                                  <code>
                                    {t("addingComponent")} {pendingInsert}…
                                  </code>
                                  <span>{t("addingComponentHint")}</span>
                                </>
                              ) : selected?.operations.includes("insert") ? (
                                <>
                                  <code>{selected.tag}</code>
                                  <small>
                                    {selected.source.file}:{selected.source.line}
                                  </small>
                                  <span>{t("dropComponentHere")}</span>
                                </>
                              ) : (
                                <span>
                                  {selected
                                    ? t("unsupportedInsertTarget")
                                    : t("chooseInsertTarget")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="list-section-label">
                            {t("projectComponents")} {" "}
                            <span>{projectCatalog.length}</span>
                          </div>
                          <p className="catalog-hint">
                            {t("reusableComponentsHint")}
                          </p>
                          <div className="project-component-list">
                            {projectCatalog.length ? (
                              projectCatalog.map((component) => (
                                <button
                                  key={component.id}
                                  draggable
                                  onDragStart={(event) => {
                                    setDraggingPalette(true);
                                    event.dataTransfer.setData(
                                      "uiux/component",
                                      component.id,
                                    );
                                    event.dataTransfer.setData(
                                      "text/plain",
                                      JSON.stringify({
                                        kind: "component",
                                        value: component.id,
                                      }),
                                    );
                                    event.dataTransfer.effectAllowed = "copy";
                                  }}
                                  onDragEnd={() => setDraggingPalette(false)}
                                  onClick={() => {
                                    if (
                                      selected?.operations.includes("insert")
                                    )
                                      stageDroppedComponent(
                                        selected,
                                        component,
                                      );
                                    else setError(t("simpleDropError"));
                                  }}
                                  title={`${component.source.file} · ${t("dragWritesDirectly")}`}
                                >
                                  <Icon
                                    name={componentPaletteIcon(component.name)}
                                    size={16}
                                  />
                                  <span>{component.name}</span>
                                  <small>
                                    {component.props.length}P · {component.events.length}E
                                  </small>
                                </button>
                              ))
                            ) : (
                              <p className="primitive-hint">
                                {t("noProjectComponents")}
                              </p>
                            )}
                          </div>
                          <div className="list-section-label">
                            {t("primitives")}
                          </div>
                          <div className="primitive-grid">
                            {PRIMITIVE_PALETTE.map((item) => (
                              <button
                                key={item.tag}
                                draggable
                                onDragStart={(event) => {
                                  setDraggingPalette(true);
                                  event.dataTransfer.setData(
                                    "uiux/tag",
                                    item.tag,
                                  );
                                  event.dataTransfer.setData(
                                    "text/plain",
                                    JSON.stringify({
                                      kind: "tag",
                                      value: item.tag,
                                    }),
                                  );
                                  event.dataTransfer.effectAllowed = "copy";
                                }}
                                onDragEnd={() => setDraggingPalette(false)}
                                onClick={() => {
                                  if (selected?.operations.includes("insert"))
                                    stageDroppedElement(selected, item.tag);
                                  else setError(t("simpleDropError"));
                                }}
                                title={`${t(item.label)} · ${t("dragWritesDirectly")}`}
                              >
                                <span className="primitive-icon">
                                  <Icon name={item.icon} size={17} />
                                </span>
                                <span>{t(item.label)}</span>
                              </button>
                            ))}
                          </div>
                          <p className="primitive-hint">
                            {t("dragWritesDirectly")}
                          </p>
                        </div>
                      )}
                      {nav === "pages" && leftTab === "tree" && (
                        <>
                          <div className="list-section-label">
                            {t("sourceTree")} <span>{report.files.length}</span>
                          </div>
                          {sourceExplorer}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </aside>
            <div
              className="resize-handle"
              role="separator"
              tabIndex={0}
              aria-label={t("resize")}
              aria-orientation="vertical"
              aria-valuenow={panelWidths.left}
              onPointerDown={(event) => resizeStart(event, "left")}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") resizePanel("left", 10);
                if (event.key === "ArrowLeft") resizePanel("left", -10);
              }}
            />
            <section className="canvas-panel">
              <div className="canvas-toolbar">
                <div className="route-control">
                  <Icon name={nav === "boards" ? "board" : "globe"} size={15} />
                  {nav === "boards" ? (
                    <span>{currentBoard?.name || t("boards")}</span>
                  ) : (
                    <select
                      aria-label={t("selectRoute")}
                      value={route}
                      onChange={(e) => setRoute(e.target.value)}
                    >
                      {[
                        ...new Set(["/", ...report.routes.map((r) => r.path)]),
                      ].map((path) => (
                        <option key={path}>{path}</option>
                      ))}
                    </select>
                  )}
                  <Badge tone={previewState === "ready" ? "green" : "neutral"}>
                    {!preview
                      ? t("staticInspection")
                      : previewState === "ready"
                        ? "Live"
                        : previewState === "error"
                          ? t("error")
                          : t("working")}
                  </Badge>
                </div>
                <div className="canvas-actions">
                  {designTarget && (
                    <button
                      className="button small-button"
                      onClick={() =>
                        void act(async () => {
                          await api("preview/design", {
                            approved: true,
                            clear: true,
                          });
                          setDesignTarget(null);
                          setPreviewState("starting");
                        })
                      }
                    >
                      {t("appPreview")}
                    </button>
                  )}
                  <button
                    className="icon-button"
                    title={t("undoHint")}
                    aria-label={t("undo")}
                    disabled={busy || !checkpoint}
                    onClick={() => void undo()}
                  >
                    <Icon name="undo" size={16} />
                  </button>
                </div>
              </div>
              <div className="viewport-toolbar">
                <div className="viewport-controls">
                  <Icon name="desktop" size={14} />
                  <select
                    value={viewport}
                    aria-label={t("viewport")}
                    onChange={(e) => setViewport(e.target.value)}
                  >
                    <option value="desktop">{t("desktop")}</option>
                    <option value="tablet">{t("tablet")} · 768</option>
                    <option value="mobile">{t("mobile")} · 390</option>
                  </select>
                  <span className="toolbar-line" />
                  <button
                    className="mini-button"
                    onClick={() => setZoom(Math.max(40, zoom - 10))}
                    aria-label="Zoom out"
                  >
                    −
                  </button>
                  <span className="zoom-label">{zoom}%</span>
                  <button
                    className="mini-button"
                    onClick={() => setZoom(Math.min(150, zoom + 10))}
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                </div>
                <div className="canvas-actions">
                  {preview && (
                    <button
                      className="icon-button"
                      title={t("refresh")}
                      aria-label={t("refresh")}
                      onClick={() => {
                        if (frame.current) {
                          setPreviewState("starting");
                          frame.current.src = frame.current.src;
                        }
                      }}
                    >
                      <Icon name="refresh" size={14} />
                    </button>
                  )}
                  <button
                    className="text-button small"
                    disabled={
                      !preview && report.readiness.state === "UNSUPPORTED"
                    }
                    title={report.readiness.reason}
                    onClick={() => setModal("preview")}
                  >
                    {preview
                      ? t("configurePreview")
                      : report.readiness.state === "UNSUPPORTED"
                        ? t("unsupported")
                        : t("startPreview")}{" "}
                    ↗
                  </button>
                </div>
              </div>
              {mode === "interact" && (
                <div className="interact-banner">△ {t("interactWarning")}</div>
              )}
              {sourceChanged && (
                <div className="conflict-banner">
                  {t("conflict")}
                  <button
                    onClick={() =>
                      void act(async () =>
                        applyReport(await api("analyze", {})),
                      )
                    }
                  >
                    {t("rescan")}
                  </button>
                </div>
              )}
              {projectSwitched && <div className="conflict-banner" role="alert">{t("projectSwitched")}</div>}
              {watchingIncomplete && <div className="conflict-banner" role="status">{t("watchingIncomplete")}</div>}
              {preview && report.detected.styling.includes("tailwind") && <div className="conflict-banner" role="status">{t("previewStylingWarning")}</div>}
              {nav === "boards" && isDemo && (
                <div className="scenario-toolbar">
                  <span>{t("scenario")}</span>
                  <select
                    aria-label={t("scenario")}
                    value={currentBoard?.scenario || "default"}
                    onChange={(e) =>
                      setBoards(
                        boards.map((b) =>
                          b.id === boardId
                            ? { ...b, scenario: e.target.value }
                            : b,
                        ),
                      )
                    }
                  >
                    {["default", "loading", "error"].map((value) => (
                      <option key={value} value={value}>
                        {t(value as Key)}
                      </option>
                    ))}
                  </select>
                  <Badge>{t("boardOnly")}</Badge>
                  <button
                    className="text-button"
                    onClick={() =>
                      setBoards(
                        boards.map((b) =>
                          b.id === boardId ? { ...b, scenario: "default" } : b,
                        ),
                      )
                    }
                  >
                    {t("restore")}
                  </button>
                </div>
              )}
              <div
                className={`canvas-area ${mode === "code" ? "code-area" : ""}`}
              >
                {mode === "code" ? (
                  <div className="canvas-source">
                    <div className="source-file-label">
                      <Icon name="file" size={15} />
                      {selected?.source.file || t("sourceReadOnly")}
                    </div>
                    {codeSearchOpen && <div className="code-find" role="search">
                      <input ref={codeSearchInput} aria-label={t("findInCode")} placeholder={t("findInCode")} value={codeSearch} onChange={(event) => setCodeSearch(event.target.value)} onKeyDown={(event) => {
                        if (event.key === "Escape") { setCodeSearchOpen(false); event.stopPropagation(); }
                        if (event.key === "Enter" && codeMatches.length) { event.preventDefault(); setCodeMatch((current) => (current + (event.shiftKey ? -1 : 1) + codeMatches.length) % codeMatches.length); }
                      }} />
                      <span aria-live="polite">{codeMatches.length ? `${codeMatch + 1}/${codeMatches.length}${codeMatches.length === 2000 ? "+" : ""}` : `0/0`}</span>
                      <button className="button" aria-label={t("previousMatch")} disabled={!codeMatches.length} onClick={() => setCodeMatch((current) => (current - 1 + codeMatches.length) % codeMatches.length)}>↑</button>
                      <button className="button" aria-label={t("nextMatch")} disabled={!codeMatches.length} onClick={() => setCodeMatch((current) => (current + 1) % codeMatches.length)}>↓</button>
                      <button className="button" aria-label={t("closeSearch")} onClick={() => setCodeSearchOpen(false)}>×</button>
                    </div>}
                    <pre ref={codeSource}>{codeMatches.length ? <>{codeMatches.map((start, index) => <span key={start}>{source.slice(index ? codeMatches[index - 1] + codeSearch.length : 0, start)}<mark data-current-match={index === codeMatch}>{source.slice(start, start + codeSearch.length)}</mark></span>)}{source.slice(codeMatches[codeMatches.length - 1] + codeSearch.length)}</> : source || t("selectHint")}</pre>
                  </div>
                ) : preview && (nav !== "boards" || isDemo) ? (
                  <div
                    className={`frame-shell ${viewport}`}
                    aria-busy={previewState === "starting"}
                    style={{
                      width:
                        viewport === "mobile"
                          ? 390
                          : viewport === "tablet"
                            ? 768
                            : "100%",
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: "top center",
                    }}
                  >
                    {previewState === "starting" && <div className="canvas-loading" role="status">{t("working")}</div>}
                    {draggingPalette && (
                      <div
                        className="canvas-drop-overlay"
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={dropPaletteOnCanvas}
                      >
                        <Icon name="plus" size={28} />
                        <strong>{t("releaseToAdd")}</strong>
                        <span>
                          {selected?.tag
                            ? `${t("addInside")} ${selected.tag}`
                            : t("simpleDropError")}
                        </span>
                      </div>
                    )}
                    <iframe
                      ref={frame}
                      src={frameSrc}
                      style={{ visibility: previewState === "starting" ? "hidden" : undefined }}
                      title={t("preview")}
                      onLoad={sendMode}
                      sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-downloads"
                    />
                  </div>
                ) : (
                  <div className="canvas-empty">
                    <div className="canvas-empty-icon">
                      <Icon
                        name={nav === "boards" ? "board" : "layers"}
                        size={32}
                      />
                    </div>
                    <h2>
                      {nav === "boards" ? t("boards") : t("previewMissing")}
                    </h2>
                    <p>
                      {nav === "boards"
                        ? t("boardUnavailable")
                        : report.readiness.state === "UNSUPPORTED"
                          ? t("previewUnavailable")
                          : t("previewHint")}
                    </p>
                    {nav !== "boards" && (
                      <button
                        className="button accent"
                        disabled={report.readiness.state === "UNSUPPORTED"}
                        title={report.readiness.reason}
                        onClick={() => setModal("preview")}
                      >
                        <Icon name="play" size={15} />
                        {report.readiness.state === "UNSUPPORTED"
                          ? t("unsupported")
                          : t("startPreview")}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="canvas-breadcrumb">
                <span>
                  <Icon
                    name={mode === "interact" ? "play" : "code"}
                    size={13}
                  />
                  {t(mode)}
                </span>
                <span className="breadcrumb-path">
                  {selected
                    ? `${selected.ownerComponent || report.name} › ${selected.tag}`
                    : report.name}
                </span>
                <span className="canvas-dimensions">
                  {viewport === "mobile"
                    ? "390"
                    : viewport === "tablet"
                      ? "768"
                      : "Auto"}{" "}
                  × {t("viewport")}
                </span>
              </div>
            </section>
            <div
              className="resize-handle"
              role="separator"
              tabIndex={0}
              aria-label={t("resize")}
              aria-orientation="vertical"
              aria-valuenow={panelWidths.right}
              onPointerDown={(event) => resizeStart(event, "right")}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") resizePanel("right", -10);
                if (event.key === "ArrowLeft") resizePanel("right", 10);
              }}
            />
            {renderInspector()}
          </div>
          <section className={`bottom-panel ${bottomOpen ? "expanded" : ""}`}>
            <div className="bottom-toolbar">
              <div role="tablist" aria-label={t("analysis")}>
                {(
                  [
                    "analysis",
                    "problems",
                    "changes",
                    "logs",
                    "scenarios",
                  ] as Key[]
                ).map((tab) => (
                  <button
                    role="tab"
                    aria-selected={bottomTab === tab && bottomOpen}
                    className={bottomTab === tab && bottomOpen ? "active" : ""}
                    key={tab}
                    onClick={() => {
                      setBottomTab(tab);
                      setBottomOpen(true);
                    }}
                  >
                    {t(tab)}
                    {tab === "changes" && patch && (
                      <span className="tab-count">1</span>
                    )}
                    {tab === "problems" && report.warnings.length > 0 && (
                      <span className="tab-count neutral">
                        {report.warnings.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="bottom-actions">
                {patch && (
                  <>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void discard()}
                    >
                      {t("discard")}
                    </button>
                    <button
                      className="button accent small-button"
                      onClick={() => setModal("review")}
                    >
                      {t("reviewChanges")}
                    </button>
                  </>
                )}
                <button
                  className="icon-button"
                  aria-label={t(bottomOpen ? "collapse" : "expand")}
                  onClick={() => setBottomOpen(!bottomOpen)}
                >
                  <span className={bottomOpen ? "rotate-chevron" : ""}>⌃</span>
                </button>
              </div>
            </div>
            {bottomOpen && (
              <div className="bottom-content">
                {bottomTab === "analysis" && renderAnalysis(true)}
                {bottomTab === "changes" && renderDiff()}
                {bottomTab === "problems" && (
                  <div className="problem-list">
                    {report.warnings.length ? (
                      report.warnings.map((warning, index) => (
                        <p key={index}>
                          <span>△</span>
                          {evidence(warning)}
                        </p>
                      ))
                    ) : (
                      <p className="muted">{t("noWarnings")}</p>
                    )}
                  </div>
                )}
                {bottomTab === "logs" && (
                  <pre className="console-output">
                    {logs.length ? logs.join("\n") : t("noOutput")}
                  </pre>
                )}
                {bottomTab === "scenarios" && (
                  <div className="scenarios-panel">
                    <Icon name="board" size={22} />
                    <div>
                      <strong>{t("boards")}</strong>
                      <p>{isDemo ? t("boardHint") : t("boardUnavailable")}</p>
                    </div>
                    <button className="button" onClick={() => setNav("boards")}>
                      {t("boards")} →
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
          <footer className="statusbar">
            <span>
              <i className={`dot ${patch ? "amber" : "green"}`} />
              {busy ? t("working") : patch ? t("modified") : t("ready")}
            </span>
            <span>
              {report.detected.framework} · {report.coverage.filesInspected}{" "}
              {t("scanned")}
            </span>
            <span className="statusbar-end">{t("noPush")}</span>
          </footer>
        </>
      )}
      {modal === "leave-project" && (
        <Modal
          closeLabel={t("close")}
          title={t("leaveWorkspaceTitle")}
          onClose={() => setModal(null)}
        >
          <p>{t("leaveWorkspaceMessage")}</p>
          <p className="small muted">{t("leaveWorkspaceHint")}</p>
          {preview && <p className="small muted">{t("leavePreviewHint")}</p>}
          <div className="modal-footer">
            <button className="button" onClick={() => setModal(null)}>
              {t("stayInWorkspace")}
            </button>
            <button className="button accent" disabled={busy} onClick={() => {
              setModal(null);
              setScreen("home");
            }}>
              {t("leaveWorkspace")}
            </button>
          </div>
        </Modal>
      )}
      {modal === "language" && (
        <Modal
          closeLabel={t("close")}
          title={t("chooseLanguage")}
          onClose={() => {
            localStorage.setItem("uiux-language", language);
            setModal(null);
          }}
        >
          <p className="muted">{t("firstLanguage")}</p>
          <div className="language-options">
            <button
              className={`language-option ${language === "en" ? "selected" : ""}`}
              onClick={() => switchLanguage("en")}
            >
              <strong>English</strong>
              <span>Build visually. Keep your source.</span>
            </button>
            <button
              className={`language-option ${language === "id" ? "selected" : ""}`}
              onClick={() => switchLanguage("id")}
            >
              <strong>Bahasa Indonesia</strong>
              <span>Bangun visual, kendalikan source code.</span>
            </button>
          </div>
          <p className="small muted">{t("languageHint")}</p>
          <div className="modal-footer">
            <button
              className="button accent"
              onClick={() => {
                localStorage.setItem("uiux-language", language);
                setModal(null);
              }}
            >
              {t("continue")}
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </Modal>
      )}
      {modal === "preview" && (
        <Modal
          closeLabel={t("close")}
          title={t("previewApproval")}
          onClose={() => setModal(null)}
        >
          <div className="notice warning">
            <span>△</span>
            <p>{t("previewRisk")}</p>
          </div>
          <dl className="detail-list preview-details">
            <div>
              <dt>{t("path")}</dt>
              <dd>
                <code>{report?.projectRoot}</code>
              </dd>
            </div>
            <div>
              <dt>{t("command")}</dt>
              <dd>
                <code>
                  {report?.detected.framework === "nextjs"
                    ? "Next.js adapter unavailable"
                    : "Controlled Vite preview adapter"}
                </code>
              </dd>
            </div>
          </dl>
          <p className="small muted">{t("safePreview")}</p>
          {preview?.warnings?.map((warning, index) => (
            <p key={index} className="small muted">
              {warning}
            </p>
          ))}
          <div className="modal-footer">
            {preview && (
              <button
                className="button danger-quiet"
                onClick={() =>
                  void act(async () => {
                    await api("preview/stop", {});
                    setPreview(null);
                    setDesignTarget(null);
                    setPreviewState("stopped");
                    setModal(null);
                    flash(t("stopped"));
                  })
                }
              >
                <Icon name="stop" size={15} />
                {t("cancelPreview")}
              </button>
            )}
            <button className="button" onClick={() => setModal(null)}>
              {t("cancel")}
            </button>
            <button
              className="button accent"
              disabled={busy || report?.readiness.state === "UNSUPPORTED"}
              title={report?.readiness.reason}
              onClick={() => void act(startApprovedPreview)}
            >
              <Icon name="play" size={15} />
              {busy
                ? t("working")
                : report?.readiness.state === "UNSUPPORTED"
                  ? t("unsupported")
                  : t("approvePreview")}
            </button>
          </div>
        </Modal>
      )}
      {modal === "review" && (
        <Modal
          closeLabel={t("close")}
          title={t("reviewChanges")}
          onClose={() => setModal(null)}
          wide
        >
          {renderDiff()}
          <div className="modal-footer">
            <button className="button" onClick={() => setModal(null)}>
              {t("backDesign")}
            </button>
            {patch && (
              <>
                <button
                  className="button danger-quiet"
                  disabled={busy}
                  onClick={() => void discard()}
                >
                  {t("discard")}
                </button>
                <button
                  className="button accent"
                  disabled={busy || sourceChanged}
                  onClick={() => void apply()}
                >
                  <Icon name="check" size={16} />
                  {busy ? t("working") : t("apply")}
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
      {modal === "guide" && (
        <Modal
          closeLabel={t("close")}
          title={t("interactiveGuide")}
          onClose={() => setModal(null)}
          wide
        >
          <div className="guide-layout">
            <nav className="guide-steps" aria-label={t("interactiveGuide")}>
              {guideSteps.map((item, index) => (
                <button
                  key={item.title}
                  className={guideStep === index ? "active" : ""}
                  aria-current={guideStep === index ? "step" : undefined}
                  onClick={() => setGuideStep(index)}
                >
                  <span>{index + 1}</span>
                  {item.title}
                </button>
              ))}
            </nav>
            <section className="guide-content">
              <div className="guide-illustration">
                <Icon name={guideSteps[guideStep].icon} size={32} />
              </div>
              <span className="guide-progress">
                {t("step")} {guideStep + 1} / {guideSteps.length}
              </span>
              <h3>{guideSteps[guideStep].title}</h3>
              <p>{guideSteps[guideStep].body}</p>
              {guideStep === 0 && (
                <div
                  className="guide-workflow"
                  aria-label={t("guideWorkflowLabel")}
                >
                  {[
                    ["folder", "guideWorkflowOpen"],
                    ["search", "guideWorkflowAnalyze"],
                    ["desktop", "guideWorkflowPreview"],
                    ["board", "guideWorkflowEdit"],
                    ["check", "guideWorkflowReview"],
                  ].map(([icon, label], index) => (
                    <div className="guide-workflow-step" key={label}>
                      <span>
                        <Icon name={icon} size={17} />
                      </span>
                      <strong>{t(label as Key)}</strong>
                      {index < 4 && <i aria-hidden="true">→</i>}
                    </div>
                  ))}
                </div>
              )}
              {!!guideSteps[guideStep].bullets.length && (
                <ul className="guide-bullets">
                  {guideSteps[guideStep].bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
              {guideStep === 0 ? (
                <div className="guide-choices">
                  <button
                    className="button"
                    onClick={() => {
                      setModal(null);
                      setScreen("open");
                    }}
                  >
                    <Icon name="folder" size={15} />
                    {t("openProject")}
                  </button>
                  <button
                    className="button"
                    onClick={() => {
                      setModal(null);
                      setScreen("wizard");
                      setWizardStep(0);
                    }}
                  >
                    <Icon name="plus" size={15} />
                    {t("newProject")}
                  </button>
                </div>
              ) : (
                report && (
                  <button
                    className="button guide-context-action"
                    onClick={() => {
                      const action = guideSteps[guideStep].action;
                      setModal(null);
                      if (action === "analysis") {
                        setScreen("analysis");
                        return;
                      }
                      setScreen("studio");
                      if (action === "pages" || action === "tree") {
                        setNav("pages");
                        setLeftTab("tree");
                      } else if (action === "preview") {
                        setModal("preview");
                      } else if (action === "components") {
                        setNav("components");
                        setLeftTab("components");
                      } else if (action === "props" || action === "duplicate") {
                        setInspectorTab("props");
                      } else if (action === "events") {
                        setInspectorTab("events");
                      } else if (action === "layout") {
                        setInspectorTab("layout");
                      } else if (action === "direct") {
                        setBottomOpen(true);
                        setBottomTab("problems");
                      } else if (action === "review") {
                        setBottomOpen(true);
                        setBottomTab("changes");
                      }
                    }}
                  >
                    {t("startExploring")}
                    <Icon name="arrow" size={15} />
                  </button>
                )
              )}
            </section>
          </div>
          <div className="modal-footer guide-footer">
            <button className="button" onClick={() => setModal("about")}>
              {t("aboutTool")}
            </button>
            <button
              className="button"
              disabled={guideStep === 0}
              onClick={() => setGuideStep((step) => Math.max(0, step - 1))}
            >
              {t("previous")}
            </button>
            <button
              className="button accent"
              onClick={() => {
                if (guideStep === guideSteps.length - 1) setModal(null);
                else setGuideStep((step) => step + 1);
              }}
            >
              {guideStep === guideSteps.length - 1 ? t("finish") : t("next")}
            </button>
          </div>
        </Modal>
      )}
      {modal === "about" && (
        <Modal
          closeLabel={t("close")}
          title={t("about")}
          onClose={() => setModal(null)}
        >
          <div className="about-brand">
            <span className="brand-icon">
              <Icon name="code" size={24} />
            </span>
            <div>
              <h3>React UI/UX Tool</h3>
              <span>{t("createdBy")}</span>
            </div>
          </div>
          <p>{t("aboutDescription")}</p>
          <dl className="detail-list">
            <div>
              <dt>{t("version")}</dt>
              <dd>{session?.version || "0.1.0"}</dd>
            </div>
            <div>
              <dt>{t("license")}</dt>
              <dd>MIT © 2026 RA</dd>
            </div>
            <div>
              <dt>Origin</dt>
              <dd>
                <code>RA::react-uiux-tool::2026</code>
              </dd>
            </div>
          </dl>
          <p className="small muted">{t("licenseEthics")}</p>
          <div className="guide-links">
            <a className="button" href="/LICENSE" target="_blank" rel="noreferrer">
              {t("license")}
            </a>
            <a
              className="button"
              href="/THIRD_PARTY_NOTICES.md"
              target="_blank"
              rel="noreferrer"
            >
              {t("thirdPartyNotices")}
            </a>
            <a
              className="button"
              href="/INSPIRATION.md"
              target="_blank"
              rel="noreferrer"
            >
              {t("inspirationCredits")}
            </a>
          </div>
          <h3>{t("shortcuts")}</h3>
          <dl className="detail-list">
            <div>
              <dt>{t("shortcutUndo")}</dt>
              <dd>
                <kbd>⌘/Ctrl</kbd> + <kbd>Z</kbd>
              </dd>
            </div>
            <div>
              <dt>{t("shortcutDelete")}</dt>
              <dd>
                <kbd>Delete</kbd> / <kbd>Backspace</kbd>
              </dd>
            </div>
            <div>
              <dt>{t("shortcutMulti")}</dt>
              <dd>
                <kbd>⌘/Ctrl</kbd> + <kbd>Click</kbd>
              </dd>
            </div>
            <div>
              <dt>{t("shortcutMove")}</dt>
              <dd>
                <kbd>Arrow</kbd> / <kbd>⌘/Ctrl</kbd> + <kbd>Arrow</kbd>
              </dd>
            </div>
            <div>
              <dt>{t("shortcutEscape")}</dt>
              <dd>
                <kbd>Esc</kbd>
              </dd>
            </div>
          </dl>
          <div className="guide-links">
            <button
              className="button accent"
              onClick={() => {
                setGuideStep(0);
                setModal("guide");
              }}
            >
              <Icon name="play" size={15} />
              {t("interactiveGuide")}
            </button>
          </div>
          <p className="small muted">{t("localNote")}</p>
          <div className="modal-footer">
            <button className="button accent" onClick={() => setModal(null)}>
              {t("close")}
            </button>
          </div>
        </Modal>
      )}
      {boardNaming && (
        <Modal
          closeLabel={t("close")}
          title={t(
            boardNaming === "new"
              ? "newBoard"
              : boardNaming === "variant"
                ? "addVariant"
                : "rename",
          )}
          onClose={() => setBoardNaming(null)}
        >
          <Field label={t("boardName")}>
            <input
              autoFocus
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
            />
          </Field>
          <p className="small muted">
            {t("boardOnly")} · {t("boardHint")}
          </p>
          <div className="modal-footer">
            <button className="button" onClick={() => setBoardNaming(null)}>
              {t("cancel")}
            </button>
            <button
              className="button accent"
              disabled={!boardName.trim()}
              onClick={() => {
                if (boardNaming === "rename") {
                  setBoards(
                    boards.map((b) =>
                      b.id === boardId ? { ...b, name: boardName } : b,
                    ),
                  );
                } else {
                  const newId = crypto.randomUUID();
                  setBoards([
                    ...boards,
                    {
                      id: newId,
                      name: boardName,
                      scenario: currentBoard?.scenario || "default",
                    },
                  ]);
                  setBoardId(newId);
                }
                setBoardNaming(null);
              }}
            >
              {t("save")}
            </button>
          </div>
        </Modal>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>△</span>
          <div>
            <strong>{t("error")}</strong>
            <p>{error}</p>
          </div>
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label={t("close")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={17} />
          {toast}
        </div>
      )}
      {busy && (
        <div
          className="loading-line"
          role="progressbar"
          aria-label={t("working")}
        />
      )}
    </div>
  );
}
