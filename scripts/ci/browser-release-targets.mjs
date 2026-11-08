export function releaseTargets(targets) {
  const mac = [
    { os: "macos-15", platform: "darwin", arch: "arm64", flag: "mac" },
    { os: "macos-15-intel", platform: "darwin", arch: "x64", flag: "mac" },
  ];
  if (targets === "macos") return mac;
  if (targets === "all")
    return [
      ...mac,
      { os: "windows-latest", platform: "win32", arch: "x64", flag: "win" },
      { os: "ubuntu-latest", platform: "linux", arch: "x64", flag: "linux" },
    ];
  throw new Error("Release targets must be macos or all");
}
export function validateManifests(manifests, targets) {
  const expected = releaseTargets(targets)
    .map((m) => `${m.platform}/${m.arch}`)
    .sort();
  const actual = manifests.map((m) => `${m.platform}/${m.arch}`).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error(
      "Require exactly the selected build targets before publication"
    );
  if (new Set(manifests.map((m) => `${m.version}/${m.channel}`)).size !== 1)
    throw new Error(
      "All release manifests must have the same version and channel"
    );
}
if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
)
  console.log(
    `matrix=${JSON.stringify({ include: releaseTargets(process.argv[2]) })}`
  );
