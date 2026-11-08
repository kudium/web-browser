import { execFileSync } from "node:child_process";
const id = process.env.RELEASE_RUN_ID;
const tag = process.env.RELEASE_TAG;
const repo = process.env.GITHUB_REPOSITORY;
if (!/^\d+$/.test(id || "") || !/^v\d+\.\d+\.\d+(-beta\.\d+)?$/.test(tag || ""))
  throw new Error("Invalid release tag or run ID");
if (process.env.GITHUB_REF !== "refs/heads/main")
  throw new Error("Publish only from main");
execFileSync("git", [
  "merge-base",
  "--is-ancestor",
  `refs/tags/${tag}`,
  "origin/main",
]);
const api = (route) =>
  JSON.parse(
    execFileSync("gh", ["api", `repos/${repo}/${route}`], { encoding: "utf8" })
  );
const run = api(`actions/runs/${id}`);
if (run.name !== "Browser release" || run.status !== "completed")
  throw new Error("Require a completed Browser release run");
execFileSync("git", [
  "merge-base",
  "--is-ancestor",
  `refs/tags/${tag}`,
  run.head_sha,
]);
const jobs = api(`actions/runs/${id}/jobs?per_page=100`).jobs;
for (const arch of ["arm64", "x64"]) {
  const job = jobs.find((job) => job.name === `Build darwin/${arch}`);
  if (
    job?.conclusion !== "success" ||
    !job.steps.some(
      (step) =>
        step.name === "Verify macOS signing and notarization" &&
        step.conclusion === "success"
    )
  )
    throw new Error(`Missing successful signed and notarized ${arch} build`);
}
console.log(`Verified both signed Mac build jobs in release run ${id}`);
