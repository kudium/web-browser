import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../apps/browser/package.json", import.meta.url)
);
const { parse } = require("yaml");
const [platform, arch, channel] = process.argv.slice(2);
if (
  !["darwin", "win32", "linux"].includes(platform) ||
  !["x64", "arm64"].includes(arch) ||
  !["stable", "beta"].includes(channel)
)
  throw new Error("Invalid release target");
const version = require("../../apps/browser/package.json").version;
const directoryURL = (value) => pathToFileURL(path.resolve(value) + path.sep);
const build = process.env.RELEASE_BUILD_DIR
  ? directoryURL(process.env.RELEASE_BUILD_DIR)
  : new URL("../../apps/browser/release/build/", import.meta.url);
const out = process.env.RELEASE_ARTIFACTS_DIR
  ? directoryURL(path.join(process.env.RELEASE_ARTIFACTS_DIR, `${platform}-${arch}`))
  : new URL(`../../release-artifacts/${platform}-${arch}/`, import.meta.url);
fs.mkdirSync(out, { recursive: true });
const yamlName = `${channel === "stable" ? "latest" : "beta"}${
  platform === "darwin" ? "-mac" : platform === "linux" ? "-linux" : ""
}.yml`;
const feed = parse(fs.readFileSync(new URL(yamlName, build), "utf8"));
if (feed.version !== version)
  throw new Error("Updater version does not match the release");
if (
  !Array.isArray(feed.files) ||
  !feed.files.some((f) =>
    f.url.endsWith(
      platform === "darwin"
        ? ".zip"
        : platform === "win32"
        ? ".exe"
        : ".AppImage"
    )
  )
)
  throw new Error("Updater metadata is missing the required installer");
const names = new Set(feed.files.map((f) => path.basename(f.url)));
for (const name of fs.readdirSync(build))
  if (name.endsWith(".dmg") || name.endsWith(".blockmap")) names.add(name);
const files = [];
for (const name of names) {
  const bytes = fs.readFileSync(new URL(name, build));
  const sha512 = createHash("sha512").update(bytes).digest("base64");
  const advertised = feed.files.find((f) => path.basename(f.url) === name);
  if (
    advertised &&
    (advertised.sha512 !== sha512 || advertised.size !== bytes.length)
  )
    throw new Error("Installer differs from its updater metadata");
  fs.copyFileSync(new URL(name, build), new URL(name, out));
  if (!name.endsWith(".blockmap"))
    files.push({
      url: `https://browser.kudium.com/downloads/${version}/${platform}/${arch}/${name}`,
      sha512,
      size: bytes.length,
    });
}
// macOS needs ZIP first for auto-updates; DMG is preferred by the manual download route.
files.sort(
  (a, b) =>
    Number(
      !a.url.endsWith(
        platform === "darwin"
          ? ".zip"
          : platform === "win32"
          ? ".exe"
          : ".AppImage"
      )
    ) -
    Number(
      !b.url.endsWith(
        platform === "darwin"
          ? ".zip"
          : platform === "win32"
          ? ".exe"
          : ".AppImage"
      )
    )
);
fs.writeFileSync(
  new URL("manifest.json", out),
  JSON.stringify(
    {
      version,
      platform,
      arch,
      channel,
      notes: `Kudium Browser ${version}`,
      files,
    },
    null,
    2
  )
);
console.log(
  `Collected ${platform}/${arch}/${channel} installers with verified checksums`
);
