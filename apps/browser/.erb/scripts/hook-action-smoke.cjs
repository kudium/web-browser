// Real Chromium boundary checks using a disposable profile; no application stores.
const { app, BrowserWindow } = require('electron');
const { buildSync } = require('esbuild');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '../..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-hook-action-'));
app.setPath('userData', path.join(fixture, 'profile'));
app.on('window-all-closed', () => {});
app
  .whenReady()
  .then(async () => {
    for (const file of ['hookActionSandbox', 'hookActionField', 'dialogs'])
      buildSync({
        entryPoints: [path.join(root, `src/main/${file}.ts`)],
        bundle: true,
        platform: 'node',
        external: ['electron'],
        outfile: path.join(fixture, `${file}.cjs`),
      });
    const { runActionSandbox } = require(path.join(
      fixture,
      'hookActionSandbox.cjs'
    ));
    const {
      captureActionField,
      fillActionField,
      readActionFieldContext,
      readActionFormForSave,
      findPageActionForms,
      captureSelectedActionForm,
      fillActionForm,
    } = require(path.join(fixture, 'hookActionField.cjs'));
    const action = (source) => ({
      id: 'test',
      name: 'Test',
      contexts: ['page'],
      source,
    });
    const context = {
      apiVersion: 1,
      url: 'https://example.com',
      title: 'Fixture',
    };
    assert.deepEqual(
      await runActionSandbox(
        action(
          'return `${typeof require}:${typeof process}:${context.title}`;'
        ),
        context
      ),
      [{ capability: 'result', input: 'undefined:undefined:Fixture' }]
    );
    assert.deepEqual(
      await runActionSandbox(
        action(
          'try { await fetch("https://example.com"); return "network open"; } catch { return "blocked"; }'
        ),
        context
      ),
      [{ capability: 'result', input: 'blocked' }]
    );
    assert.deepEqual(
      await runActionSandbox(
        action(
          'return `${typeof document}:${typeof RTCPeerConnection}:${typeof window}`;'
        ),
        context
      ),
      [{ capability: 'result', input: 'undefined:undefined:undefined' }]
    );
    assert.deepEqual(
      await runActionSandbox(
        action('api.notes.create({title:"Note",body:"Content"});'),
        context
      ),
      [
        {
          capability: 'notes.create',
          input: { title: 'Note', body: 'Content' },
        },
      ]
    );
    await assert.rejects(
      runActionSandbox(
        action(
          'api.notes.create({title:"Note",body:"Content",scope:"another"});'
        ),
        context
      ),
      /Invalid note/
    );
    await assert.rejects(
      runActionSandbox(action('api.showResult("x".repeat(120000));'), context),
      /too large/
    );
    await assert.rejects(
      runActionSandbox(action('while (true) {}'), context),
      /five seconds/
    );
    const custom = await runActionSandbox(
      {
        ...action(
          'const bytes = crypto.getRandomValues(new Uint8Array(24)); api.passwords.fill(Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""));'
        ),
        permissions: ['password.write'],
      },
      context
    );
    assert.equal(custom[0].capability, 'password.write');
    assert.match(custom[0].input, /^[a-f0-9]{48}$/);
    assert.deepEqual(
      await runActionSandbox(action('api.passwords.fill("Custom");'), context),
      [{ capability: 'password.write', input: 'Custom' }]
    );
    assert.deepEqual(
      await runActionSandbox(
        action(
          'const data = await api.personalData.request({fields:["firstName","lastName"]}); if (!data) return; api.field.fill(`${data.firstName} ${data.lastName}`);'
        ),
        context,
        {
          request: async (request) => {
            assert.deepEqual(request, {
              type: 'input',
              fields: [
                {
                  key: 'firstName',
                  label: 'First Name',
                  type: 'text',
                  personalData: 'firstName',
                },
                {
                  key: 'lastName',
                  label: 'Last Name',
                  type: 'text',
                  personalData: 'lastName',
                },
              ],
            });
            // A realistic human wait must not exhaust the script budget.
            await new Promise((resolve) => setTimeout(resolve, 5500));
            return { firstName: 'Alex', lastName: 'Studio' };
          },
        }
      ),
      [{ capability: 'field.write', input: 'Alex Studio' }]
    );
    assert.deepEqual(
      await runActionSandbox(
        action(
          'const data = await api.input.request({fields:["question"]}); if (!data) return; return data.question;'
        ),
        context,
        { request: async () => null }
      ),
      []
    );
    assert.deepEqual(
      await runActionSandbox(
        action(
          'const a = await api.input.request({fields:["a"]}); const b = await api.input.request({fields:["b"]}); return a.a + b.b;'
        ),
        context,
        {
          request: async (r) =>
            Object.fromEntries(r.fields.map(({ key }) => [key, key])),
        }
      ),
      [{ capability: 'result', input: 'ab' }]
    );
    await assert.rejects(
      runActionSandbox(
        action(
          'for (let i=0;i<4;i++) await api.input.request({fields:["a"]});'
        ),
        context,
        { request: async () => ({ a: 'x' }) }
      ),
      /Maximum three/
    );
    await assert.rejects(
      runActionSandbox(
        action('await api.personalData.request({fields:["constructor"]});'),
        context,
        {
          request: async () => {
            throw new Error('Should not reach broker');
          },
        }
      ),
      /input field/
    );
    await assert.rejects(
      runActionSandbox(
        action(
          'self.postMessage({request:{type:"vault",fields:["all"]}}); await new Promise(()=>{});'
        ),
        context
      ),
      /named input/
    );
    await assert.rejects(
      runActionSandbox(
        action(
          'await Promise.all([api.input.request({fields:["a"]}),api.input.request({fields:["b"]})]);'
        ),
        context,
        { request: async () => ({ a: 'x' }) }
      ),
      /Await/
    );
    const cancel = new AbortController();
    await assert.rejects(
      runActionSandbox(
        action(
          'api.field.fill("Never apply"); await api.input.request({fields:["a"]});'
        ),
        context,
        {
          signal: cancel.signal,
          request: async (_r, signal) => {
            setTimeout(() => cancel.abort(), 30);
            await new Promise((resolve) =>
              signal.addEventListener('abort', resolve, { once: true })
            );
            return { a: 'late' };
          },
        }
      ),
      /cancelled/
    );
    const page = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await page.loadURL(
      'data:text/html,' +
        encodeURIComponent(
          '<input id="text" style="position:absolute;left:10px;top:10px"><input id="password" type="password" style="position:absolute;left:10px;top:60px">'
        )
    );
    // Real native context-menu events use zoomed view coordinates, not CSS coordinates.
    const nativePasswordMenu = async () => {
      const zoom = page.webContents.getZoomFactor();
      const point = await page.webContents.executeJavaScript(
        '(()=>{const b=document.getElementById("password").getBoundingClientRect();return {x:Math.round((b.x+b.width/2)*' +
          zoom +
          '),y:Math.round((b.y+b.height/2)*' +
          zoom +
          ')}})()'
      );
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Native context menu did not open.')),
          2000
        );
        page.webContents.once('context-menu', (_event, params) => {
          clearTimeout(timeout);
          resolve(params);
        });
        page.webContents.sendInputEvent({
          type: 'mouseDown',
          button: 'right',
          clickCount: 1,
          ...point,
        });
        page.webContents.sendInputEvent({
          type: 'mouseUp',
          button: 'right',
          clickCount: 1,
          ...point,
        });
      });
    };
    for (const zoom of [1, 1.5, 0.8]) {
      page.webContents.setZoomFactor(zoom);
      const nativeParams = await nativePasswordMenu();
      assert.equal(nativeParams.formControlType, 'input-password');
      assert.equal(nativeParams.isEditable, true);
      const token = 'native-password-' + zoom;
      assert.equal(
        await captureActionField(page.webContents, nativeParams, token),
        true
      );
      assert.equal(
        (await readActionFieldContext(page.webContents, token, false)).field
          .type,
        'password'
      );
      await fillActionField(
        page.webContents,
        token,
        'Native generated fixture',
        true
      );
    }
    page.webContents.setZoomFactor(1);
    await page.webContents.executeJavaScript(
      'document.getElementById("password").readOnly=true'
    );
    const readonlyParams = await nativePasswordMenu();
    assert.equal(readonlyParams.isEditable, false);
    await page.webContents.executeJavaScript(
      'document.getElementById("password").readOnly=false'
    );
    const params = { x: 20, y: 20, menuSourceType: 'mouse' };
    assert.equal(
      await captureActionField(page.webContents, params, 'text'),
      true
    );
    await fillActionField(page.webContents, 'text', 'Filled', false);
    assert.equal(
      await page.webContents.executeJavaScript(
        'document.getElementById("text").value'
      ),
      'Filled'
    );
    await assert.rejects(
      fillActionField(page.webContents, 'wrong-token', 'No', false),
      /changed/
    );
    await page.webContents.executeJavaScript(
      'document.getElementById("text").type="password"'
    );
    await assert.rejects(
      fillActionField(page.webContents, 'text', 'No', false),
      /changed/
    );
    assert.equal(
      await captureActionField(
        page.webContents,
        { ...params, y: 70 },
        'password'
      ),
      true
    );
    await fillActionField(page.webContents, 'password', 'Generated', true);
    assert.equal(
      await page.webContents.executeJavaScript(
        'document.getElementById("password").value'
      ),
      'Generated'
    );
    await page.webContents.executeJavaScript(
      'document.getElementById("password").remove()'
    );
    await assert.rejects(
      fillActionField(page.webContents, 'password', 'No', true),
      /changed/
    );
    await page.webContents.executeJavaScript(
      `document.body.innerHTML = '<form id="profile"><label for="email">Email address</label><input id="email" name="email" type="email" value="PRIVATE" placeholder="Work email" autocomplete="email" maxlength="80" required><label for="first">First name</label><input id="first" autocomplete="given-name"><input id="secret" type="password" value="SECRET"><input id="hidden" type="hidden" value="HIDDEN"><input id="readonly" readonly value="READONLY"></form><input id="outside">'; document.getElementById('email').focus();`
    );
    assert.equal(
      await captureActionField(
        page.webContents,
        { ...params, menuSourceType: 'keyboard' },
        'form'
      ),
      true
    );
    const metadata = await readActionFieldContext(
      page.webContents,
      'form',
      true
    );
    assert.equal(metadata.field.label, 'Email address');
    assert.equal(metadata.field.maxLength, 80);
    assert.equal(metadata.form.fields.length, 3);
    assert.equal(metadata.field.value, 'PRIVATE');
    assert(!JSON.stringify(metadata).includes('SECRET'));
    const email = metadata.field.key;
    const first = metadata.form.fields.find((f) => f.id === 'first').key;
    const secret = metadata.form.fields.find((f) => f.id === 'secret').key;
    await assert.rejects(
      fillActionForm(page.webContents, 'form', [
        { key: email, value: 'changed@example.com' },
        { key: secret, value: 'No' },
      ]),
      /changed/
    );
    assert.equal(
      await page.webContents.executeJavaScript(
        'document.getElementById("email").value'
      ),
      'PRIVATE'
    );
    await fillActionForm(page.webContents, 'form', [
      { key: email, value: 'hello@example.com' },
      { key: first, value: 'Alex' },
    ]);
    assert.equal(
      await page.webContents.executeJavaScript(
        'document.getElementById("first").value'
      ),
      'Alex'
    );
    await page.webContents.executeJavaScript(
      'document.getElementById("first").outerHTML = "<input id=first>"'
    );
    await assert.rejects(
      fillActionForm(page.webContents, 'form', [{ key: first, value: 'No' }]),
      /changed/
    );
    await page.webContents.executeJavaScript(
      'document.querySelector("label").textContent = "Changed label"'
    );
    await assert.rejects(
      fillActionField(page.webContents, 'form', 'No', false),
      /changed/
    );
    // A page event changing the next target must stop the remaining writes.
    await page.webContents.executeJavaScript(
      'document.getElementById("email").focus(); document.getElementById("email").addEventListener("input", () => document.getElementById("first").type="password");'
    );
    assert.equal(
      await captureActionField(
        page.webContents,
        { ...params, menuSourceType: 'keyboard' },
        'event'
      ),
      true
    );
    const eventMetadata = await readActionFieldContext(
      page.webContents,
      'event',
      true
    );
    await assert.rejects(
      fillActionForm(page.webContents, 'event', [
        { key: eventMetadata.field.key, value: 'event@example.com' },
        {
          key: eventMetadata.form.fields.find((f) => f.id === 'first').key,
          value: 'No',
        },
      ]),
      /changed/
    );
    assert.equal(
      await page.webContents.executeJavaScript(
        'document.getElementById("first").value'
      ),
      ''
    );
    await page.webContents.executeJavaScript(
      `document.body.innerHTML = '<form><div contenteditable="true" aria-label="Description" id="editable"><span id="inner">Draft</span></div><fieldset disabled><input id="disabled"></fieldset></form>'; const range = document.createRange(); range.selectNodeContents(document.getElementById('inner')); getSelection().removeAllRanges(); getSelection().addRange(range); document.getElementById('editable').focus();`
    );
    assert.equal(
      await captureActionField(
        page.webContents,
        { ...params, menuSourceType: 'keyboard' },
        'editable'
      ),
      true
    );
    const editable = await readActionFieldContext(
      page.webContents,
      'editable',
      true
    );
    assert.equal(editable.field.id, 'editable');
    assert.equal(editable.form.fields.length, 1);
    await fillActionField(
      page.webContents,
      'editable',
      'Updated description',
      false
    );
    assert.equal(
      await page.webContents.executeJavaScript(
        'document.getElementById("editable").textContent'
      ),
      'Updated description'
    );
    const { showBrowserDialog } = require(path.join(fixture, 'dialogs.cjs'));
    const selectSavedField = (_event, modal) => {
      if (modal === page) return;
      modal.webContents.once('did-finish-load', () => {
        void modal.webContents.executeJavaScript('window.finish(3)');
      });
    };
    app.on('browser-window-created', selectSavedField);
    const choice = await showBrowserDialog(page, {
      message: 'Fill from Personal Data',
      buttons: ['Cancel', 'Fill field'],
      cancelId: 0,
      defaultId: 1,
      scopeLabel: 'Saved field',
      confirmLabel: 'Fill field',
      scope: [
        { label: 'Work · Email', response: 1 },
        { label: 'Home · Email', response: 2 },
        { label: 'Work · First name', response: 3 },
      ],
    });
    app.removeListener('browser-window-created', selectSavedField);
    assert.equal(choice.response, 3);
    assert.deepEqual(
      await runActionSandbox(action('api.personalData.fill();'), context),
      [{ capability: 'personalData.fill' }]
    );
    const chooseInputs = (_event, modal) => {
      if (modal === page) return;
      modal.webContents.once('did-finish-load', () => {
        void modal.webContents.executeJavaScript(`
          document.getElementById('input-0').value='0';
          document.getElementById('input-1').value='1';
          document.getElementById('input-0').dispatchEvent(new Event('change'));
          document.getElementById('confirm').click();
        `);
      });
    };
    app.on('browser-window-created', chooseInputs);
    const shared = await showBrowserDialog(page, {
      message: 'Share Personal Data',
      detail:
        'Choose fields to share with “Form tools · Combine name” on example.com.',
      buttons: ['Cancel', 'Share fields'],
      cancelId: 0,
      defaultId: 1,
      inputs: [
        {
          key: 'firstName',
          label: 'First name',
          choices: [{ value: '0', label: 'Profile · First name' }],
        },
        {
          key: 'lastName',
          label: 'Last name',
          choices: [{ value: '1', label: 'Profile · Last name' }],
        },
      ],
    });
    app.removeListener('browser-window-created', chooseInputs);
    assert.deepEqual(shared, {
      response: 1,
      checkboxChecked: false,
      inputValues: { firstName: '0', lastName: '1' },
      remembered: [],
      savedSources: {},
    });
    const groupedInputs = (_event, modal) => {
      if (modal === page) return;
      modal.webContents.once('did-finish-load', () => {
        void modal.webContents
          .executeJavaScript(
            `
          if(window.validateInputs()) throw new Error('Required fields should fail');
          if(!document.getElementById('error-1').textContent.includes('required')) throw new Error('Missing inline error');
          const email=document.getElementById('input-0');
          email.value='invalid';
          if(window.validateInputs()) throw new Error('Invalid email accepted');
          const picker=document.querySelector('[data-saved-for="input-0"]');
          picker.click();
          if(document.querySelectorAll('.saved-option').length>40)throw new Error('Unbounded picker rendering');
          const search=document.querySelector('.saved-search');search.value='Archived 44';search.dispatchEvent(new Event('input'));
          if(document.querySelectorAll('.saved-option').length!==1)throw new Error('Search missed value outside initial batch');
          search.value='Work';search.dispatchEvent(new Event('input'));
          search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
          if(email.value!=='work@example.com') throw new Error('Saved field did not fill');
          email.value='edited@example.com';
          document.getElementById('input-1').value='Explain this';
          document.getElementById('input-2').value='Alex';
          document.getElementById('input-2').dispatchEvent(new Event('input'));
          if(document.getElementById('error-2').textContent) throw new Error('Grouped input validation used wrong field');
          document.getElementById('input-3').value='basic';
          document.getElementById('forget-answers').click();
          if(document.getElementById('input-1').value!=='Explain this') throw new Error('Forgetting cleared custom answer');
          email.value='custom@example.com';
          document.querySelector('[data-remember="email"]').checked=true;
          if(!window.validateInputs()) throw new Error('Valid input rejected');
        `
          )
          .then(() =>
            setTimeout(async () => {
              fs.writeFileSync(
                '/tmp/kudium-grouped-input.png',
                (await modal.webContents.capturePage()).toPNG()
              );
              await modal.webContents.executeJavaScript(
                'document.getElementById("confirm").click()'
              );
            }, 800)
          )
          .catch((error) => {
            console.error(error);
            app.exit(1);
          });
      });
    };
    app.on('browser-window-created', groupedInputs);
    const grouped = await showBrowserDialog(page, {
      message: 'Complete your profile',
      eyebrow: 'Form tools · Ask · example.com',
      buttons: ['Cancel', 'Continue'],
      cancelId: 0,
      inputs: [
        {
          key: 'email',
          label: 'Work email',
          type: 'email',
          group: 'Profile',
          required: true,
          value: 'old@example.com',
          remember: true,
          remembered: true,
          saved: [
            { id: 'work', label: 'Work · Email', value: 'work@example.com' },
            ...Array.from({ length: 45 }, (_, i) => ({
              id: 'archived-' + i,
              label: 'Archived ' + i + ' · Email',
              value: 'archived' + i + '@example.com',
            })),
          ],
        },
        {
          key: 'question',
          label: 'What would you like help with?',
          type: 'textarea',
          required: true,
        },
        {
          key: 'firstName',
          label: 'First name',
          group: 'Profile',
          required: true,
        },
        {
          key: 'plan',
          label: 'Plan',
          type: 'select',
          options: [{ value: 'basic', label: 'Basic' }],
          required: true,
        },
      ],
    });
    app.removeListener('browser-window-created', groupedInputs);
    assert.deepEqual(grouped, {
      response: 1,
      checkboxChecked: false,
      inputValues: {
        email: 'custom@example.com',
        firstName: 'Alex',
        question: 'Explain this',
        plan: 'basic',
      },
      remembered: ['email'],
      savedSources: {},
    });
    const unmatchedInputs = (_event, modal) => {
      if (modal === page) return;
      modal.webContents.once('did-finish-load', () => {
        void modal.webContents
          .executeJavaScript(
            `
          const pickers = document.querySelectorAll('.saved-picker');
          if (pickers.length !== 2 || document.querySelector('.saved-hint')) throw new Error('Missing grouped Personal Data controls');
          pickers[0].click();
          const search=document.querySelector('.saved-search');
          search.value='not-found';search.dispatchEvent(new Event('input'));
          if(document.querySelector('.saved-empty').textContent!=='No results')throw new Error('Search did not filter results');
          search.value='profile';search.dispatchEvent(new Event('input'));
          if(document.querySelectorAll('.saved-option').length!==3)throw new Error('Search did not find saved item');
          if(document.querySelectorAll('.saved-group-title').length!==1 || document.querySelector('.saved-option small'))throw new Error('Saved item titles were not grouped');
          search.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
          if(!document.querySelector('.saved-panel').hidden)throw new Error('Escape did not dismiss picker');
        `
          )
          .then(() => new Promise((resolve) => setTimeout(resolve, 800)))
          .then(async () => {
            fs.writeFileSync(
              '/tmp/kudium-input-personal-data.png',
              (await modal.webContents.capturePage()).toPNG()
            );
            await modal.webContents.executeJavaScript(
              "document.querySelector('[data-saved-for]').click()"
            );
            await new Promise((resolve) => setTimeout(resolve, 200));
            fs.writeFileSync(
              '/tmp/kudium-input-personal-data-picker.png',
              (await modal.webContents.capturePage()).toPNG()
            );
            await modal.webContents.executeJavaScript(
              'document.getElementById("cancel").click()'
            );
          })
          .catch((error) => {
            console.error(error);
            app.exit(1);
          });
      });
    };
    app.on('browser-window-created', unmatchedInputs);
    const unmatched = await showBrowserDialog(page, {
      message: 'Complete your name',
      eyebrow: 'Form tools · Combine Personal Data · example.com',
      buttons: ['Cancel', 'Continue'],
      cancelId: 0,
      inputs: [
        {
          key: 'firstName',
          label: 'First name',
          group: 'Profile',
          required: true,
          personalData: 'firstName',
          remember: true,
          saved: [
            {
              id: 'name',
              label: 'Personal profile · Name',
              value: 'Alex Example',
            },
            {
              id: 'email',
              label: 'Personal profile · Email',
              value: 'alex@example.com',
            },
            {
              id: 'phone',
              label: 'Personal profile · Phone',
              value: '+15555550100',
            },
            {
              id: 'work-email',
              label: 'Work · Email',
              value: 'work@example.com',
            },
          ],
        },
        {
          key: 'lastName',
          label: 'Last name',
          group: 'Profile',
          required: true,
          personalData: 'lastName',
          remember: true,
          saved: [],
          savedHint:
            'No saved values available for this website. Enter your own value.',
        },
      ],
    });
    app.removeListener('browser-window-created', unmatchedInputs);
    assert.equal(unmatched.response, 0);
    const directPicker = (_event, modal) => {
      if (modal === page) return;
      modal.webContents.once('did-finish-load', () => {
        void modal.webContents
          .executeJavaScript(
            `
          if(document.querySelector('[data-input]') || document.getElementById('scope'))throw new Error('Direct picker still has a form');
          if(document.activeElement!==document.querySelector('.saved-search'))throw new Error('Direct picker did not focus search');
          if(document.querySelectorAll('.saved-group-title').length!==2)throw new Error('Direct picker did not reuse grouped list');
        `
          )
          .then(() => new Promise((resolve) => setTimeout(resolve, 800)))
          .then(async () => {
            fs.writeFileSync(
              '/tmp/kudium-personal-data-fill.png',
              (await modal.webContents.capturePage()).toPNG()
            );
            await modal.webContents.executeJavaScript(`
            const search=document.querySelector('.saved-search');search.value='Work';search.dispatchEvent(new Event('input'));
            if(document.querySelectorAll('.saved-option').length!==1)throw new Error('Direct picker search failed');
            search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
          `);
          })
          .catch((error) => {
            console.error(error);
            app.exit(1);
          });
      });
    };
    app.on('browser-window-created', directPicker);
    const direct = await showBrowserDialog(page, {
      message: 'Fill from Personal Data',
      eyebrow: 'Email · example.com',
      buttons: ['Cancel'],
      cancelId: 0,
      savedPicker: [
        { label: 'Personal profile · Name' },
        { label: 'Personal profile · Email' },
        { label: 'Work · Email' },
      ],
    });
    app.removeListener('browser-window-created', directPicker);
    assert.equal(direct.response, 3);
    assert.deepEqual(await runActionSandbox(action('api.personalData.saveForm();'), context), [{ capability: 'personalData.saveForm' }]);
    await page.loadURL('data:text/html,' + encodeURIComponent('<form><label>Username<input id="save-user" name="username" autocomplete="username" value="alex"></label><label>Email<input name="email" type="email" value="alex@example.com"></label><label>Password<input name="password" type="password" value="private-fixture-password"></label><input name="otp" value="123456"></form><form><input name="other-form" value="excluded"></form>'));
    await page.webContents.executeJavaScript('document.getElementById("save-user").focus()');
    assert.equal(await captureActionField(page.webContents, { menuSourceType: 'keyboard', x: 0, y: 0 }, 'save-form'), true);
    const normalForm = await readActionFieldContext(page.webContents, 'save-form', true);
    assert.equal(normalForm.form.fields.find(f => f.type === 'password').value, undefined);
    const capturedForm = await readActionFormForSave(page.webContents, 'save-form');
    assert.equal(capturedForm.length, 3);
    assert.equal(capturedForm.find(f => f.type === 'password').value, 'private-fixture-password');
    assert(!capturedForm.some(f => f.name === 'otp' || f.name === 'other-form'));
    const reviewForm = (_event, modal) => {
      if (modal === page) return;
      modal.webContents.once('did-finish-load', () => {
        void new Promise(resolve => setTimeout(resolve, 600)).then(async () => {
          await modal.webContents.executeJavaScript(`
            if (document.body.textContent.includes('private-fixture-password') || document.documentElement.innerHTML.includes('private-fixture-password')) throw new Error('Secret leaked into review');
            if (!document.getElementById('review-availability').disabled) throw new Error('Private form not site bound');
            if (!document.documentElement.dataset.glass) throw new Error('Missing shared dialog material');
          `);
          fs.writeFileSync('/tmp/kudium-save-form.png', (await modal.webContents.capturePage()).toPNG());
          await modal.webContents.executeJavaScript(`
            const password=document.querySelector('[data-review-key="f2"]');password.checked=false;password.dispatchEvent(new Event('change'));
            if(document.getElementById('review-availability').disabled) throw new Error('Ordinary data still restricted');
            document.getElementById('review-availability').value='anywhere';
            document.getElementById('review-title').value='Contact';
            window.finish(1);
          `);
        }).catch(error => {console.error(error);app.exit(1)});
      });
    };
    app.on('browser-window-created', reviewForm);
    const reviewed = await showBrowserDialog(page, {
      message: 'Save form to Personal Data', eyebrow: 'example.com', buttons: ['Cancel','Save'], cancelId: 0, defaultId: 1,
      formReview: {title: 'example.com', fields: capturedForm.map(f => ({key:f.key,label:f.label,value:f.type==='password'?'':f.value,secret:f.type==='password',mapping:f.type==='password'?'current-password':f.type==='email'?'email':'username'}))},
    });
    app.removeListener('browser-window-created', reviewForm);
    assert.equal(reviewed.response, 1);
    assert.equal(reviewed.formReview.availability, 'anywhere');
    assert.equal(reviewed.formReview.fields.length, 2);
    assert(!JSON.stringify(reviewed).includes('private-fixture-password'));
    const pageForms = await findPageActionForms(page.webContents, 'page-save');
    assert.equal(pageForms.length, 2);
    assert(!JSON.stringify(pageForms).includes('private-fixture-password'));
    assert.equal(await captureSelectedActionForm(page.webContents, 'page-save', pageForms[0].key), true);
    assert.equal((await readActionFormForSave(page.webContents, 'page-save')).length, 3);
    await page.loadURL('data:text/html,' + encodeURIComponent('<input name="email" value="alex@example.com"><input name="password" type="password" value="private-unowned">'));
    const unownedForms = await findPageActionForms(page.webContents, 'unowned');
    assert.equal(unownedForms.length, 1);
    assert(unownedForms[0].label.includes('Page fields'));
    assert.equal(await captureSelectedActionForm(page.webContents, 'unowned', unownedForms[0].key), true);
    assert.equal((await readActionFormForSave(page.webContents, 'unowned')).length, 2);
    await page.webContents.executeJavaScript('document.querySelector("input").remove()');
    assert.equal(await captureSelectedActionForm(page.webContents, 'unowned', unownedForms[0].key), false);
    page.destroy();
    console.log(
      'Hook action Chromium checks passed: sandbox, network denial, timeout, command validation, and clicked-field binding.'
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
app.on('will-quit', () => fs.rmSync(fixture, { recursive: true, force: true }));
