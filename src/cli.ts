#!/usr/bin/env node
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startStudio } from './server/index.js';
import { VERSION, PROJECT_ORIGIN } from './provenance.js';

const args = process.argv.slice(2);
const command = args[0];
if (args.includes('--version') || args.includes('-v')) {
  console.log(`react-uiux-tool ${VERSION}\nCreated by RA · MIT · ${PROJECT_ORIGIN}`);
} else if (args.includes('--help') || args.includes('-h')) {
  console.log(`React UI/UX Tool ${VERSION}
Usage:
  react-uiux-tool                         Launch local studio
  react-uiux-tool open /absolute/project  Open project (static analysis first)
  react-uiux-tool new                     Open project creation wizard
  react-uiux-tool analyze /project [--json | --format json]
Options:
  --port <number>  Select loopback port (default: random free port)
  --no-open       Print the URL without opening the browser
  --version       Version and attribution
Stop with Ctrl+C. No scripts, installation, commits or pushes run automatically.`);
} else {
  try {
    if (command === 'analyze') {
      const root = path.resolve(args[1] && !args[1].startsWith('--') ? args[1] : '.');
      const { analyzeProject } = await import('./engine/index.js');
      const report = await analyzeProject(root);
      if (args.includes('--json') || args.includes('json')) console.log(JSON.stringify(report,null,2));
      else console.log(`${report.name}\n${report.projectRoot}\nFramework: ${report.detected.framework} · ${report.detected.router}\n${report.components.length} components · ${report.elements.length} JSX nodes\nEditable: ${report.coverage.elementsEditable} · Limited: ${report.coverage.elementsLimited} · Read-only: ${report.coverage.elementsReadOnly}\nFiles inspected: ${report.coverage.filesInspected} · Skipped: ${report.coverage.filesSkipped}\n${report.warnings.join('\n')}`);
    } else {
      if (command && !['open','new'].includes(command) && !command.startsWith('--')) throw new Error(`Unknown command: ${command}. Use --help.`);
      const portIndex = args.indexOf('--port'); const port = portIndex < 0 ? undefined : Number(args[portIndex+1]);
      if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error('Port must be an integer from 0 to 65535');
      const studio = await startStudio({port,initialPath:command==='open' ? path.resolve(args[1] && !args[1].startsWith('--') ? args[1] : '.') : undefined,dev:import.meta.url.endsWith('.ts')});
      const url = studio.url + (command === 'new' ? '/?new=1' : '');
      console.log(`\n  React UI/UX Tool ${VERSION}\n  Local: ${url}\n  Created by RA · MIT\n\n  Press Ctrl+C to stop studio and its preview.\n`);
      if (!args.includes('--no-open') && !process.env.UIUX_NO_OPEN) {
        const executable = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
        const child = spawn(executable,[url],{stdio:'ignore'}); child.on('error',()=>{}); child.unref();
      }
      const stop = () => { void studio.close().then(()=>process.exit(0)); };
      process.once('SIGINT',stop); process.once('SIGTERM',stop);
    }
  } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode=1; }
}
