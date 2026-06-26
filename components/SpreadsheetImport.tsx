'use client';

import React, { useState, useRef } from 'react';
import { X, Upload, CheckCircle, AlertCircle, FileSpreadsheet, ChevronRight, Loader2 } from 'lucide-react';
import { Transaction, Bank, Category, Participant, Wallet } from '../types';
import { financeService } from '../services/financeService';

interface SpreadsheetImportProps {
  onClose: () => void;
  onSuccess: () => void;
  banks: Bank[];
  categories: Category[];
  wallets: Wallet[];
  participants: Participant[];
}

interface ParsedRow {
  rowIndex: number;
  emissionDate: string;
  date: string;
  docNumber: string;
  bankName: string;
  participantName: string;
  categoryName: string;
  description: string;
  status: 'PAID' | 'PENDING';
  value: number;
  type: 'DEBIT' | 'CREDIT';
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

function normalizeStr(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function parseDate(s: string): string {
  if (!s?.trim()) return '';
  const m = s.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return s.trim();
  return '';
}

function parseNumber(s: string): number {
  if (!s?.trim()) return 0;
  const cleaned = s.trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.abs(n);
}

function detectSeparator(line: string): string {
  const sc = (line.match(/;/g) || []).length;
  const co = (line.match(/,/g) || []).length;
  return sc >= co ? ';' : ',';
}

function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === sep && !inQuotes) { result.push(field.trim()); field = ''; }
    else { field += ch; }
  }
  result.push(field.trim());
  return result;
}

