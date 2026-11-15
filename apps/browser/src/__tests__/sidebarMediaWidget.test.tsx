import { act, fireEvent, render, screen } from '@testing-library/react';
import { SidebarMediaWidget } from '../components/UI/SidebarMediaWidget';
import type { IApp } from '../types';
import type { BrowserState } from '../browser/contracts';

const tab = {
  id: 'music',
  name: 'Music',
  url: 'https://music.example',
} as IApp;
const state: BrowserState = {
  id: tab.id,
  title: 'A song',
  url: tab.url,
  loading: false,
  canGoBack: false,
  canGoForward: false,
  mediaPlaying: true,
  sidebarMediaEligible: true,
};

test('appears for playback, targets the source tab, and keeps resume available after pause', () => {
  const onCommand = jest.fn();
  const onSelect = jest.fn();
  const props = { tabs: [tab], selectedId: undefined, onCommand, onSelect };
  const view = render(<SidebarMediaWidget {...props} states={{}} />);
  expect(screen.queryByRole('group')).toBeNull();
  view.rerender(<SidebarMediaWidget {...props} states={{ music: state }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(onCommand).toHaveBeenLastCalledWith({
    id: 'music',
    action: 'media-play-pause',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
  expect(onCommand).toHaveBeenLastCalledWith({
    id: 'music',
    action: 'media-next',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Previous track' }));
  expect(onCommand).toHaveBeenLastCalledWith({
    id: 'music',
    action: 'media-previous',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Mute site' }));
  expect(onCommand).toHaveBeenLastCalledWith({
    id: 'music',
    action: 'toggle-mute',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open A song' }));
  expect(onSelect).toHaveBeenCalledWith(tab);
  view.rerender(
    <SidebarMediaWidget
      {...props}
      states={{ music: { ...state, mediaPlaying: false } }}
    />,
  );
  expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
  view.rerender(
    <SidebarMediaWidget {...props} tabs={[]} states={{ music: state }} />,
  );
  expect(screen.queryByRole('group')).toBeNull();
});

test('background focuses the source while controls and dismissal do not switch tabs', () => {
  const onCommand = jest.fn();
  const onSelect = jest.fn();
  const props = {
    tabs: [tab],
    selectedId: undefined,
    states: { music: state },
    onCommand,
    onSelect,
  };
  const view = render(<SidebarMediaWidget {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Focus tab A song' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith(tab);
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss media widget' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('group')).toBeNull();
  view.rerender(
    <SidebarMediaWidget
      {...props}
      states={{ music: { ...state, title: 'Another song' } }}
    />,
  );
  expect(screen.queryByRole('group')).toBeNull();
  expect(onCommand).toHaveBeenCalledTimes(1);
});

test('hides on the music tab and resets dismissal when returning to it', () => {
  jest.useFakeTimers();
  const props = {
    tabs: [tab],
    states: { music: state },
    onCommand: jest.fn(),
    onSelect: jest.fn(),
  };
  const view = render(<SidebarMediaWidget {...props} selectedId="music" />);
  expect(screen.queryByRole('group')).toBeNull();
  view.rerender(<SidebarMediaWidget {...props} selectedId="other" />);
  act(() => jest.advanceTimersByTime(120));
  expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss media widget' }));
  expect(screen.queryByRole('group')).toBeNull();
  view.rerender(<SidebarMediaWidget {...props} selectedId="third" />);
  act(() => jest.advanceTimersByTime(120));
  expect(screen.queryByRole('group')).toBeNull();
  view.rerender(<SidebarMediaWidget {...props} selectedId="music" />);
  act(() => jest.advanceTimersByTime(120));
  expect(screen.queryByRole('group')).toBeNull();
  view.rerender(<SidebarMediaWidget {...props} selectedId="other" />);
  act(() => jest.advanceTimersByTime(120));
  expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  jest.useRealTimers();
});

test('rapid focus changes preserve the same widget and settle only on the final tab', () => {
  jest.useFakeTimers();
  const props = {
    tabs: [tab],
    states: { music: state },
    onCommand: jest.fn(),
    onSelect: jest.fn(),
  };
  const view = render(<SidebarMediaWidget {...props} selectedId="other" />);
  const widget = screen.getByRole('group');
  view.rerender(<SidebarMediaWidget {...props} selectedId="music" />);
  act(() => jest.advanceTimersByTime(60));
  expect(screen.getByRole('group')).toBe(widget);
  view.rerender(<SidebarMediaWidget {...props} selectedId="third" />);
  act(() => jest.advanceTimersByTime(120));
  expect(screen.getByRole('group')).toBe(widget);
  view.rerender(<SidebarMediaWidget {...props} selectedId="music" />);
  act(() => jest.advanceTimersByTime(120));
  expect(screen.queryByRole('group')).toBeNull();
  expect(screen.getByRole('group', { hidden: true })).toBe(widget);
  view.rerender(<SidebarMediaWidget {...props} selectedId="other" />);
  act(() => jest.advanceTimersByTime(120));
  expect(screen.getByRole('group')).toBe(widget);
  jest.useRealTimers();
});

test('ignores decorative playback and clears a remembered player when its session ends', () => {
  const props = {
    tabs: [tab],
    selectedId: 'other',
    onCommand: jest.fn(),
    onSelect: jest.fn(),
  };
  const view = render(
    <SidebarMediaWidget
      {...props}
      states={{
        music: { ...state, audible: true, sidebarMediaEligible: false },
      }}
    />,
  );
  expect(screen.queryByRole('group')).toBeNull();
  view.rerender(<SidebarMediaWidget {...props} states={{ music: state }} />);
  expect(screen.getByRole('group')).toBeTruthy();
  view.rerender(
    <SidebarMediaWidget
      {...props}
      states={{
        music: { ...state, sidebarMediaEligible: false, mediaPlaying: false },
      }}
    />,
  );
  expect(screen.queryByRole('group')).toBeNull();
});
