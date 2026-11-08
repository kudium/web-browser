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
    | 'create';
  id?: string;
  enabled?: boolean;
  source?: string;
  name?: string;
  description?: string;
  instructions?: string;
}
