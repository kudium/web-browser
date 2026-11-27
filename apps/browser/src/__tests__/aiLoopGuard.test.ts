import { AILoopGuard } from '../main/aiLoopGuard';
const message = (name: string, args = '{}') => ({
  tool_calls: [{ function: { name, arguments: args } }],
});
it('stops a third repeated clarification before execution', () => {
  const guard = new AILoopGuard();
  guard.check(message('request_user_feedback', '{"title":"Which tab?"}'));
  guard.check(
    message('request_user_feedback', '{"title":"Please confirm the tab"}')
  );
  expect(() =>
    guard.check(
      message('request_user_feedback', '{"title":"Tell me the tab ID"}')
    )
  ).toThrow('stopped');
});
it('allows changed reads and resets after genuine browser actions', () => {
  const guard = new AILoopGuard();
  guard.check(message('list_tabs'));
  guard.check(message('list_tabs'));
  guard.check(message('navigate', '{"url":"https://example.com"}'));
  expect(() => guard.check(message('list_tabs'))).not.toThrow();
  for (let i = 0; i < 5; i++)
    expect(() => guard.check(message('scroll'))).not.toThrow();
});
it('names the next tier up when it stops a loop', () => {
  const assist = new AILoopGuard('assist');
  expect(assist.message()).toContain('Apple local AI');
  expect(assist.message()).toContain('Install a local model');
  expect(new AILoopGuard('control').message()).toContain('cloud model');
  expect(new AILoopGuard('cloud').message()).toContain('more capable model');
  const guard = new AILoopGuard('control');
  guard.check(message('list_tabs'));
  guard.check(message('list_tabs'));
  expect(() => guard.check(message('list_tabs'))).toThrow('cloud model');
});
