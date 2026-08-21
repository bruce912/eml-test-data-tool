import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Download, Mail, RefreshCw, ShieldCheck, UploadCloud } from 'lucide-react';
import { anonymizeFields, defaultOptions, piiLabel } from './lib/anonymize';
import { downloadCsv } from './lib/csv';
import { readEmlFile } from './lib/eml';
import type { AnonymizeOptions, EmailRecord, PiiKind } from './types';
import './styles.css';

const categories = ['', '帳務與發票', '退款申請', '訂單與出貨', '系統操作問題', '帳號與權限', '合作與業務', '客訴', '其他／無法判斷'];

function makeRecord(parsed: Awaited<ReturnType<typeof readEmlFile>>, index: number, options: AnonymizeOptions): EmailRecord {
  const anon = anonymizeFields(parsed, options);
  return {
    ...parsed,
    caseId: `MAIL_${String(index + 1).padStart(6, '0')}`,
    anonymizedSubject: anon.subject,
    anonymizedFrom: anon.from,
    anonymizedTo: anon.to,
    anonymizedCc: anon.cc,
    anonymizedBody: anon.body,
    piiCounts: anon.counts,
    primaryCategory: '',
    secondaryCategory: '',
    reviewStatus: 'unreviewed',
  };
}

function Highlight({ text }: { text: string }) {
  const parts = text.split(/(\[[A-Z_]+_\d+\])/g);
  return <>{parts.map((part, index) => /^\[[A-Z_]+_\d+\]$/.test(part) ? <mark key={index}>{part}</mark> : part)}</>;
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [records, setRecords] = useState<EmailRecord[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [options, setOptions] = useState<AnonymizeOptions>(defaultOptions);
  const [customTerms, setCustomTerms] = useState('');
  const active = records[selected];
  const piiTotal = useMemo(() => records.reduce((sum, record) => sum + Object.values(record.piiCounts).reduce((a, b) => a + (b || 0), 0), 0), [records]);
  const reviewed = records.filter((record) => record.reviewStatus === 'reviewed').length;

  async function importFiles(files: FileList | File[]) {
    const emlFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith('.eml'));
    if (!emlFiles.length) return;
    setLoading(true);
    const start = records.length;
    const parsed = await Promise.all(emlFiles.map(async (file, index) => {
      try {
        return makeRecord(await readEmlFile(file), start + index, options);
      } catch (error) {
        const empty = { filename: file.name, subject: '', from: '', to: '', cc: '', date: '', messageId: '', body: '', hasAttachment: false, language: 'und' };
        return { ...makeRecord(empty, start + index, options), error: error instanceof Error ? error.message : '無法解析' };
      }
    }));
    setRecords((current) => [...current, ...parsed]);
    if (!records.length) setSelected(0);
    setLoading(false);
  }

  function reapply() {
    const nextOptions = { ...options, customTerms: customTerms.split(/[,\n]/).map((term) => term.trim()).filter(Boolean) };
    setOptions(nextOptions);
    setRecords((current) => current.map((record) => {
      const anon = anonymizeFields(record, nextOptions);
      return { ...record, anonymizedSubject: anon.subject, anonymizedFrom: anon.from, anonymizedTo: anon.to, anonymizedCc: anon.cc, anonymizedBody: anon.body, piiCounts: anon.counts };
    }));
  }

  function updateRecord(index: number, patch: Partial<EmailRecord>) {
    setRecords((current) => current.map((record, row) => row === index ? { ...record, ...patch } : record));
  }

  return (
    <div className="app-shell">
      <header>
        <div className="brand"><Mail size={23} /> EML 測試資料整理器</div>
        <div className="privacy"><ShieldCheck size={17} /> 所有資料僅在此瀏覽器處理</div>
      </header>

      <aside>
        <nav>
          {['匯入信件', '去識別化', '檢查與標註', '匯出 CSV'].map((label, index) => (
            <div className={`step ${index === 0 ? 'active' : ''}`} key={label}>
              <span>{index + 1}</span><div><strong>{label}</strong><small>{['匯入多個 .eml 檔案', '套用規則移除敏感資訊', '檢查內容並指定預期類別', '匯出給 Dify 評估使用'][index]}</small></div>
            </div>
          ))}
        </nav>
        <div className="settings">
          <div className="section-title">去識別化設定</div>
          {(Object.keys(piiLabel) as PiiKind[]).map((kind) => (
            <label className="check-row" key={kind}>
              <input type="checkbox" checked={options[kind]} onChange={(event) => setOptions({ ...options, [kind]: event.target.checked })} />
              <span>{piiLabel[kind]}</span>
            </label>
          ))}
          <label className="field-label" htmlFor="custom">自訂人名／機密詞</label>
          <textarea id="custom" rows={3} value={customTerms} onChange={(event) => setCustomTerms(event.target.value)} placeholder="每行或逗號分隔" />
          <button className="secondary full" onClick={reapply} disabled={!records.length}><RefreshCw size={16} />重新套用規則</button>
        </div>
      </aside>

      <main>
        <section
          className={`drop-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); importFiles(event.dataTransfer.files); }}
        >
          <UploadCloud size={39} />
          <div><strong>拖曳 .eml 檔案到此處，或</strong><small>可多選上傳・檔案只在瀏覽器記憶體中處理</small></div>
          <button className="primary" onClick={() => inputRef.current?.click()} disabled={loading}>{loading ? '解析中…' : '選擇 EML 檔'}</button>
          <input ref={inputRef} type="file" multiple accept=".eml,message/rfc822" hidden onChange={(event) => event.target.files && importFiles(event.target.files)} />
        </section>

        <section className="summary">
          <div className="summary-title">處理摘要</div>
          {[['匯入檔案', records.length], ['已檢查', reviewed], ['待檢查', records.length - reviewed], ['偵測到 PII', piiTotal], ['有附件', records.filter((r) => r.hasAttachment).length]].map(([label, value]) => (
            <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
          <div className="summary-note">{records.length ? `${reviewed} / ${records.length} 封已完成標註` : '尚未匯入信件'}</div>
        </section>

        <section className="table-wrap">
          <div className="toolbar"><strong>信件清單</strong><span>選取信件以檢查去識別化結果</span></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>檔名</th><th>主旨（預覽）</th><th>寄件者</th><th>偵測到的 PII</th><th>預期主類別</th><th>狀態</th></tr></thead>
              <tbody>
                {!records.length && <tr><td colSpan={6} className="empty">尚無資料。請先拖曳或選擇 EML 檔案。</td></tr>}
                {records.map((record, index) => (
                  <tr key={`${record.filename}-${index}`} className={selected === index ? 'selected' : ''} onClick={() => setSelected(index)}>
                    <td><Mail size={15} />{record.filename}</td>
                    <td>{record.anonymizedSubject || '（無主旨）'}</td>
                    <td className="mono">{record.anonymizedFrom || '—'}</td>
                    <td><div className="tags">{Object.entries(record.piiCounts).filter(([, count]) => count).slice(0, 3).map(([kind, count]) => <span key={kind}>{piiLabel[kind as PiiKind]} {count}</span>)}</div></td>
                    <td onClick={(event) => event.stopPropagation()}><div className="select-wrap"><select value={record.primaryCategory} onChange={(event) => updateRecord(index, { primaryCategory: event.target.value })}>{categories.map((category) => <option key={category} value={category}>{category || '請選擇類別'}</option>)}</select><ChevronDown size={14} /></div></td>
                    <td><span className={`status ${record.reviewStatus}`}>{record.error ? '解析異常' : record.reviewStatus === 'reviewed' ? '已檢查' : '待檢查'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="preview">
          <div className="preview-head">
            <strong>{active ? `預覽：${active.filename}` : '內容預覽'}</strong>
            {active && <div className="review-actions">
              <input value={active.secondaryCategory} onChange={(event) => updateRecord(selected, { secondaryCategory: event.target.value })} placeholder="次分類（選填）" />
              <button className="secondary" onClick={() => updateRecord(selected, { reviewStatus: active.reviewStatus === 'reviewed' ? 'unreviewed' : 'reviewed' })}>{active.reviewStatus === 'reviewed' ? '取消完成' : <><Check size={15} />標記已檢查</>}</button>
            </div>}
          </div>
          <div className="compare">
            <article><h3>原始內容（僅本機顯示）</h3><pre>{active ? `From: ${active.from}\nTo: ${active.to}\nSubject: ${active.subject}\n\n${active.body}` : '匯入信件後，可在此檢查原始內容。'}</pre></article>
            <article><h3>去識別化內容（可直接編輯）</h3>{active ? <textarea value={active.anonymizedBody} onChange={(event) => updateRecord(selected, { anonymizedBody: event.target.value })} /> : <pre>去識別化內容會顯示在此處。</pre>}</article>
            <aside className="legend"><h3>PII 標籤</h3>{active && Object.entries(active.piiCounts).filter(([, count]) => count).map(([kind, count]) => <div key={kind}><span>{piiLabel[kind as PiiKind]}</span><strong>{count}</strong></div>)}</aside>
          </div>
          {active && <div className="subject-edit"><label>去識別化主旨</label><div><Highlight text={active.anonymizedSubject} /></div><input value={active.anonymizedSubject} onChange={(event) => updateRecord(selected, { anonymizedSubject: event.target.value })} /></div>}
        </section>
      </main>

      <footer>
        <span>{records.length ? `將匯出 ${records.length} 筆資料；建議先完成所有人工檢查。` : '匯入 EML 後即可建立測試資料。'}</span>
        <button className="primary export" disabled={!records.length} onClick={() => downloadCsv(records)}><Download size={17} />匯出 CSV</button>
      </footer>
    </div>
  );
}
