import { describe, expect, it } from 'vitest';
import { anonymizeFields, defaultOptions } from './anonymize';
import { recordsToCsv } from './csv';
import { decodeMimeHeader, parseEml } from './eml';

describe('EML parser', () => {
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
    const result = anonymizeFields({ subject: 'ming@example.com', from: '王小明 <ming@example.com>', to: '', cc: '', body: '請聯絡王小明 ming@example.com，電話 0912-345-678，訂單 ORD-20260821-001' }, defaultOptions);
    expect(result.from).toContain('[PERSON_1]');
    expect(result.body).toContain('[PERSON_1]');
    expect(result.body).toContain('[EMAIL_1]');
    expect(result.body).toContain('[PHONE_1]');
    expect(result.body).toContain('[ORDER_ID_1]');
  });
});

describe('CSV exporter', () => {
  it('adds UTF-8 BOM and quotes multiline data', () => {
    const csv = recordsToCsv([{ caseId: 'MAIL_1', filename: 'a.eml', subject: '', from: '', to: '', cc: '', date: '', messageId: '', body: '', hasAttachment: false, language: 'zh-TW', anonymizedSubject: '退款', anonymizedFrom: '[EMAIL_1]', anonymizedTo: '', anonymizedCc: '', anonymizedBody: '第一行\n第二行', piiCounts: { email: 1 }, primaryCategory: '退款申請', secondaryCategory: '', reviewStatus: 'reviewed' }]);
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain('"第一行\n第二行"');
  });
});
