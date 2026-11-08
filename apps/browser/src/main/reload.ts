import type { Session } from 'electron';

/** Remove cookies sent to this page, preserving unrelated sites and sessions. */
export async function clearPageCookies(session: Session, pageURL: string) {
  const page = new URL(pageURL);
  if (!['http:', 'https:'].includes(page.protocol)) return;
  const cookies = await session.cookies.get({ url: page.href });
  await Promise.all(
    cookies.map((cookie) => {
      const host = (cookie.domain || page.hostname).replace(/^\./, '');
      const url = `${cookie.secure ? 'https' : 'http'}://${host}${
        cookie.path || '/'
      }`;
      return session.cookies.remove(url, cookie.name);
    })
  );
}
