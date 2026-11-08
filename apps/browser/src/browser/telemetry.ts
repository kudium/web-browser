/**
 * Only these product actions can cross the telemetry boundary. Never add user
 * content.
 */
export const telemetryFeatures = [
  'tab_created',
  'tab_selected',
  'command_opened',
  'space_created',
  'group_imported',
  'group_exported',
  'group_created',
  'project_linked',
  'ai_run',
  'ai_skill_installed',
  'file_browser_opened',
  'file_previewed',
  'file_saved',
  'terminal_opened',
  'script_saved',
  'script_run',
  'downloads_opened',
  'settings_opened',
] as const;
export type TelemetryFeature = (typeof telemetryFeatures)[number];
export const errorTypes = [
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
] as const;
export function safeErrorType(value: unknown): string {
  return errorTypes.includes(value as any) ? String(value) : 'Error';
}
export function telemetryFeature(value: unknown): value is TelemetryFeature {
  return telemetryFeatures.includes(value as TelemetryFeature);
}

/**
 * Keep only shipped bundle names and numeric locations, never paths or
 * messages.
 */
export function safeErrorFrames(stack: unknown): string[] {
  if (typeof stack !== 'string') return [];
  return [
    ...stack
      .slice(0, 10000)
      .matchAll(
        /(?:^|[/\\\s])(main|renderer|preload)(?:\.prod)?\.js:(\d{1,8}):(\d{1,8})/gm
      ),
  ]
    .slice(0, 8)
    .map((match) => `${match[1]}.js:${match[2]}:${match[3]}`);
}
export function validatedErrorFrames(frames: unknown): string[] {
  return Array.isArray(frames)
    ? frames
        .filter(
          (frame) =>
            typeof frame === 'string' &&
            /^(main|renderer|preload)\.js:\d{1,8}:\d{1,8}$/.test(frame)
        )
        .slice(0, 8)
    : [];
}
