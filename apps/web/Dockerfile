FROM oven/bun:1.2.19
WORKDIR /app
COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun public ./public
COPY --chown=bun:bun scripts ./scripts
COPY --chown=bun:bun drizzle ./drizzle
ENV NODE_ENV=production PORT=3000
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD bun -e 'const r = await fetch("http://127.0.0.1:3000/ready"); if (!r.ok) process.exit(1)'
CMD ["bun", "src/index.ts"]
