/* eslint-disable import/no-relative-packages */
import { parse } from 'acorn';
import postcss from 'postcss';
import { createHookSourceValidator } from '../../../../packages/hooks/source-validation';
import { validDeveloperConfig, type SiteDeveloperConfig } from './siteDeveloper';
export const hookSourceValidator = createHookSourceValidator({
  javascript: source => parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true }),
  css: source => postcss.parse(source),
});
export function assertDeveloperSources(config: SiteDeveloperConfig) {
  if (!validDeveloperConfig(config)) throw new Error('Invalid site hook settings.');
  hookSourceValidator.assert(config);
  config.hooks?.forEach(hook => hookSourceValidator.assert(hook));
}
