# Hook screenshots

Publishers can attach up to three PNG, JPEG or WebP screenshots from the hook publishing page. Each input is limited to 5 MB and 16 million pixels. Animated images and SVGs are rejected. The server decodes and re-encodes every image, removes metadata, and stores only WebP derivatives: a preview up to 1600 pixels and 250 KB, plus a thumbnail up to 400 × 300 pixels and 50 KB. Uploaded filenames are never used.

Authenticated, origin-checked uploads have opaque owner-scoped identifiers. Publishing checks image ownership; unpublished screenshots are visible only to their owner. Approved listing images are publicly readable with image/webp and nosniff headers. Original files are never served. Publishers have a 200-image / 50 MB quota, and processing concurrency is bounded.

Mount a persistent Docker volume at `/app/hook-images` in Coolify. The container creates the directory owned by the non-root Bun user; `HOOK_IMAGE_DIR` can override it. Back up this volume together with PostgreSQL. The database stores references only. The app runs cleanup at startup and daily. Run `bun scripts/cleanup-hook-images.ts` in the app container for manual maintenance. Cleanup removes uploads unreferenced by any listing after seven days. References in pending or rejected listings are retained.
