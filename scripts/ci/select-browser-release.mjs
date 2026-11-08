import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { releaseTargets } from "./browser-release-targets.mjs";

const baseVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const releaseTag =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-beta\.[1-9]\d*)?$/;
export function selectRelease(version, channel, tags) {
  version = version?.trim().replace(/^v/, "");
  if (!baseVersion.test(version || "") || version.length > 60)
    throw new Error(
      "Enter a version such as 1.0.2; choose beta or stable separately."
    );
  if (!["beta", "stable"].includes(channel))
    throw new Error("Choose beta or stable.");
  const numbers = version.split(".").map(Number);
  if (!numbers.every(Number.isSafeInteger))
    throw new Error("Version numbers are too large.");
  for (const tag of tags) {
    if (!/^v\d+\.\d+\.\d+$/.test(tag)) continue;
    const previous = tag.slice(1).split(".").map(Number);
    const difference =
      numbers
        .map((value, index) => value - previous[index])
        .find((value) => value !== 0) || 0;
    if (difference <= 0)
      throw new Error(
        `Choose a version newer than ${tag.slice(
          1
        )}. Existing release tags are immutable.`
      );
  }
  if (channel === "stable") return `v${version}`;
  const prefix = `v${version}-beta.`;
  const iterations = tags
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => Number(tag.slice(prefix.length)))
    .filter(Number.isSafeInteger);
  const iteration = Math.max(0, ...iterations) + 1;
  if (!Number.isSafeInteger(iteration))
    throw new Error("Beta number is too large.");
  return `${prefix}${iteration}`;
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
      process.env.VERSION,
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
  console.log(
    `${publish ? "Publishing" : "Building"} ${tag} for ${channel} (${targets})`
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
