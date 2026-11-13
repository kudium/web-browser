/* Static discovery never executes project files or invokes build tools. */
/* eslint-disable no-restricted-syntax, no-await-in-loop, no-continue, no-nested-ternary */
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { parse as parseTOML } from 'smol-toml';
import { parse as parseYAML } from 'yaml';
import type { ProjectScriptCandidate } from '../browser/developerProject';

/** Strip JSONC comments without altering strings, then remove trailing commas. */
function parseJSONC(text: string) {
  const clean = text.replace(
    /"(?:\\.|[^"\\])*"|\/\/[^\n\r]*|\/\*[\s\S]*?\*\//g,
    (match) => (match.startsWith('"') ? match : ' ')
  );
  return JSON.parse(
    clean.replace(/("(?:\\.|[^"\\])*"|,)\s*(?=[}\]])/g, (match) =>
      match.trim().startsWith(',') ? '' : match
    )
  );
}

const manifests = new Set([
  'package.json',
  'composer.json',
  'deno.json',
  'deno.jsonc',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'tox.ini',
  'Makefile',
  'makefile',
  'GNUmakefile',
  'justfile',
  'Justfile',
  'Taskfile.yml',
  'Taskfile.yaml',
  'Rakefile',
  'Gemfile',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Package.swift',
  'pubspec.yaml',
  'mix.exs',
  'build.zig',
  'Project.toml',
  'DESCRIPTION',
  'CMakeLists.txt',
  'compose.yaml',
  'compose.yml',
  'docker-compose.yml',
  'docker-compose.yaml',
]);
const skipped = new Set([
  'node_modules',
  'release-artifacts',
  'release',
  'coverage',
  '.git',
  '.venv',
  'venv',
  'target',
  'build',
  'dist',
  'vendor',
  '.next',
  '.idea',
]);
const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
const taskName = /^[A-Za-z0-9_][A-Za-z0-9_.:@/-]*$/;
export async function discoverProjectScripts(
  folder: string,
  ensureAccess = () => {}
) {
  const root = await fs.realpath(folder);
  const candidates: ProjectScriptCandidate[] = [];
  const warnings: string[] = [];
  const commands = new Set<string>();
  let directories = 0;
  let files = 0;
  const scan = async (
    directory: string,
    depth: number,
    inheritedManager = 'npm'
  ) => {
    ensureAccess();
    if ((await fs.realpath(directory)) !== directory) return;
    directories += 1;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    ensureAccess();
    const names = new Set(entries.map((entry) => entry.name));
    const relative = path.relative(root, directory);
    let manager = names.has('pnpm-lock.yaml')
      ? 'pnpm'
      : names.has('yarn.lock')
      ? 'yarn'
      : names.has('bun.lock') || names.has('bun.lockb')
      ? 'bun'
      : inheritedManager;
    const add = (
      source: string,
      name: string,
      command: string,
      kind: 'task' | 'standard' = 'standard'
    ) => {
      const full = relative ? `cd ${quote(relative)} && ${command}` : command;
      if (
        commands.has(full) ||
        candidates.length >= 256 ||
        full.length > 4096 ||
        Array.from(full + name).some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
        )
      )
        return;
      commands.add(full);
      const label = `${relative ? `${relative}: ` : ''}${name}`.slice(0, 60);
      candidates.push({
        id: createHash('sha256').update(`${source}\0${full}`).digest('hex'),
        name: label,
        command: full,
        source: path.join(relative, source),
        kind,
      });
    };
    const standard = (source: string, tool: string, tasks: string[]) =>
      tasks.forEach((task) =>
        add(source, `${tool} ${task}`, `${tool} ${task}`)
      );
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        !entry.isFile() ||
        (!manifests.has(entry.name) &&
          !/\.(?:csproj|fsproj|vbproj|sln|slnx)$/.test(entry.name))
      )
        continue;
      if (files >= 128) break;
      files += 1;
      const file = path.join(directory, entry.name);
      try {
        const real = await fs.realpath(file);
        if (real !== file) continue;
        const stat = await fs.stat(file);
        if (stat.size > 1024 * 1024) {
          warnings.push(`${path.relative(root, file)} is too large to scan.`);
          continue;
        }
        const handle = await fs.open(file, 'r');
        let text: string;
        try {
          const buffer = Buffer.alloc(1024 * 1024 + 1);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          if (bytesRead > 1024 * 1024 || (await fs.realpath(file)) !== file)
            throw new Error('File changed');
          text = buffer.subarray(0, bytesRead).toString('utf8');
        } finally {
          await handle.close();
        }
        ensureAccess();
        const source = entry.name;
        if (source === 'package.json') {
          const data = JSON.parse(text);
          manager =
            /^(npm|pnpm|yarn|bun)@/.exec(
              String(data.packageManager || '')
            )?.[1] || manager;
          const packageManager = manager;
          Object.keys(data.scripts || {})
            .filter(
              (name) =>
                taskName.test(name) && typeof data.scripts[name] === 'string'
            )
            .forEach((name) =>
              add(source, name, `${packageManager} run ${name}`, 'task')
            );
        } else if (source === 'composer.json') {
          const data = JSON.parse(text);
          Object.keys(data.scripts || {})
            .filter((name) => taskName.test(name))
            .forEach((name) =>
              add(source, name, `composer run-script ${quote(name)}`, 'task')
            );
        } else if (source.startsWith('deno.json')) {
          // Preserve quoted URLs while removing JSONC comments and trailing commas.
          const data = source.endsWith('jsonc')
            ? parseJSONC(text)
            : JSON.parse(text);
          Object.keys(data.tasks || {})
            .filter((name) => taskName.test(name))
            .forEach((name) =>
              add(source, name, `deno task ${quote(name)}`, 'task')
            );
        } else if (/^(?:GNUmakefile|Makefile|makefile)$/.test(source)) {
          for (const match of text.matchAll(
            /^([A-Za-z0-9_][\w./-]*(?:[ \t]+[A-Za-z0-9_][\w./-]*)*)[ \t]*:(?![=:])/gm
          ))
            match[1]
              .split(/\s+/)
              .filter((name) => !name.startsWith('.'))
              .forEach((name) =>
                add(source, name, `make ${quote(name)}`, 'task')
              );
        } else if (/^justfile$/i.test(source)) {
          for (const match of text.matchAll(
            /^([A-Za-z_][\w-]*)(?:[ \t]+[^\n:]*)?:[^=]/gm
          ))
            add(source, match[1], `just ${quote(match[1])}`, 'task');
        } else if (/^Taskfile\.ya?ml$/.test(source)) {
          const data = parseYAML(text, { maxAliasCount: 50 });
          Object.keys(data?.tasks || {})
            .filter(
              (name) => taskName.test(name) && !data.tasks[name]?.internal
            )
            .forEach((name) =>
              add(source, name, `task ${quote(name)}`, 'task')
            );
        } else if (source === 'pyproject.toml') {
          const data = parseTOML(text) as any;
          const tool = data.tool || {};
          Object.keys(tool.poe?.tasks || {})
            .filter((name) => taskName.test(name))
            .forEach((name) => add(source, name, `poe ${quote(name)}`, 'task'));
          Object.keys(tool.hatch?.envs || {}).forEach((env) =>
            Object.keys(tool.hatch.envs[env]?.scripts || {})
              .filter((name) => taskName.test(name) && taskName.test(env))
              .forEach((name) =>
                add(
                  source,
                  `${env}:${name}`,
                  `hatch run ${quote(`${env}:${name}`)}`,
                  'task'
                )
              )
          );
          if (tool.pytest || names.has('pytest.ini'))
            add(source, 'Python tests', 'python3 -m pytest');
          if (tool.poetry)
            add(source, 'Install Python dependencies', 'poetry install');
          if (tool.uv || names.has('uv.lock'))
            add(source, 'Sync Python dependencies', 'uv sync');
          add(source, 'Build Python package', 'python3 -m build');
        } else if (source === 'tox.ini') {
          standard(source, 'tox', ['list', 'run']);
        } else if (source === 'Cargo.toml')
          standard(source, 'cargo', ['build', 'run', 'test', 'check', 'fmt']);
        else if (source === 'go.mod')
          standard(source, 'go', [
            'build ./...',
            'test ./...',
            'run .',
            'mod download',
          ]);
        else if (source === 'pom.xml')
          standard(source, names.has('mvnw') ? './mvnw' : 'mvn', [
            'compile',
            'test',
            'package',
            'verify',
          ]);
        else if (source.startsWith('build.gradle')) {
          const tool = names.has('gradlew') ? './gradlew' : 'gradle';
          standard(source, tool, ['build', 'test', 'clean']);
          for (const match of text.matchAll(
            /(?:tasks\.(?:register|create)\s*\(\s*["']([\w-]+)["']|task\s+([\w-]+))/g
          )) {
            const name = match[1] || match[2];
            add(source, name, `${tool} ${quote(name)}`, 'task');
          }
        } else if (source === 'Rakefile') {
          for (const match of text.matchAll(
            /^\s*task\s+(?::([\w-]+)|["']([\w:-]+)["'])/gm
          )) {
            const name = match[1] || match[2];
            add(source, name, `bundle exec rake ${quote(name)}`, 'task');
          }
        } else if (source === 'Gemfile')
          standard(source, 'bundle', ['install', 'exec rake -T']);
        else if (source === 'Package.swift')
          standard(source, 'swift', ['build', 'test', 'run']);
        else if (source === 'pubspec.yaml') {
          const tool = /\bsdk:\s*flutter/.test(text) ? 'flutter' : 'dart';
          standard(source, tool, ['pub get', 'analyze', 'test', 'run']);
        } else if (source === 'mix.exs')
          standard(source, 'mix', ['deps.get', 'compile', 'test', 'format']);
        else if (source === 'build.zig')
          standard(source, 'zig', ['build', 'build test']);
        else if (source === 'Project.toml') {
          add(
            source,
            'Julia instantiate',
            `julia --project=. -e 'using Pkg; Pkg.instantiate()'`
          );
          add(
            source,
            'Julia tests',
            `julia --project=. -e 'using Pkg; Pkg.test()'`
          );
        } else if (source === 'DESCRIPTION') {
          add(source, 'R build', 'R CMD build .');
          add(source, 'R tests', `Rscript -e 'devtools::test()'`);
        } else if (source === 'CMakeLists.txt') {
          add(source, 'Configure CMake', 'cmake -S . -B build');
          add(source, 'Build CMake', 'cmake --build build');
          add(source, 'Test CMake', 'ctest --test-dir build');
        } else if (/compose\.ya?ml$/.test(source))
          standard(source, 'docker compose', ['up --build', 'down', 'logs -f']);
        else if (/\.(?:csproj|fsproj|vbproj|sln|slnx)$/.test(source))
          ['build', 'test', 'restore'].forEach((task) =>
            add(source, `dotnet ${task}`, `dotnet ${task} ${quote(source)}`)
          );
      } catch {
        warnings.push(
          `Could not read tasks from ${path.relative(root, file)}.`
        );
      }
    }
    if (depth < 2)
      for (const entry of entries) {
        if (directories >= 80) break;
        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          !skipped.has(entry.name)
        )
          await scan(path.join(directory, entry.name), depth + 1, manager);
      }
  };
  await scan(root, 0);
  ensureAccess();
  if (files >= 128 || directories >= 80 || candidates.length >= 256)
    warnings.push(
      'Discovery limit reached. Link a subproject to scan it separately.'
    );
  return { candidates, warnings };
}
