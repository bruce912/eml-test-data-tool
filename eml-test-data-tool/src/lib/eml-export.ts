import type { EmailRecord } from '../types';

const encoder = new TextEncoder();

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function encodedWord(value: string): string {
  const clean = cleanHeader(value);
  return clean ? `=?UTF-8?B?${base64(encoder.encode(clean))}?=` : '';
}

function wrapBase64(value: string): string {
  return base64(encoder.encode(value)).match(/.{1,76}/g)?.join('\r\n') ?? '';
}

export function recordToEml(record: EmailRecord, exportedAt = new Date()): string {
  const headers = [
    `Date: ${exportedAt.toUTCString()}`,
    `Message-ID: <${record.caseId.toLowerCase()}@anonymized.local>`,
    `From: ${cleanHeader(record.anonymizedFrom) || 'anonymous@anonymized.local'}`,
    `To: ${cleanHeader(record.anonymizedTo) || 'undisclosed-recipients:;'}`,
  ];
  if (record.anonymizedCc) headers.push(`Cc: ${cleanHeader(record.anonymizedCc)}`);
  if (record.anonymizedBcc) headers.push(`Bcc: ${cleanHeader(record.anonymizedBcc)}`);
  headers.push(
    `Subject: ${encodedWord(record.anonymizedSubject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    'X-Anonymized: true',
    'X-Attachments-Removed: true',
  );
  return `${headers.join('\r\n')}\r\n\r\n${wrapBase64(record.anonymizedBody)}\r\n`;
}

export function anonymizedEmlFilename(record: EmailRecord): string {
  return `${record.caseId.replace(/[^a-zA-Z0-9_-]/g, '_')}_anonymized.eml`;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const u16 = (value: number) => Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
const u32 = (value: number) => Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);

function join(chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

export function recordsToZip(records: EmailRecord[], exportedAt = new Date()): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;
  for (const record of records) {
    const name = encoder.encode(anonymizedEmlFilename(record));
    const data = encoder.encode(recordToEml(record, exportedAt));
    const checksum = crc32(data);
    const local = join([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
    locals.push(local);
    centrals.push(join([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(localOffset), name]));
    localOffset += local.length;
  }
  const central = join(centrals);
  return join([...locals, central, u32(0x06054b50), u16(0), u16(0), u16(records.length), u16(records.length), u32(central.length), u32(localOffset), u16(0)]);
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadAnonymizedEml(records: EmailRecord[]): void {
  if (records.length === 1) {
    download(new Blob([recordToEml(records[0])], { type: 'message/rfc822;charset=utf-8' }), anonymizedEmlFilename(records[0]));
    return;
  }
  download(new Blob([recordsToZip(records) as BlobPart], { type: 'application/zip' }), `anonymized-emails-${new Date().toISOString().slice(0, 10)}.zip`);
}
