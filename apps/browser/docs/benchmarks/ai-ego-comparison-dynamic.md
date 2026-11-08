# Kudium Browser / Ego dynamic form comparison

Measured November 5, 2026 on the same machine, using the installed Ego guide v2.2.0 and authenticated Kudium Browser MCP. The fixture has 100 action buttons, Name input and Apply button. Apply disables itself, changes its label to Working, requests a localhost response delayed 75 ms, then restores Apply and displays the submitted value. Both browsers wait for completion and verify final semantic state. All 102 controls must be present in observations.

Two warmup rounds are excluded. Twenty measured rounds alternate which browser runs first. No builds/tests run during measurement. Kudium Browser action approval is fixture-accepted; human decision time and model inference are excluded. These are awaited public API timings, not internal Chromium round-trip counts.

| Measurement | Kudium Browser compact | Ego |
| --- | ---: | ---: |
| First observation | 10.4 ms | 12.3 ms |
| Snapshot median / p95 | 3.9 / 7.1 ms | 11.1 / 17.1 ms |
| Dynamic form median / p95 | 124.9 / 137.6 ms | 1059.5 / 1133.8 ms |
| Final snapshot bytes, first workflow | 6157 | 4662 |
| Public API calls per workflow | 6 | 5 |
| Completed measured workflows | 20 | 20 |

Kudium Browser was faster on this fixture; Ego returned smaller semantic observations. Kudium Browser currently requests a detailed wait_until observation and then another compact read, adding a public call and redundant output. Both products verified all measured workflows without failures or retries. Transport paths, action pacing and schemas differ, so this does not identify the cause of latency differences or prove general superiority. A controlled localhost delay is not remote network variability, a production application, frame/file coverage, or human takeover. Twenty samples provide only a coarse p95 estimate.

Reproduce from the repository:

```sh
KUDIUMBROWSER_BENCHMARK_FORMAT=compact npx electron .erb/scripts/ai-ego-dynamic-benchmark.cjs
```

After READY, in another terminal:

```sh
ego-browser skill
ego-browser nodejs < .erb/scripts/ai-ego-dynamic-benchmark.mjs
```

The pair uses its own temporary Electron profile and MCP port, and resumes the goal's existing Ego TaskSpace (`Kudium Browser AI control benchmark`, id 5) and p1. It does not inspect personal tabs. Only one dynamic harness may run at a time. Results go to ai-ego-comparison-dynamic-compact.json, preserving earlier static results. The broader task remains active, so its Ego space remains available for subsequent comparisons.

The first exploratory dynamic attempt rejected unsupported format on wait_until during warmup. No completed report was produced by that attempt. The corrected recorded run includes the required extra compact read; it does not hide the inefficiency.

## Compact wait observation

`wait_until` now accepts `format: "compact"` and returns its final observation directly. Set `KUDIUMBROWSER_BENCHMARK_COMPACT_WAIT=1` alongside `KUDIUMBROWSER_BENCHMARK_FORMAT=compact` when starting the same harness. This records a separate `ai-ego-comparison-dynamic-compact-wait.json`; the six-call baseline remains intact.

Measured 2026-11-05T15:11:20.119Z, after tests/build completed:

| Measurement | Kudium Browser compact wait | Ego |
| --- | ---: | ---: |
| Snapshot median / p95 | 3.6 / 9.7 ms | 13.3 / 22.7 ms |
| Dynamic form median / p95 | 122.0 / 131.1 ms | 1031.9 / 1147.4 ms |
| Final observation bytes, first workflow | 6157 | 4662 |
| Public API calls per workflow | 5 | 5 |
| Completed measured workflows | 20 | 20 |

Both products verify the final server-produced value and all 102 controls, with zero failures/retries. Removing the sixth public call and its redundant detailed snapshot is a direct implementation improvement. The small Kudium Browser latency change from the separately recorded baseline does not isolate a causal speedup; the new snapshot p95 is also higher. This remains one controlled workload, not a broad superiority claim.
