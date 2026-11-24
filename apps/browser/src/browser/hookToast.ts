export type HookToast = {
  id: string; title: string; message: string;
  type?: 'info' | 'warn' | 'success' | 'error';
  tone?: 'info' | 'success' | 'warning' | 'error';
  durationMs?: number;
  action?: { id: string; label: string };
};
export function validateHookToast(value: unknown): HookToast {
  const input = value as HookToast;
  if (!input || Object.keys(input).some(key => !['id','title','message','tone','type','action','durationMs'].includes(key)) ||
    typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(input.id) ||
    typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 ||
    typeof input.message !== 'string' || input.message.length > 500 ||
    (input.type !== undefined && !['info','warn','success','error'].includes(input.type)) ||
    (input.tone !== undefined && !['info','success','warning','error'].includes(input.tone))) throw new Error('Invalid hook toast.');
  if (input.durationMs !== undefined && (!Number.isInteger(input.durationMs) || input.durationMs < 1000 || input.durationMs > 60000)) throw new Error('Toast duration must be 1000–60000 milliseconds.');
  if (input.action && (Object.keys(input.action).some(key => !['id','label'].includes(key)) ||
    typeof input.action.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(input.action.id) ||
    typeof input.action.label !== 'string' || !input.action.label.trim() || input.action.label.length > 40)) throw new Error('Invalid toast action.');
  return {...input, tone: input.type === 'warn' ? 'warning' : input.type || input.tone};
}
