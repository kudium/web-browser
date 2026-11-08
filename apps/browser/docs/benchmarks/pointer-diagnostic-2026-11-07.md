# Pointer regression diagnostic — November 7, 2026

Result: unresolved native capture and resize verification. No production source changes were made during this diagnostic. This is not a before/after improvement benchmark or evidence of production readiness.

The unmodified `.erb/scripts/ai-activity-smoke.cjs` reproduces `UnknownVizError`. Generated screenshots were redirected through a temporary working directory with source/dependency symlinks; existing visual evidence was preserved.

An instrumented copy shows the initial two direct CDP mouse commands and the three production-protocol pointer commands returning successfully. Native click bypass, shield absorption, cursor presentation, dock drag and keyboard movement reach their assertions before capture. The failure is the first underlying-page `capturePage()` at `light-700`, rather than a failed pointer command. A subsequent run using the existing `capturePagePNG` fallback encounters native capture failure for the overlay and a protocol timeout. Electron `stayHidden`/`stayAwake` capture options still reproduce `UnknownVizError`.

A disposable copy replacing only screenshot generation with explicit SKIP logging reaches a separate resize assertion: native overlay bounds are 400×390, while renderer `innerWidth` remains 700 and the dock retains x=160.359375, width=309.28125. Explicit host/application focus does not change that result. This establishes stale observed renderer dimensions in this environment; it does not establish the cause or justify changing pointer routing. Later takeover, reduced-motion, visibility and disposal assertions were not reached.

Preserved logs, the final disposable interaction probe and source hashes are in `pointer-diagnostic-2026-11-07/`. The final probe skips capture and must not be presented as the original visual regression passing. Earlier intermediate instrumentation is diagnostic only; no universal input, compositor, focus or capture claim is made.

Next verification should resolve native renderer resize/capture availability before repeating the full visual regression. The actual renderer/sidebar takeover gate remains open. Existing Enter/navigation improvements retain their earlier evidence; no broad suite or build was repeated because production source did not change.
