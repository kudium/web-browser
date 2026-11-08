import { app, ipcMain, WebContents } from 'electron';
import { PostHog } from 'posthog-node';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import posthogConfig from '../browser/posthog.json';
import {
  getBrowserPreferences,
  onBrowserPreferencesChanged,
} from './preferences';
import {
  safeErrorType,
  safeErrorFrames,
  validatedErrorFrames,
  telemetryFeature,
  TelemetryFeature,
} from '../browser/telemetry';

const enabled = () =>
  app.isPackaged && getBrowserPreferences().shareUsageDiagnostics;

// Gate capture and transport: queued events must not escape after opt-out.
export class TelemetryClient extends PostHog {
  active = true;

  fetch(...args: Parameters<PostHog['fetch']>): ReturnType<PostHog['fetch']> {
    if (!this.active || !enabled())
      return Promise.resolve({
        status: 200,
        text: async () => '',
        json: async () => ({ status: 1 }),
      });
    return super.fetch(...args);
  }
}
let client: TelemetryClient | undefined;
let distinctId: string;
const properties = () => ({
  app_version: app.getVersion(),
  platform: process.platform,
  architecture: process.arch,
  $process_person_profile: false,
  $geoip_disable: true,
});
function capture(event: string, extra: Record<string, unknown> = {}) {
  if (!client || !enabled()) return;
  try {
    client.capture({
      distinctId,
      event,
      properties: { ...properties(), ...extra },
    });
  } catch {
    /* Telemetry never interrupts the app. */
  }
}
export function trackFeature(feature: TelemetryFeature, succeeded = true) {
  if (telemetryFeature(feature))
    capture('feature_used', { feature, succeeded });
}
export function trackAppError(
  type: unknown,
  source: 'main' | 'renderer' | 'operation',
  feature?: TelemetryFeature,
  frames?: unknown
) {
  // Raw error messages and stacks can contain URLs, source code, prompts and local paths.
  if (!client || !enabled()) return;
  const error = new Error(
    `Kudium ${source} error${feature ? ` (${feature})` : ''}`
  );
  error.name = safeErrorType(type);
  error.stack = [
    `${error.name}: ${error.message}`,
    ...validatedErrorFrames(frames).map((frame) => `    at ${frame}`),
  ].join('\n');
  try {
    client.captureException(error, distinctId, {
      ...properties(),
      source,
      ...(feature ? { feature } : {}),
    });
    client.flush().catch(() => {});
  } catch {
    /* Diagnostics must not introduce failures. */
  }
}
export function registerTelemetry(trusted: (contents: WebContents) => boolean) {
  const key = process.env.KUDIUM_POSTHOG_KEY || posthogConfig.projectToken;
  const host = process.env.KUDIUM_POSTHOG_HOST || posthogConfig.host;
  if (
    !key ||
    !['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(host)
  )
    return;
  const start = () => {
    if (!enabled() || client) return;
    try {
      const file = path.join(app.getPath('userData'), 'telemetry-id');
      try {
        distinctId = fs.readFileSync(file, 'utf8').trim();
      } catch {
        distinctId = '';
      }
      if (!/^[0-9a-f-]{36}$/.test(distinctId)) {
        distinctId = randomUUID();
        fs.writeFileSync(file, distinctId, { mode: 0o600 });
      }
      client = new TelemetryClient(key, {
        host,
        disableGeoip: true,
        enableExceptionAutocapture: false,
        flushAt: 20,
        flushInterval: 30000,
        maxQueueSize: 100,
        before_send: (event) => (enabled() ? event : null),
      });
      client.on('error', () => {});
      capture('app_started');
    } catch {
      /* Missing or unwritable telemetry configuration is nonfatal. */
    }
  };
  app
    .whenReady()
    .then(start)
    .catch(() => {});
  onBrowserPreferencesChanged(() => {
    if (enabled()) start();
    else if (client) {
      const previous = client;
      client = undefined;
      previous.active = false;
      // Discard queued events at the transport boundary after opt-out.
      previous.shutdown(1000).catch(() => {});
      try {
        fs.unlinkSync(path.join(app.getPath('userData'), 'telemetry-id'));
      } catch {
        /* Already removed. */
      }
    }
  });
  ipcMain.on('kudium-telemetry', (event, request: unknown) => {
    if (
      !trusted(event.sender) ||
      event.senderFrame !== event.sender.mainFrame ||
      !request ||
      typeof request !== 'object'
    )
      return;
    const value = request as {
      feature?: unknown;
      succeeded?: unknown;
      errorType?: unknown;
      frames?: unknown;
    };
    if (telemetryFeature(value.feature)) {
      trackFeature(value.feature, value.succeeded !== false);
      if (value.succeeded === false)
        trackAppError(
          value.errorType,
          'operation',
          value.feature,
          value.frames
        );
    } else if (value.errorType)
      trackAppError(value.errorType, 'renderer', undefined, value.frames);
  });
  process.on('uncaughtExceptionMonitor', (error) =>
    trackAppError(error.name, 'main', undefined, safeErrorFrames(error.stack))
  );
  app.on('web-contents-created', (_event, contents) => {
    contents.on('render-process-gone', () => {
      if (trusted(contents)) trackAppError('Error', 'renderer');
    });
  });
  let closing = false;
  app.on('before-quit', (event) => {
    if (!client || closing) return;
    closing = true;
    event.preventDefault();
    client
      .shutdown(2000)
      .then(() => app.quit())
      .catch(() => app.quit());
  });
}
