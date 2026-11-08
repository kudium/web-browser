import { useEffect, useState } from 'react';
import { Button, Callout, DropdownMenu, IconButton } from '@radix-ui/themes';
import { Bot, Ellipsis, Check } from 'lucide-react';
import { PreferenceHint } from '../../UI/PreferenceHint';
import { PERSONAL_AGENTS } from '../../../browser/personalAgents';
import type {
  PersonalAgentId,
  PersonalAgentRequest,
  PersonalAgentStatus,
} from '../../../browser/personalAgents';

const statusText = (state?: PersonalAgentStatus['state']) => {
  switch (state) {
    case 'configured':
      return 'Configured';
    case 'outdated':
      return 'Reconnect to update browser access';
    case 'conflict':
      return 'An existing Kudium Browser connection was found';
    case 'available':
      return 'Ready to connect';
    case 'missing':
      return 'Choose your agent’s configuration';
    case 'error':
      return 'Configuration needs attention';
    default:
      return 'Checking installation…';
  }
};

export function PersonalAgentSettings({
  revision,
  busy,
  onBusy,
  onUpdated,
}: {
  revision: number;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onUpdated: () => void;
}) {
  const [agents, setAgents] = useState<PersonalAgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PersonalAgentId>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    window.electron.ai
      .personalAgents({ action: 'list' })
      .then((value) => {
        if (alive) {
          setAgents(value.agents);
          setError('');
        }
        return undefined;
      })
      .catch((reason: Error) => {
        if (alive) setError(reason.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [revision, retry]);
  useEffect(() => {
    const rescan = () => setRetry((value) => value + 1);
    window.addEventListener('focus', rescan);
    return () => window.removeEventListener('focus', rescan);
  }, []);
  const perform = async (
    id: PersonalAgentId,
    action: PersonalAgentRequest['action']
  ) => {
    onBusy(true);
    setActive(id);
    setError('');
    setNotice('');
    try {
      const result = await window.electron.ai.personalAgents({ id, action });
      setAgents(result.agents);
      const agent = PERSONAL_AGENTS.find((entry) => entry.id === id)!;
      if (result.changed)
        setNotice(
          action === 'disconnect'
            ? `${agent.name} disconnected.`
            : `${agent.name} configured. ${agent.discoveryNotice}`
        );
      onUpdated();
    } catch (reason) {
      setError(
        (reason as Error).message.replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          ''
        )
      );
    } finally {
      setActive(undefined);
      onBusy(false);
    }
  };
  return (
    <section className="personal-agent-settings" aria-label="Personal agents">
      <div className="personal-agent-heading">
        <h2>Personal agents</h2>
        <p>Connect your existing agent to work in Kudium Browser.</p>
      </div>
      <div className="preference-card">
        {PERSONAL_AGENTS.map((agent) => {
          const state = agents.find((entry) => entry.id === agent.id);
          const locate =
            !state || state.state === 'missing' || state.state === 'error';
          const configured = state?.state === 'configured';
          let action: PersonalAgentRequest['action'] = 'connect';
          let label = 'Connect';
          if (locate) {
            action = 'locate';
            label = 'Locate…';
          } else if (configured) {
            action = 'disconnect';
            label = 'Disconnect';
          } else if (state?.state === 'outdated') label = 'Reconnect';
          if (active === agent.id) label = 'Working…';
          return (
            <div className="personal-agent-row" key={agent.id}>
              <span className="personal-agent-icon" aria-hidden="true">
                {configured ? <Check size={18} /> : <Bot size={18} />}
              </span>
              <div className="personal-agent-info">
                <div className="personal-agent-title">
                  <strong>{agent.name}</strong>
                  <PreferenceHint label={`${agent.name} connection`}>
                    <p>{agent.discoveryHelp}</p>
                    <p>{agent.fallbackHelp}</p>
                    {agent.id === 'openclaw' && (
                      <p>
                        Use a version with Settings → MCP. This connects the
                        local installation.
                      </p>
                    )}
                    {state && (
                      <p className="personal-agent-config-path">
                        {state.configPath}
                      </p>
                    )}
                    <a
                      href={agent.guide}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Setup guide
                    </a>
                  </PreferenceHint>
                </div>
                <p>
                  {loading && !state
                    ? 'Checking installation…'
                    : statusText(state?.state)}
                </p>
              </div>
              <div className="personal-agent-actions">
                <Button
                  variant="soft"
                  disabled={busy || loading}
                  aria-label={`${label.replace('…', '')} ${agent.name}`}
                  onClick={() => perform(agent.id, action)}
                >
                  {label}
                </Button>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    <IconButton
                      variant="ghost"
                      color="gray"
                      disabled={busy || loading}
                      aria-label={`${agent.name} options`}
                    >
                      <Ellipsis size={16} />
                    </IconButton>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content>
                    <DropdownMenu.Item
                      onSelect={() => perform(agent.id, 'locate')}
                    >
                      Choose configuration…
                    </DropdownMenu.Item>
                    {configured && (
                      <DropdownMenu.Item
                        onSelect={() => perform(agent.id, 'connect')}
                      >
                        Update connection
                      </DropdownMenu.Item>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>
            </div>
          );
        })}
      </div>
      {error && (
        <Callout.Root color="red" role="alert">
          <Callout.Text>
            {error}{' '}
            <Button
              size="1"
              variant="soft"
              disabled={busy}
              onClick={() => setRetry((value) => value + 1)}
            >
              Check again
            </Button>
          </Callout.Text>
        </Callout.Root>
      )}
      {notice && (
        <p role="status" className="personal-agent-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
