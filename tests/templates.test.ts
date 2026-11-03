import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createProject, previewCreation, templateFiles } from '../src/templates/index.js';

test('creation preview is read-only; files-only generation supports spaces and unicode', async () => {
  const parentDirectory = await mkdtemp(path.join(os.tmpdir(), 'uiux create-'));
  try {
    const input = { parentDirectory, name: 'Aplikasi Tim 日本', template: 'form' as const };
    const plan = await previewCreation(input);
    assert.ok(plan.files.includes('src/App.tsx'));
    assert.deepEqual(await readdir(parentDirectory), []);
    const result = await createProject(input);
    assert.equal(result.created, true);
    const manifest = JSON.parse(await readFile(path.join(result.targetDirectory, 'package.json'), 'utf8'));
    assert.ok(manifest.dependencies.react);
    assert.equal(manifest.scripts.dev, 'vite --host 127.0.0.1');
    assert.equal((await readdir(result.targetDirectory)).includes('node_modules'), false);
    await assert.rejects(createProject(input), /not empty/);
  } finally { await rm(parentDirectory, { recursive: true, force: true }); }
});

test('creation rejects traversal, nonempty folders, files, unknown options, and symlink targets', async () => {
  const parentDirectory = await mkdtemp(path.join(os.tmpdir(), 'uiux-safe-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'uiux-outside-'));
  try {
    for (const name of ['../escape', '..', 'a/b', 'a\\b', '.', 'bad?', 'NUL', 'CON.txt']) {
      await assert.rejects(createProject({ parentDirectory, name }), /Invalid project/);
    }
    await mkdir(path.join(parentDirectory, 'taken'));
    await writeFile(path.join(parentDirectory, 'taken', 'keep.txt'), 'do not change');
    await assert.rejects(createProject({ parentDirectory, name: 'taken' }), /not empty/);
    assert.equal(await readFile(path.join(parentDirectory, 'taken', 'keep.txt'), 'utf8'), 'do not change');
    await writeFile(path.join(parentDirectory, 'a-file'), 'keep');
    await assert.rejects(createProject({ parentDirectory, name: 'a-file' }), /real directory/);
    try {
      await symlink(outside, path.join(parentDirectory, 'linked'), 'dir');
      await assert.rejects(createProject({ parentDirectory, name: 'linked' }), /real directory/);
      assert.deepEqual(await readdir(outside), []);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error; }
    await assert.rejects(createProject({ parentDirectory, name: 'next-app', framework: 'next' }), /Vite React/);
    await assert.rejects(createProject({ parentDirectory: '.', name: 'app' }), /absolute/);
    await assert.rejects(createProject({ parentDirectory: '//server/share', name: 'app' }), /UNC|network/);
    await assert.rejects(createProject({ parentDirectory, name: 'app', template: 'unknown' as never }), /Unknown/);
  } finally { await rm(parentDirectory, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('all shipped template/style combinations parse as TSX and have actual styling configuration', () => {
  for (const template of ['blank', 'dashboard', 'form', 'operations'] as const) {
    for (const styling of ['css', 'css-modules', 'tailwind'] as const) {
      const files = templateFiles({ parentDirectory: os.tmpdir(), name: 'demo', template, styling });
      const result = ts.transpileModule(files['src/App.tsx']!, { fileName: 'App.tsx', compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
      assert.deepEqual(result.diagnostics, [], `${template}/${styling} parses`);
      assert.ok(!files['src/App.tsx']!.includes('fetch('));
      if (styling === 'css-modules') {
        assert.ok(files['src/App.module.css']);
        assert.ok(files['src/App.tsx']!.includes('className={styles.shell}'));
      }
      if (styling === 'tailwind') {
        assert.ok(files['vite.config.ts']!.includes('tailwindcss()'));
        assert.ok(files['src/styles.css']!.includes("@import 'tailwindcss'"));
      }
    }
  }
});
