import { hookImageStore, imageRoot } from "./hook-images";
import { marketplaceStore } from "./hook-marketplace";
import { publishingConfig } from "./release-publishing";
import { connect } from "./db";
import { authConfig } from "./config";
import { createAuth } from "./auth";
import { createApp } from "./app";
import { relayWebSocket } from "./relay/websocket";
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
const { db, client } = connect(required("DATABASE_URL"));
const encodedSyncKey = process.env.SYNC_MASTER_KEY;
if (
  encodedSyncKey &&
  (!/^[A-Za-z0-9_-]{43}$/.test(encodedSyncKey) ||
    Buffer.from(encodedSyncKey, "base64url").toString("base64url") !==
      encodedSyncKey)
)
  throw new Error("SYNC_MASTER_KEY must be a canonical 32-byte base64url key");
const app = createApp({
  db,
  hookAdminIds: (process.env.HOOK_ADMIN_ACCOUNT_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  syncMasterKey: encodedSyncKey
    ? Buffer.from(encodedSyncKey, "base64url")
    : undefined,
  publishing: publishingConfig(process.env),
  auth: createAuth(db, authConfig(process.env)),
  assetOrigins: required("RELEASE_ASSET_ORIGINS")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean),
  // Devices get https://<id>.<RELAY_HOST>/mcp when wildcard DNS exists; the path form always works.
  relay: { host: process.env.RELAY_HOST },
});
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch(request, server) {
    return app.fetch(request, {
      remoteAddress: server.requestIP(request)?.address,
      // The relay upgrades device sockets through the server (relay/websocket.ts).
      server,
    });
  },
  websocket: relayWebSocket,
  maxRequestBodySize: 12 * 1024 * 1024,
  idleTimeout: 255,
});
console.log(`Kudium web: http://localhost:${server.port}`);
let cleaningImages = false;
const cleanImages = async () => {
  if (cleaningImages) return;
  cleaningImages = true;
  try {
    await hookImageStore(imageRoot()).cleanup((key) =>
      marketplaceStore(db).imageReferenced(key),
    );
  } catch {
    console.error("Hook screenshot cleanup failed; will retry.");
  } finally {
    cleaningImages = false;
  }
};
const imageCleanup = setInterval(cleanImages, 24 * 60 * 60 * 1000);
imageCleanup.unref();
void cleanImages();
async function shutdown() {
  clearInterval(imageCleanup);
  await server.stop(false);
  await client.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
