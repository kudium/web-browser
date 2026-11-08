# Dense drawing path benchmark

A 128-point curve was driven through the real Electron canvas and the official authenticated MCP client, first with fixed interpolation and then with adaptive interpolation. Every vertex had to reach trusted native pointer input. Both main-page and forced-OOP cross-origin frame requests completed.

| Fixture | Fixed interpolation | Adaptive interpolation |
| --- | ---: | ---: |
| Main canvas | 9,000.8 ms | 1,649.4 ms |
| Embedded canvas | 9,034.5 ms | 1,716.7 ms |
| Movement commands | 1,016 | 127 |

The previous algorithm inserted eight movements per segment even when two vertices were approximately one pixel apart. Adaptive interpolation sends already dense vertices directly, while subdividing longer segments and retaining all requested vertices. The existing two-endpoint format still uses twelve steps. Long paths retain the 1,024-movement cap and the existing per-movement geometry/coverage checks.

These are single local before/after measurements, not latency distributions or an Ego comparison. Timings include MCP transport, geometry checks and settling waits, but exclude model inference and human approval time. Raw measurements and environment metadata are in [ai-drawing-path-benchmark.json](ai-drawing-path-benchmark.json).

To reproduce from the repository, finish builds/tests first, then run each command separately:

```sh
TOUCHBOX_LONG_PATH_FIXTURE=dense TOUCHBOX_DRAWING_INTERPOLATION=baseline npx electron .erb/scripts/mcp-smoke.cjs --oop-frames
TOUCHBOX_LONG_PATH_FIXTURE=dense npx electron .erb/scripts/mcp-smoke.cjs --oop-frames
```

The baseline flag replaces only the interpolation function in the disposable test bundle using a TypeScript AST. It does not edit product files or alter validation, approvals, target checks or frame routing. `LONG_PATH` output records the timed action; assertions inspect the actual canvas afterward. Without the dense fixture flag the suite uses a 128-point zigzag, which still needs many interpolation movements.

Both reproduction commands also passed the complete forced-OOP control suite. The generated baseline again took approximately nine seconds per canvas; adaptive reproduction took approximately 1.58 seconds for the main canvas and 1.63 seconds for the embedded canvas. Those raw repeats are preserved in the JSON report. Covered intermediate vertices, denial, movement, stale-target checks and Stop remain part of the same native suite.
