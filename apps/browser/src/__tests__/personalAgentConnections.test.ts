/** @jest-environment node */
/* File permission checks intentionally inspect mode bits. */
/* eslint-disable no-bitwise */
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSON5 from 'json5';
import { parse } from 'yaml';
import {
  agentConfig,
  PersonalAgentConnections,
} from '../main/personalAgentConnections';
import type { PersonalAgentId } from '../browser/personalAgents';

let home: string;
let registry: string;
let manager: PersonalAgentConnections;
const connection = {
  mcpServers: {
    kudiumbrowser: {
      url: 'http://127.0.0.1:43187/mcp',
      headers: { Authorization: 'Bearer fixture-private-token' },
    },
  },
};
const filenames = () => ({
  hermes: path.join(home, '.hermes/config.yaml'),
  openclaw: path.join(home, '.openclaw/openclaw.json'),
});
const setup = (id: PersonalAgentId, text: string) => {
  const filename = filenames()[id];
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, text, { mode: 0o600 });
  return filename;
};
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-agent-test-'));
  registry = path.join(home, 'registrations.json');
  manager = new PersonalAgentConnections({ home, filename: registry });
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

it.each(['hermes', 'openclaw'] as const)(
  'connects %s without replacing unrelated values or comments and disconnects only its entry',
  async (id) => {
    const text =
      id === 'hermes'
        ? '# My settings\nmodel: my-model\nmcp_servers:\n  other:\n    url: https://other.test/mcp\n'
        : '// My settings\n{model: "my-model", mcp: {servers: {other: {url: "https://other.test/mcp"}}},}\n';
    const filename = setup(id, text);
    const confirm = jest.fn().mockResolvedValue(true);
    expect(await manager.change(id, connection, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    const after = fs.readFileSync(filename, 'utf8');
    expect(after).toContain('My settings');
    const parsed = id === 'hermes' ? parse(after) : JSON5.parse(after);
    expect(parsed.model).toBe('my-model');
    const servers = id === 'hermes' ? parsed.mcp_servers : parsed.mcp.servers;
    expect(servers.other.url).toBe('https://other.test/mcp');
    expect(servers.kudiumbrowser.headers.Authorization).toBe(
      'Bearer fixture-private-token'
    );
    if (process.platform !== 'win32') { expect(fs.statSync(filename).mode & 0o777).toBe(0o600); }
    const backup = fs
      .readdirSync(path.dirname(filename))
      .find((entry) => entry.includes('kudiumbrowser-backup'))!;
    expect(
      fs.readFileSync(path.join(path.dirname(filename), backup), 'utf8')
    ).toBe(text);
    if (process.platform !== 'win32') { expect(
      fs.statSync(path.join(path.dirname(filename), backup)).mode & 0o777
    ).toBe(0o600); }
    expect(JSON.stringify(manager.list(connection))).not.toContain(
      'fixture-private-token'
    );
    manager = new PersonalAgentConnections({ home, filename: registry });
    expect(
      manager.list(connection).find((entry) => entry.id === id)?.state
    ).toBe('configured');
    expect(await manager.change(id, undefined, confirm)).toBe(true);
    const remaining = agentConfig(id, fs.readFileSync(filename, 'utf8'));
    expect(remaining.entry).toBeUndefined();
    expect(fs.readFileSync(filename, 'utf8')).toContain('other.test');
  }
);

it('detects missing agents without creating folders, and supports an existing installation with no config yet', async () => {
  expect(manager.list().every((entry) => entry.state === 'missing')).toBe(true);
  fs.mkdirSync(path.join(home, '.hermes'));
  expect(manager.list()[0].state).toBe('available');
  await manager.change('hermes', connection, jest.fn());
  expect(manager.list(connection)[0].state).toBe('configured');
});

it('requires review to replace an unknown entry and cancels without changes', async () => {
  const filename = setup(
    'hermes',
    'mcp_servers:\n  kudiumbrowser:\n    command: original-agent\n'
  );
  const original = fs.readFileSync(filename, 'utf8');
  expect(manager.list()[0].state).toBe('conflict');
  expect(await manager.change('hermes', connection, async () => false)).toBe(
    false
  );
  expect(fs.readFileSync(filename, 'utf8')).toBe(original);
  expect(await manager.change('hermes', connection, async () => true)).toBe(
    true
  );
  expect(manager.list(connection)[0].state).toBe('configured');
});

it('detects rotated tokens and refuses to silently remove user edits', async () => {
  const filename = setup('openclaw', '{}');
  await manager.change('openclaw', connection, jest.fn());
  const rotated = {
    mcpServers: {
      kudiumbrowser: {
        ...connection.mcpServers.kudiumbrowser,
        headers: { Authorization: 'Bearer new-token' },
      },
    },
  };
  expect(manager.list(rotated)[1].state).toBe('outdated');
  const edited = fs
    .readFileSync(filename, 'utf8')
    .replace('streamable-http', 'sse');
  fs.writeFileSync(filename, edited);
  expect(await manager.change('openclaw', undefined, async () => false)).toBe(
    false
  );
  expect(fs.readFileSync(filename, 'utf8')).toBe(edited);
});

it('rejects concurrent config changes during review', async () => {
  const filename = setup(
    'openclaw',
    '{mcp:{servers:{kudiumbrowser:{url:"https://original.test"}}}}'
  );
  await expect(
    manager.change('openclaw', connection, async () => {
      fs.writeFileSync(filename, '{model:"edited while reviewing"}');
      return true;
    })
  ).rejects.toThrow('changed during setup');
  expect(fs.readFileSync(filename, 'utf8')).toContain('edited while reviewing');
});

it('revoked review cannot create a backup, registry or changed config', async () => {
  const filename = setup(
    'openclaw',
    '{mcp:{servers:{kudiumbrowser:{url:"https://original.test"}}}}'
  );
  const before = fs.readFileSync(filename, 'utf8');
  let current = true;
  await expect(
    manager.change(
      'openclaw',
      connection,
      async () => {
        current = false;
        return true;
      },
      undefined,
      () => {
        if (!current) throw new Error('Review revoked');
      }
    )
  ).rejects.toThrow('Review revoked');
  expect(fs.readFileSync(filename, 'utf8')).toBe(before);
  expect(fs.readdirSync(path.dirname(filename))).toEqual(['openclaw.json']);
  expect(fs.existsSync(registry)).toBe(false);
});

it('rejects malformed/linked files and never returns their secret contents in status errors', async () => {
  const filename = setup('hermes', 'invalid: [private-secret');
  expect(manager.list()[0].state).toBe('error');
  expect(JSON.stringify(manager.list())).not.toContain('private-secret');
  await expect(manager.change('hermes', connection, jest.fn())).rejects.toThrow(
    'invalid'
  );
  fs.unlinkSync(filename);
  const elsewhere = path.join(home, 'elsewhere.yaml');
  fs.writeFileSync(elsewhere, 'model: untouched');
  fs.symlinkSync(elsewhere, filename);
  await expect(manager.change('hermes', connection, jest.fn())).rejects.toThrow(
    'not a link'
  );
  expect(fs.readFileSync(elsewhere, 'utf8')).toBe('model: untouched');
});

it('preserves YAML aliases and rejects an aliased server mapping rather than mutating other settings', () => {
  const text = 'defaults: &defaults\n  model: unchanged\nprofile: *defaults\n';
  const result = agentConfig('hermes', text).set(
    connection.mcpServers.kudiumbrowser
  );
  expect(parse(result).profile.model).toBe('unchanged');
  const alias =
    'shared: &shared\n  other:\n    url: https://other.test\nmcp_servers: *shared\n';
  expect(() =>
    agentConfig('hermes', alias).set(connection.mcpServers.kudiumbrowser)
  ).toThrow('mapping');
});

it('supports a user-chosen config and remembers its location', async () => {
  const filename = path.join(home, 'custom-agent.yaml');
  fs.writeFileSync(filename, 'model: custom');
  manager.locate('hermes', filename);
  await manager.change('hermes', connection, jest.fn());
  const reopened = new PersonalAgentConnections({ home, filename: registry });
  expect(reopened.list(connection)[0]).toMatchObject({
    configPath: filename,
    state: 'configured',
  });
});

it('rolls back the agent config if saving the local registry fails', async () => {
  const filename = setup('openclaw', '{model:"keep"}');
  const broken = new PersonalAgentConnections({
    home,
    filename: path.join(home, 'missing/registry.json'),
  });
  await expect(
    broken.change('openclaw', connection, jest.fn())
  ).rejects.toThrow('restored');
  expect(fs.readFileSync(filename, 'utf8')).toBe('{model:"keep"}');
});
