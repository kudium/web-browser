import { validHookActions, type HookAction } from './actions';
/** Portable public source only. Runtime grants and local settings never belong here. */
export const hookLicenses = [
  "MIT",
  "Apache-2.0",
  "BSD-3-Clause",
  "GPL-3.0-only",
] as const;
export interface HookPackage {
  schemaVersion: 1 | 2;
  actions?: HookAction[];
  minimumBrowserVersion: string;
  testUrl?: string;
  name: string;
  description: string;
  license: (typeof hookLicenses)[number];
  applicability: "general" | "site";
  sites: Array<{ host: string; includeSubdomains: boolean }>;
  path: string;
  lifecycle: { before: string; after: string; css: string };
}
export function validTestWebsiteUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 4096 ||
    value !== value.trim()
  )
    return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function parseHookPackage(value: unknown): HookPackage {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a hook JSON package.");
  const data = value as Record<string, any>;
  const keys = [
    "actions",
    "testUrl",
    "schemaVersion",
    "minimumBrowserVersion",
    "name",
    "description",
    "license",
    "applicability",
    "sites",
    "path",
    "lifecycle",
  ];
  if (Object.keys(data).some((key) => !keys.includes(key)))
    throw new Error("Unknown package settings.");
  if (data.testUrl !== undefined && !validTestWebsiteUrl(data.testUrl))
    throw new Error("Invalid test website URL.");
  if (data.actions !== undefined && (data.schemaVersion !== 2 || !validHookActions(data.actions)))
    throw new Error("Invalid action declarations; use schema version 2.");
  if (![1, 2].includes(data.schemaVersion))
    throw new Error(
      "This hook package needs a newer browser (unsupported schema version)."
    );
  if (
    typeof data.minimumBrowserVersion !== "string" ||
    !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(data.minimumBrowserVersion)
  )
    throw new Error("Invalid minimum browser version.");
  for (const [key, limit] of [
    ["name", 120],
    ["description", 4000],
    ["path", 500],
  ] as const) {
    if (
      typeof data[key] !== "string" ||
      !data[key].trim() ||
      data[key].length > limit
    )
      throw new Error(`Invalid ${key}.`);
  }
  if (!data.path.startsWith("/"))
    throw new Error("Path patterns must start with /.");
  if (!hookLicenses.includes(data.license))
    throw new Error("Choose a supported open-source license.");
  if (
    !["general", "site"].includes(data.applicability) ||
    !Array.isArray(data.sites) ||
    data.sites.length > 20 ||
    (data.applicability === "site"
      ? !data.sites.length
      : data.sites.length !== 0)
  )
    throw new Error("Choose target sites or general applicability.");
  const sites = data.sites.map((site: any) => {
    if (
      !site ||
      typeof site !== "object" ||
      Object.keys(site).some(
        (key) => !["host", "includeSubdomains"].includes(key)
      ) ||
      typeof site.host !== "string" ||
      typeof site.includeSubdomains !== "boolean"
    )
      throw new Error("Invalid target site.");
    const host = site.host.toLowerCase();
    if (
      host.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
        host
      )
    )
      throw new Error(
        "Target sites must be domain names, without paths or schemes."
      );
    return { host, includeSubdomains: site.includeSubdomains };
  });
  if (
    new Set(sites.map((site: { host: string }) => site.host)).size !==
    sites.length
  )
    throw new Error("Duplicate target sites.");
  if (
    !data.lifecycle ||
    typeof data.lifecycle !== "object" ||
    Array.isArray(data.lifecycle) ||
    Object.keys(data.lifecycle).some(
      (key) => !["before", "after", "css"].includes(key)
    )
  )
    throw new Error("Unsupported lifecycle stage; update your browser.");
  for (const phase of ["before", "after", "css"]) {
    if (
      typeof data.lifecycle[phase] !== "string" ||
      data.lifecycle[phase].length > 20000
    )
      throw new Error(`Invalid ${phase} source (maximum 20,000 characters).`);
  }
  if (!Object.values(data.lifecycle).some((source) => String(source).trim()) && !data.actions?.some((a: HookAction) => a.source.trim()))
    throw new Error("Add at least one script or CSS stage.");
  return {
    schemaVersion: data.schemaVersion,
    ...(data.actions !== undefined ? { actions: data.actions.map(({id, name, contexts, source}: HookAction) => ({id, name, contexts, source})) } : {}),
    ...(data.testUrl !== undefined ? { testUrl: data.testUrl } : {}),
    minimumBrowserVersion: data.minimumBrowserVersion,
    name: data.name.trim(),
    description: data.description.trim(),
    license: data.license,
    applicability: data.applicability,
    sites,
    path: data.path,
    lifecycle: {
      before: data.lifecycle.before,
      after: data.lifecycle.after,
      css: data.lifecycle.css,
    },
  };
}
export function packageMatchesSite(pkg: HookPackage, url: string): boolean {
  try {
    const target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol)) return false;
    return (
      pkg.applicability === "general" ||
      pkg.sites.some(
        (site) =>
          target.hostname === site.host ||
          (site.includeSubdomains && target.hostname.endsWith(`.${site.host}`))
      )
    );
  } catch {
    return false;
  }
}
export function browserSupportsPackage(
  pkg: HookPackage,
  version: string
): boolean {
  const installed = version.replace(/-.*$/, "").split(".").map(Number);
  const required = pkg.minimumBrowserVersion.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (!Number.isFinite(installed[i])) return false;
    if (installed[i] !== required[i]) return installed[i] > required[i];
  }
  return true;
}
export interface PublishedHookPackage {
  id: string;
  version: number;
  publisher: { id: string; name: string };
  contentHash: string;
  package: HookPackage;
}
