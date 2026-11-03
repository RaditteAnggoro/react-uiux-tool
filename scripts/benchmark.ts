import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { startStudio } from '../src/server/index.js';

const root = path.resolve('fixtures/demo');
global.gc?.();
const startedAt = performance.now();
const studio = await startStudio({ port: 0 });
const serverMs = performance.now() - startedAt;
global.gc?.();
const idle = process.memoryUsage().rss;
let observedPeak = idle;
const sample = setInterval(() => { observedPeak = Math.max(observedPeak, process.memoryUsage().rss); }, 5);
const analyzeAt = performance.now();
const { analyzeProject } = await import('../src/engine/index.js');
const report = await analyzeProject(root);
const analysisMs = performance.now() - analyzeAt;
clearInterval(sample);
observedPeak = Math.max(observedPeak, process.memoryUsage().rss);
global.gc?.();
const settled = process.memoryUsage().rss;
await studio.close();

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  node: process.version,
  fixture: 'fixtures/demo',
  serverStartupMs: Number(serverMs.toFixed(1)),
  analysisMs: Number(analysisMs.toFixed(1)),
  filesInspected: report.coverage.filesInspected,
  jsxElements: report.elements.length,
  idleRssMiB: Number((idle / 1024 / 1024).toFixed(1)),
  observedAnalysisPeakRssMiB: Number((observedPeak / 1024 / 1024).toFixed(1)),
  settledRssMiB: Number((settled / 1024 / 1024).toFixed(1)),
}, null, 2));
