/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AIAuditEntry, AIAuditLog, aiAuditRetentionDays, aiAuditSince } from '../main/aiAudit';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-audit-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const entry = (time: string, agent = 'Claude Code'): AIAuditEntry => ({
  time,
  agent,
  kind: 'act',
  groupId: 'g1',
  groupName: 'Delight',
  intent: 'sign in',
  ok: true,
  durationMs: 480,
  steps: [{ step: 1, tool: 'navigate', ok: true, durationMs: 12, url: 'http://localhost:5173/' }],
  approvals: [{ tool: 'project_terminal', answer: 'allowed', reason: 'sensitive' }],
  caps: { used: { navigations: 1, tabs: 0, uploads: 0, projectBytes: 0 }, caps: { navigations: 200, tabs: 20, uploads: 20, projectBytes: 5242880 } },
});

it('appends one JSON line per run, filters by since, and exports verbatim lines', () => {
  const log = new AIAuditLog(path.join(root, 'nested', 'ai-audit.jsonl'));
  log.append(entry('2026-11-20T10:00:00.000Z'));
  log.append(entry('2026-11-26T10:00:00.000Z', 'Cursor'));
  const text = fs.readFileSync(log.path, 'utf8');
  expect(text.split('\n').filter(Boolean)).toHaveLength(2);
  expect(JSON.parse(text.split('\n')[1])).toMatchObject({ agent: 'Cursor', approvals: [{ answer: 'allowed' }] });
  expect(log.read().map((item) => item.agent)).toEqual(['Claude Code', 'Cursor']);
  expect(log.read({ since: Date.parse('2026-11-25T00:00:00Z') }).map((item) => item.agent)).toEqual(['Cursor']);
  expect(log.export({ since: Date.parse('2026-11-25T00:00:00Z') })).toBe(text.split('\n')[1]);
  expect(new AIAuditLog(path.join(root, 'missing.jsonl')).export()).toBe('');
});

it('prunes entries older than the retention window and skips damaged lines', () => {
  const log = new AIAuditLog(path.join(root, 'ai-audit.jsonl'));
  log.append(entry('2026-01-01T00:00:00.000Z'));
  log.append(entry('2026-11-25T00:00:00.000Z'));
  fs.appendFileSync(log.path, '{ not json\n');
  expect(log.read()).toHaveLength(2);
  expect(log.prune(90, Date.parse('2026-11-26T00:00:00Z'))).toBe(2);
  expect(log.read().map((item) => item.time)).toEqual(['2026-11-25T00:00:00.000Z']);
  expect(log.prune(90, Date.parse('2026-11-26T00:00:00Z'))).toBe(0);
});

it('trims oversized runs instead of dropping them', () => {
  const log = new AIAuditLog(path.join(root, 'ai-audit.jsonl'));
  const big = entry('2026-11-26T10:00:00.000Z');
  big.steps = Array.from({ length: 2000 }, (_, index) => ({
    step: index + 1,
    tool: 'read_page',
    ok: true,
    durationMs: 1,
    url: `http://localhost:5173/${'x'.repeat(50)}${index}`,
  }));
  log.append(big);
  const [saved] = log.read() as (AIAuditEntry & { truncated?: boolean })[];
  expect(saved.steps).toHaveLength(50);
  expect(saved.truncated).toBe(true);
});

it('validates retention days and since values', () => {
  expect(aiAuditRetentionDays(undefined)).toBe(90);
  expect(aiAuditRetentionDays(30)).toBe(30);
  expect(() => aiAuditRetentionDays(0)).toThrow('1–3650');
  expect(aiAuditSince(undefined)).toBeUndefined();
  expect(aiAuditSince(1700000000000)).toBe(1700000000000);
  expect(aiAuditSince('2026-11-26')).toBe(Date.parse('2026-11-26'));
  expect(() => aiAuditSince('yesterday')).toThrow('since must be');
});
