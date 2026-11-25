import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { PanelDockButton } from '../components/UI/PanelDockButton';
import { usePanelDock } from '../utils/hooks/usePanelDock';
function Container() {
  const { position } = usePanelDock();
  return <div data-testid="container" data-dock={position}><PanelDockButton /><input aria-label="Panel draft" defaultValue="Keep this draft" /></div>;
}
beforeEach(() => localStorage.clear());
it('changes the shared dock without replacing panel content and remembers the selection', () => {
  const view = render(<Container />);
  const draft = screen.getByRole('textbox');
  fireEvent.change(draft, { target: { value: 'Unsaved editor changes' } });
  fireEvent.change(screen.getByLabelText('Panel dock position'), { target: { value: 'bottom' } });
  expect(screen.getByTestId('container')).toHaveAttribute('data-dock', 'bottom');
  expect(screen.getByRole('textbox')).toBe(draft);
  expect(draft).toHaveValue('Unsaved editor changes');
  expect(localStorage.getItem('kudium-panel-dock')).toBe('bottom');
  view.unmount();
  render(<Container />);
  expect(screen.getByTestId('container')).toHaveAttribute('data-dock', 'bottom');
  fireEvent.change(screen.getByLabelText('Panel dock position'), { target: { value: 'right' } });
  expect(screen.getByTestId('container')).toHaveAttribute('data-dock', 'right');
});
