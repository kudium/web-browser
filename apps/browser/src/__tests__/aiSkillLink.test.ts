import { EventEmitter } from 'events';
import { lookup } from 'dns/promises';
import { request } from 'https';
import { loadSkillLink, skillLinkURL } from '../main/aiSkillLink';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('https', () => ({ request: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
it('normalizes GitHub files, folders, and repositories and rejects unsafe URL schemes', () => {
  expect(
    skillLinkURL('https://github.com/acme/skills/blob/main/pdf/SKILL.md').href
  ).toBe('https://raw.githubusercontent.com/acme/skills/main/pdf/SKILL.md');
  expect(
    skillLinkURL('https://github.com/acme/skills/tree/main/pdf').pathname
  ).toBe('/acme/skills/main/pdf/SKILL.md');
  expect(skillLinkURL('https://github.com/acme/pdf').pathname).toBe(
    '/acme/pdf/HEAD/SKILL.md'
  );
  expect(() => skillLinkURL('file:///etc/passwd')).toThrow('HTTPS');
  expect(() =>
    skillLinkURL('https://user:password@example.com/skill.md')
  ).toThrow('credentials');
});
it('rejects private destinations before issuing a request', async () => {
  (lookup as jest.Mock).mockResolvedValue([
    { address: '127.0.0.1', family: 4 },
  ]);
  await expect(
    loadSkillLink('https://example.com/SKILL.md', new AbortController().signal)
  ).rejects.toThrow('public');
  expect(request).not.toHaveBeenCalled();
});
it('downloads a bounded skill without cookies and pins the public DNS result', async () => {
  (lookup as jest.Mock).mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  const outgoing = Object.assign(new EventEmitter(), {
    end: jest.fn(),
    destroy: jest.fn(),
  });
  (request as jest.Mock).mockImplementation((_url, options, callback) => {
    outgoing.end = jest.fn(() => {
      const response = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: {},
        resume: jest.fn(),
      });
      callback(response);
      response.emit(
        'data',
        Buffer.from('---\nname: Review\n---\nRead relevant files.')
      );
      response.emit('end');
    });
    const resolved = jest.fn();
    options.lookup('example.com', { all: false }, resolved);
    expect(resolved).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    expect(options.headers.Cookie).toBeUndefined();
    return outgoing;
  });
  const skill = await loadSkillLink(
    'https://example.com/SKILL.md',
    new AbortController().signal
  );
  expect(skill.name).toBe('Review');
  expect(skill.enabled).toBe(false);
});
it('rejects oversized downloads even when the response ends immediately', async () => {
  (lookup as jest.Mock).mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  const outgoing = Object.assign(new EventEmitter(), {
    end: jest.fn(),
    destroy: jest.fn(),
  });
  (request as jest.Mock).mockImplementation((_url, _options, callback) => {
    outgoing.end = jest.fn(() => {
      const response = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: {},
        destroy: jest.fn(),
      });
      callback(response);
      response.emit('data', Buffer.alloc(65537));
      response.emit('end');
    });
    return outgoing;
  });
  await expect(
    loadSkillLink('https://example.com/SKILL.md', new AbortController().signal)
  ).rejects.toThrow('64 KB');
});
it('cancels while DNS is pending without making a network request', async () => {
  (lookup as jest.Mock).mockReturnValue(new Promise(() => {}));
  const controller = new AbortController();
  const pending = loadSkillLink(
    'https://example.com/SKILL.md',
    controller.signal
  );
  controller.abort();
  await expect(pending).rejects.toThrow('timed out');
  expect(request).not.toHaveBeenCalled();
});
