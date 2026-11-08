/** User-facing storage failures that can retry OS access after a restart. */
export const storageRecoveryMessage = (subject: string) =>
  `Kudium could not unlock ${subject}. Restart Kudium and allow access to your system’s secure storage if prompted, then try again. Your saved data has been preserved.`;

export const isStorageRecoveryError = (message: string) =>
  message.includes('Kudium could not unlock ') ||
  message.includes('secure local storage is unavailable.') ||
  message.includes('OS encryption is unavailable.') ||
  message.includes('OS encryption is required') ||
  message.includes('OS credential storage is unavailable.');
