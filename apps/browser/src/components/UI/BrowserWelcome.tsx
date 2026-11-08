export function BrowserWelcome() {
  const url =
    process.env.NODE_ENV === 'production'
      ? 'https://browser.kudium.com'
      : 'http://localhost:3000';
  return (
    <iframe
      className="browser-showcase"
      title="About Kudium Browser"
      src={url}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
    />
  );
}
