import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import JSON5 from 'json5';
import { update as updateJSON5 } from 'jju';
import { isMap, parseDocument } from 'yaml';
import { writePrivateFile as atomicWrite } from './privateFile';
import type { MCPConnection } from '../browser/mcp';
import { PERSONAL_AGENTS } from '../browser/personalAgents';
import type {
  PersonalAgentId,
  PersonalAgentStatus,
} from '../browser/personalAgents';

type RecordValue = Record<string, unknown>;
type Registration = { configPath: string; hash?: string };
const object = (value: unknown): value is RecordValue =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const LIMIT = 2 * 1024 * 1024;
const empty = (id: PersonalAgentId) => (id === 'hermes' ? '' : '{}\n');

/** Format-preserving adapters; only the Kudium Browser server entry is edited. */
export function agentConfig(id: PersonalAgentId, text: string) {
  const yaml =
    id === 'hermes' ? parseDocument(text, { merge: true }) : undefined;
  if (yaml?.errors.length) throw new Error('Invalid configuration');
  const data = yaml ? yaml.toJS({ maxAliasCount: 50 }) : JSON5.parse(text);
  const root: RecordValue = data ?? {};
  if (!object(root)) throw new Error('Invalid configuration');
  const parent = id === 'hermes' ? root : root.mcp;
  if (parent !== undefined && !object(parent))
    throw new Error('Invalid MCP settings');
  const servers = id === 'hermes' ? root.mcp_servers : parent?.servers;
  if (servers !== undefined && !object(servers))
    throw new Error('Invalid MCP servers');
  const entry = object(servers) ? servers.touchbox : undefined;
  const set = (next?: RecordValue) => {
    if (yaml) {
      const existing = yaml.get('mcp_servers', true);
      if (existing !== undefined && !isMap(existing))
        throw new Error('MCP servers must be a mapping');
      if (next) yaml.setIn(['mcp_servers', 'touchbox'], next);
      else yaml.deleteIn(['mcp_servers', 'touchbox']);
      const result = yaml.toString();
      const check = parseDocument(result, { merge: true });
      if (check.errors.length) throw new Error('Invalid updated configuration');
      check.toJS({ maxAliasCount: 50 });
      return result;
    }
    const updated = { ...root, mcp: { ...(parent as RecordValue) } };
    updated.mcp.servers = { ...(servers as RecordValue) };
    if (next) (updated.mcp.servers as RecordValue).touchbox = next;
    else delete (updated.mcp.servers as RecordValue).touchbox;
    return updateJSON5(text, updated, {
      reserved_keys: 'replace',
      null_prototype: true,
    });
  };
  return { entry, set };
}

function snapshot(filename: string, fallback: string) {
  if (!fs.existsSync(filename)) return { text: fallback, stat: undefined };
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw new Error('Choose a regular configuration file, not a link.');
  if (stat.size > LIMIT) throw new Error('The configuration exceeds 2 MB.');
  return { text: fs.readFileSync(filename, 'utf8'), stat };
}

export class PersonalAgentConnections {
  private registrations: Partial<Record<PersonalAgentId, Registration>> = {};

  constructor(
    private options: {
      home: string;
      filename: string;
      hermesHome?: string;
      openclawConfig?: string;
      openclawHome?: string;
    }
  ) {
    try {
      const saved = JSON.parse(fs.readFileSync(options.filename, 'utf8'));
      PERSONAL_AGENTS.forEach(({ id }) => {
        if (typeof saved[id]?.configPath === 'string')
          this.registrations[id] = saved[id];
      });
    } catch {
      // Default agent locations remain available if the registry is absent.
    }
  }

  private filename(id: PersonalAgentId) {
    if (!PERSONAL_AGENTS.some((agent) => agent.id === id))
      throw new Error('Unknown personal agent.');
    return (
      this.registrations[id]?.configPath ||
      (id === 'hermes'
        ? path.join(
            this.options.hermesHome || path.join(this.options.home, '.hermes'),
            'config.yaml'
          )
        : this.options.openclawConfig ||
          path.join(
            this.options.openclawHome ||
              path.join(this.options.home, '.openclaw'),
            'openclaw.json'
          ))
    );
  }

