// The package exports this entry's types, but this project's legacy Node resolver
// cannot resolve package subpath exports. Keep this shim limited to the public API.
declare module 'electron-chrome-extensions/browser-action' {
  export function injectBrowserAction(): void;
}
