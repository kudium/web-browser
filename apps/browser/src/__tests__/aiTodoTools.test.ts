/** @jest-environment node */
import { aiToolParameters } from '../browser/aiToolSchemas';
import { AIToolCatalog } from '../main/aiToolCatalog';
import { mcpArguments } from '../main/mcp';
import { aiActionClass } from '../browser/aiRunConsent';
import {
  requiresAIApproval,
  requiresAIPrivateReview,
} from '../browser/aiPermissions';
import { aiToolProgress } from '../browser/aiProgress';
import { AIExecutionTracker } from '../main/aiExecution';

it('discovers user todos separately from scheduled AI runs', () => {
  const catalog = new AIToolCatalog();
  expect(catalog.has('create_todo')).toBe(false);
  expect(catalog.preloadIntent('Add these three tasks to Today')).toContain(
    'create_todo',
  );
  expect(catalog.has('create_todo')).toBe(true);
  const todo = catalog
    .tools()
    .find((tool) => tool.function.name === 'create_todo');
  expect(todo?.function.description).toContain('not a scheduled AI run');
  const scheduled = new AIToolCatalog();
  expect(scheduled.preloadIntent('Schedule an AI run')).toContain(
    'create_task',
  );
  expect(scheduled.has('create_todo')).toBe(false);
});

it('validates bounded inputs for provider and external MCP tools', () => {
  const schema = aiToolParameters('create_todo');
  expect(schema.required).toEqual(['title']);
  expect(schema.properties.title).toMatchObject({ maxLength: 500 });
  expect(schema.properties.todoDetails).toMatchObject({ maxLength: 30000 });
  expect(schema.properties.today).toMatchObject({ type: 'boolean' });
  expect(
    mcpArguments('create_todo', {
      title: 'Call the supplier',
      today: true,
      destination: 'group',
    }).args,
  ).toEqual({ title: 'Call the supplier', today: true, destination: 'group' });
  expect(() =>
    mcpArguments('create_todo', { title: 'Task', today: 'true' }),
  ).toThrow('today must be boolean');
  expect(() =>
    mcpArguments('create_todo', { title: 'a'.repeat(501) }),
  ).toThrow();
  expect(() =>
    mcpArguments('create_todo', { title: 'Task', groupId: 'other' }),
  ).toThrow('Unsupported argument');
});

it('uses saved-data review rules and counts creation as an applied action', () => {
  expect(aiActionClass('create_todo')).toBe('saved-data');
  expect(requiresAIApproval('ask', 'create_todo')).toBe(true);
  expect(requiresAIApproval('standard', 'create_todo')).toBe(true);
  expect(requiresAIApproval('full', 'create_todo')).toBe(false);
  expect(requiresAIPrivateReview('create_todo')).toBe(true);
  expect(aiToolProgress('create_todo')).toBe('Adding your todo…');
  const execution = new AIExecutionTracker();
  execution.record(
    'create_todo',
    { title: 'Review' },
    { created: true, taskId: 'task', recordId: 'note' },
  );
  expect(execution.snapshot().applied).toBe(1);
});
