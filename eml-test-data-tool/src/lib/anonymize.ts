import type { AnonymizeOptions, PiiCounts, PiiKind } from '../types';

export const defaultOptions: AnonymizeOptions = {
  person: true,
  account: true,
  email: true,
  phone: true,
  address: true,
  nationalId: true,
  companyId: true,
  orderId: true,
  card: true,
  url: true,
  customTerms: [],
};

const patterns: Array<{ kind: PiiKind; regex: RegExp }> = [
  { kind: 'email', regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { kind: 'url', regex: /https?:\/\/[^\s<>"']+/gi },
  { kind: 'nationalId', regex: /\b[A-Z][12]\d{8}\b/gi },
  { kind: 'orderId', regex: /\b(?=[A-Z0-9_-]{7,}\b)(?=[A-Z0-9_-]*\d)[A-Z]{2,}[A-Z0-9]*(?:[-_][A-Z0-9]+)+\b/gi },
  { kind: 'phone', regex: /(?<!\d)(?:\+?886[-\s]?)?(?:0?9\d{2}[-\s]?\d{3}[-\s]?\d{3}|0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4})(?!\d)/g },
  { kind: 'card', regex: /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g },
  { kind: 'companyId', regex: /(?<!\d)\d{8}(?!\d)/g },
  { kind: 'address', regex: /(?:(?:台|臺)[北中南東]市|(?:新北|桃園|基隆|新竹|嘉義)市|(?:彰化|南投|雲林|屏東|宜蘭|花蓮|臺東|澎湖|金門|連江|苗栗|新竹|嘉義)縣)[^\s,，。；;]{2,60}(?:號|樓|室)/g },
];

const labels: Record<PiiKind, string> = {
  person: 'PERSON', account: 'ACCOUNT', email: 'EMAIL', phone: 'PHONE', address: 'ADDRESS',
  nationalId: 'NATIONAL_ID', companyId: 'COMPANY_ID', orderId: 'ORDER_ID',
  card: 'CARD', url: 'URL',
};

interface State {
  maps: Record<PiiKind, Map<string, string>>;
  counts: PiiCounts;
}

function makeState(): State {
  const kinds = Object.keys(labels) as PiiKind[];
  return {
    maps: Object.fromEntries(kinds.map((kind) => [kind, new Map()])) as State['maps'],
    counts: {},
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceKind(text: string, kind: PiiKind, regex: RegExp, state: State): string {
  return text.split(/(\[[A-Z_]+_\d+\])/g).map((part) => {
    if (/^\[[A-Z_]+_\d+\]$/.test(part)) return part;
    return part.replace(regex, (match) => {
      const key = match.trim().toLowerCase();
      let token = state.maps[kind].get(key);
      if (!token) {
        token = `[${labels[kind]}_${state.maps[kind].size + 1}]`;
        state.maps[kind].set(key, token);
        state.counts[kind] = (state.counts[kind] || 0) + 1;
      }
      return match.replace(match.trim(), token);
    });
  }).join('');
}

function displayName(address: string): string {
  const beforeAngle = address.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim() || '';
  if (!beforeAngle || /@/.test(beforeAngle) || beforeAngle.length < 2) return '';
  return beforeAngle;
}

const personContextPattern = /(?:(?:姓名|人名|大名|名字|聯絡人|申請人|收件人|寄件人)(?:\s*(?:為|是|叫|[:：])\s*|\s+)|(?:我是|本人是)\s*)([\u3400-\u9fff·]{2,8})/gu;
const accountContextPattern = /(?:會員帳號|登入帳號|使用者帳號|用戶帳號|帳號|account|username|user\s*id)\s*(?:為|是|[:：]|\s)\s*([\p{L}\p{N}][\p{L}\p{N}._-]{1,63})/giu;

function contextualValues(text: string, regex: RegExp): string[] {
  return Array.from(text.matchAll(regex), (match) => match[1]?.trim()).filter((value): value is string => Boolean(value));
}

export function anonymizeFields(
  fields: { subject: string; from: string; to: string; cc: string; bcc?: string; body: string },
  options: AnonymizeOptions,
) {
  const state = makeState();
  const combined = [fields.subject, fields.from, fields.to, fields.cc, fields.bcc || '', fields.body].join('\n');
  const names = options.person
    ? [displayName(fields.from), ...contextualValues(combined, personContextPattern), ...options.customTerms]
      .filter((name, index, all) => name.length >= 2 && all.indexOf(name) === index)
    : [];
  const accounts = options.account
    ? contextualValues(combined, accountContextPattern)
      .filter((account, index, all) => !account.includes('@') && all.indexOf(account) === index)
    : [];

  const process = (input: string) => {
    let output = input;
    for (const account of accounts) {
      output = replaceKind(output, 'account', new RegExp(escapeRegExp(account), 'giu'), state);
    }
    for (const { kind, regex } of patterns) {
      if (options[kind]) output = replaceKind(output, kind, regex, state);
    }
    for (const name of names) {
      output = replaceKind(output, 'person', new RegExp(escapeRegExp(name), 'gi'), state);
    }
    return output;
  };

  return {
    subject: process(fields.subject),
    from: process(fields.from),
    to: process(fields.to),
    cc: process(fields.cc),
    bcc: process(fields.bcc || ''),
    body: process(fields.body),
    counts: state.counts,
  };
}

export const piiLabel: Record<PiiKind, string> = {
  person: '人名／姓名／大名', account: '帳號', email: '電子郵件', phone: '電話', address: '地址', nationalId: '身分證',
  companyId: '統一編號', orderId: '訂單／代碼', card: '卡號', url: '網址',
};
