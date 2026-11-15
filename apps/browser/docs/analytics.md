# Product analytics and diagnostics

PostHog project: https://us.posthog.com/project/720353
Usage dashboard: https://us.posthog.com/project/720353/dashboard/2321556
Errors: https://us.posthog.com/project/720353/error-tracking

The free plan is selected. Autocapture, heatmaps, web vitals autocapture and session replay are disabled. The project configuration in `src/browser/posthog.json` contains only a public, write-only ingestion token, not a personal API key. Build-time overrides are `KUDIUM_POSTHOG_KEY` and `KUDIUM_POSTHOG_HOST` (US/EU Cloud ingestion hosts only).

## Events

- `app_started`: anonymous active installs, one event when telemetry starts.
- `feature_used`: a whitelisted `feature` and boolean `succeeded`. Covers tab creation/selection, groups, spaces, Action Command, project linking, AI runs/skill installation, file browsing/preview/save, terminals, scripts, downloads and settings.
- `$exception`: error class, main/renderer/operation source, optional feature, and sanitized shipped-bundle locations. Raw error messages, raw stack paths, URLs, chats, file contents, terminal commands/output, group names and credentials are excluded. No screenshots or session recordings.

Events include app version, OS platform and architecture. Anonymous UUIDs are stored locally in `telemetry-id`; they are not tied to email or GitHub identity. Person profiles and GeoIP enrichment are disabled. PostHog still receives the network request like any hosted service.

`Privacy & security → Share usage and diagnostics` controls collection. It defaults on in packaged builds, is always disabled in development, and deletes the local identifier on opt-out. A transport gate prevents queued events from being sent after opt-out. Requests already dispatched cannot be recalled. SDK queues are bounded and memory-only; this is best-effort diagnostics, not an offline crash-report archive.

Only trusted top-level Kudium UI windows can submit telemetry over IPC. Website tabs cannot submit analytics. Operation counts count instrumented actions, including file-list requests; use unique-install adoption charts to assess how many users use each feature. User cancellations returning null/false are not counted as successful usage.

## Dashboard and validation

The Usage & Reliability dashboard has active installs, unique-install feature adoption, total feature operations and failures by feature over 30 days. All charts exclude `is_test=true` setup events. A labelled synthetic event and synthetic exception were received and verified in PostHog. They are not real user usage or a real bug.

Focused tests verify schema allowlists, error/path filtering, trusted-frame checks, development disabling, identifier reset and queued transport suppression after opt-out. Native Electron component review covered the privacy control at 900px and 360px in light/dark mode, with its hint open/closed and toggling. Production main-process compilation was checked. Live verification on November 14, 2026 confirmed received `app_started` and `feature_used` events from macOS arm64 app version `1.0.11`, without an `is_test` marker. A successful `tab_selected` event was timestamped `2026-11-14T22:33:41.240Z`. Feature operations are populated in the dashboard. Received exceptions include a sanitized `Kudium renderer error`; that event had no stacktrace, so its receipt confirms error delivery but not source-level crash diagnosis. The six focused telemetry tests passed again during this verification.

When adding a feature, extend the shared allowlist and instrument an explicit action. Pass only a fixed feature name and outcome. Do not attach user-provided values.
