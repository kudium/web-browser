/* File media has no caption sidecar; optional props use parameter defaults. */
/* eslint-disable jsx-a11y/media-has-caption, react/require-default-props */
import { ReactNode, useMemo, useState } from 'react';
import { Button } from '@radix-ui/themes';
import type { ProjectFilesResult } from '../../browser/developerProject';
import { parseFileTable } from '../../utils/fileTable';
import { renderAIMessage } from './AIMessage';
import { DeveloperPDFPreview } from './DeveloperPDFPreview';

function JSONBranch({
  value,
  label,
  depth = 0,
}: {
  value: unknown;
  label: string;
  depth?: number;
}) {
  if (value === null || typeof value !== 'object')
    return (
      <div className="developer-json-value">
        <span>{label}</span>: {JSON.stringify(value)}
      </div>
    );
  const entries = Object.entries(value);
  return (
    <details open={depth === 0}>
      <summary>
        {label}{' '}
        <span>
          {Array.isArray(value)
            ? `Array (${entries.length})`
            : `Object (${entries.length})`}
        </span>
      </summary>
      {depth < 12 ? (
        entries
          .slice(0, 200)
          .map(([key, item]) => (
            <JSONBranch key={key} label={key} value={item} depth={depth + 1} />
          ))
      ) : (
        <p>Use Source to see deeper values.</p>
      )}
      {entries.length > 200 && (
        <p>Showing 200 entries. View Source for the rest.</p>
      )}
    </details>
  );
}

export function DeveloperFormatPreview({
  file,
  text,
  children,
}: {
  file: NonNullable<ProjectFilesResult['file']>;
  text: string;
  children: ReactNode;
}) {
  const [source, setSource] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const extension = file.name.split('.').pop()?.toLowerCase();
  const format = ['md', 'markdown', 'csv', 'tsv', 'json'].includes(
    extension || ''
  )
    ? extension
    : undefined;
  const json = useMemo(() => {
    if (format !== 'json') return undefined;
    try {
      return { value: JSON.parse(text) };
    } catch {
      return { error: 'Invalid JSON. Switch to Source to edit it.' };
    }
  }, [format, text]);
  const table = useMemo(
    () =>
      format === 'csv' || format === 'tsv'
        ? parseFileTable(text, format === 'tsv' ? '\t' : ',')
        : undefined,
    [format, text]
  );
  const markdown = useMemo(
    () =>
      format === 'md' || format === 'markdown' ? renderAIMessage(text) : '',
    [format, text]
  );
  if (file.media?.type === 'application/pdf')
    return <DeveloperPDFPreview url={file.media.url} />;
  if (file.media)
    return (
      <div className="developer-media-preview">
        {mediaError && (
          <p role="alert">
            This media could not be played. Try opening it in a tab or external
            app.
          </p>
        )}
        {file.media.type.startsWith('video/') ? (
          <video
            controls
            preload="metadata"
            src={file.media.url}
            aria-label={file.name}
            onError={() => setMediaError(true)}
          />
        ) : (
          <audio
            controls
            preload="metadata"
            src={file.media.url}
            aria-label={file.name}
            onError={() => setMediaError(true)}
          />
        )}
      </div>
    );
  if (!format || file.text === undefined)
    return <div className="developer-format-preview">{children}</div>;
  return (
    <div className="developer-format-preview">
      <div
        className="developer-preview-controls"
        role="group"
        aria-label="File display"
      >
        <Button
          size="1"
          variant={source ? 'ghost' : 'soft'}
          aria-pressed={!source}
          onClick={() => setSource(false)}
        >
          Preview
        </Button>
        <Button
          size="1"
          variant={source ? 'soft' : 'ghost'}
          aria-pressed={source}
          onClick={() => setSource(true)}
        >
          Source
        </Button>
      </div>
      {source ? (
        children
      ) : (
        <div className="developer-format-content">
          {markdown && (
            <div
              className="developer-markdown-preview"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: markdown }}
            />
          )}
          {table && (
            <>
              <div className="developer-table-scroll">
                <table>
                  <tbody>
                    {table.rows.map((row, index) => (
                      <tr key={index}>
                        {row.map((cell, column) =>
                          index === 0 ? (
                            <th key={column} scope="col">
                              {cell}
                            </th>
                          ) : (
                            <td key={column}>{cell}</td>
                          )
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {table.truncated && (
                <p>
                  Showing up to 500 rows and 50 columns. View Source for the
                  rest.
                </p>
              )}
            </>
          )}
          {json &&
            (json.error ? (
              <p role="alert">{json.error}</p>
            ) : (
              <div className="developer-json-preview">
                <JSONBranch label="Root" value={json.value} />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
