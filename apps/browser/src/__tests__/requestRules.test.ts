import { addRequestRule, RequestRule } from '../main/requestRules';

function fixture() {
  let listener: any;
  const target = {
    webRequest: {
      onBeforeRequest: jest.fn((_filter, value) => {
        listener = value;
      }),
    },
  };
  return {
    target: target as any,
    send: (details = {}) => {
      const reply = jest.fn();
      listener(details, reply);
      return reply;
    },
  };
}
it('checks authority synchronously at the final callback after asynchronous rules settle', async () => {
  const { target, send } = fixture();
  let accept!: (cancel: boolean) => void;
  let valid = true;
  const rule: RequestRule = () =>
    new Promise<boolean>((resolve) => {
      accept = resolve;
    });
  rule.check = () => {
    if (!valid) throw new Error('Revoked');
  };
  addRequestRule(target, rule);
  const reply = send();
  accept(false);
  valid = false;
  await Promise.resolve();
  expect(reply).toHaveBeenCalledWith({ cancel: true });
  expect(reply).toHaveBeenCalledTimes(1);
});
it('checks initial synchronous requests immediately before allowing them', () => {
  const { target, send } = fixture();
  const rule: RequestRule = () => false;
  rule.check = () => {
    throw new Error('Revoked');
  };
  addRequestRule(target, rule);
  expect(send()).toHaveBeenCalledWith({ cancel: true });
});
it('composes synchronous preferences without promises and installs one native listener', () => {
  const { target, send } = fixture();
  addRequestRule(target, () => false);
  const later = jest.fn(() => false);
  addRequestRule(target, () => true);
  addRequestRule(target, later);
  expect(send()).toHaveBeenCalledWith({ cancel: true });
  expect(later).not.toHaveBeenCalled();
  expect(target.webRequest.onBeforeRequest).toHaveBeenCalledTimes(1);
});
it('holds an asynchronous review, cancels on disposal, and ignores late acceptance', async () => {
  const { target, send } = fixture();
  let accept!: (cancel: boolean) => void;
  const remove = addRequestRule(
    target,
    () =>
      new Promise<boolean>((resolve) => {
        accept = resolve;
      })
  );
  const reply = send();
  expect(reply).not.toHaveBeenCalled();
  remove();
  expect(reply).toHaveBeenCalledWith({ cancel: true });
  accept(false);
  await Promise.resolve();
  expect(reply).toHaveBeenCalledTimes(1);
  expect(send()).toHaveBeenCalledWith({ cancel: false });
});
it('fails closed on synchronous and asynchronous rule errors', async () => {
  const sync = fixture();
  addRequestRule(sync.target, () => {
    throw new Error('bad rule');
  });
  expect(sync.send()).toHaveBeenCalledWith({ cancel: true });
  const asyncRule = fixture();
  addRequestRule(asyncRule.target, () =>
    Promise.reject(new Error('bad review'))
  );
  const reply = asyncRule.send();
  await Promise.resolve();
  await Promise.resolve();
  expect(reply).toHaveBeenCalledWith({ cancel: true });
});

it('does not cancel a held request when an unrelated scoped rule is removed', async () => {
  const { target, send } = fixture();
  let accept!: (cancel: boolean) => void;
  addRequestRule(
    target,
    () =>
      new Promise<boolean>((resolve) => {
        accept = resolve;
      })
  );
  const removeSibling = addRequestRule(target, () => false);
  const reply = send();
  removeSibling();
  expect(reply).not.toHaveBeenCalled();
  accept(false);
  await Promise.resolve();
  expect(reply).toHaveBeenCalledWith({ cancel: false });
});
