(async () => {
  const panel = document.querySelector('[data-download-recommendation]');
  if (!panel) return;
  const ua = navigator.userAgent;
  // Mobile browsers can report desktop-like platforms; never recommend a desktop build to them.
  if (/Android|iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return;
  let hints = {};
  try {
    hints = await navigator.userAgentData?.getHighEntropyValues(['platform', 'platformVersion', 'architecture', 'bitness']) || {};
  } catch { /* Privacy settings may withhold client hints. Keep manual choices. */ }
  const os = hints.platform || navigator.platform || ua;
  const platform = /mac/i.test(os) ? 'darwin' : /win/i.test(os) ? 'win32' : /linux/i.test(os) ? 'linux' : null;
  if (!platform) return;
  const names = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
  // macOS UA versions and Windows client-hint versions are often reduced or mapped.
  // Display only a supplied macOS version; don't claim an exact version from the UA.
  const version = platform === 'darwin' && hints.platformVersion ? ` ${hints.platformVersion}` : '';
  document.querySelector('[data-download-title]').textContent = `For your ${names[platform]}${version}`;
  const arch = hints.bitness === '64' && /arm/i.test(hints.architecture || '') ? 'arm64'
    : hints.bitness === '64' && /x86/i.test(hints.architecture || '') ? 'x64' : null;
  const primary = document.querySelector('[data-download-primary]');
  const options = document.querySelector('[data-download-options]');
  const trigger = document.querySelector('[data-download-trigger]');
  if (arch) {
    primary.href = `/download/${platform}/${arch}`;
    primary.textContent = `Download for ${platform === 'darwin' ? arch === 'arm64' ? 'Apple silicon' : 'Intel Mac' : arch === 'arm64' ? 'ARM64' : 'Intel / AMD'}`;
    primary.hidden = false;
    document.querySelector('[data-download-trigger-label]').hidden = true;
    options.classList.add('has-primary');
  }
  document.addEventListener('click', event => {
    if (!options.contains(event.target)) options.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && options.open) {
      options.open = false;
      trigger.focus();
    }
  });
  panel.hidden = false;
})();
