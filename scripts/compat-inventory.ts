import { analyzeProject } from "../src/engine/index.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
if (!root) {
  console.error("Usage: npm run compat:inventory -- <project-directory>");
  process.exitCode = 1;
} else {
  const report = await analyzeProject(root);
  const git = promisify(execFile);
  const toolDirectory = fileURLToPath(new URL("..", import.meta.url));
  let toolRevision: string | null = null;
  let toolWorkingTreeDirty: boolean | null = null;
  try {
    toolRevision = (await git("git", ["rev-parse", "HEAD"], { cwd: toolDirectory })).stdout.trim();
    toolWorkingTreeDirty = !!(await git("git", ["status", "--porcelain"], { cwd: toolDirectory })).stdout.trim();
  } catch {
    // Git metadata is optional and is not a compatibility result.
  }
  const elements = new Map(report.elements.map((element) => [element.id, element]));
  const wrapperEvidence = new Map<string, Set<string>>();
  for (const element of report.elements) {
    if (!element.componentId || !element.parentId) continue;
    const parent = elements.get(element.parentId);
    if (!parent || !/^[A-Z][\w$]*\.[A-Z][\w$]*$/.test(parent.tag)) continue;
    const wrappers = wrapperEvidence.get(element.componentId) ?? new Set<string>();
    wrappers.add(parent.tag);
    wrapperEvidence.set(element.componentId, wrappers);
  }
  const modules: Record<string, number> = {};
  for (const file of report.files) {
    const match = file.file.match(/(?:^|\/)views\/([^/]+)\/[^/]+\.[jt]sx?$/i);
    if (match) modules[match[1]] = (modules[match[1]] ?? 0) + 1;
  }
  const components = report.components.map((component) => ({
    name: component.name,
    file: component.source.file,
    exported: component.exported,
    wrapperEvidence: [...(wrapperEvidence.get(component.id) ?? [])].sort(),
    provenRequiredProps: component.props.filter((prop) => prop.requiredProven).map((prop) => prop.name).sort(),
    validation: "not-tested" as const,
  }));
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    toolRevision,
    toolWorkingTreeDirty,
    framework: report.detected.framework,
    filesInspected: report.coverage.filesInspected,
    filesSkipped: report.coverage.filesSkipped,
    analysisComplete: report.coverage.complete,
    analysisReasons: report.coverage.reasons,
    indexedComponents: components.length,
    validation: { passed: 0, failed: 0, blocked: 0, notTested: components.length },
    businessModuleSourceFiles: modules,
    components,
  }, null, 2));
}
