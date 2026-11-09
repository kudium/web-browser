export interface AISkill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  instructions: string;
  resources: Record<string, string>;
}
export interface AISkillsRequest {
  action:
    | 'list'
    | 'add'
    | 'toggle'
    | 'remove'
    | 'import-link'
    | 'import-path'
    | 'create'
    | 'update';
  id?: string;
  enabled?: boolean;
  source?: string;
  name?: string;
  description?: string;
  instructions?: string;
}

/** Stable, readable slash names; suffix collisions using library order. */
export function skillCommands(skills: AISkill[]) {
  const used = new Set<string>();
  return skills.map((skill) => {
    const base =
      skill.name
        .trim()
        .replace(/^\/+/, '')
        .replace(/[^\p{L}\p{N}_-]+/gu, '-')
        .replace(/^-|-$/g, '') || 'skill';
    let command = base;
    let suffix = 2;
    while (used.has(command.toLowerCase())) {
      command = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(command.toLowerCase());
    return { ...skill, command: `/${command}` };
  });
}