  list(
    connection?: MCPConnection,
    agentConnections?: Partial<Record<PersonalAgentId, MCPConnection>>
  ): PersonalAgentStatus[] {
    return PERSONAL_AGENTS.map(({ id }) => {
      const configPath = this.filename(id);
      try {
        if (!fs.existsSync(path.dirname(configPath)))
          return { id, configPath, state: 'missing' };
        const { text } = snapshot(configPath, empty(id));
        const { entry } = agentConfig(id, text);
        let state: PersonalAgentStatus['state'] = 'available';
        const expected = agentConnections?.[id] || connection;
        if (entry !== undefined) {
          if (hash(entry) !== this.registrations[id]?.hash) state = 'conflict';
          else if (agentConnections && !agentConnections[id])
            state = 'outdated';
          else if (
            expected &&
            (!object(entry) ||
              entry.url !== expected.mcpServers.touchbox.url ||
              !object(entry.headers) ||
              entry.headers.Authorization !==
                expected.mcpServers.touchbox.headers.Authorization)
          )
            state = 'outdated';
          else state = 'configured';
        }
        return { id, configPath, state };
      } catch {
        return {
          id,
          configPath,
          state: 'error',
          error:
            'Could not read this configuration. Choose a valid, regular config file.',
        };
      }
    });
  }

  locate(id: PersonalAgentId, filename: string) {
    this.filename(id);
    const { text } = snapshot(filename, empty(id));
    agentConfig(id, text);
    const previous = this.registrations;
    this.registrations = {
      ...previous,
      [id]: {
        configPath: filename,
        hash:
          previous[id]?.configPath === filename
            ? previous[id]?.hash
            : undefined,
      },
    };
    try {
      atomicWrite(this.options.filename, JSON.stringify(this.registrations));
    } catch (error) {
      this.registrations = previous;
      throw error;
    }
  }

  async change(
    id: PersonalAgentId,
    connection: MCPConnection | undefined,
    confirm: (message: string, filename: string) => Promise<boolean>,
    beforeCommit?: () => void,
    assertCurrent: () => void = () => {}
  ): Promise<boolean> {
    assertCurrent();
    const filename = this.filename(id);
    if (!fs.existsSync(path.dirname(filename)))
      throw new Error(
        'Agent not found. Install it first, or choose its configuration.'
      );
    const before = snapshot(filename, empty(id));
    let config: ReturnType<typeof agentConfig>;
    try {
      config = agentConfig(id, before.text);
    } catch {
      throw new Error(
        'This agent configuration is invalid. It has not been changed.'
      );
    }
    if (!connection && config.entry === undefined) return false;
    const agent = PERSONAL_AGENTS.find((item) => item.id === id)!;
    if (
      config.entry !== undefined &&
      hash(config.entry) !== this.registrations[id]?.hash &&
      !(await confirm(
        `${
          connection ? 'Replace' : 'Remove'
        } the existing Kudium Browser connection in ${agent.name}?`,
        filename
      ))
    )
      return false;
    assertCurrent();
    const next = connection
      ? {
          ...connection.mcpServers.touchbox,
          enabled: true,
          ...(id === 'hermes'
            ? { skip_preflight: true }
            : { transport: 'streamable-http' }),
        }
      : undefined;
    let updated: string;
    try {
      updated = config.set(next);
    } catch {
      throw new Error(
        'Could not update this configuration safely. It has not been changed.'
      );
    }
    if (updated === before.text) return false;
    const current = snapshot(filename, empty(id));
    if (
      current.text !== before.text ||
      current.stat?.ino !== before.stat?.ino ||
      current.stat?.dev !== before.stat?.dev
    )
      throw new Error('The configuration changed during setup. Try again.');
    if (before.stat)
      fs.writeFileSync(
        `${filename}.touchbox-backup-${randomUUID()}`,
        before.text,
        { mode: 0o600, flag: 'wx' }
      );
    beforeCommit?.();
    assertCurrent();
    atomicWrite(filename, updated);
    const previous = this.registrations;
    this.registrations = {
      ...previous,
      [id]: { configPath: filename, hash: next ? hash(next) : undefined },
    };
    try {
      atomicWrite(this.options.filename, JSON.stringify(this.registrations));
    } catch {
      this.registrations = previous;
      if (before.stat) atomicWrite(filename, before.text);
      else fs.unlinkSync(filename);
      throw new Error(
        'Setup could not be saved. The previous configuration was restored.'
      );
    }
    return true;
  }
}
