/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { discoverProjectScripts } from '../main/projectScriptDiscovery';

let root: string;
beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'script-discovery-'))
  );
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const write = (name: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), text);
};
it('discovers actual Node tasks with the package manager and safe subproject directory', async () => {
  write(
    'package.json',
    JSON.stringify({
      packageManager: 'pnpm@10',
      scripts: { dev: 'touch SHOULD_NOT_RUN', build: 'vite build' },
    })
  );
  write(
    'apps/my app/package.json',
    JSON.stringify({ scripts: { test: 'vitest' } })
  );
  const { candidates } = await discoverProjectScripts(root);
  expect(candidates.map((item) => item.command)).toEqual(
    expect.arrayContaining([
      'pnpm run dev',
      'pnpm run build',
      "cd 'apps/my app' && pnpm run test",
    ])
  );
  expect(fs.existsSync(path.join(root, 'SHOULD_NOT_RUN'))).toBe(false);
  expect(new Set(candidates.map((item) => item.id)).size).toBe(
    candidates.length
  );
});
it('reads tasks from JSONC, YAML, TOML, Make, Just, PHP and Ruby without evaluating them', async () => {
  write(
    'deno.jsonc',
    '{ // tasks\n "tasks": {"serve": "deno run main.ts",}, }'
  );
  write('composer.json', '{"scripts":{"test":"phpunit"}}');
  write(
    'Taskfile.yml',
    'version: "3"\ntasks:\n  deploy:\n    cmds: [echo hi]\n  hidden:\n    internal: true\n    cmds: [echo hi]\n'
  );
  write(
    'pyproject.toml',
    '[tool.poe.tasks]\nlint = "ruff check"\n[tool.hatch.envs.default.scripts]\ntest = "pytest"\n'
  );
  write('Makefile', '.PHONY: test\ntest build: prerequisite\n\techo hi\n');
  write('justfile', 'check:\n    echo hi\n');
  write('Rakefile', "task :spec do\n  puts 'hi'\nend\n");
  const { candidates, warnings } = await discoverProjectScripts(root);
  expect(warnings).toEqual([]);
  expect(candidates.map((item) => item.command)).toEqual(
    expect.arrayContaining([
      "deno task 'serve'",
      "composer run-script 'test'",
      "task 'deploy'",
      "poe 'lint'",
      "hatch run 'default:test'",
      "make 'test'",
      "make 'build'",
      "just 'check'",
      "bundle exec rake 'spec'",
    ])
  );
  expect(candidates.some((item) => item.name === 'hidden')).toBe(false);
});
it('offers standard commands for detected compiled and scripting language projects', async () => {
  [
    'Cargo.toml',
    'go.mod',
    'pom.xml',
    'build.gradle.kts',
    'Example.csproj',
    'Package.swift',
    'mix.exs',
    'build.zig',
    'Project.toml',
    'DESCRIPTION',
    'CMakeLists.txt',
    'Gemfile',
  ].forEach((name) => write(name, ''));
  write('pubspec.yaml', 'dependencies:\n  flutter:\n    sdk: flutter');
  const { candidates } = await discoverProjectScripts(root);
  expect(candidates.map((item) => item.command)).toEqual(
    expect.arrayContaining([
      'cargo test',
      'go test ./...',
      'mvn test',
      'gradle test',
      "dotnet build 'Example.csproj'",
      'swift test',
      'mix test',
      'zig build',
      "julia --project=. -e 'using Pkg; Pkg.test()'",
      'R CMD build .',
      'cmake --build build',
      'bundle install',
      'flutter test',
    ])
  );
});
it('skips symlinks and dependency folders, tolerates malformed manifests and enforces access', async () => {
  write('package.json', '{bad');
  write('node_modules/dependency/package.json', '{"scripts":{"test":"test"}}');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-script-'));
  try {
    fs.writeFileSync(
      path.join(outside, 'package.json'),
      '{"scripts":{"secret":"test"}}'
    );
    fs.symlinkSync(outside, path.join(root, 'linked'));
    const result = await discoverProjectScripts(root);
    expect(result.candidates).toEqual([]);
    expect(result.warnings).toEqual([
      'Could not read tasks from package.json.',
    ]);
    await expect(
      discoverProjectScripts(root, () => {
        throw new Error('Locked');
      })
    ).rejects.toThrow('Locked');
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
