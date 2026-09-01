import type { ParsedEmail } from '../types';
import { readEmlFile } from './eml';
import { readMsgFile } from './msg';

export const supportedMailExtension = /\.(?:eml|msg)$/i;

export async function readMailFile(file: File): Promise<ParsedEmail> {
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'eml') return readEmlFile(file);
  if (extension === 'msg') return readMsgFile(file);
  throw new Error('只支援 .eml 或 .msg 郵件檔案');
}
