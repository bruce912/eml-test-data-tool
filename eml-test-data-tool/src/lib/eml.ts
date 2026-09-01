import type { ParsedEmail } from '../types';

const CRLF = /\r?\n/;

function splitHeaderBody(raw: string): [string, string] {
  const match = raw.match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) return [raw, ''];
  return [raw.slice(0, match.index), raw.slice(match.index + match[0].length)];
}

function parseHeaders(block: string): Map<string, string> {
  const unfolded = block.replace(/\r?\n[ \t]+/g, ' ');
  const result = new Map<string, string>();
  for (const line of unfolded.split(CRLF)) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    result.set(key, result.has(key) ? `${result.get(key)}, ${value}` : value);
  }
  return result;
}

function bytesFromBinary(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

function binaryFromBytes(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return output;
}

function decodeBytes(bytes: Uint8Array, charset = 'utf-8'): string {
  const normalized = charset.trim().replace(/["']/g, '').toLowerCase();
  try {
    return new TextDecoder(normalized).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/\s/g, '');
  const binary = atob(clean);
  return bytesFromBinary(binary);
}

function decodeQuotedPrintable(value: string): Uint8Array {
  const joined = value.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i += 1) {
    if (joined[i] === '=' && /^[0-9a-f]{2}$/i.test(joined.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(joined.charCodeAt(i) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

export function decodeMimeHeader(value: string): string {
  let normalized = value;
  if (/[\x80-\xff]/.test(value)) {
    try {
      normalized = new TextDecoder('utf-8', { fatal: true }).decode(bytesFromBinary(value));
    } catch {
      normalized = value;
    }
  }
  return normalized.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_, charset, encoding, data) => {
    try {
      const bytes = encoding.toLowerCase() === 'b'
        ? decodeBase64(data)
        : decodeQuotedPrintable(data.replace(/_/g, ' '));
      return decodeBytes(bytes, charset);
    } catch {
      return data;
    }
  });
}

function param(header: string, name: string): string {
  const match = header.match(new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]*))`, 'i'));
  return (match?.[1] || match?.[2] || '').trim();
}

function htmlToText(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(p|div|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');
  document.querySelectorAll('script, style, head').forEach((node) => node.remove());
  document.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
  document.querySelectorAll('p, div, li, tr').forEach((node) => node.append('\n'));
  return (document.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface MimeResult { plain: string[]; html: string[]; attachments: number }

function parseMimePart(raw: string, result: MimeResult): void {
  const [headerBlock, body] = splitHeaderBody(raw);
  const headers = parseHeaders(headerBlock);
  const contentType = headers.get('content-type') || 'text/plain; charset=utf-8';
  const disposition = headers.get('content-disposition') || '';
  const transfer = (headers.get('content-transfer-encoding') || '').toLowerCase();
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  const boundary = param(contentType, 'boundary');

  if (mimeType.startsWith('multipart/') && boundary) {
    const marker = `--${boundary}`;
    for (const piece of body.split(marker).slice(1)) {
      if (piece.startsWith('--')) break;
      parseMimePart(piece.replace(/^\r?\n/, '').replace(/\r?\n$/, ''), result);
    }
    return;
  }

  const isAttachment = /attachment/i.test(disposition) || Boolean(param(disposition, 'filename')) || Boolean(param(contentType, 'name'));
  if (isAttachment) {
    result.attachments += 1;
    return;
  }
  if (mimeType !== 'text/plain' && mimeType !== 'text/html') return;

  const charset = param(contentType, 'charset') || 'utf-8';
  let bytes: Uint8Array;
  try {
    bytes = transfer === 'base64'
      ? decodeBase64(body)
      : transfer === 'quoted-printable'
        ? decodeQuotedPrintable(body)
        : bytesFromBinary(body);
  } catch {
    bytes = bytesFromBinary(body);
  }
  const text = decodeBytes(bytes, charset).trim();
  if (!text) return;
  if (mimeType === 'text/html') result.html.push(htmlToText(text));
  else result.plain.push(text);
}

function detectLanguage(text: string): string {
  const chinese = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (text.match(/[a-z]/gi) || []).length;
  return chinese >= Math.max(3, latin * 0.1) ? 'zh-TW' : 'und';
}

export function parseEml(raw: string, filename: string): ParsedEmail {
  const [headerBlock] = splitHeaderBody(raw);
  const headers = parseHeaders(headerBlock);
  const content: MimeResult = { plain: [], html: [], attachments: 0 };
  parseMimePart(raw, content);
  const body = (content.plain.length ? content.plain : content.html).join('\n\n').trim();
  const header = (key: string) => decodeMimeHeader(headers.get(key) || '');
  return {
    filename,
    sourceFormat: 'eml',
    subject: header('subject'),
    from: header('from'),
    to: header('to'),
    cc: header('cc'),
    bcc: header('bcc'),
    date: headers.get('date') || '',
    messageId: headers.get('message-id') || '',
    body,
    hasAttachment: content.attachments > 0,
    language: detectLanguage(`${header('subject')} ${body}`),
  };
}

export async function readEmlFile(file: File): Promise<ParsedEmail> {
  const buffer = await file.arrayBuffer();
  const raw = binaryFromBytes(new Uint8Array(buffer));
  return parseEml(raw, file.name);
}
