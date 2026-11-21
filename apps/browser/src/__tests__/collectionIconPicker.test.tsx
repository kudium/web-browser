import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import {
  CollectionIcon,
  CollectionIconPicker,
} from '../components/UI/CollectionIcon';
import { SpaceManager, SPACE_KEY } from '../utils/SpaceManager';
import { moveFolder } from '../utils/folderActions';

beforeEach(() => {
  localStorage.clear();
  Object.assign(window, {
    electron: { ipcRenderer: { sendMessage: jest.fn() } },
  });
});

it('uses the shared picker for emoji, symbols and restoring the default', () => {
  const onChange = jest.fn();
  render(
    <Theme>
      <CollectionIconPicker
        value={{ emoji: '📚', image: '' }}
        onChange={onChange}
      />
    </Theme>,
  );
  const trigger = screen.getByRole('button', {
    name: 'Choose collection icon',
  });
  expect(trigger).toHaveTextContent('📚');
  fireEvent.click(trigger);
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Use work icon for Choose collection icon',
    }),
  );
  expect(onChange).toHaveBeenLastCalledWith({
    emoji: '',
    image: 'kudium-symbol:work',
  });
  fireEvent.click(trigger);
  fireEvent.change(screen.getByLabelText('Emoji for Choose collection icon'), {
    target: { value: '🌱' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Use emoji' }));
  expect(onChange).toHaveBeenLastCalledWith({ emoji: '🌱', image: '' });
  fireEvent.click(trigger);
  fireEvent.click(
    screen.getByRole('button', { name: 'Default collection icon' }),
  );
  expect(onChange).toHaveBeenLastCalledWith({ emoji: '', image: '' });
});

it('renders symbols and uploaded images without changing the default collection appearance', () => {
  const view = render(<CollectionIcon size={20} />);
  expect(view.container.querySelector('svg')).toBeInTheDocument();
  view.rerender(
    <CollectionIcon
      collection={{ iconImage: 'kudium-symbol:work' }}
      size={20}
    />,
  );
  expect(view.container.querySelector('svg')).toBeInTheDocument();
  expect(view.container.querySelector('img')).toBeNull();
  const image = 'data:image/png;base64,aGVsbG8=';
  view.rerender(<CollectionIcon collection={{ iconImage: image }} size={20} />);
  expect(view.container.querySelector('img')).toHaveAttribute('src', image);
  view.rerender(
    <CollectionIcon collection={{ iconEmoji: '🌱', iconImage: image }} />,
  );
  expect(view.container).toHaveTextContent('🌱');
  expect(view.container.querySelector('img')).toBeNull();
});

it('persists collection icons and preserves them when moving the collection to another space', () => {
  const collection = {
    id: 'project',
    name: 'Project',
    iconEmoji: '🌱',
    iconImage: '',
    focusColor: '#123456',
  };
  SpaceManager.set([
    {
      id: 'source',
      name: 'Source',
      color: 'iris',
      folders: [collection, { id: 'old', name: 'Old collection' }],
    },
    { id: 'destination', name: 'Destination', color: 'blue', folders: [] },
  ]);
  expect(SpaceManager.getAll()[0].folders[0]).toEqual(collection);
  const moved = moveFolder(
    [],
    SpaceManager.getAll(),
    'source',
    'project',
    'destination',
  );
  SpaceManager.set(moved.spaces);
  expect(
    SpaceManager.getAll().find((space) => space.id === 'destination')
      ?.folders[0],
  ).toEqual(collection);
  expect(JSON.parse(localStorage.getItem(SPACE_KEY)!)[1].folders[0]).toEqual(
    collection,
  );
  expect(SpaceManager.getAll()[0].folders[0]).toEqual({
    id: 'old',
    name: 'Old collection',
  });
});
