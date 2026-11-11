/** Quoted delimiters, escaped quotes and line breaks are preserved. */
export function parseFileTable(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let truncated = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && (quoted || !cell)) {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (rows.length >= 500) {
        truncated = index < text.length - 1;
        break;
      }
    } else cell += char;
  }
  if (!truncated && (cell || row.length)) {
    row.push(cell);
    rows.push(row);
  }
  return {
    rows: rows.map((values) => values.slice(0, 50)),
    truncated: truncated || rows.some((values) => values.length > 50),
  };
}
