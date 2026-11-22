import { intentBundles } from '../browser/aiToolCapabilities';

it.each([
  'Fill the form using my saved Personal Data',
  'Log in to this website',
  'Fill the login form',
  'Sign in with my saved credentials',
])('loads secure saved-login tools immediately for %s', (query) => {
  const tools = intentBundles
    .filter((bundle) => bundle.pattern.test(query))
    .flatMap((bundle) => bundle.tools);
  expect(tools).toContain('list_saved_logins');
  expect(tools).toContain('fill_saved_login');
});

it('does not load personal data for unrelated page summaries', () => {
  const tools = intentBundles
    .filter((bundle) => bundle.pattern.test('Summarize this page'))
    .flatMap((bundle) => bundle.tools);
  expect(tools).not.toContain('list_saved_logins');
});
