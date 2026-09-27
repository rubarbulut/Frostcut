/** Bounded CSV reader with quoted fields, embedded newlines and escaped quotes. */
export function analyticsCsv(text: string, delimiter = ',') {
  if (![',', ';', '\t'].includes(delimiter)) throw new Error('Choose comma, semicolon or tab.');
  if (text.length > 1_000_000) throw new Error('Choose a CSV smaller than 1 MB.');
  const rows: string[][] = [];
  const recordNumbers: number[] = [];
  let record = 0;
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  const cell = () => {
    row.push(field.trim());
    field = '';
    closed = false;
    if (row.length > 100) throw new Error('CSV has more than 100 columns.');
  };
  const line = () => {
    cell();
    record++;
    if (row.some((value) => value !== '')) {
      rows.push(row);
      recordNumbers.push(record);
    }
    row = [];
    if (rows.length > 301) throw new Error('Import at most 300 video rows at a time.');
  };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
    } else if (char === delimiter) cell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      line();
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (closed || char === '"')
      throw new Error('Malformed CSV quoting. Export the report again.');
    else field += char;
    if (field.length > 10_000 || row.length > 100)
      throw new Error('CSV fields or column count are too large.');
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  if (field || row.length || closed) line();
  const headers = rows.shift();
  recordNumbers.shift();
  if (!headers || headers.length < 2) throw new Error('No columns found. Check the delimiter.');
  if (!rows.length) throw new Error('The CSV has no video rows.');
  return { headers, rows, recordNumbers };
}

export function analyticsNumber(value: string, decimal: '.' | ',', integer = false) {
  let normalized = value.trim();
  if (!integer) normalized = normalized.replace(/%$/, '').trim();
  if (decimal === ',') {
    if (normalized.includes('.'))
      throw new Error('The report uses a period; choose the matching decimal separator.');
    normalized = normalized.replace(',', '.');
  }
  if (!(integer ? /^\d+$/ : /^\d+(?:\.\d+)?$/).test(normalized))
    throw new Error('Use plain numbers without thousands separators; check the decimal setting.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || (integer && !Number.isSafeInteger(n)))
    throw new Error('Number is too large.');
  return n;
}
