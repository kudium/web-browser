# UI refresh performance plan

Replace work that repeats while nothing has changed with cached metadata and explicit change notifications. Keep credential authorization and actual fill operations separate from metadata used to render controls.

## Implementation

1. Cache the vault summary after its initial load and successful writes. Lock expiry checks must not load or parse files. Startup summary loading uses the existing worker; older stores can load once on first access.
2. Persist a separate autofill field index containing field names, aliases and protection flags, never field values or passwords. Apply group overrides and website priority. Older stores acquire the index on normal unlock. Read actual values and revalidate permissions only for a requested fill. Availability fallback uses one effective-record pass.
3. Start save-login observation only for a pending attempt. Debounce relevant DOM changes and use one settling timeout instead of interval polling. Bound observation to the pending-attempt lifetime and disconnect after a prompt or disposal.
4. Notify trusted application windows when saved data changes. Notes, the unread badge and Personal Data settings refresh from these notifications. Build the ordinary-note ID set once per summary request.
5. Use existing playback/navigation events for immediate PiP refreshes. Observe video DOM changes, metadata/playback/PiP events and element resize in every loaded frame and open shadow root. Coalesce notifications; detach observers and listeners for removed nodes. Use a 30-second fallback only for incomplete frame observation or custom elements with inaccessible or not-yet-attached shadow roots.
6. Apply AI overlay bounds and visibility only when changed. Subscribe to committed browser layout and host-theme changes, coalescing updates into one deferred refresh; no recurring geometry timer. Refresh developer editors on explicit window updates, preference changes and developer runtime changes; remove their interval.

## Verification

Regression checks cover locked status and availability without file access or unlocking, secret-free field metadata, website and scope priority, idle save-login behavior, pending-login form disappearance, note change notifications, identical native overlay writes, PiP fallback and playback events, existing vault permissions and native autofill/login/PiP flows.

## Remaining measurement work

Profile large vaults, many open tabs and sustained AI actions to quantify CPU and responsiveness. AI geometry no longer polls. PiP retains a slow fallback only where observation is incomplete; explicit actions always revalidate current frame/video state.
