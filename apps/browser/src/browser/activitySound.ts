export const activitySounds = {
  chime: 'Kudium chime',
  system: 'System alert',
  Glass: 'Glass',
  Ping: 'Ping',
  Pop: 'Pop',
  Tink: 'Tink',
  Purr: 'Purr',
} as const;
export type ActivitySoundName = keyof typeof activitySounds;
export function validActivitySound(value: unknown): value is ActivitySoundName {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(activitySounds, value)
  );
}
