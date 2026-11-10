import { AIMessageQueue } from '../main/aiMessageQueue';

function fixture() {
  let busy = true;
  const start = jest.fn(() => {
    busy = true;
  });
  const changed = jest.fn();
  const failed = jest.fn();
  const queue = new AIMessageQueue<string>(() => !busy, start, changed, failed);
  const finish = () => {
    busy = false;
    queue.pump();
  };
  return { queue, start, changed, failed, finish };
}

it('waits for the running task and starts follow-ups one at a time in order', () => {
  const { queue, start, finish } = fixture();
  queue.add('First follow-up', 'first');
  queue.add('Second follow-up', 'second');
  expect(start).not.toHaveBeenCalled();
  expect(queue.snapshot().messages).toHaveLength(2);
  finish();
  expect(start).toHaveBeenNthCalledWith(1, 'first');
  queue.pump();
  expect(start).toHaveBeenCalledTimes(1);
  finish();
  expect(start).toHaveBeenNthCalledWith(2, 'second');
  expect(queue.hasPending).toBe(false);
});

it('retains stopped follow-ups until explicitly resumed and allows removal', () => {
  const { queue, start, finish } = fixture();
  queue.add('Skip this', 'skip');
  queue.add('Keep this', 'keep');
  queue.pause();
  queue.remove(queue.snapshot().messages[0].id);
  finish();
  expect(start).not.toHaveBeenCalled();
  expect(queue.snapshot().paused).toBe(true);
  queue.resume();
  expect(start).toHaveBeenCalledWith('keep');
});

it('keeps a rejected message in the queue for retry instead of losing it', () => {
  const { queue, start, finish, failed } = fixture();
  queue.add('Follow-up', 'next');
  start.mockImplementationOnce(() => {
    throw new Error('Scope changed');
  });
  finish();
  expect(failed).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Scope changed' })
  );
  expect(queue.snapshot()).toEqual({
    paused: true,
    messages: [expect.objectContaining({ prompt: 'Follow-up' })],
  });
  queue.resume();
  expect(start).toHaveBeenLastCalledWith('next');
});

it('does not restart a disposed chat or retain stale paused state after removal', () => {
  const { queue, start, finish } = fixture();
  queue.add('Follow-up', 'next');
  queue.pause();
  queue.remove(queue.snapshot().messages[0].id);
  expect(queue.snapshot().paused).toBe(false);
  queue.add('New follow-up', 'new');
  queue.dispose();
  finish();
  expect(start).not.toHaveBeenCalled();
  expect(() => queue.add('Closed', 'closed')).toThrow('closed');
});
