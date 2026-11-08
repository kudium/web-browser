# TouchBox / Ego local control benchmark

Run from the TouchBox repository on macOS with Electron dependencies and Ego installed:

```sh
npx electron .erb/scripts/ai-ego-benchmark.cjs
```

Wait for `READY`, then run in a second terminal:

```sh
ego-browser skill
ego-browser nodejs < .erb/scripts/ai-ego-benchmark.mjs
```

The harness uses a disposable Electron profile, a localhost fixture, and an authenticated official MCP client. It writes a private control file at `/tmp/touchbox-comparison-control.json`. Run only one harness at a time. The script resumes the named Ego TaskSpace and uses its existing `p1`; it does not inspect personal tabs. The space stays active for additional parity fixtures. On success the Electron harness closes its disposable window, removes the control file, and writes `docs/benchmarks/ai-ego-comparison.json`.

There are 100 ordinary action buttons, a labelled input, an Apply button, and visible status text. Every measured observation must contain all 102 interactive controls. Each workflow fills the input, clicks Apply, and verifies the resulting status in the final semantic observation. Two warmup rounds are excluded; 20 measured rounds alternate which product goes first.

Latency measures an awaited official MCP call or an awaited Ego Page SDK call, excluding CLI startup and AI inference. The first observation after navigation is reported separately as cold; it is not a browser-startup measurement. TouchBox native approvals are accepted automatically in this fixture, so human approval time is excluded. TouchBox performs five public API calls per form workflow, including the intermediate observation recommended by its agent guide. Ego performs four using its recommended sequence. Internal Chromium protocol round trips are not measured by this harness.

Payload bytes count serialized semantic observations before transport framing. TouchBox JSON includes bounds, metadata, coverage, and control values; Ego returns a semantic tree. Both cover the whole fixture, but their schemas are not interchangeable. Zero failures/retries describes a completed run only: the harness aborts if either product fails or omits controls.

A single local static fixture provides a baseline, not proof of general superiority. It does not measure remote navigation, dynamic applications, frames, files, popup/dialog handling, inference cost, human handoff, or recovery under load. Twenty samples also give only a coarse estimate of the 95th percentile.

## Recorded run

Measured 2026-11-05T08:22:39.595Z.

| Measurement | TouchBox | Ego |
| --- | ---: | ---: |
| First observation (ms) | 9.8 | 11.0 |
| Warmed snapshot p50 (ms) | 5.5 | 11.8 |
| Warmed snapshot p95 (ms) | 8.7 | 16.0 |
| Form workflow p50 (ms) | 21.7 | 1032.6 |
| Form workflow p95 (ms) | 43.3 | 1091.4 |
| Snapshot bytes (first measured round) | 23778.0 | 4664.0 |

Both products verified 20 workflows with no failures or retries. TouchBox was faster on this fixture; Ego emitted substantially smaller observations. An earlier exploratory run had a worse TouchBox snapshot p95 than Ego, so tail latency remains a stability target. Cursor feedback, input dispatch pacing, transport paths, and observation schemas differ; this benchmark does not attribute the workflow difference to any one of them.

## Compact observations

Set `TOUCHBOX_BENCHMARK_FORMAT=compact` when starting the Electron harness to measure compact TouchBox observations against the same Ego workflow. The report is written separately to `ai-ego-comparison-compact.json`, preserving the detailed baseline. Do not run builds or tests during measurement; finish those checks before starting a comparison.

Compact output keeps page text, coverage, viewport, snapshot IDs, target IDs, labels, roles, non-null type/href metadata, input values (including empty strings), checked state (including false), select options, and true disabled/read-only/truncation flags. It omits ordinary control tag/bounds and false state flags. Canvas geometry remains. The isolated target receipts keep the original bounds and fingerprints, so compact observations can drive the same checked actions. Request detailed output when ordinary target geometry is required. Compaction runs inside the isolated page program before its result crosses the Chromium protocol boundary.

Measured 2026-11-05T08:29:02.910Z after build/test completion: compact TouchBox snapshots were 6159 bytes versus 23778 bytes in the earlier detailed baseline (74.1% smaller). Compact snapshot p50/p95 was 5.6/8.0ms; Ego in the same interleaved run was 14.6/18.5ms. Form workflow p50/p95 was 21.2/40.0ms for TouchBox and 1030.4/1068.6ms for Ego. Both completed 20 workflows, with no failures/retries. Payload reduction is directly comparable for the same fixture and complete control coverage; latency differences between separately recorded detailed and compact runs do not isolate the format change.
