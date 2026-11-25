# Hook screenshots

Publishers can attach up to three PNG, JPEG or WebP screenshots from the hook publishing page. Each input is limited to 5 MB and 16 million pixels. Animated images and SVGs are rejected. The server decodes and re-encodes every image, removes metadata, and stores only WebP derivatives: a preview up to 1600 pixels and 250 KB, plus a thumbnail up to 400 × 300 pixels and 50 KB. Uploaded filenames are never used.

Authenticated, origin-checked uploads have opaque owner-scoped identifiers. Publishing checks image ownership; unpublished screenshots are visible only to their owner. Approved listing images are publicly readable with image/webp and nosniff headers. Original files are never served. Publishers have a 200-image / 50 MB quota, and processing concurrency is bounded.

Mount a persistent Docker volume at `/app/hook-images` in Coolify. The container creates the directory owned by the non-root Bun user; `HOOK_IMAGE_DIR` can override it. Back up this volume together with PostgreSQL. The database stores references only. The app runs cleanup at startup and daily. Run `bun scripts/cleanup-hook-images.ts` in the app container for manual maintenance. Cleanup removes uploads unreferenced by any listing after seven days. References in pending or rejected listings are retained.

## Showcase the result

Photograph the installed hook running on a page, not its source editor. Use a
populated example that makes its benefit clear: extracted media, an expanded
article outline, a saved note with its source, or several decoded query fields.
For actions, show the filled input/review step and the resulting browser panel.
Keep AI drafts unsent and label them as drafts; never invent assistant answers.

Use the first image for the visible result. Add a close-up or a before/after view
when it explains more than the overview alone. Small captions or highlights may
direct attention to the actual output. Screenshots must remain truthful; avoid
empty states, loading screens, runtime errors, unrelated chrome, or repeated
pictures of the same code. Public, signed-out websites and the disposable Atlas
Studio fixture are suitable examples. Never photograph private accounts.
