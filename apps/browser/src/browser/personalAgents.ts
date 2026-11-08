export type PersonalAgentId = 'hermes' | 'openclaw';

export const PERSONAL_AGENTS = [
  {
    id: 'hermes' as const,
    name: 'Hermes',
    guide: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp',
    discoveryNotice: 'Usually available within a minute.',
    discoveryHelp:
      'A running Hermes gateway detects new connections automatically, usually within a minute.',
    fallbackHelp:
      'If Kudium Browser is missing from an existing chat, use /reload-mcp or start a new chat with /new.',
  },
  {
    id: 'openclaw' as const,
    name: 'OpenClaw',
    guide: 'https://docs.openclaw.ai/tools/mcp',
    discoveryNotice: 'Usually available automatically.',
    discoveryHelp:
      'With automatic reload enabled, the OpenClaw gateway picks up MCP changes without restarting.',
    fallbackHelp:
      'If Kudium Browser is still missing, reload or publish the gateway’s MCP configuration. Restart the gateway only if automatic reload is disabled.',
  },
];

export interface PersonalAgentStatus {
  id: PersonalAgentId;
  state:
    | 'missing'
    | 'available'
    | 'configured'
    | 'outdated'
    | 'conflict'
    | 'error';
  configPath: string;
  error?: string;
}

export interface PersonalAgentRequest {
  action: 'list' | 'locate' | 'connect' | 'disconnect';
  id?: PersonalAgentId;
}

export interface PersonalAgentResult {
  agents: PersonalAgentStatus[];
  changed?: boolean;
}
