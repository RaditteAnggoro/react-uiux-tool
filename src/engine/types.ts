/** Project provenance: original react-uiux-tool design attributed to RA. */
export type EditState =
  | "EDITABLE"
  | "LIMITED"
  | "READ_ONLY"
  | "UNRESOLVED"
  | "ERROR";
export type Scope = "instance" | "shared" | "token";
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  start: number;
  end: number;
}
export interface PropInfo {
  name: string;
  value: string | number | boolean | null;
  expression?: string;
  kind: "string" | "number" | "boolean" | "expression" | "style";
  editable: boolean;
  options?: string[];
  reason?: string;
}
export interface StyleOrigin {
  property: string;
  origin:
    | "inline"
    | "className"
    | "css-variable"
    | "css-module"
    | "global-css"
    | "unknown";
  source: SourceLocation;
  value?: string;
  scope: "instance" | "global" | "shared";
  confidence: "high" | "medium" | "low";
}
export interface JsxElement {
  id: string;
  tag: string;
  source: SourceLocation;
  hash: string;
  parentId: string | null;
  children: string[];
  text: string | null;
  props: PropInfo[];
  events: { name: string; expression: string }[];
  editability: EditState;
  reasons: string[];
  operations: string[];
  dynamic: boolean;
  componentId?: string;
  ownerComponent?: string;
  styleOrigins: StyleOrigin[];
  behavior: string[];
  sourceOwnership: "jsx-instance" | "shared-component";
  references: { knownCount: number; analysisComplete: boolean };
}
export interface ComponentInfo {
  id: string;
  name: string;
  source: SourceLocation;
  exported: boolean;
  defaultExported?: boolean;
  props: {
    name: string;
    type: string;
    optional: boolean;
    requiredProven?: boolean;
    options?: string[];
    defaultValue?: string | number | boolean;
  }[];
  events: string[];
  callables: string[];
  behavior: string[];
  references: { file: string; line: number }[];
  confidence: "high" | "medium";
  editability: EditState;
}
export interface AnalyzedFile {
  file: string;
  hash: string;
  bytes: number;
  imports: { name: string; from: string; resolved?: string }[];
  errors: string[];
}
export interface AnalysisReport {
  schemaVersion: 1;
  projectRoot: string;
  name: string;
  analyzedAt: string;
  detected: {
    framework: "vite-react" | "nextjs" | "react" | "unknown";
    router: string;
    typescript: boolean;
    styling: string[];
    componentLibraries: string[];
    packageManager: string;
    dependencies: Record<string, string>;
    scripts: Record<string, string>;
    aliases: Record<string, string[]>;
    nodeEngine?: string;
  };
  files: AnalyzedFile[];
  elements: JsxElement[];
  components: ComponentInfo[];
  routes: {
    path: string;
    file: string;
    previewState: "CONFIG_REQUIRED" | "UNSUPPORTED";
    reason: string;
  }[];
  stories: string[];
  styleTokens: {
    name: string;
    value: string;
    source: SourceLocation;
    consumers: string[];
  }[];
  warnings: string[];
  coverage: {
    filesInspected: number;
    filesSkipped: number;
    elementsEditable: number;
    elementsLimited: number;
    elementsReadOnly: number;
    reasons: string[];
    complete: boolean;
  };
  git: { available: boolean; branch?: string; dirty: boolean; files: string[] };
  readiness: {
    dependenciesInstalled: boolean;
    previewCommand: string | null;
    state: "CONFIG_REQUIRED" | "UNSUPPORTED";
    reason: string;
  };
}
export interface PatchRequest {
  file: string;
  elementId: string;
  expectedHash: string;
  operation:
    | "text"
    | "prop"
    | "event"
    | "remove-event"
    | "style"
    | "insert"
    | "duplicate"
    | "move"
    | "remove";
  name?: string;
  value?: string | number | boolean;
  direction?: "up" | "down";
  scope: Scope;
  confirmScope?: boolean;
  targetId?: string;
  position?: "before" | "after" | "inside";
  insertProps?: { name: string; value: string | number | boolean }[];
  insertEvent?: { name: string; handler: string };
  insertComponent?: {
    name: string;
    sourceFile: string;
    defaultExported: boolean;
  };
  duplicateProp?: {
    elementId: string;
    name: string;
    value: string | number | boolean;
  };
}
export interface SourcePatch {
  id: string;
  file: string;
  beforeHash: string;
  afterHash: string;
  before: string;
  after: string;
  diff: string;
  scope: Scope;
  impact: {
    knownUsages: number;
    files: string[];
    usageFiles: string[];
    analysisComplete: boolean;
    warning: string;
  };
  warnings: string[];
  operation: PatchRequest["operation"];
  state: "PATCH_PREVIEW";
}
export interface Checkpoint {
  id: string;
  file: string;
  before: string;
  beforeHash: string;
  afterHash: string;
  appliedAt: string;
}
