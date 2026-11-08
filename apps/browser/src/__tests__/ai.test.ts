import { aiURL } from '../browser/ai';
import { readAIPage, actAIPage } from '../main/ai';

it('validates the observed keyboard target after focus without refocusing a changed target', () => {
  jest
    .spyOn(Element.prototype, 'getClientRects')
    .mockReturnValue([{ width: 20 }] as any);
  try {
    document.body.innerHTML =
      '<input aria-label="Account"><button>Other</button>';
    const page = readAIPage();
    const target = page.elements.find((item) => item.label === 'Account')!;
    actAIPage('key_focus', target.id, '', page.snapshotId);
    expect(() =>
      actAIPage('key_validate', target.id, '', page.snapshotId)
    ).not.toThrow();
    document.querySelector('button')!.focus();
    expect(() =>
      actAIPage('key_validate', target.id, '', page.snapshotId)
    ).toThrow('keyboard focus');
    expect(document.activeElement).toBe(document.querySelector('button'));
    document.querySelector('input')!.focus();
    document.querySelector('input')!.setAttribute('readonly', '');
    expect(() =>
      actAIPage('key_validate', target.id, '', page.snapshotId)
    ).toThrow('Target changed');
  } finally {
    jest.restoreAllMocks();
  }
});

jest.mock('../main/mcp', () => ({ createMCPController: jest.fn() }));

