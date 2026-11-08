import { compactAIPage } from '../browser/aiSnapshot';
import { readAIPage, actAIPage } from '../main/ai';

jest.mock('../main/mcp', () => ({ createMCPController: jest.fn() }));
jest.mock('electron', () => ({}));

it('reduces bytes while preserving actionable receipts and meaningful form state', () => {
  document.body.innerHTML =
    '<button>Apply</button><input aria-label="Name"><input type="checkbox"><input type="password"><canvas></canvas><select><option value="a">Alpha</option></select>';
  const rects = jest
    .spyOn(Element.prototype, 'getClientRects')
    .mockReturnValue([{ width: 20 }] as any);
  try {
    const detailed = readAIPage();
    const compact = compactAIPage(detailed);
    expect(compact.snapshotId).toBe(detailed.snapshotId);
    expect(compact.elements.map((element) => element.id)).toEqual(
      detailed.elements.map((element) => element.id)
    );
    expect(compact.elements[0]).toEqual({
      id: 0,
      label: 'Apply',
      role: 'button',
    });
    expect(compact.elements[1].value).toBe('');
    expect(compact.elements[2].checked).toBe(false);
    expect(compact.elements[3].type).toBe('password');
    expect(compact.elements[3]).not.toHaveProperty('value');
    expect(compact.elements[4].bounds).toEqual(detailed.elements[4].bounds);
    expect(compact.elements[5].options).toEqual(detailed.elements[5].options);
    expect(JSON.stringify(compact).length).toBeLessThan(
      JSON.stringify(detailed).length
    );
    actAIPage('type', 1, 'Sam', compact.snapshotId);
    expect(document.querySelector('input')!.value).toBe('Sam');
    document.querySelector('button')!.textContent = 'Delete';
    expect(() => actAIPage('click', 0, '', compact.snapshotId)).toThrow(
      'Target changed'
    );
    expect(detailed.elements[0]).toHaveProperty('bounds');
  } finally {
    rects.mockRestore();
  }
});

it('reports pending Cloudflare verification without exposing a challenge-solving action', () => {
  document.body.innerHTML =
    '<main>Performing security verification</main><iframe src="https://challenges.cloudflare.com/turnstile/widget"></iframe>';
  Object.defineProperty(document.body, 'innerText', {
    value: 'Performing security verification',
    configurable: true,
  });
  const rects = jest
    .spyOn(Element.prototype, 'getClientRects')
    .mockReturnValue([{ width: 20 }] as any);
  try {
    expect(readAIPage(0).verification).toEqual(
      expect.objectContaining({ provider: 'Cloudflare', status: 'pending' })
    );
    document.body.innerHTML = '<main>Normal page</main>';
    expect(readAIPage().verification).toBeUndefined();
  } finally {
    rects.mockRestore();
    delete (document.body as any).innerText;
  }
});
