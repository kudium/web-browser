/** Website fields accept addresses, never silently turn mistakes into searches. */
export function websiteAddress(value: string): string {
  const input = value.trim();
  if (!input) throw new Error('Enter a website address, such as example.com.');
  try {
    const explicit =
      /^[a-z][a-z\d+.-]*:/i.test(input) &&
      !/^(localhost|[\w.-]+\.\w+):\d+(?:\/|$)/i.test(input);
    const url = new URL(
      explicit ? input : `https://${input.replace(/^\/\//, '')}`
    );
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      /\s/.test(input) ||
      url.username ||
      url.password ||
      (!url.hostname.includes('.') &&
        url.hostname !== 'localhost' &&
        !url.hostname.includes(':'))
    )
      throw new Error();
    return url.href;
  } catch {
    throw new Error(
      `“${input}” isn’t a website address. Try example.com or https://example.com.`
    );
  }
}
