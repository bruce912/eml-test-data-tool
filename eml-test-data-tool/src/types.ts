export type PiiKind =
  | 'person'
  | 'account'
  | 'email'
  | 'phone'
  | 'address'
  | 'nationalId'
  | 'companyId'
  | 'orderId'
  | 'card'
  | 'url';

export type PiiCounts = Partial<Record<PiiKind, number>>;

export interface AnonymizeOptions {
  person: boolean;
  account: boolean;
  email: boolean;
  phone: boolean;
  address: boolean;
  nationalId: boolean;
  companyId: boolean;
  orderId: boolean;
  card: boolean;
  url: boolean;
  customTerms: string[];
}

export interface ParsedEmail {
  filename: string;
  sourceFormat: 'eml' | 'msg';
  subject: string;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  date: string;
  messageId: string;
  body: string;
  hasAttachment: boolean;
  language: string;
}

export interface EmailRecord extends ParsedEmail {
  caseId: string;
  anonymizedSubject: string;
  anonymizedFrom: string;
  anonymizedTo: string;
  anonymizedCc: string;
  anonymizedBcc: string;
  anonymizedBody: string;
  piiCounts: PiiCounts;
  primaryCategory: string;
  secondaryCategory: string;
  reviewStatus: 'unreviewed' | 'reviewed';
  error?: string;
}
