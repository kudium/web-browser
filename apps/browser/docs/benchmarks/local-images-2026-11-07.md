# Local image resource and lifetime boundaries — November 7, 2026

Evidence: `local-image-boundaries.json`, `local-images-verification.json`, and
`../evidence/local-images/local-images-results.json`. Electron 45, macOS arm64.

The icon picker previously synchronously checked a source file, then reopened its
path through nativeImage. Download image thumbnails opened the mutable source
path without a byte/dimension bound. New reads use one descriptor, a fixed initial
size plus one-byte growth sentinel, asynchronous stat/read, and ownership checks.
The existing AI attachment reader shares this implementation with its unchanged
20 MB import policy. Non-regular, empty, oversized or observed changing files
reject, and descriptors close on failure.

PNG/JPEG icons decode validated buffers, with a 5 MiB file limit and maximum 2048
pixels per side. ICNS validates container/entry lengths and every modern embedded
PNG/JPEG-2000 image (maximum 1024 per side), then uses a private owner-only snapshot.
Its native thumbnail decoder supplies the 32px icon. The old native path decoder
returned empty for the application's own ICNS file; the new path succeeds. Legacy
fixed-size bitmap/mask entries and explicit metadata types remain supported.
Only one picker may remain pending per host document.

Raster download previews have a 20 MiB file/40-million-pixel header limit and use
private snapshot files. PNG/JPEG/GIF/WebP/BMP/TIFF/HEIF headers are recognized;
platform decoders still determine actual support. Unsupported/oversized previews
use the OS file-type icon, keeping the download accessible. Website/source paths
are never reopened by the image-preview decoder. The OS file-icon API still takes
a source path; its resource parsing is a separate unresolved boundary.

| Actual native observation | Before | After |
| --- | --- | --- |
| Oversized icon / malformed ICNS image decoder dispatch | 1 each | 0 each |
| Oversized pixels / oversized file thumbnail dispatch | 1 each | 0 each |
| Two replaced-source cases decode replaced bytes | 2 | 0 |
| Thumbnail completion accepted after host reload | Yes | No |
| Native thumbnail pipelines active across eight requests | 8 | 4 |
| App ICNS import produces a usable image | No | Yes |

The replacement cases atomically replace the source after its initial stat.
Afterward, the PNG decoded hash matches the original validated bytes, and native
thumbnail paths refer to owner-only snapshots. An additional held file-read test
reloads the actual icon host and rejects before decoding. Actual Chromium/native
PNG/ICNS/thumbnail work runs for normal inputs; dangerous oversized/malformed
inputs use dispatch observers instead of executing hostile native decoding. Both
phases have the same probe hash and retained source/bundle identities.

Thumbnail cache generation has four active slots, at most 128 pending IDs, and
skips invalidated queued work. Four pipelines bound simultaneous file buffers and
native requests; this is not a measured peak-RSS or overall speed improvement.
Snapshots add temporary writes and the concurrency cap may delay all-thumbnail
completion. No completion-latency speedup is claimed.

140 suites / 709 tests, lint/types and production build pass. Native production
preload checks verify real PNG/ICNS icon results, cancellation, oversized and
foreign-window denial, an actual downloaded PNG thumbnail, cache deduplication,
download recovery and symlink/directory rejection. Native picker selection is a
controlled fixture; physical user input/authentication and the full desktop suite
are not claimed. Expected rejection diagnostics appear in the integration logs.

Header inspection is not decoder containment or full animation/container
validation. Same-size mutation without observable stat change, native decoder
CPU/RSS, hostile OS file-icon resources, abrupt-crash/power-loss cleanup and
signed/cross-platform behavior remain open. Private snapshot cleanup is tested
for normal thumbnail dispatch and source replacement, not every interruption.
