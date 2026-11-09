import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { GroupEditor } from '../components/UI/GroupEditor';
import { AppManager } from '../utils/AppManager';

jest.mock('../components/UI/GroupAccessGate', () => ({
  GroupAccessGate: ({ children }: any) => children,
}));
jest.mock('../components/UI/IconPicker', () => ({ IconPicker: () => null }));
jest.mock('../components/UI/DeveloperProjectSection', () => ({
  DeveloperProjectSection: () => null,
}));
beforeAll(() => {
  global.ResizeObserver = class {
    observe = jest.fn();

    unobserve = jest.fn();

    disconnect = jest.fn();
  } as any;
});
const item = {
  id: 'draft',
  sessionId: 'draft-session',
  name: '',
  url: 'about:blank',
  icon: '',
  spaceId: 'default',
};
it('creates through the settings form and preserves a manually edited reference', async () => {
  const read = jest.spyOn(AppManager, 'getAll').mockReturnValue([]);
  const save = jest.spyOn(AppManager, 'set').mockImplementation(() => {});
  const created = jest.fn();
  const close = jest.fn();
  render(
    <Theme>
      <GroupEditor item={item} creating close={close} onCreated={created} />
    </Theme>
  );
  fireEvent.change(screen.getByLabelText('Group name'), {
    target: { value: 'Work tools' },
  });
  expect(screen.getByLabelText('Group slug')).toHaveValue('work-tools');
  fireEvent.change(screen.getByLabelText('Group slug'), {
    target: { value: ' work tools\t ' },
  });
  expect(screen.getByLabelText('Group slug')).toHaveValue('worktools');
  fireEvent.change(screen.getByLabelText('Group slug'), {
    target: { value: '--WORK_@tools!.é/😀--2' },
  });
  expect(screen.getByLabelText('Group slug')).toHaveValue('worktools-2');
  fireEvent.change(screen.getByLabelText('Group slug'), {
    target: { value: 'a'.repeat(70) },
  });
  expect(screen.getByLabelText('Group slug')).toHaveValue('a'.repeat(60));
  fireEvent.change(screen.getByLabelText('Group slug'), {
    target: { value: 'work' },
  });
  fireEvent.change(screen.getByLabelText('Group name'), {
    target: { value: 'Team tools' },
  });
  expect(screen.getByLabelText('Group slug')).toHaveValue('work');
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('New tab address'), {
    target: { value: 'https://example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add tab' }));
  fireEvent.change(screen.getByLabelText('New tab address'), {
    target: { value: 'https://example.org' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add tab' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove tab: example.org' })
  );
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
  expect(save).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'draft',
        sessionName: 'Team tools',
        sessionSlug: 'work',
        url: 'https://example.com/',
      }),
    ])
  );
  expect(created).toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  read.mockRestore();
  save.mockRestore();
});

it('uses the settings form for dropped projects, prefilling the path and saving only on Create', async () => {
  const read = jest.spyOn(AppManager, 'getAll').mockReturnValue([]);
  const save = jest.spyOn(AppManager, 'set').mockImplementation(() => {});
  const createDroppedGroup = jest.fn().mockResolvedValue({
    tab: { ...item, id: 'created', sessionId: 'created-session' },
  });
  const previous = window.electron;
  window.electron = { siteDeveloper: { createDroppedGroup } } as any;
  const close = jest.fn();
  const created = jest.fn();
  render(
    <Theme>
      <GroupEditor
        item={{
          ...item,
          name: 'Website',
          sessionName: 'Website',
          sessionSlug: 'website',
        }}
        creating
        droppedProject={{
          kind: 'project',
          token: 'drop',
          name: 'Website',
          slug: 'website',
          folder: '/Projects/Website',
        }}
        close={close}
        onCreated={created}
      />
    </Theme>
  );
  expect(screen.getByLabelText('Group name')).toHaveValue('Website');
  expect(screen.getByLabelText('Group slug')).toHaveValue('website');
  expect(screen.getByText('/Projects/Website')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalled();
  expect(createDroppedGroup).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
  await waitFor(() => expect(created).toHaveBeenCalled());
  expect(createDroppedGroup).toHaveBeenCalledWith({
    token: 'drop',
    name: 'Website',
    slug: 'website',
  });
  expect(save).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'created',
        sessionName: 'Website',
        sessionSlug: 'website',
      }),
    ])
  );
  window.electron = previous;
  read.mockRestore();
  save.mockRestore();
});

it('clears committed tab drafts when creation becomes group editing', () => {
  let saved: any[] = [];
  const read = jest.spyOn(AppManager, 'getAll').mockImplementation(() => saved);
  const save = jest.spyOn(AppManager, 'set').mockImplementation((tabs) => {
    saved = tabs;
  });
  try {
    const close = jest.fn();
    const view = render(
      <Theme>
        <GroupEditor
          item={item}
          creating
          close={close}
          onCreated={(created) => {
            view.rerender(
              <Theme>
                <GroupEditor item={created} close={close} />
              </Theme>
            );
          }}
        />
      </Theme>
    );
    fireEvent.change(screen.getByLabelText('Group name'), {
      target: { value: 'Draft cleanup' },
    });
    fireEvent.change(screen.getByLabelText('New tab address'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add tab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    expect(screen.getAllByLabelText('Tab name: example.com')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(saved).toHaveLength(1);
  } finally {
    read.mockRestore();
    save.mockRestore();
  }
});
