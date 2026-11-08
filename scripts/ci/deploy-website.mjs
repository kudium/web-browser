import { setTimeout as delay } from "node:timers/promises";
const token = process.env.COOLIFY_API_TOKEN;
const sha = process.env.GITHUB_SHA;
const deployUrl = new URL(process.env.COOLIFY_DEPLOY_URL || "");
const uuid = deployUrl.searchParams.get("uuid");
if (
  !token ||
  !/^[a-f0-9]{40}$/.test(sha || "") ||
  !uuid ||
  deployUrl.protocol !== "https:"
)
  throw new Error("Configure Coolify secrets and a checked commit SHA");
const api = deployUrl.origin + "/api/v1";
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`Coolify request failed (${response.status})`);
  return response.json();
}
// Pin the checked commit, so a newer untested push cannot be picked up by the build.
await request(`${api}/applications/${uuid}`, {
  method: "PATCH",
  body: JSON.stringify({ git_commit_sha: sha, is_auto_deploy_enabled: false }),
});
const result = await request(deployUrl.href, { method: "POST" });
const deployment = result.deployments?.find(
  (d) => d.resource_uuid === uuid
)?.deployment_uuid;
if (!deployment) throw new Error("Coolify did not queue a deployment");
console.log(`Queued deployment ${deployment} for ${sha}`);
let finished = false;
for (let attempt = 0; attempt < 120; attempt++) {
  const state = await request(`${api}/deployments/${deployment}`);
  if (state.status === "finished") {
    if (state.commit !== sha)
      throw new Error("Deployed commit differs from the checked commit");
    finished = true;
    break;
  }
  if (!["queued", "in_progress"].includes(state.status))
    throw new Error(`Deployment ended with status ${state.status}`);
  await delay(10000);
}
if (!finished) throw new Error("Deployment timed out");
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch("https://browser.kudium.com/ready", {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (response.ok && (await response.json()).status === "ready") {
      console.log("Checked commit deployed and website ready");
      process.exit(0);
    }
  } catch {
    /* Retry while the public proxy switches to the new container. */
  }
  await delay(10000);
}
throw new Error("Deployed website did not become ready");
