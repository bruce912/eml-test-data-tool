import type { FieldsData } from '@kenjiuno/msgreader';
import type { ParsedEmail } from '../types';

function mailbox(name = '', email = ''): string {
  const cleanName = name.trim();
  const cleanEmail = email.trim();
  if (!cleanEmail) return cleanName;
  if (!cleanName || cleanName.toLowerCase() === cleanEmail.toLowerCase()) return cleanEmail;
  return `"${cleanName.replace(/"/g, '')}" <${cleanEmail}>`;
}

function htmlToText(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .trim();
  }
  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');
  document.querySelectorAll('script, style, head').forEach((node) => node.remove());
  document.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
  document.querySelectorAll('p, div, li, tr').forEach((node) => node.append('\n'));
  return (document.body.textContent || '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function decodeHtmlBytes(bytes?: Uint8Array): string {
  if (!bytes?.length) return '';
  for (const charset of ['utf-8', 'big5', 'windows-1252']) {
    try {
      return new TextDecoder(charset, { fatal: true }).decode(bytes);
    } catch {
      // Try the next likely encoding.
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function detectLanguage(text: string): string {
  const chinese = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (text.match(/[a-z]/gi) || []).length;
  return chinese >= Math.max(3, latin * 0.1) ? 'zh-TW' : 'und';
}

function recipientList(fields: FieldsData, type: 'to' | 'cc' | 'bcc'): string {
  return (fields.recipients || [])
    .filter((recipient) => recipient.recipType === type)
    .map((recipient) => mailbox(recipient.name, recipient.email))
    .filter(Boolean)
    .join(', ');
}

export function normalizeMsgData(fields: FieldsData, filename: string): ParsedEmail {
  if (fields.error) throw new Error(`MSG 解析失敗：${fields.error}`);
  const senderEmail = fields.senderSmtpAddress || fields.senderEmail || '';
  const html = fields.bodyHtml || decodeHtmlBytes(fields.html);
  const body = (fields.body || '').trim() || htmlToText(html);
  const parsed: ParsedEmail = {
    filename,
    sourceFormat: 'msg',
    subject: fields.subject || '',
    from: mailbox(fields.senderName, senderEmail),
    to: recipientList(fields, 'to'),
    cc: recipientList(fields, 'cc'),
    bcc: recipientList(fields, 'bcc'),
    date: fields.messageDeliveryTime || fields.clientSubmitTime || fields.creationTime || '',
    messageId: fields.messageId || '',
    body,
    hasAttachment: Boolean(fields.attachments?.length),
    language: detectLanguage(`${fields.subject || ''} ${body}`),
  };
  return parsed;
}

export async function readMsgFile(file: File): Promise<ParsedEmail> {
  const buffer = await file.arrayBuffer();
  const { default: MsgReader } = await import('@kenjiuno/msgreader');
  const reader = new MsgReader(buffer);
  reader.parserConfig = { ansiEncoding: 'big5' };
  return normalizeMsgData(reader.getFileData(), file.name);
}
