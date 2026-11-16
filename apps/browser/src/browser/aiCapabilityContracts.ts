/** Completion evidence is defined by the browser, never by assistant prose. */
export const capabilityContracts = [
  {
    id: 'website_hook',
    intent:
      /\b(?:create|build|install|add|save|update|edit|change|make)\b.{0,80}\bhook\b|\b(?:script|automate) (?:this|the|my) (?:website|site|page)\b|\b(?:write|create|build|script)\b.{0,40}\b(?:script|javascript)\b.{0,60}\b(?:website|site|page)\b/i,
    tools: ['configure_site_hooks', 'save_global_hook'],
    recovery:
      'The user requested a website hook or script, but no verified hook save receipt exists. Use read_hook_api, inspect the page and read existing hooks, then author/test and call configure_site_hooks (or save_global_hook for the requested broader scope) to open native review. Preserve unrelated hooks. Do not replace installation with a code snippet or assume permission is denied. If required information is missing, ask for it. Respect actual tool errors and cancellation; report the concrete blocker. Saving verifies configuration only, not runtime behavior.',
  },
] as const;

export interface AICapabilityOutcome {
  capability: string;
  status: 'not_attempted' | 'saved' | 'unverified' | 'denied' | 'failed';
  configurationVerified: boolean;
  runtimeVerified: false;
  needsReload?: boolean;
}

export function capabilityFailure(name: string, error: string) {
  const contract = capabilityContracts.find((item) =>
    (item.tools as readonly string[]).includes(name),
  );
  return contract
    ? {
        capability: contract.id,
        status: error.startsWith('User declined')
          ? ('denied' as const)
          : ('failed' as const),
        error,
        configurationVerified: false,
        runtimeVerified: false,
      }
    : { error };
}
