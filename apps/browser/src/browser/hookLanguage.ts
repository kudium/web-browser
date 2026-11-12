export interface HookLanguageRequest {
  action: 'completions' | 'diagnostics' | 'hover';
  source: string;
  position: number;
}
export interface HookLanguageResult {
  completions?: { label: string; type: string; detail: string }[];
  from?: number;
  diagnostics?: {
    from: number;
    to: number;
    severity: 'error' | 'warning';
    message: string;
  }[];
  hover?: { from: number; to: number; text: string };
}