function findCol(headers: string[], ...names: string[]): number {
  const norm = headers.map(normalizeStr);
  for (const name of names) {
    const idx = norm.indexOf(normalizeStr(name));
    if (idx !== -1) return idx;
  }
  for (const name of names) {
    const n = normalizeStr(name);
    const idx = norm.findIndex(h => h.includes(n) || n.includes(h));
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectStatusCol(headers: string[], rows: string[][]): number {
  const byName = findCol(headers, 'c', 'status', 'situacao', 'pago', 'situação');
  if (byName !== -1) return byName;
  for (let col = 0; col < headers.length; col++) {
    const vals = rows.map(r => (r[col] || '').toLowerCase().trim()).filter(Boolean);
    if (vals.length === 0) continue;
    const cvCount = vals.filter(v => v === 'c' || v === 'v').length;
    if (cvCount / vals.length > 0.5) return col;
  }
  return -1;
}

export const SpreadsheetImport: React.FC<SpreadsheetImportProps> = ({
  onClose,
  onSuccess,
  banks: initialBanks,
  categories: initialCategories,
  wallets,
  participants: initialParticipants,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [selectedWalletId, setSelectedWalletId] = useState(
    wallets.find(w => w.active !== false)?.id || ''
  );
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [importStats, setImportStats] = useState({ imported: 0, created: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const inputClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  function parseFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { setParseError('Arquivo vazio ou sem dados.'); return; }

        const sep = detectSeparator(lines[0]);
        const headers = parseCsvLine(lines[0], sep);
        const dataRows = lines.slice(1).map(l => parseCsvLine(l, sep));

        const colEmission = findCol(headers, 'Data Emissão', 'Data Emissao', 'Emissão', 'Emissao');
        const colPayment  = findCol(headers, 'Data Pagamento', 'Pagamento', 'Data Pag');
        const colDue      = findCol(headers, 'Data Vencimento', 'Vencimento', 'Data Venc');
        const colDoc      = findCol(headers, 'NF Laura', 'NF', 'Nota Fiscal', 'Doc', 'Num', 'N Doc', 'Nº Doc');
        const colAccount  = findCol(headers, 'Conta');
        const colSupplier = findCol(headers, 'Fornecedor', 'Participante', 'Cliente');
        const colCategory = findCol(headers, 'Categoria');
        const colObs      = findCol(headers, 'Observação', 'Observacao', 'Obs', 'Descrição', 'Descricao', 'Descr');
        const colStatus   = detectStatusCol(headers, dataRows);
        const colDebit    = findCol(headers, 'Débito', 'Debito', 'Saída', 'Saida', 'Despesa');
        const colCredit   = findCol(headers, 'Crédito', 'Credito', 'Entrada', 'Receita');

        if (colPayment === -1 && colDue === -1) {
          setParseError('Não encontrei coluna de data (Data Pagamento ou Data Vencimento).'); return;
        }
        if (colDebit === -1 && colCredit === -1) {
          setParseError('Não encontrei colunas de valor (Débito / Crédito).'); return;
        }

        const get = (r: string[], col: number) => col !== -1 ? (r[col] || '') : '';

        const rows: ParsedRow[] = [];
        for (let i = 0; i < dataRows.length; i++) {
          const r = dataRows[i];
          const date = parseDate(get(r, colPayment)) || parseDate(get(r, colDue));
          if (!date) continue;
          const debitVal  = parseNumber(get(r, colDebit));
          const creditVal = parseNumber(get(r, colCredit));
          if (debitVal === 0 && creditVal === 0) continue;
          const statusRaw = get(r, colStatus).toLowerCase().trim();
          rows.push({
            rowIndex: i + 2,
            emissionDate: parseDate(get(r, colEmission)),
            date,
            docNumber: get(r, colDoc),
            bankName: get(r, colAccount).trim(),
            participantName: get(r, colSupplier).trim(),
            categoryName: get(r, colCategory).trim(),
            description: get(r, colObs).trim(),
            status: statusRaw === 'v' ? 'PENDING' : 'PAID',
            value: debitVal > 0 ? debitVal : creditVal,
            type: debitVal > 0 ? 'DEBIT' : 'CREDIT',
          });
        }

        if (rows.length === 0) { setParseError('Nenhuma linha com dados válidos encontrada.'); return; }
        setParsedRows(rows);
        setParseError('');
        setStep('preview');
      } catch {
        setParseError('Erro ao processar o arquivo. Verifique o formato.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleImport() {
    if (!selectedWalletId) return;
    setStep('importing');
    try {
      const bankMap  = new Map<string, string>(initialBanks.map(b => [normalizeStr(b.name), b.id]));
      const catMap   = new Map<string, string>(initialCategories.map(c => [normalizeStr(c.name), c.id]));
      const partMap  = new Map<string, string>(initialParticipants.map(p => [normalizeStr(p.name), p.id]));
      let created = 0;

      const uniqueBanks  = [...new Set(parsedRows.map(r => r.bankName).filter(Boolean))];
      const uniqueCats   = [...new Set(parsedRows.map(r => r.categoryName).filter(Boolean))];
      const uniqueParts  = [...new Set(parsedRows.map(r => r.participantName).filter(Boolean))];

      for (const name of uniqueBanks) {
        if (!bankMap.has(normalizeStr(name))) {
          const saved = await financeService.saveRegistryItem('banks', {
            id: '', name, walletId: selectedWalletId, currency: 'BRL', type: 'CHECKING', active: true,
          } as any);
          bankMap.set(normalizeStr(name), saved.id);
          created++;
        }
      }
      for (const name of uniqueCats) {
        if (!catMap.has(normalizeStr(name))) {
          const saved = await financeService.saveRegistryItem('categories', { id: '', name, active: true });
          catMap.set(normalizeStr(name), saved.id);
          created++;
        }
      }
      for (const name of uniqueParts) {
        if (!partMap.has(normalizeStr(name))) {
          const saved = await financeService.saveRegistryItem('participants', { id: '', name, active: true });
          partMap.set(normalizeStr(name), saved.id);
          created++;
        }
      }

      const transactions: Transaction[] = parsedRows.map(row => ({
        id: '',
        date: row.date,
        emissionDate: row.emissionDate || undefined,
        description: row.description,
        docNumber: row.docNumber,
        value: row.value,
        type: row.type,
        status: row.status,
        walletId: selectedWalletId,
        bankId: bankMap.get(normalizeStr(row.bankName)) || '',
        categoryId: catMap.get(normalizeStr(row.categoryName)) || '',
        participantId: partMap.get(normalizeStr(row.participantName)) || '',
        costCenterId: '',
      }));

      await financeService.createManyTransactions(transactions);
      setImportStats({ imported: transactions.length, created });
      setStep('done');
    } catch (err: any) {
      setParseError(err.message || 'Erro ao importar. Tente novamente.');
      setStep('preview');
    }
  }

  const bankNamesToCreate = [...new Set(parsedRows.map(r => r.bankName).filter(Boolean))]
    .filter(n => !initialBanks.some(b => normalizeStr(b.name) === normalizeStr(n)));
  const catNamesToCreate  = [...new Set(parsedRows.map(r => r.categoryName).filter(Boolean))]
    .filter(n => !initialCategories.some(c => normalizeStr(c.name) === normalizeStr(n)));
  const partNamesToCreate = [...new Set(parsedRows.map(r => r.participantName).filter(Boolean))]
    .filter(n => !initialParticipants.some(p => normalizeStr(p.name) === normalizeStr(n)));
  const totalToCreate = bankNamesToCreate.length + catNamesToCreate.length + partNamesToCreate.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900">Importar Planilha</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* UPLOAD */}
          {step === 'upload' && (
            <div className="flex flex-col items-center gap-6">
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors w-full max-w-md"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
              >
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-700 font-medium">Arraste ou clique para enviar o CSV</p>
                <p className="text-gray-400 text-sm mt-1">Exporte a planilha Excel como CSV antes de enviar</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])}
                />
              </div>
              {parseError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg w-full max-w-md">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{parseError}</span>
                </div>
              )}
              <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 max-w-md w-full">
                <p className="font-medium text-gray-700 mb-2">Colunas esperadas no CSV:</p>
                <p className="leading-relaxed">
                  Data Emissão, Data Pagamento, Data Vencimento, NF, Conta, Fornecedor,
                  Categoria, Observação, C/V (status), Débito, Crédito
                </p>
              </div>
            </div>
          )}

          {/* PREVIEW */}
          {step === 'preview' && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-4 bg-blue-50 rounded-xl p-4">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  Carteira <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedWalletId}
                  onChange={e => setSelectedWalletId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Selecione a carteira...</option>
                  {wallets.filter(w => w.active !== false).map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{parsedRows.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Lançamentos</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">{totalToCreate}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Cadastros novos</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {parsedRows.filter(r => r.status === 'PAID').length}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Pagos</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-600">
                    {parsedRows.filter(r => r.status === 'PENDING').length}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">A pagar</p>
                </div>
              </div>

              {totalToCreate > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-orange-800 mb-2">
                    Serão criados automaticamente:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {bankNamesToCreate.map(n => (
                      <span key={n} className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
                        🏦 {n}
                      </span>
                    ))}
                    {catNamesToCreate.map(n => (
                      <span key={n} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                        🏷️ {n}
                      </span>
                    ))}
                    {partNamesToCreate.map(n => (
                      <span key={n} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                        👤 {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {parseError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{parseError}</span>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Data</th>
                      <th className="px-3 py-2 text-left font-medium">Fornecedor</th>
                      <th className="px-3 py-2 text-left font-medium">Categoria</th>
                      <th className="px-3 py-2 text-left font-medium">Conta</th>
                      <th className="px-3 py-2 text-right font-medium">Valor</th>
                      <th className="px-3 py-2 text-center font-medium">Tipo</th>
                      <th className="px-3 py-2 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsedRows.slice(0, 100).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{row.date}</td>
                        <td className="px-3 py-2">
                          {row.participantName}
                          {partNamesToCreate.includes(row.participantName) && (
                            <span className="ml-1 text-purple-500 text-[10px] font-medium">novo</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.categoryName}
                          {catNamesToCreate.includes(row.categoryName) && (
                            <span className="ml-1 text-blue-500 text-[10px] font-medium">novo</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.bankName}
                          {bankNamesToCreate.includes(row.bankName) && (
                            <span className="ml-1 text-orange-500 text-[10px] font-medium">novo</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(row.value)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            row.type === 'DEBIT' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {row.type === 'DEBIT' ? 'Débito' : 'Crédito'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            row.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {row.status === 'PAID' ? 'Pago' : 'A pagar'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 100 && (
                  <p className="text-xs text-gray-400 text-center py-2 border-t">
                    ... e mais {parsedRows.length - 100} lançamentos
                  </p>
                )}
              </div>
            </div>
          )}

          {/* IMPORTING */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              <p className="text-gray-700 font-medium">Importando lançamentos...</p>
              <p className="text-gray-400 text-sm">Criando cadastros e registrando transações</p>
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <CheckCircle className="w-16 h-16 text-green-500" />
              <h3 className="text-xl font-semibold text-gray-900">Importação concluída!</h3>
              <div className="flex gap-8 text-center mt-2">
                <div>
                  <p className="text-3xl font-bold text-green-600">{importStats.imported}</p>
                  <p className="text-sm text-gray-500">lançamentos importados</p>
                </div>
                {importStats.created > 0 && (
                  <div>
                    <p className="text-3xl font-bold text-orange-500">{importStats.created}</p>
                    <p className="text-sm text-gray-500">cadastros criados</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t flex-shrink-0">
          {step === 'done' ? (
            <button
              onClick={onSuccess}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Concluir
            </button>
          ) : step === 'preview' ? (
            <>
              <button
                onClick={() => { setParsedRows([]); setParseError(''); setStep('upload'); }}
                className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleImport}
                disabled={!selectedWalletId}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
                Importar {parsedRows.length} lançamentos
              </button>
            </>
          ) : step === 'upload' ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
