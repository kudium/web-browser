# Frame pointer command overhead

A real 128-vertex zigzag was driven through authenticated MCP into a main-page canvas and a forced-OOP embedded canvas. Assertions verify trusted native input and every requested vertex. The uncached and cached runs both passed the full forced-OOP control fixture.

| Canvas | Uncached commands | Cached commands | Uncached time | Cached time |
| --- | ---: | ---: | ---: | ---: |
| Main | 1,020 | 1,020 | 9,012.9 ms | 8,982.5 ms |
| Embedded | 8,822 | 3,216 | 9,032.3 ms | 9,010.8 ms |

Embedded command count decreased by 63.5%. Owner lookup, isolated-world creation and node resolution happen once per ancestor per operation. Focus setup happens once per operation. Every pointer position still checks current iframe geometry, coverage, transforms and connectivity: both embedded runs perform 1,148 live geometry calls and 1,019 native mouse commands. Cached references are released before protocol teardown; ancestor navigation and renderer detachment invalidate the operation.

Elapsed time is essentially unchanged. This long zigzag still needs 1,016 interpolated movements, and native input pacing dominates. These are single sequential measurements on macOS arm64, Electron 45.0.0, Chromium 156.0.8078.48; they are not latency distributions or an Ego comparison. Timing includes MCP transport, geometry checks, native input and settling, and excludes model inference and human approval time.

Raw method counts and source hashes are in [ai-frame-pointer-benchmark.json](ai-frame-pointer-benchmark.json). To reproduce, run separately after other builds and tests finish:

```sh
TOUCHBOX_FRAME_POINTER_VARIANT=uncached npx electron .erb/scripts/mcp-smoke.cjs --oop-frames
npx electron .erb/scripts/mcp-smoke.cjs --oop-frames
```

The baseline patches only a disposable frame helper in the fixture bundle. It repeats owner setup, focus setup and immediate reference release while keeping the same live safety checks. It is not an exact historical whole-file replay and does not edit product source. A source-pattern assertion prevents silently benchmarking a mismatched helper. There is no product feature flag.
