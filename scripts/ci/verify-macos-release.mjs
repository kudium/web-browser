import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import metadata from '../../apps/browser/.erb/scripts/release-update-metadata.cjs';
const build = path.resolve(process.argv[2] || "apps/browser/release/build");
const archives = (await fs.readdir(build)).filter((name) =>
  name.endsWith(".zip")
);
if (archives.length !== 1) throw new Error("Expected one macOS update ZIP");
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "kudium-release-check-")
);
try {
  execFileSync("/usr/bin/ditto", [
    "-x",
    "-k",
    path.join(build, archives[0]),
    directory,
  ]);
  const apps = (await fs.readdir(directory)).filter((name) =>
    name.endsWith(".app")
  );
  if (apps.length !== 1) throw new Error("Expected one app in update ZIP");
  const app = path.join(directory, apps[0]);
  const arch = archives[0].match(/-(arm64|x64)\.zip$/)?.[1];
  if (!arch) throw new Error('Update ZIP must identify its target architecture');
  const version = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  metadata.verifyUpdateMetadata(path.join(app, 'Contents/Resources'), 'darwin', arch, version.includes('-beta.') ? 'beta' : 'stable');
  execFileSync(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", app],
    { stdio: "inherit" }
  );
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync("/usr/bin/codesign", ["-dv", "--verbose=4", app], {
    encoding: "utf8",
  });
  if (
    result.status !== 0 ||
    !result.stderr.includes(
      "Authority=Developer ID Application: Kudium LTD (79VCL28M9P)"
    ) ||
    !result.stderr.includes("TeamIdentifier=79VCL28M9P") ||
    !result.stderr.includes("runtime")
  )
    throw new Error(
      "Release must be signed by Kudium Developer ID with hardened runtime"
    );
  execFileSync("/usr/bin/xcrun", ["stapler", "validate", app], {
    stdio: "inherit",
  });
  execFileSync(
    "/usr/sbin/spctl",
    ["--assess", "--type", "execute", "--verbose=2", app],
    { stdio: "inherit" }
  );
  console.log("Update ZIP contains correct update metadata and a valid signed, notarized and stapled app.");
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
