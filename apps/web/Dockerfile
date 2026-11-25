FROM oven/bun:1.4.4
WORKDIR /app/apps/web
COPY --chown=bun:bun apps/web/package.json apps/web/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --chown=bun:bun apps/web/src ./src
COPY --chown=bun:bun apps/web/public ./public
COPY --chown=bun:bun apps/web/scripts ./scripts
COPY --chown=bun:bun apps/web/drizzle ./drizzle
COPY --chown=bun:bun packages/hooks /app/packages/hooks
ENV NODE_ENV=production PORT=3000
RUN mkdir -p /app/release-assets /app/hook-images && chown bun:bun /app/release-assets /app/hook-images
ENV HOOK_IMAGE_DIR=/app/hook-images
VOLUME ["/app/release-assets", "/app/hook-images"]
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD bun -e 'const r = await fetch("http://127.0.0.1:3000/ready"); if (!r.ok) process.exit(1)'
CMD ["sh", "-c", "bun scripts/migrate.ts && exec bun src/index.ts"]
