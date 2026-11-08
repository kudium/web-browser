export function pageFailure(code?: number) {
  if (code === -3)
    return {
      title: 'Loading was stopped',
      description: 'Try again when you’re ready.',
    };
  if (code === -10000)
    return {
      title: 'This page stopped responding',
      description: 'Reload the page to continue.',
    };
  if (code === -106)
    return {
      title: 'You’re offline',
      description: 'Check your internet connection, then try again.',
    };
  if (code === -105)
    return {
      title: 'This website can’t be found',
      description: 'Check the address or try again later.',
    };
  if (code === -7 || code === -118)
    return {
      title: 'This website took too long to respond',
      description: 'The server may be busy. Try again in a moment.',
    };
  if (code !== undefined && code <= -200 && code >= -299)
    return {
      title: 'This connection isn’t secure',
      description: 'The website’s security certificate could not be verified.',
    };
  return {
    title: 'This website is unavailable',
    description: 'Check your connection or try again in a moment.',
  };
}
