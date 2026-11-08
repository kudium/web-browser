# Pointer capture/resize with software rendering — November 7, 2026

The original `ai-activity-smoke.cjs` regression passes on local macOS arm64 when Electron starts with `--disable-gpu`. Its assertions and capture operations were preserved; no screenshot was skipped and no production pointer routing code was changed. The only script addition in the disposable copy was a 45-second process deadline.

The run verifies AI click bypass, protection from incidental input, explicit Take control, native dragging/keyboard control, light/dark captures at 700/400/320/240 CSS pixels, resize/layout bounds, reduced motion, visibility and disposal. The 240-pixel screenshot was visually inspected. Evidence is saved separately under `../evidence/pointer-software-rendering-2026-11-07/`.

This resolves availability of that regression under software rendering. The earlier GPU-mode `UnknownVizError` and stale viewport observations remain valid, and GPU rendering still needs separate verification. The application already exposes hardware acceleration in advanced preferences, but this probe does not validate restarting the packaged application after changing that setting. Physical OS mouse routing, the full application sidebar handoff, full desktop suite and Windows/Linux remain unverified.
