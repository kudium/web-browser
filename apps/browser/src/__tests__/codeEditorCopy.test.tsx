import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CodeEditor } from '../components/UI/CodeEditor';
jest.mock('@uiw/react-codemirror', () => ({
  __esModule: true,
  default: () => <div data-testid="code-canvas" />,
  EditorView: { lineWrapping: {}, contentAttributes: { of: () => ({}) } },
  EditorState: { transactionFilter: { of: () => ({}) } },
}));
jest.mock('../browser/hookIntelligence', () => ({ hookLanguageMode: { of: () => ({}) } }));
jest.mock('../utils/appearance', () => ({ useAppearance: () => ({ appearance: 'light' }) }));
const writeText = jest.fn();
beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});
it('copies the current draft, including when the editor is read-only', async () => {
  const props = { value: 'first', onChange: jest.fn(), language: 'javascript' as const, label: 'After load code', disabled: true };
  const { rerender } = render(<CodeEditor {...props} />);
  rerender(<CodeEditor {...props} value="updated draft" />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy After load code' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied'));
  expect(writeText).toHaveBeenCalledWith('updated draft');
});
it('reports clipboard rejection without claiming success', async () => {
  writeText.mockRejectedValue(new Error('Clipboard unavailable'));
  render(<CodeEditor value="draft" onChange={jest.fn()} language="css" label="CSS code" disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy CSS code' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Try again'));
});
