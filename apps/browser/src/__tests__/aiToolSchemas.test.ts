import { aiProviderTools, aiToolParameters } from '../browser/aiToolSchemas';

it('advertises only the inputs relevant to each browser operation', () => {
  expect(aiToolParameters('resume_control').required).toEqual(['reason']);
  expect(aiProviderTools().map((tool) => tool.function.name)).not.toContain(
    'resume_control'
  );
  expect(Object.keys(aiToolParameters('list_tabs').properties)).toEqual([
    'groupId',
    'encoding',
  ]);
  expect(Object.keys(aiToolParameters('screenshot').properties)).toEqual([
    'tabId',
    'imageFormat',
    'scale',
    'compareTo',
    'threshold',
  ]);
  expect(Object.keys(aiToolParameters('navigate').properties)).toEqual([
    'tabId',
    'url',
    'waitUntil',
  ]);
  expect(aiToolParameters('read_page').properties).not.toHaveProperty('text');
  expect(aiToolParameters('read_page').properties).not.toHaveProperty('paths');
  expect(aiToolParameters('hand_off').properties).not.toHaveProperty(
    'elementId'
  );
});
it('keeps required values and nested path constraints for executable operations', () => {
  // elementId/snapshotId may be replaced by a selector, so only values stays required.
  expect(aiToolParameters('select_options').required).toEqual([
    'values',
  ]);
  expect(aiToolParameters('drag_at').properties.path).toMatchObject({
    minItems: 2,
    maxItems: 128,
    items: { required: ['x', 'y'], additionalProperties: false },
  });
  expect(aiToolParameters('wait_until').properties.format).toMatchObject({
    enum: ['compact', 'detailed'],
  });
  expect(aiToolParameters('read_options').properties.limit).toMatchObject({
    maximum: 200,
  });
  aiProviderTools().forEach((tool) => {
    tool.function.parameters.required.forEach((field) =>
      expect(tool.function.parameters.properties[field]).toBeDefined()
    );
  });
});

it('shares narrow hook setup tools with explicit configuration and opaque field references', () => {
  expect(aiToolParameters('configure_site_hooks').required).toEqual([
    'developer',
    'reason',
  ]);
  expect(
    aiToolParameters('configure_site_hooks').properties
  ).not.toHaveProperty('scope');
  expect(
    aiToolParameters('configure_site_hooks').properties.notification
  ).toMatchObject({
    additionalProperties: false,
    required: ['key', 'recordId', 'fieldName'],
  });
  [
    'read_site_hooks',
    'configure_site_hooks',
    'find_hook_personal_data',
  ].forEach((name) =>
    expect(aiProviderTools().some((tool) => tool.function.name === name)).toBe(
      true
    )
  );
});

it('exposes opening a project file in a browser tab', () => {
  expect(
    aiToolParameters('project_files').properties.fileRequest
  ).toMatchObject({
    properties: { action: { enum: expect.arrayContaining(['open-tab']) } },
  });
});
