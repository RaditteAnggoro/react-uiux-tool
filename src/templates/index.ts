/** Copyright (c) 2026 RA. MIT License. */
import { access, lstat, mkdir, readdir, realpath, rmdir, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export type TemplateName = 'blank' | 'dashboard' | 'form' | 'operations';
export type Styling = 'css' | 'css-modules' | 'tailwind';
export interface TemplateInput {
  parentDirectory: string;
  name: string;
  framework?: 'vite' | 'next';
  template?: TemplateName;
  styling?: Styling;
}
export interface CreationPlan {
  targetDirectory: string;
  files: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  commands: string[];
  warnings: string[];
}

const dependencies = { react: '^19.3.1', 'react-dom': '^19.3.1' };
const devDependencies = { '@types/react': '^19.2.0', '@types/react-dom': '^19.2.0', typescript: '^5.9.3', vite: '^8.3.5' };
const templateNames = new Set(['blank', 'dashboard', 'form', 'operations']);
const stylingNames = new Set(['css', 'css-modules', 'tailwind']);
const reservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function validateInput(input: TemplateInput): void {
  if (!input || typeof input.parentDirectory !== 'string' || !path.isAbsolute(input.parentDirectory)) {
    throw new Error('Choose an absolute parent directory. / Pilih absolute path folder induk.');
  }
  if (/^(?:\\\\|\/\/)/.test(input.parentDirectory)) {
    throw new Error('UNC/network parent directories are unsupported. Choose a local folder. / Folder jaringan UNC belum didukung.');
  }
  if (typeof input.name !== 'string' || !input.name.trim() || input.name !== input.name.trim() ||
      input.name.length > 100 || /[<>:"/\\|?*\u0000-\u001f]/.test(input.name) ||
      input.name === '.' || input.name === '..' || input.name.endsWith('.') || reservedName.test(input.name)) {
    throw new Error('Invalid project folder name. Use a name without path separators or reserved characters. / Nama folder project tidak valid.');
  }
  if (input.framework !== undefined && input.framework !== 'vite') {
    throw new Error('This release creates Vite React TypeScript projects only. Next.js projects can be inspected. / Versi ini membuat project Vite React TypeScript saja.');
  }
  if (input.template !== undefined && !templateNames.has(input.template)) throw new Error('Unknown project template. / Template project tidak dikenal.');
  if (input.styling !== undefined && !stylingNames.has(input.styling)) throw new Error('Unknown styling system. / Styling tidak dikenal.');
}

async function destination(input: TemplateInput): Promise<string> {
  validateInput(input);
  const parent = await realpath(input.parentDirectory);
  if (/^(?:\\\\|\/\/)/.test(parent)) {
    throw new Error('UNC/network parent directories are unsupported. Choose a local folder. / Folder jaringan UNC belum didukung.');
  }
  if (!(await lstat(parent)).isDirectory()) throw new Error('Parent must be a directory. / Folder induk harus berupa directory.');
  await access(parent, constants.W_OK);
  const target = path.join(parent, input.name);
  let stat;
  try { stat = await lstat(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (stat) {
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Target must be a real directory, not a symlink or file. / Target harus berupa folder asli.');
    if ((await readdir(target)).length) throw new Error('Target directory is not empty. Choose a new folder. / Folder target tidak kosong. Pilih folder baru.');
    await access(target, constants.W_OK);
  }
  return target;
}

function packageName(name: string): string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'my-react-app';
}

const baseCss = `:root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #172033; background: #f5f6fa; font-synthesis: none; text-rendering: optimizeLegibility; }
* { box-sizing: border-box; }
body { margin: 0; }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; border: 0; border-radius: 8px; padding: 11px 18px; color: white; background: #635bff; }
button:disabled { cursor: wait; opacity: .6; }
input, select, textarea { width: 100%; border: 1px solid #dfe3eb; border-radius: 8px; background: #fff; padding: 10px 12px; color: inherit; }
label { display: grid; gap: 8px; font-size: 14px; font-weight: 600; }
h1 { font-size: clamp(28px, 4vw, 42px); letter-spacing: -.04em; margin: 10px 0 14px; }
h2 { font-size: 18px; margin-top: 0; }
p { line-height: 1.6; }
small { color: #677286; }
table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
td, th { padding: 14px 12px; border-bottom: 1px solid #edf0f5; }
th { color: #677286; font-size: 12px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
nav { display: flex; gap: 20px; }
nav a { color: #677286; text-decoration: none; }
main { max-width: 1100px; padding: 48px 28px; margin: auto; }
section { margin-top: 28px; }
form { display: grid; gap: 20px; }
@media (max-width: 650px) { header { align-items: start; flex-direction: column; } main { padding: 28px 18px; } }
`;

const componentCss = `.shell { max-width: 1100px; padding: 48px 28px; margin: auto; }
.eyebrow { display: inline-flex; align-items: center; gap: 8px; color: #635bff; font-weight: 700; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
.muted { color: #677286; }
.card { background: white; border: 1px solid #e4e8f0; border-radius: 14px; padding: 26px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(210px,1fr)); gap: 18px; }
.metric { font-size: 32px; font-weight: 700; margin: 10px 0; letter-spacing: -.04em; }
.toolbar { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin: 24px 0; }
.form { display: grid; gap: 20px; max-width: 560px; }
.status { border-radius: 5px; padding: 4px 8px; font-size: 12px; color: #16803c; background: #e9f7ee; }
.message { display: flex; gap: 15px; align-items: start; padding: 18px 0; border-bottom: 1px solid #edf0f5; }
.avatar { border-radius: 9px; width: 38px; height: 38px; background: #eeeefe; color: #635bff; display: grid; place-items: center; flex-shrink: 0; font-weight: 700; }
.success { padding: 12px; border-radius: 8px; color: #136c34; background: #e9f7ee; }
`;

function appSource(template: TemplateName, modules: boolean): string {
  const cls = (name: string) => modules ? `{styles.${name}}` : `"${name}"`;
  const className = (name: string) => `className=${cls(name)}`;
  const imports = `import { useState } from 'react';\n${modules ? "import styles from './App.module.css';\n" : ''}`;
  const top = `<header><span ${className('eyebrow')}>◈ Local workspace</span><nav aria-label="Main"><a href="#overview">Overview</a><a href="#details">Details</a></nav></header>`;
  if (template === 'form') return `${imports}
export default function App() {
  const [saved, setSaved] = useState(false);
  return <main ${className('shell')}>
    ${top}
    <section id="overview"><h1>Make room for your next idea.</h1><p ${className('muted')}>A local example form. Nothing is sent to a server.</p></section>
    <section id="details" ${className('card')}><form ${className('form')} onSubmit={event => { event.preventDefault(); setSaved(true); }}>
      <h2>Project details</h2>
      <label>Project name<input name="name" placeholder="A great new project" required /></label>
      <label>Email address<input name="email" type="email" placeholder="you@example.com" required /></label>
      <label>Team<select name="team"><option>Design</option><option>Engineering</option><option>Operations</option></select></label>
      <label>Notes<textarea name="notes" placeholder="Tell us a little more" rows={3} /></label>
      <button type="submit">Save locally</button>
      {saved && <p role="status" ${className('success')}>Example submitted. No backend was called.</p>}
    </form></section>
  </main>;
}
`;
  if (template === 'dashboard') return `${imports}
export default function App() {
  const [period, setPeriod] = useState('This month');
  return <main ${className('shell')}>
    ${top}
    <section id="overview"><h1>A clearer view of your work.</h1><p ${className('muted')}>A business dashboard with local example data.</p></section>
    <div ${className('toolbar')}><h2>Workspace overview</h2><select aria-label="Reporting period" value={period} onChange={event => setPeriod(event.target.value)} style={{ width: 160 }}><option>This month</option><option>Last month</option></select></div>
    <div ${className('grid')}><article ${className('card')}><small>Projects</small><p ${className('metric')}>24</p><span ${className('status')}>4 added this month</span></article><article ${className('card')}><small>Tasks completed</small><p ${className('metric')}>186</p><span ${className('status')}>12% increase</span></article><article ${className('card')}><small>Team members</small><p ${className('metric')}>12</p><span ${className('status')}>All systems ready</span></article></div>
    <section id="details" ${className('card')}><h2>Recent projects · {period}</h2><table><thead><tr><th>Project</th><th>Owner</th><th>Status</th></tr></thead><tbody><tr><td>Website refresh</td><td>Design team</td><td>In progress</td></tr><tr><td>Customer portal</td><td>Engineering</td><td>Planning</td></tr><tr><td>Welcome flow</td><td>Product team</td><td>Completed</td></tr></tbody></table></section>
  </main>;
}
`;
  if (template === 'operations') return `${imports}
export default function App() {
  const [query, setQuery] = useState('');
  const messages = [{ initial: 'D', name: 'Design team', text: 'The new workspace is ready for review.' }, { initial: 'E', name: 'Engineering', text: 'All checks have passed on the latest build.' }, { initial: 'O', name: 'Operations', text: 'Your weekly summary is ready.' }];
  return <main ${className('shell')}>
    ${top}
    <section id="overview"><h1>One place to stay in sync.</h1><p ${className('muted')}>A local operations console. These are fictional example messages.</p></section>
    <section id="details" ${className('card')}><div ${className('toolbar')}><h2>Team inbox</h2><input aria-label="Search messages" placeholder="Search messages…" value={query} onChange={event => setQuery(event.target.value)} style={{ width: 230 }} /></div>
      {messages.filter(message => (message.name + message.text).toLowerCase().includes(query.toLowerCase())).map(message => <article key={message.name} ${className('message')}><span ${className('avatar')}>{message.initial}</span><div><strong>{message.name}</strong><p ${className('muted')}>{message.text}</p></div></article>)}
      {messages.filter(message => (message.name + message.text).toLowerCase().includes(query.toLowerCase())).length === 0 && <p role="status">No matching messages.</p>}
    </section>
  </main>;
}
`;
  return `${imports}
export default function App() {
  const [count, setCount] = useState(0);
  return <main ${className('shell')}>
    ${top}
    <section id="overview"><h1>Your next idea starts here.</h1><p ${className('muted')}>A small React + TypeScript project, ready to make your own.</p></section>
    <section id="details" ${className('card')}><h2>Built for your workflow</h2><p>Edit <code>src/App.tsx</code> in your editor, or inspect supported static elements in React UI/UX Tool.</p><button type="button" onClick={() => setCount(count + 1)}>Clicked {count} times</button></section>
  </main>;
}
`;
}

export function templateFiles(input: TemplateInput): Record<string, string> {
  validateInput(input);
  const modules = input.styling === 'css-modules';
  const tailwind = input.styling === 'tailwind';
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: packageName(input.name), version: '0.0.0', private: true, type: 'module', scripts: { dev: 'vite --host 127.0.0.1', build: 'tsc --noEmit && vite build', preview: 'vite preview --host 127.0.0.1' }, dependencies, devDependencies: { ...devDependencies, ...(tailwind ? { tailwindcss: '^4.1.0', '@tailwindcss/vite': '^4.1.0' } : {}) } }, null, 2) + '\n',
    '.gitignore': 'node_modules/\ndist/\n.env\n.env.*\n!.env.example\n',
    'index.html': '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>My React workspace</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true, types: ['vite/client'] }, include: ['src'] }, null, 2) + '\n',
    'vite.config.ts': `import { defineConfig } from 'vite';\n${tailwind ? "import tailwindcss from '@tailwindcss/vite';\n" : ''}export default defineConfig({${tailwind ? ' plugins: [tailwindcss()],' : ''} server: { host: '127.0.0.1' } });\n`,
    'src/main.tsx': "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './styles.css';\n\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);\n",
    'src/App.tsx': appSource(input.template || 'blank', modules),
    'src/styles.css': `${tailwind ? "@import 'tailwindcss';\n" : ''}${baseCss}${modules ? '' : componentCss}`,
    'README.md': `# ${input.name}\n\nLocal React + TypeScript example generated by React UI/UX Tool.\n\nInstall dependencies only when you are ready to run the app:\n\n\x60\x60\x60bash\nnpm install\nnpm run dev\n\x60\x60\x60\n\nBuild: \x60npm run build\x60. Stop the development server with Ctrl+C.\n\nThe ${input.template || 'blank'} template uses local example data and does not contact a backend. Generated project files are yours; no tracking or required designer runtime is included.\n`,
  };
  if (modules) files['src/App.module.css'] = componentCss;
  return files;
}

