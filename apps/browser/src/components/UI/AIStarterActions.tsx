const actions = [
  {
    label: 'Create a social media group',
    prompt:
      'Create a Social Media tab group with Tiktok, Instagram, Reddit and X.com.',
  },
  {
    label: 'Set up my work tools',
    prompt:
      'Create a Work tab group with Slack, Google Docs, Google Drive, and Google Calendar.',
  },
  {
    label: 'Summarize my open tabs',
    prompt:
      'Summarize the pages in my current tab group and highlight the key points.',
  },
  {
    label: 'Update and test my website',
    prompt:
      'Help me update and test my website using a linked project folder. Ask which group and what changes I want, then inspect the project and suggest useful scripts.',
  },
];
export function AIStarterActions({
  onChoose,
  disabled,
}: {
  onChoose: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="ai-starter-actions" aria-label="Things to try with AI">
      <span>Try asking</span>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          disabled={disabled}
          onClick={() => onChoose(action.prompt)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
