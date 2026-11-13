import type { Session, WebContents } from 'electron';

// Chromium reuses certificate exceptions across tabs in the same session.
const errors = new WeakMap<Session, Map<string, string>>();

export function certificateErrorFor(session: Session, origin: string) {
  return errors.get(session)?.get(origin);
}

/** Only website contents opt in; app UI and update requests keep TLS checks. */
export function allowWebsiteCertificateErrors(
  contents: WebContents,
  changed: () => void
) {
  contents.on(
    'certificate-error',
    (event, url, error, _certificate, callback) => {
      let origin: string;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') return;
        origin = parsed.origin;
      } catch {
        return;
      }
      let sessionErrors = errors.get(contents.session);
      if (!sessionErrors) {
        sessionErrors = new Map();
        errors.set(contents.session, sessionErrors);
      }
      sessionErrors.set(origin, error);
      event.preventDefault();
      callback(true);
      changed();
    }
  );
}
