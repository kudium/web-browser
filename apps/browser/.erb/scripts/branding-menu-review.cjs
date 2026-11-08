const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const project = path.resolve(__dirname, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-menu-review-'));
app.setPath('userData', path.join(root, 'profile'));
app.setName('Kudium Browser');
const out = path.join(project, 'docs/evidence/branding');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const defaultsBundle = path.join(root, 'shortcuts.cjs');
  require('esbuild').buildSync({
    entryPoints: [path.join(project, 'src/browser/shortcuts.ts')],
    outfile: defaultsBundle,
    bundle: true,
    platform: 'node',
  });
  const defaults = require(defaultsBundle).defaultShortcuts;
  await require('esbuild').build({
    entryPoints: [path.join(project, 'src/main/menu.ts')],
    outfile: path.join(root, 'menu.cjs'),
    bundle: true,
    platform: 'node',
    external: ['electron'],
    plugins: [
      {
        name: 'disposable-settings',
        setup(build) {
          build.onResolve({ filter: /^\.\/preferences$/ }, () => ({
            path: 'preferences',
            namespace: 'fixture',
          }));
          build.onResolve({ filter: /^\.\/shellContextMenu$/ }, () => ({
            path: 'context',
            namespace: 'fixture',
          }));
          build.onLoad(
            { filter: /.*/, namespace: 'fixture' },
            ({ path: name }) => ({
              contents:
                name === 'context'
                  ? 'export const shellContextMenu=()=>[];'
                  : `export const getBrowserPreferences=()=>({shortcuts:${JSON.stringify(
                      defaults
                    )}}); export const onBrowserPreferencesChanged=()=>()=>{}; export const showBrowserPreferences=()=>{};`,
            })
          );
        },
      },
    ],
  });
  await app.whenReady();
  app.dock?.setIcon(path.join(project, 'assets/app-icon.png'));
  const w = new BrowserWindow({
    width: 1000,
    height: 760,
    title: 'Kudium Browser Menu Review',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const MenuBuilder = require(path.join(root, 'menu.cjs')).default;
  const builder = new MenuBuilder({ mainWindow: w, createNewWindow: () => {} });
  const menu = builder.buildMenu();
  fs.writeFileSync(
    path.join(out, 'menus.json'),
    JSON.stringify(
      menu.items.map((item) => ({
        label: item.label,
        items: item.submenu?.items.map((child) => ({
          label: child.label,
          role: child.role,
          type: child.type,
          accelerator: child.accelerator,
        })),
      })),
      null,
      2
    )
  );
  for (const theme of ['light', 'dark'])
    for (const width of [1000, 760]) {
      nativeTheme.themeSource = theme;
      w.setSize(width, 760);
      await w.loadURL(
        'data:text/html,' +
          encodeURIComponent(
            `<html><head><meta charset="utf-8"></head><body style="margin:0;background:${
              theme === 'dark' ? '#171717' : '#fafafa'
            };color:${
              theme === 'dark' ? '#eee' : '#222'
            };font:15px system-ui,-apple-system,sans-serif;padding:32px"><img src="data:image/png;base64,${fs
              .readFileSync(path.join(project, 'assets/app-icon.png'))
              .toString(
                'base64'
              )}" width="96"><h1 style="font-size:24px">Kudium Browser</h1><p>Native browser menus · ${width}px · ${theme}</p><p>File · Edit · View · History · Workspace · AI · Developer · Window · Help</p></body></html>`
          )
      );
      w.show();
      w.focus();
      await w.webContents.executeJavaScript(
        'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'
      );
      fs.writeFileSync(
        path.join(out, `${width}-${theme}.png`),
        (await w.webContents.capturePage()).toPNG()
      );
    }
  w.focus();
  console.log('PASS: native menu fixture and four branding captures');
  w.destroy();
  app.quit();
})().catch((error) => {
  console.error(error);
  app.exit(1);
});