jest.mock('electron', () => ({}));
describe('AI page tools', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<button aria-label="Next">Next</button><input aria-label="Name" /><input type="password" />';
    jest
      .spyOn(Element.prototype, 'getClientRects')
      .mockReturnValue([{ width: 20 }] as any);
  });
  afterEach(() => jest.restoreAllMocks());
  it('reads labels and acts on only observed elements', () => {
    const page = readAIPage();
    expect(page.elements[0].label).toBe('Next');
    const click = jest.fn();
    document.querySelector('button')!.addEventListener('click', click);
    actAIPage('click', 0, '');
    expect(click).toHaveBeenCalledTimes(1);
    const input = document.querySelector('input')!;
    const change = jest.fn();
    input.addEventListener('input', change);
    actAIPage('type', 1, 'Sam');
    expect(input.value).toBe('Sam');
    expect(change).toHaveBeenCalledTimes(1);
  });
  it('rejects stale elements and password fields', () => {
    readAIPage();
    expect(() => actAIPage('type', 2, 'secret')).toThrow('Full access');
    actAIPage('type', 2, 'fixture-secret', undefined, true);
    expect(
      document.querySelector<HTMLInputElement>('[type=password]')!.value
    ).toBe('fixture-secret');
    expect(
      readAIPage().elements.find((element) => element.type === 'password')
    ).not.toHaveProperty('value', 'fixture-secret');
    document.querySelector('button')!.remove();
    expect(() => actAIPage('click', 0, '')).toThrow('Target changed');
  });
  it('rejects snapshot replacement and in-place changes before acting', () => {
    const page = readAIPage();
    const click = jest.fn();
    document.querySelector('button')!.addEventListener('click', click);
    readAIPage();
    expect(() => actAIPage('click', 0, '', page.snapshotId)).toThrow(
      'Snapshot changed'
    );
    const fresh = readAIPage();
    document
      .querySelector('button')!
      .setAttribute('aria-label', 'Delete account');
    expect(() => actAIPage('click', 0, '', fresh.snapshotId)).toThrow(
      'Target changed'
    );
    expect(click).not.toHaveBeenCalled();
  });
  it('discovers nested open shadow roots and dispatches input inside them', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<div></div>';
    const nested = shadow.querySelector('div')!.attachShadow({ mode: 'open' });
    nested.innerHTML = '<input aria-label="Shadow name">';
    const page = readAIPage();
    const target = page.elements.find((item) => item.label === 'Shadow name')!;
    expect(target).toBeDefined();
    const changed = jest.fn();
    nested.querySelector('input')!.addEventListener('input', changed);
    actAIPage('type', target.id, 'Shadow value', page.snapshotId);
    expect(nested.querySelector('input')!.value).toBe('Shadow value');
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it('exposes select options and refuses missing or disabled values', () => {
    document.body.innerHTML =
      '<select aria-label="Size"><option value="s">Small</option><option value="l">Large</option><option value="x" disabled>Unavailable</option></select>';
    const page = readAIPage();
    expect(page.elements[0].options).toContainEqual({
      value: 'l',
      label: 'Large',
      disabled: false,
      selected: false,
    });
    expect(() => actAIPage('type', 0, 'x', page.snapshotId)).toThrow(
      'enabled option'
    );
    expect(() => actAIPage('type', 0, 'unknown', page.snapshotId)).toThrow(
      'enabled option'
    );
    actAIPage('type', 0, 'l', page.snapshotId);
    expect(document.querySelector('select')!.value).toBe('l');
  });
  it('rejects fields changed to password during keyboard focus', () => {
    const page = readAIPage();
    const input = document.querySelector('input')!;
    input.addEventListener('focus', () => {
      input.type = 'password';
    });
    expect(() => actAIPage('key_focus', 1, '', page.snapshotId)).toThrow(
      'protected field'
    );
  });
  it('stops target traversal and reports bounded coverage', () => {
    document.body.innerHTML = '<button>Action</button>'.repeat(1000);
    const page = readAIPage(0);
    expect(page.elements).toHaveLength(250);
    expect(page.coverage.targetLimitReached).toBe(true);
    expect(page.coverage.visitedNodes).toBeLessThan(260);
    expect(page.text).toBe('');
  });
  it('bounds option output and reports truncation', () => {
    document.body.innerHTML = `<select>${'<option>Choice</option>'.repeat(
      500
    )}</select>`;
    const page = readAIPage();
    expect(page.elements[0].options).toHaveLength(200);
    expect(page.elements[0].optionsTruncated).toBe(true);
  });
  it('uses associated HTML labels and rejects relabelled controls', () => {
    document.body.innerHTML =
      '<label for="full-name">Full name</label><input id="full-name">';
    const page = readAIPage(0, 'Full name');
    expect(page.elements).toHaveLength(1);
    expect(page.elements[0].label).toBe('Full name');
    document.querySelector('label')!.textContent = 'Account owner';
    expect(() => actAIPage('type', 0, 'Sam', page.snapshotId)).toThrow(
      'Target changed'
    );
  });
  it('resolves aria-labelledby before other name sources', () => {
    document.body.innerHTML =
      '<span id="caption">Save changes</span><button aria-labelledby="caption" aria-label="Wrong label">Save</button>';
    expect(readAIPage().elements[0].label).toBe('Save changes');
  });
  it('looks up labelled targets beyond the unfiltered snapshot target limit', () => {
    document.body.innerHTML = `${'<button>Other action</button>'.repeat(
      500
    )}<button>Unique action</button>`;
    const page = readAIPage(0, 'Unique action');
    expect(page.elements).toHaveLength(1);
    expect(page.elements[0].label).toBe('Unique action');
    expect(page.coverage.targetLimitReached).toBe(false);
  });
  it('disambiguates identical labels by native role', () => {
    document.body.innerHTML = '<button>Save</button><a href="/save">Save</a>';
    expect(readAIPage(0, 'Save').elements).toHaveLength(2);
    const button = readAIPage(0, 'Save', 'button');
    expect(button.elements).toHaveLength(1);
    expect(button.elements[0].role).toBe('button');
    expect(readAIPage(0, 'Save', 'link').elements[0].tag).toBe('A');
  });
  it('reports bounded form state without protected values', () => {
    document.body.innerHTML =
      '<label><input type="checkbox" checked>Notify</label><input aria-label="Name" value="Sam"><input type="password" value="never-expose"><input type="hidden" value="hidden-secret"><textarea></textarea>';
    document.querySelector('textarea')!.value = 'x'.repeat(1200);
    const page = readAIPage();
    expect(page.elements[0]).toMatchObject({
      role: 'checkbox',
      checked: true,
      label: 'Notify',
    });
    expect(page.elements[1].value).toBe('Sam');
    expect(page.elements[4].value).toHaveLength(1000);
    expect(page.elements[4].valueTruncated).toBe(true);
    expect(JSON.stringify(page)).not.toContain('never-expose');
    expect(JSON.stringify(page)).not.toContain('hidden-secret');
  });
  it('blocks read-only and disabled fields', () => {
    document.body.innerHTML =
      '<input readonly value="Original"><fieldset disabled><input disabled value="Disabled"></fieldset>';
    const page = readAIPage();
    expect(page.elements[0].readOnly).toBe(true);
    expect(page.elements[1].disabled).toBe(true);
    expect(() => actAIPage('type', 0, 'Changed', page.snapshotId)).toThrow(
      'read-only'
    );
    expect(() => actAIPage('type', 1, 'Changed', page.snapshotId)).toThrow(
      'disabled'
    );
    document.querySelectorAll('input')[1].disabled = false;
    expect(() => actAIPage('type', 1, 'Changed', page.snapshotId)).toThrow(
      'Target changed'
    );
  });
  it('limits navigation to web URLs without credentials', () => {
    expect(aiURL('https://example.com')).toBe('https://example.com/');
    [
      'file:///etc/passwd',
      // eslint-disable-next-line no-script-url
      'javascript:alert(1)',
      'https://user:pass@example.com',
    ].forEach((url) => expect(() => aiURL(url)).toThrow());
  });
});

