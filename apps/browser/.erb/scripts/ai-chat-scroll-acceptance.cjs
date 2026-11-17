const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

module.exports = async ({ main, evaluate, out }) => {
  const histories = Object.fromEntries(
    ['first', 'second'].map((id) => [
      id,
      Array.from({ length: 40 }, (_, index) => ({
        type: 'message',
        text: `${id} message ${index + 1}\n\nA long disposable chat fixture for checking scroll position.\n\n${'Conversation history remains readable. '.repeat(8)}`,
      })),
    ]),
  );
  let selectedId = 'first';
  const state = () => ({
    selectedId,
    history: histories[selectedId],
    draft: '',
    conversations: ['first', 'second'].map((id) => ({
      id,
      title: `${id} scroll fixture`,
      updatedAt: 0,
      paused: false,
    })),
  });
  ipcMain.removeHandler('ai-conversations');
  ipcMain.removeHandler('ai-task-status');
  ipcMain.handle('ai-conversations', (_event, request) => {
    if (request.action === 'select') selectedId = request.id;
    return state();
  });
  ipcMain.handle('ai-task-status', () => ({
    busy: false,
    resumable: false,
    history: histories[selectedId],
  }));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (expression) => {
    for (let index = 0; index < 100; index++) {
      if (await evaluate(main, expression)) return;
      await wait(30);
    }
    throw new Error('Chat scrolling timed out: ' + expression);
  };
  const metrics = () =>
    evaluate(
      main,
      `(()=>{const log=document.querySelector('.ai-log');return {height:log.clientHeight,total:log.scrollHeight,top:log.scrollTop,bottom:log.scrollHeight-log.scrollTop-log.clientHeight}})()`,
    );
  const bottom = () =>
    until(
      `(()=>{const log=document.querySelector('.ai-log');return log?.clientHeight>0 && log.scrollHeight>log.clientHeight && log.scrollHeight-log.scrollTop-log.clientHeight<3})()`,
    );
  const top = async () => {
    await evaluate(
      main,
      `(()=>{const log=document.querySelector('.ai-log');log.scrollTop=0;log.dispatchEvent(new Event('scroll',{bubbles:true}));})();undefined`,
    );
    await wait(100);
    assert.equal((await metrics()).top, 0);
  };
  const toggle = () =>
    evaluate(
      main,
      `document.querySelector('[aria-label^="Toggle Chat sidebar"]').click();undefined`,
    );
  const pane = async (value) => {
    await evaluate(
      main,
      `localStorage.setItem('kudiumbrowser-ai-page-pane',JSON.stringify(${JSON.stringify(value)}));window.dispatchEvent(new CustomEvent('ai-page-preference-changed',{detail:'kudiumbrowser-ai-page-pane'}));undefined`,
    );
    await wait(80);
  };
  await toggle();
  await bottom();
  const opened = await metrics();
  await top();
  main.webContents.send('ai-event', {
    type: 'message',
    text: 'A new message while reading older history.',
  });
  await wait(120);
  assert.equal(
    (await metrics()).top,
    0,
    'Incoming messages must not pull the reader to the bottom',
  );
  await toggle();
  await wait(80);
  await toggle();
  await bottom();
  const reopened = await metrics();
  await top();
  await pane('tasks');
  await pane('assistant');
  await bottom();
  await top();
  await evaluate(
    main,
    `document.querySelector('[aria-label="Chat history"]').click();undefined`,
  );
  await until(`!!document.querySelector('[title="second scroll fixture"]')`);
  await evaluate(
    main,
    `document.querySelector('[title="second scroll fixture"]').click();undefined`,
  );
  await until(
    `document.querySelector('.ai-log').textContent.includes('second message 40')`,
  );
  await bottom();
  assert.equal(selectedId, 'second');
  fs.writeFileSync(
    path.join(out, 'ai-chat-scroll.png'),
    (await main.capturePage()).toPNG(),
  );
  fs.writeFileSync(
    path.join(out, 'ai-chat-scroll-results.json'),
    JSON.stringify(
      {
        outcome: 'passed',
        runtime: {
          electron: process.versions.electron,
          chromium: process.versions.chrome,
        },
        checks: [
          'Restored conversation opens at its latest messages',
          'New messages preserve manual reading position',
          'Closing/reopening Chat returns to bottom',
          'Returning from Tasks returns to bottom',
          'Selecting another conversation opens its latest messages',
        ],
        opened,
        reopened,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: chat opening/reopening, pane return, conversation selection and manual reading. Evidence: ' +
      out,
  );
};
