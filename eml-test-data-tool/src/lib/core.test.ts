import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { anonymizeFields, defaultOptions } from './anonymize';
import { recordsToCsv } from './csv';
import { decodeMimeHeader, parseEml } from './eml';
import { anonymizedEmlFilename, recordToEml, recordsToZip } from './eml-export';
import { normalizeMsgData } from './msg';
import type { EmailRecord } from '../types';

const exportRecord: EmailRecord = {
  caseId: 'MAIL_000001', filename: 'private-name.msg', sourceFormat: 'msg', subject: '原始主旨',
  from: 'person@example.com', to: 'service@example.com', cc: '', bcc: '', date: 'private date',
  messageId: '<original@example.com>', body: '原始內容', hasAttachment: true, language: 'zh-TW',
  anonymizedSubject: '退款 [PERSON_1]', anonymizedFrom: '[EMAIL_1]', anonymizedTo: '[EMAIL_2]',
  anonymizedCc: '', anonymizedBcc: '', anonymizedBody: '您好 [PERSON_1]', piiCounts: { person: 1 },
  primaryCategory: '退款申請', secondaryCategory: '', reviewStatus: 'reviewed',
};

describe('EML parser', () => {
  it('parses every generated EML fixture', () => {
    const fixtureDir = fileURLToPath(new URL('../../test-fixtures/generated/', import.meta.url));
    const filenames = readdirSync(fixtureDir).filter((name) => name.endsWith('.eml'));
    const parsed = filenames.map((filename) => parseEml(readFileSync(`${fixtureDir}/${filename}`, 'utf8'), filename));
    expect(parsed).toHaveLength(7);
    expect(parsed.every((mail) => mail.subject && mail.body)).toBe(true);
    expect(parsed.find((mail) => mail.filename === '06-with-attachment.eml')?.hasAttachment).toBe(true);
  });

  it('decodes encoded subject and quoted printable body', () => {
    const raw = [
      'From: "王小明" <ming@example.com>',
      'To: service@example.com',
      'Subject: =?UTF-8?B?6YCA5qy+55Sz6KuL?=',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '=E6=82=A8=E5=A5=BD=EF=BC=8Corder ORD-20260821-001',
    ].join('\r\n');
    const parsed = parseEml(raw, 'sample.eml');
    expect(parsed.subject).toBe('退款申請');
    expect(parsed.body).toContain('您好');
  });

  it('decodes MIME headers', () => {
    expect(decodeMimeHeader('=?UTF-8?B?5ris6Kmm?=')).toBe('測試');
  });

  it('recovers non-standard raw UTF-8 headers', () => {
    const rawHeader = Array.from(new TextEncoder().encode('王小明'), (byte) => String.fromCharCode(byte)).join('');
    expect(decodeMimeHeader(rawHeader)).toBe('王小明');
  });
});

describe('anonymizer', () => {
  it('uses stable placeholders across fields', () => {
    const result = anonymizeFields({ subject: 'ming@example.com', from: '王小明 <ming@example.com>', to: '', cc: '', bcc: '', body: '請聯絡王小明 ming@example.com，電話 0912-345-678，訂單 ORD-20260821-001' }, defaultOptions);
    expect(result.from).toContain('[PERSON_1]');
    expect(result.body).toContain('[PERSON_1]');
    expect(result.body).toContain('[EMAIL_1]');
    expect(result.body).toContain('[PHONE_1]');
    expect(result.body).toContain('[ORDER_ID_1]');
  });

  it('detects names from common Chinese name labels and reuses the same token', () => {
    const result = anonymizeFields({
      subject: '王小明的服務申請', from: 'service@example.com', to: '', cc: '', bcc: '',
      body: '姓名：王小明\n請問您的大名？聯絡人是陳美玲。以上姓名與帳號均為虛構。',
    }, defaultOptions);
    expect(result.subject).toContain('[PERSON_1]');
    expect(result.body).toContain('姓名：[PERSON_1]');
    expect(result.body).toContain('聯絡人是[PERSON_2]');
    expect(result.body).toContain('以上姓名與帳號均為虛構');
    expect(result.counts.person).toBe(2);
  });

  it('detects login and member account identifiers', () => {
    const result = anonymizeFields({
      subject: '帳號 member_7788 無法登入', from: '', to: '', cc: '', bcc: '',
      body: '會員帳號：member_7788\nUser ID: EMP-2048',
    }, defaultOptions);
    expect(result.subject).toContain('[ACCOUNT_1]');
    expect(result.body).toContain('會員帳號：[ACCOUNT_1]');
    expect(result.body).toContain('User ID: [ACCOUNT_2]');
    expect(result.counts.account).toBe(2);
  });
});

