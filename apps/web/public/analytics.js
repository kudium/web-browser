(() => {
  // Only the production public website sends page analytics.
  if (location.origin !== 'https://browser.kudium.com') return;
  const id = 'G-JF314TQ397';
  const key = 'kudium.analytics-consent.v1';
  const panel = document.querySelector('[data-analytics-consent]');
  let started = false;
  let choiceMade = false;
  const read = () => { try { return localStorage.getItem(key); } catch { return null; } };
  const gtag = function () { window.dataLayer.push(arguments); };
  const start = () => {
    if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
    window[`ga-disable-${id}`] = false;
    if (started) { gtag('consent', 'update', { analytics_storage: 'granted' }); return; }
    started = true;
    window.dataLayer = window.dataLayer || [];
    gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    gtag('js', new Date());
    const path = location.pathname;
    gtag('config', id, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: location.origin + path,
      page_referrer: '',
      page_title: path,
    });
    gtag('event', 'page_view', { page_location: location.origin + path, page_title: path, page_referrer: '' });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.append(script);
  };
  const choose = (choice) => {
    choiceMade = true;
    try { localStorage.setItem(key, choice); } catch { /* Choice still applies to this page. */ }
    panel.hidden = true;
    if (choice === 'granted') start();
    else {
      window[`ga-disable-${id}`] = true;
      if (started) gtag('consent', 'update', { analytics_storage: 'denied' });
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.trim().split('=')[0];
        if (name !== '_ga' && !name.startsWith('_ga_')) continue;
        for (const domain of ['', '; domain=browser.kudium.com', '; domain=.kudium.com']) {
          document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax; Secure`;
        }
      }
    }
  };
  document.querySelector('[data-analytics-allow]')?.addEventListener('click', () => choose('granted'));
  document.querySelector('[data-analytics-decline]')?.addEventListener('click', () => choose('denied'));
  document.querySelector('[data-analytics-settings]')?.addEventListener('click', () => {
    panel.hidden = false;
    panel.querySelector('button')?.focus();
  });
  const initialize = async () => {
    if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
    const saved = read();
    if (saved === 'granted') { start(); return; }
    if (saved === 'denied') return;
    let consentRequired = false;
    try {
      const response = await fetch('/analytics-policy', {
        credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(5000),
      });
      if (response.ok) consentRequired = (await response.json()).consentRequired === true;
    } catch { /* Unknown region uses the default-on policy. */ }
    if (choiceMade) return;
    if (consentRequired) panel.hidden = false;
    else start(); // Do not persist automatic enablement as explicit consent.
  };
  void initialize();
})();
