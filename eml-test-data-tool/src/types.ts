export type PiiKind =
  | 'person'
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
  subject: string;
  from: string;
  to: string;
  cc: string;
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
  anonymizedBody: string;
  piiCounts: PiiCounts;
  primaryCategory: string;
  secondaryCategory: string;
  reviewStatus: 'unreviewed' | 'reviewed';
  error?: string;
}