it('observes canvases and resolves target-local CSS coordinates with resize checks', () => {
  document.body.innerHTML = '<canvas aria-label="Drawing"></canvas>';
  const canvas = document.querySelector('canvas')!;
  jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as any);
  const rect = {
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 210,
    bottom: 120,
    width: 200,
    height: 100,
  };
  const geometry = jest
    .spyOn(canvas, 'getBoundingClientRect')
    .mockReturnValue(rect as DOMRect);
  const original = document.elementFromPoint;
  document.elementFromPoint = jest.fn(() => canvas);
  try {
    const page = readAIPage();
    expect(page.elements[0].tag).toBe('CANVAS');
    expect(page.elements[0].bounds).toEqual({
      x: 10,
      y: 20,
      width: 200,
      height: 100,
    });
    expect(
      actAIPage(
        'point_at',
        0,
        JSON.stringify({ x: 30, y: 40 }),
        page.snapshotId
      )
    ).toEqual({ x: 40, y: 60 });
    expect(() =>
      actAIPage(
        'point_at',
        0,
        JSON.stringify({ x: 200, y: 40 }),
        page.snapshotId
      )
    ).toThrow('outside');
    geometry.mockReturnValue({ ...rect, width: 220, right: 230 } as DOMRect);
    expect(() =>
      actAIPage(
        'point_at',
        0,
        JSON.stringify({ x: 30, y: 40 }),
        page.snapshotId
      )
    ).toThrow('resized');
  } finally {
    document.elementFromPoint = original;
    jest.restoreAllMocks();
  }
});

it('inspects only observed file inputs and rejects changed upload constraints', () => {
  document.body.innerHTML =
    '<input type="file" aria-label="Attachment" multiple accept=".txt" />';
  jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as any);
  try {
    const page = readAIPage();
    expect(actAIPage('file_info', 0, '', page.snapshotId)).toEqual({
      multiple: true,
      accept: '.txt',
      files: [],
    });
    document.querySelector('input')!.accept = '.png';
    expect(() => actAIPage('file_info', 0, '', page.snapshotId)).toThrow(
      'Target changed'
    );
    document.querySelector('input')!.type = 'password';
    const fresh = readAIPage();
    expect(() => actAIPage('file_info', 0, '', fresh.snapshotId)).toThrow(
      'not a file'
    );
  } finally {
    jest.restoreAllMocks();
  }
});

it('sets and clears multi-select values atomically and reports website changes', () => {
  document.body.innerHTML =
    '<select aria-label="Choices" multiple><option value="a">A</option><option value="b">B</option><optgroup disabled><option value="x">Blocked</option></optgroup></select>';
  jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as any);
  try {
    let page = readAIPage();
    expect(page.elements[0].multiple).toBe(true);
    expect(page.elements[0].selectedValues).toEqual([]);
    expect(
      actAIPage('select_options', 0, '["b","a"]', page.snapshotId)
    ).toEqual({ selectedValues: ['a', 'b'], confirmed: true });
    page = readAIPage();
    expect(() =>
      actAIPage('select_options', 0, '["a","x"]', page.snapshotId)
    ).toThrow('enabled');
    expect(
      Array.from(document.querySelector('select')!.selectedOptions).map(
        (option) => option.value
      )
    ).toEqual(['a', 'b']);
    expect(actAIPage('select_options', 0, '[]', page.snapshotId)).toEqual({
      selectedValues: [],
      confirmed: true,
    });
    page = readAIPage();
    document.querySelector('select')!.addEventListener('change', () => {
      document.querySelector('select')!.value = 'b';
    });
    expect(actAIPage('select_options', 0, '["a"]', page.snapshotId)).toEqual({
      selectedValues: ['b'],
      confirmed: false,
    });
  } finally {
    jest.restoreAllMocks();
  }
});