describe('MSG normalizer', () => {
  it('maps MAPI fields and recipient types to the common email shape', () => {
    const parsed = normalizeMsgData({
      subject: '退款查詢',
      senderName: '王小明',
      senderEmail: '/O=EXCHANGE/CN=RECIPIENTS/CN=WANG',
      senderSmtpAddress: 'ming@example.com',
      body: '請協助確認退款。',
      messageId: '<msg-001@example.com>',
      messageDeliveryTime: 'Fri, 21 Aug 2026 02:00:00 GMT',
      recipients: [
        { name: '客服', email: 'service@example.com', recipType: 'to' },
        { name: '主管', email: 'manager@example.com', recipType: 'cc' },
        { name: '稽核', email: 'audit@example.com', recipType: 'bcc' },
      ],
      attachments: [{ fileName: 'invoice.pdf' }],
    }, 'sample.msg');
    expect(parsed.sourceFormat).toBe('msg');
    expect(parsed.from).toBe('"王小明" <ming@example.com>');
    expect(parsed.to).toContain('service@example.com');
    expect(parsed.cc).toContain('manager@example.com');
    expect(parsed.bcc).toContain('audit@example.com');
    expect(parsed.hasAttachment).toBe(true);
  });

  it('falls back to HTML when the plain body is absent', () => {
    const parsed = normalizeMsgData({ subject: 'HTML', bodyHtml: '<p>第一行</p><p>第二行</p>' }, 'html.msg');
    expect(parsed.body).toContain('第一行');
    expect(parsed.body).toContain('第二行');
  });
});

describe('CSV exporter', () => {
  it('adds UTF-8 BOM and quotes multiline data', () => {
    const csv = recordsToCsv([{ caseId: 'MAIL_1', filename: 'a.eml', sourceFormat: 'eml', subject: '', from: '', to: '', cc: '', bcc: '', date: '', messageId: '', body: '', hasAttachment: false, language: 'zh-TW', anonymizedSubject: '退款', anonymizedFrom: '[EMAIL_1]', anonymizedTo: '', anonymizedCc: '', anonymizedBcc: '', anonymizedBody: '第一行\n第二行', piiCounts: { email: 1 }, primaryCategory: '退款申請', secondaryCategory: '', reviewStatus: 'reviewed' }]);
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain('"第一行\n第二行"');
    expect(csv).toContain('source_format');
  });
});

describe('anonymized EML exporter', () => {
  it('rebuilds a minimal EML without original metadata or attachments', () => {
    const eml = recordToEml(exportRecord, new Date('2026-09-01T00:00:00Z'));
    expect(eml).toContain('Message-ID: <mail_000001@anonymized.local>');
    expect(eml).toContain('X-Attachments-Removed: true');
    expect(eml).not.toContain('original@example.com');
    expect(eml).not.toContain('private-name.msg');
    expect(eml).not.toContain('原始內容');
    const encodedBody = eml.split('\r\n\r\n')[1].replace(/\r\n/g, '');
    expect(new TextDecoder().decode(Uint8Array.from(atob(encodedBody), (char) => char.charCodeAt(0)))).toBe('您好 [PERSON_1]');
  });

  it('packages multiple EML files in a ZIP archive', () => {
    const zip = recordsToZip([exportRecord, { ...exportRecord, caseId: 'MAIL_000002' }], new Date('2026-09-01T00:00:00Z'));
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain(anonymizedEmlFilename(exportRecord));
    expect(text).toContain('MAIL_000002_anonymized.eml');
  });
});
