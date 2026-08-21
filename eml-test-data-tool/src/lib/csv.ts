import type { EmailRecord } from '../types';

function cell(value: unknown): string {
  const text = String(value ?? '').replace(/\r\n/g, '\n');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function recordsToCsv(records: EmailRecord[]): string {
  const headers = [
    'case_id', 'source_filename', 'subject', 'body', 'from', 'to', 'cc', 'received_date',
    'message_id', 'expected_primary_category', 'expected_secondary_category', 'language',
    'has_attachment', 'review_status', 'detected_pii_count',
  ];
  const rows = records.map((record) => [
    record.caseId, record.filename, record.anonymizedSubject, record.anonymizedBody,
    record.anonymizedFrom, record.anonymizedTo, record.anonymizedCc, record.date,
    record.messageId, record.primaryCategory, record.secondaryCategory, record.language,
    record.hasAttachment, record.reviewStatus,
    Object.values(record.piiCounts).reduce((sum, count) => sum + (count || 0), 0),
  ]);
  return `\ufeff${[headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}`;
}

export function downloadCsv(records: EmailRecord[]): void {
  const blob = new Blob([recordsToCsv(records)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `dify-email-evaluation-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