it('rejects changed option values and focus-time option changes before selecting', () => {
  document.body.innerHTML =
    '<select><option value="a">A</option><option value="b">B</option></select>';
  jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as any);
  try {
    const select = document.querySelector('select')!;
    const page = readAIPage();
    select.options[1].value = 'changed';
    expect(() =>
      actAIPage('select_options', 0, '["b"]', page.snapshotId)
    ).toThrow('Target changed');
    const fresh = readAIPage();
    select.addEventListener('focus', () => {
      select.options[1].value = 'changed again';
    });
    expect(() =>
      actAIPage('select_options', 0, '["changed"]', fresh.snapshotId)
    ).toThrow('Target changed');
    expect(select.value).toBe('a');
  } finally {
    jest.restoreAllMocks();
  }
});

it('reads later option pages and revalidates their private receipts before selection', () => {
  document.body.innerHTML = `<select aria-label="Countries">${Array.from(
    { length: 225 },
    (_, index) => `<option value="v${index}">Choice ${index}</option>`
  ).join('')}</select>`;
  jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as any);
  try {
    let page = readAIPage();
    expect(page.elements[0].optionsTruncated).toBe(true);
    expect(() =>
      actAIPage('select_preview', 0, '["v205"]', page.snapshotId)
    ).toThrow('not observed');
    const options = actAIPage(
      'read_options',
      0,
      '{"offset":200,"limit":25}',
      page.snapshotId
    ) as any;
    expect(options.total).toBe(225);
    expect(options.hasMore).toBe(false);
    expect(options.options[5]).toMatchObject({
      index: 205,
      value: 'v205',
      label: 'Choice 205',
    });
    expect(actAIPage('select_options', 0, '["v205"]', page.snapshotId)).toEqual(
      { selectedValues: ['v205'], confirmed: true }
    );
    page = readAIPage();
    actAIPage('read_options', 0, '{"offset":200,"limit":25}', page.snapshotId);
    document.querySelector('select')!.options[206].label =
      'Changed after observation';
    expect(() =>
      actAIPage('select_options', 0, '["v206"]', page.snapshotId)
    ).toThrow('Option changed');
    expect(document.querySelector('select')!.value).toBe('v205');
  } finally {
    jest.restoreAllMocks();
  }
});

it('permits routine login and form targets while flagging sensitive submissions', () => {
  document.body.innerHTML =
    '<form><input type="password" aria-label="Password" /><button>Sign in</button></form>';
  jest
    .spyOn(Element.prototype, 'getClientRects')
    .mockReturnValue([{ width: 20 }] as any);
  try {
    let page = readAIPage();
    const password = page.elements.find((entry) => entry.type === 'password')!;
    const login = page.elements.find((entry) => entry.label === 'Sign in')!;
    expect(
      actAIPage('inspect', password.id, '', page.snapshotId)
    ).toMatchObject({ sensitiveInput: false, safeInteraction: true });
    expect(actAIPage('inspect', login.id, '', page.snapshotId)).toMatchObject({
      sensitiveAction: false,
      safeInteraction: true,
    });
    actAIPage('type', password.id, 'fixture-secret', page.snapshotId, true);
    expect(
      readAIPage().elements.find((entry) => entry.type === 'password')
    ).not.toHaveProperty('value', 'fixture-secret');
    ['Payment details', 'Delete account permanently'].forEach((context) => {
      document.body.innerHTML = `<form><h2>${context}</h2><input aria-label="Name" /><button>Continue</button></form>`;
      page = readAIPage();
      page.elements.forEach((entry) => {
        expect(
          actAIPage('inspect', entry.id, '', page.snapshotId)
        ).toMatchObject({ sensitiveAction: true, safeInteraction: false });
      });
    });
    document.body.innerHTML =
      '<form><input aria-label="Card number" autocomplete="cc-number" /><button>Submit</button></form>';
    page = readAIPage();
    expect(
      actAIPage('inspect', page.elements[0].id, '', page.snapshotId)
    ).toMatchObject({ sensitiveInput: true });
    expect(
      actAIPage('inspect', page.elements[1].id, '', page.snapshotId)
    ).toMatchObject({ sensitiveAction: true, safeInteraction: false });
    document.body.innerHTML =
      '<form><input aria-label="Search" /><button>Submit</button></form>';
    page = readAIPage();
    expect(
      actAIPage('inspect', page.elements[1].id, '', page.snapshotId)
    ).toMatchObject({ sensitiveAction: false, safeInteraction: true });
  } finally {
    jest.restoreAllMocks();
  }
});
