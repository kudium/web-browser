import type { GlobalHook } from './hookMarketplace';
/** Action-only browser defaults: opening pages does not execute any script. */
export const defaultGlobalHooks: GlobalHook[] = [
  {
    id: 'browser-form-tools',
    name: 'Form tools',
    enabled: true,
    path: '/*',
    exclusions: [],
    before: '',
    after: '',
    css: '',
    actions: [
      {
        id: 'generate-password',
        name: 'Generate password',
        contexts: ['password'],
        source: 'api.passwords.generateAndFill();',
      },
      {
        id: 'save-form',
        name: 'Save form to Personal Data',
        contexts: ['page', 'input', 'password'],
        source: 'api.personalData.saveForm();',
      },
      {
        id: 'fill-personal-data',
        name: 'Fill from Personal Data',
        contexts: ['input'],
        source: 'api.personalData.fill();',
      },
    ],
  },
];
