import { parse } from 'acorn';
import postcss from 'postcss';
import { createHookSourceValidator } from '../../../packages/hooks/source-validation';
export const hookSourceValidator = createHookSourceValidator({
  javascript: source => parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true }),
  css: source => postcss.parse(source),
});
