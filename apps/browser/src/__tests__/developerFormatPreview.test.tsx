import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { DeveloperFormatPreview } from '../components/UI/DeveloperFormatPreview';

jest.mock('../components/UI/DeveloperPDFPreview', () => ({
  DeveloperPDFPreview: () => <div>PDF viewer</div>,
}));
function preview(name: string, text: string) {
  return render(
    <Theme>
      <DeveloperFormatPreview
        file={{ name, path: name, size: text.length, text }}
        text={text}
      >
        <textarea aria-label="Source editor" defaultValue={text} />
      </DeveloperFormatPreview>
    </Theme>
  );
}
it('renders sanitized Markdown and switches to source without losing input', () => {
  preview('README.md', '# Hello\n<script>alert(1)</script>');
  expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Source' }));
  expect(screen.getByRole('textbox', { name: 'Source editor' })).toHaveValue(
    '# Hello\n<script>alert(1)</script>'
  );
});
it('renders CSV as a table', () => {
  preview('data.csv', 'name,value\n"A,B",2');
  expect(screen.getByRole('cell', { name: 'A,B' })).toBeInTheDocument();
});
it('renders expandable JSON and handles malformed JSON', () => {
  const result = preview('data.json', '{"nested":{"active":true}}');
  expect(document.querySelectorAll('details')).toHaveLength(2);
  result.unmount();
  preview('broken.json', '{');
  expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON');
});
it('renders audio and video with controls', () => {
  const result = render(
    <Theme>
      <DeveloperFormatPreview
        file={{
          name: 'clip.mp4',
          path: 'clip.mp4',
          size: 10,
          media: { type: 'video/mp4', url: 'data:video/mp4;base64,AA==' },
        }}
        text=""
      >
        Source
      </DeveloperFormatPreview>
    </Theme>
  );
  expect(document.querySelector('video')).toHaveAttribute('controls');
  result.unmount();
  render(
    <Theme>
      <DeveloperFormatPreview
        file={{
          name: 'sound.mp3',
          path: 'sound.mp3',
          size: 10,
          media: { type: 'audio/mpeg', url: 'data:audio/mpeg;base64,AA==' },
        }}
        text=""
      >
        Source
      </DeveloperFormatPreview>
    </Theme>
  );
  expect(document.querySelector('audio')).toHaveAttribute('controls');
});
