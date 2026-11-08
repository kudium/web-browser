import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { releaseTargets } from "./browser-release-targets.mjs";

const releaseTag =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-beta\.([1-9]\d*))?$/;
const compare = (left, right) => {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index])
      return left[index] > right[index] ? 1 : -1;
  }
  return 0;
};
export function selectRelease(bump, channel, tags) {
  if (!["beta", "stable"].includes(channel))
    throw new Error("Choose beta or stable.");
  if (!["auto", "patch", "minor", "major"].includes(bump))
    throw new Error("Choose auto, patch, minor or major.");
  const releases = tags
    .map((tag) => {
      const match = releaseTag.exec(tag);
      if (!match) return null;
      const version = match.slice(1, 4).map(Number);
      const beta = match[5] ? Number(match[5]) : null;
      if (
        !version.every(Number.isSafeInteger) ||
        (beta !== null && !Number.isSafeInteger(beta))
      )
        return null;
      return { version, beta };
    })
    .filter(Boolean);
  const latestStable = releases
    .filter((release) => release.beta === null)
    .map((release) => release.version)
    .sort(compare)
    .at(-1) || [0, 0, 0];
  const pendingBeta = releases
    .filter(
      (release) =>
        release.beta !== null && compare(release.version, latestStable) > 0
    )
    .map((release) => release.version)
    .sort(compare)
    .at(-1);
  let version;
  if (bump === "auto" && pendingBeta) version = pendingBeta;
  else {
    version = [...latestStable];
    const index = bump === "major" ? 0 : bump === "minor" ? 1 : 2;
    version[index]++;
    for (let reset = index + 1; reset < 3; reset++) version[reset] = 0;
    if (!version.every(Number.isSafeInteger))
      throw new Error("Version numbers are too large.");
  }
  const base = `v${version.join(".")}`;
  if (channel === "stable") return base;
  const iterations = releases
    .filter(
      (release) =>
        release.beta !== null && compare(release.version, version) === 0
    )
    .map((release) => release.beta);
  const iteration = Math.max(0, ...iterations) + 1;
  if (!Number.isSafeInteger(iteration))
    throw new Error("Beta number is too large.");
  return `${base}-beta.${iteration}`;
}
function main() {
  const git = (...args) =>
    execFileSync("git", args, { encoding: "utf8" }).trim();
  const targets = process.env.TARGETS || "macos";
  const matrix = { include: releaseTargets(targets) };
  let tag, channel, publish;
  if (process.env.EVENT === "workflow_dispatch") {
    if (process.env.GITHUB_REF !== "refs/heads/main")
      throw new Error("Run releases from main.");
    git("merge-base", "--is-ancestor", process.env.GITHUB_SHA, "origin/main");
    tag = selectRelease(
      process.env.BUMP || "auto",
      process.env.CHANNEL,
      git("tag", "--list").split("\n")
    );
    channel = process.env.CHANNEL;
    publish = true;
  } else {
    tag = process.env.TAG;
    if (!releaseTag.test(tag || "")) throw new Error("Invalid release tag.");
    git("rev-parse", "--verify", `refs/tags/${tag}`);
    git("merge-base", "--is-ancestor", `refs/tags/${tag}`, "origin/main");
    channel = tag.includes("-beta.") ? "beta" : "stable";
    // Preserve tag-push behavior for developers who still use the advanced path.
    publish = channel === "beta";
  }
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `tag=${tag}\nchannel=${channel}\npublish=${publish}\ntargets=${targets}\nmatrix=${JSON.stringify(
      matrix
    )}\n`
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Selected release: **${tag}** (${channel})\n\nSource commit: \`${process.env.GITHUB_SHA}\`\n`
    );
  console.log(
    `${publish ? "Publishing" : "Building"} ${tag} for ${channel} (${targets})`
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