export async function previewCreation(input: TemplateInput): Promise<CreationPlan> {
  const targetDirectory = await destination(input);
  const files = templateFiles(input);
  const manifest = JSON.parse(files['package.json']!);
  return { targetDirectory, files: Object.keys(files), dependencies: manifest.dependencies, devDependencies: manifest.devDependencies,
    commands: ['npm install', 'npm run dev', 'npm run build'], warnings: ['Files only: creating this project does not install dependencies or run commands. / Hanya membuat file; tidak meng-install dependency atau menjalankan command.', ...(input.styling === 'tailwind' ? ['Tailwind v4 dependencies are listed in package.json and require installation before running. / Dependency Tailwind v4 perlu di-install sebelum menjalankan project.'] : [])] };
}

export async function createProject(input: TemplateInput): Promise<CreationPlan & { created: true }> {
  const plan = await previewCreation(input);
  const files = templateFiles(input);
  let madeTarget = false;
  const written: string[] = [];
  const madeDirectories = new Set<string>();
  try {
    try { await mkdir(plan.targetDirectory); madeTarget = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    if ((await lstat(plan.targetDirectory)).isSymbolicLink() || await realpath(plan.targetDirectory) !== plan.targetDirectory || (await readdir(plan.targetDirectory)).length) {
      throw new Error('Target changed during creation. Choose a new empty folder. / Folder target berubah saat pembuatan.');
    }
    for (const [relative, contents] of Object.entries(files)) {
      if (await realpath(plan.targetDirectory) !== plan.targetDirectory) throw new Error('Target path changed. / Path target berubah.');
      const filename = path.join(plan.targetDirectory, relative);
      const directory = path.dirname(filename);
      if (directory !== plan.targetDirectory && !madeDirectories.has(directory)) {
        await mkdir(directory, { recursive: false });
        madeDirectories.add(directory);
      }
      if (await realpath(directory) !== directory) throw new Error('Symlink directory rejected. / Directory symlink ditolak.');
      await writeFile(filename, contents, { flag: 'wx', mode: 0o644 });
      written.push(filename);
    }
    return { ...plan, created: true };
  } catch (error) {
    // Remove only files created by this attempt; never recursively erase a user directory.
    for (const filename of written.reverse()) await unlink(filename).catch(() => undefined);
    for (const directory of [...madeDirectories].reverse()) await rmdir(directory).catch(() => undefined);
    if (madeTarget) await rmdir(plan.targetDirectory).catch(() => undefined);
    throw error;
  }
}
