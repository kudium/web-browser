import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../apps/browser/package.json", import.meta.url)
);
const { valid } = require("semver");
const tag = process.argv[2];
const version = tag?.replace(/^v/, "");
if (
  !tag?.startsWith("v") ||
  valid(version) !== version ||
  !/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version)
)
  throw new Error("Use vX.Y.Z or vX.Y.Z-beta.N");
const channel = version.includes("-beta.") ? "beta" : "stable";
for (const relative of [
  "../../apps/browser/package.json",
  "../../apps/browser/release/app/package.json",
]) {
  const file = new URL(relative, import.meta.url);
  const data = JSON.parse(fs.readFileSync(file));
  data.version = version;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}
if (process.env.GITHUB_OUTPUT)
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\nchannel=${channel}\n`
  );
console.log(`Preparing ${version} for the ${channel} channel`);
