export interface SyncedLogin {
  title: string;
  origin: string;
  username: string;
  password: string;
}
export function validateSyncedLogins(value: unknown): SyncedLogin[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error("Invalid synced passwords.");
  return value.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      Object.keys(entry).some(
        (key) => !["title", "origin", "username", "password"].includes(key),
      )
    )
      throw new Error("Invalid synced password.");
    const bounded = (key: string, max: number) => {
      if (typeof entry[key] !== "string" || entry[key].length > max)
        throw new Error("Invalid synced password.");
      return entry[key] as string;
    };
    const origin = bounded("origin", 4096);
    const url = new URL(origin);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.origin !== origin
    )
      throw new Error("Invalid password website.");
    return {
      title: bounded("title", 120),
      origin,
      username: bounded("username", 1000),
      password: bounded("password", 4096),
    };
  });
}
