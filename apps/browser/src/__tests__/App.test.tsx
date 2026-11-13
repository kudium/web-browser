import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import App from '../renderer/App';

jest.mock('../components/View/Main/Main', () => ({
  Main: () => <div>Kudium Browser</div>,
}));

jest.mock('../components/UI/BrowserWorkspace', () => ({
  BrowserWorkspace: () => <div>Kudium Browser</div>,
}));

describe('App', () => {
  it('should render', () => {
    Object.assign(window, {
      electron: {
        browser: {
          nativeAppearance: jest.fn().mockResolvedValue(undefined),
          onPreferences: jest.fn(() => () => {}),
          preferences: jest.fn().mockResolvedValue({}),
        },
        ipcRenderer: { on: jest.fn(() => () => {}) },
        hookMarketplace: {
          onInstall: jest.fn(() => () => {}),
          ready: jest.fn(),
        },
      },
    });
    window.history.replaceState({}, '', '/?view=main');
    render(<App />);

    expect(screen.getByText('Kudium Browser')).toBeInTheDocument();
  });
});
