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

interface ColumnMapping {
  date: number;
  emissionDate: number;
  dueDate: number;
  docNumber: number;
  bankName: number;
  participantName: number;
  categoryName: number;
  description: number;
  statusCol: number;
  debit: number;
  credit: number;
}

interface ParsedRow {
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

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

const NONE = -1;

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function splitLine(line: string, sep: string): string[] {
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

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  // Remove UTF-8 BOM (﻿)
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  // Try semicolon then comma — pick the one that gives more columns
  const sc = splitLine(lines[0], ';');
  const co = splitLine(lines[0], ',');
  const sep = sc.length >= co.length ? ';' : ',';

  const headers = splitLine(lines[0], sep);
  const rows = lines.slice(1).map(l => splitLine(l, sep));
  return { headers, rows };
}

function findCol(headers: string[], ...names: string[]): number {
  const norm = headers.map(normalizeStr);
  // 1. Exact match
  for (const name of names) {
    const idx = norm.indexOf(normalizeStr(name));
    if (idx !== -1) return idx;
  }
  // 2. Header contains the full search term (only for terms ≥ 4 chars)
  for (const name of names) {
    const n = normalizeStr(name);
    if (n.length < 4) continue;
    const idx = norm.findIndex(h => h.includes(n));
    if (idx !== -1) return idx;
  }
  return NONE;
}

function guessMapping(headers: string[]): ColumnMapping {
  return {
    date:            findCol(headers, 'Data Pagamento', 'Data Pag', 'Pagamento'),
    emissionDate:    findCol(headers, 'Data Emissão', 'Data Emissao', 'Emissão', 'Emissao'),
    dueDate:         findCol(headers, 'Data Vencimento', 'Vencimento', 'Data Venc'),
    docNumber:       findCol(headers, 'NF Laura', 'NF', 'Nota Fiscal', 'Num Doc', 'Numero'),
    bankName:        findCol(headers, 'Conta'),
    participantName: findCol(headers, 'Fornecedor', 'Participante', 'Cliente'),
    categoryName:    findCol(headers, 'Categoria'),
    description:     findCol(headers, 'Observacao', 'Observação', 'Descricao', 'Descrição'),
    statusCol:       findCol(headers, 'Status', 'Situacao', 'Situação'),
    debit:           findCol(headers, 'Debito', 'Débito', 'Saida', 'Saída'),
    credit:          findCol(headers, 'Credito', 'Crédito', 'Entrada', 'Receita'),
  };
}

// ── ColSelect: defined OUTSIDE main component to avoid inline-component issues ──

interface ColSelectProps {
  label: string;
  required?: boolean;
  field: keyof ColumnMapping;
  mapping: ColumnMapping;
  headers: string[];
  rows: string[][];
  onChange: (field: keyof ColumnMapping, idx: number) => void;
}

const ColSelect: React.FC<ColSelectProps> = ({ label, required, field, mapping, headers, rows, onChange }) => {
  const selected = mapping[field];
  const samples = selected !== NONE
    ? rows.map(r => r[selected] || '').filter(Boolean).slice(0, 3)
    : [];

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        value={selected}
        onChange={e => onChange(field, Number(e.target.value))}
        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        <option value={NONE}>— não mapeado —</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
        ))}
      </select>
      {samples.length > 0 && (
        <p className="text-[10px] text-gray-400 truncate">Ex: {samples.join(', ')}</p>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

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
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows]       = useState<string[][]>([]);
  const [mapping, setMapping]       = useState<ColumnMapping>({
    date: NONE, emissionDate: NONE, dueDate: NONE, docNumber: NONE,
    bankName: NONE, participantName: NONE, categoryName: NONE,
    description: NONE, statusCol: NONE, debit: NONE, credit: NONE,
  });
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [importStats, setImportStats] = useState({ imported: 0, created: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  function loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const raw = e.target?.result;
        if (!raw || typeof raw !== 'string') {
          setParseError('Não foi possível ler o arquivo.');
          return;
        }
        const { headers, rows } = parseCsv(raw);
        if (headers.length < 2) {
          setParseError(`Não foi possível detectar as colunas (encontradas: ${headers.length}). Salve o arquivo como CSV separado por ponto e vírgula e tente novamente.`);
          return;
        }
        setCsvHeaders(headers);
        setCsvRows(rows);
        setMapping(guessMapping(headers));
        setParseError('');
        setStep('mapping');
      } catch (err: any) {
        setParseError('Erro ao processar o arquivo: ' + (err?.message || 'formato inválido'));
      }
    };
    reader.onerror = () => setParseError('Erro ao ler o arquivo.');
    reader.readAsText(file, 'UTF-8');
  }

  function handleMappingChange(field: keyof ColumnMapping, idx: number) {
    setMapping(prev => ({ ...prev, [field]: idx }));
  }

  function applyMapping() {
    setParseError('');
    if (mapping.date === NONE && mapping.dueDate === NONE) {
      setParseError('Selecione ao menos uma coluna de data.');
      return;
    }
    if (mapping.debit === NONE && mapping.credit === NONE) {
      setParseError('Selecione ao menos uma coluna de valor (Débito ou Crédito).');
      return;
    }

    const get = (r: string[], col: number) => col !== NONE ? (r[col] || '') : '';

    const rows: ParsedRow[] = [];
    for (const r of csvRows) {
      const date = parseDate(get(r, mapping.date)) || parseDate(get(r, mapping.dueDate));
      if (!date) continue;
      const debitVal  = parseNumber(get(r, mapping.debit));
      const creditVal = parseNumber(get(r, mapping.credit));
      if (debitVal === 0 && creditVal === 0) continue;

      const statusRaw = get(r, mapping.statusCol).toLowerCase().trim();
      rows.push({
        emissionDate:    parseDate(get(r, mapping.emissionDate)),
        date,
        docNumber:       get(r, mapping.docNumber),
        bankName:        get(r, mapping.bankName).trim(),
        participantName: get(r, mapping.participantName).trim(),
        categoryName:    get(r, mapping.categoryName).trim(),
        description:     get(r, mapping.description).trim(),
        status:          statusRaw === 'v' ? 'PENDING' : 'PAID',
        value:           debitVal > 0 ? debitVal : creditVal,
        type:            debitVal > 0 ? 'DEBIT' : 'CREDIT',
      });
    }

    if (rows.length === 0) {
      setParseError('Nenhuma linha com dados válidos encontrada. Verifique o mapeamento de Data e Valor.');
      return;
    }
    setParsedRows(rows);
    setStep('preview');
  }

  async function handleImport() {
    if (!selectedWalletId) return;
    setStep('importing');
    try {
      const bankMap  = new Map<string, string>(initialBanks.map(b => [normalizeStr(b.name), b.id]));
      const catMap   = new Map<string, string>(initialCategories.map(c => [normalizeStr(c.name), c.id]));
      const partMap  = new Map<string, string>(initialParticipants.map(p => [normalizeStr(p.name), p.id]));
      let created = 0;

      for (const name of [...new Set(parsedRows.map(r => r.bankName).filter(Boolean))]) {
        if (!bankMap.has(normalizeStr(name))) {
          const saved = await financeService.saveRegistryItem('banks', {
            id: '', name, walletId: selectedWalletId, currency: 'BRL', type: 'CHECKING', active: true,
          } as any);
          bankMap.set(normalizeStr(name), saved.id);
          created++;
        }
      }
      for (const name of [...new Set(parsedRows.map(r => r.categoryName).filter(Boolean))]) {
        if (!catMap.has(normalizeStr(name))) {
          const saved = await financeService.saveRegistryItem('categories', { id: '', name, active: true });
          catMap.set(normalizeStr(name), saved.id);
          created++;
        }
      }
      for (const name of [...new Set(parsedRows.map(r => r.participantName).filter(Boolean))]) {
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
        bankId:        bankMap.get(normalizeStr(row.bankName))        || '',
        categoryId:    catMap.get(normalizeStr(row.categoryName))     || '',
        participantId: partMap.get(normalizeStr(row.participantName)) || '',
        costCenterId:  '',
      }));

      await financeService.createManyTransactions(transactions);
      setImportStats({ imported: transactions.length, created });
      setStep('done');
    } catch (err: any) {
      setParseError(err.message || 'Erro ao importar. Tente novamente.');
      setStep('preview');
    }
  }

  const bankNamesToCreate  = [...new Set(parsedRows.map(r => r.bankName).filter(Boolean))].filter(n => !initialBanks.some(b => normalizeStr(b.name) === normalizeStr(n)));
  const catNamesToCreate   = [...new Set(parsedRows.map(r => r.categoryName).filter(Boolean))].filter(n => !initialCategories.some(c => normalizeStr(c.name) === normalizeStr(n)));
  const partNamesToCreate  = [...new Set(parsedRows.map(r => r.participantName).filter(Boolean))].filter(n => !initialParticipants.some(p => normalizeStr(p.name) === normalizeStr(n)));
  const totalToCreate = bankNamesToCreate.length + catNamesToCreate.length + partNamesToCreate.length;

  const colProps = { mapping, headers: csvHeaders, rows: csvRows, onChange: handleMappingChange };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-green-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Importar Planilha</h2>
              {step === 'mapping' && <p className="text-xs text-gray-400 mt-0.5">Etapa 1 de 2 — Mapeamento de colunas</p>}
              {step === 'preview' && <p className="text-xs text-gray-400 mt-0.5">Etapa 2 de 2 — Prévia da importação</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* ── UPLOAD ── */}
          {step === 'upload' && (
            <div className="flex flex-col items-center gap-6">
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors w-full max-w-md"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
              >
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-700 font-medium">Arraste ou clique para enviar o CSV</p>
                <p className="text-gray-400 text-sm mt-1">
                  No Excel: <strong>Arquivo → Salvar como → CSV (separado por ponto e vírgula)</strong>
                </p>
                <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                  onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
              </div>
              {parseError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg w-full max-w-md">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{parseError}</span>
                </div>
              )}
            </div>
          )}

          {/* ── MAPEAMENTO ── */}
          {step === 'mapping' && (
            <div className="flex flex-col gap-5">
              {/* Diagnóstico: colunas detectadas */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <p className="text-xs font-medium text-gray-500 mb-1">
                  {csvHeaders.length} colunas detectadas no arquivo:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {csvHeaders.map((h, i) => (
                    <span key={i} className="text-xs bg-white border border-gray-200 text-gray-700 px-2 py-0.5 rounded">
                      {i + 1}. {h || '(vazio)'}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
                <strong>Confirme o mapeamento.</strong> Para cada campo, selecione qual coluna da planilha corresponde. Veja os exemplos de valores abaixo de cada seleção.
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <ColSelect label="Data do Lançamento" required field="date" {...colProps} />
                <ColSelect label="Data de Emissão"           field="emissionDate"    {...colProps} />
                <ColSelect label="Data de Vencimento"        field="dueDate"         {...colProps} />
                <ColSelect label="Nº Doc / NF"               field="docNumber"       {...colProps} />
                <ColSelect label="Conta / Banco"             field="bankName"        {...colProps} />
                <ColSelect label="Fornecedor / Participante" field="participantName" {...colProps} />
                <ColSelect label="Categoria"                 field="categoryName"    {...colProps} />
                <ColSelect label="Observação / Descrição"    field="description"     {...colProps} />
                <ColSelect label="Status (c=pago, v=a pagar)" field="statusCol"     {...colProps} />
                <ColSelect label="Débito"  required field="debit"  {...colProps} />
                <ColSelect label="Crédito"          field="credit" {...colProps} />
              </div>

              {parseError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{parseError}</span>
                </div>
              )}
            </div>
          )}

          {/* ── PRÉVIA ── */}
          {step === 'preview' && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-4 bg-blue-50 rounded-xl p-4">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  Carteira <span className="text-red-500">*</span>
                </label>
                <select value={selectedWalletId} onChange={e => setSelectedWalletId(e.target.value)} className={inputClass}>
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
                  <p className="text-2xl font-bold text-green-600">{parsedRows.filter(r => r.status === 'PAID').length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Pagos</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{parsedRows.filter(r => r.status === 'PENDING').length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">A pagar</p>
                </div>
              </div>

              {totalToCreate > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-orange-800 mb-2">Serão criados automaticamente:</p>
                  <div className="flex flex-wrap gap-2">
                    {bankNamesToCreate.map(n => <span key={n} className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">🏦 {n}</span>)}
                    {catNamesToCreate.map(n => <span key={n} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">🏷️ {n}</span>)}
                    {partNamesToCreate.map(n => <span key={n} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">👤 {n}</span>)}
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
                          {partNamesToCreate.includes(row.participantName) && <span className="ml-1 text-purple-500 text-[10px] font-medium">novo</span>}
                        </td>
                        <td className="px-3 py-2">
                          {row.categoryName}
                          {catNamesToCreate.includes(row.categoryName) && <span className="ml-1 text-blue-500 text-[10px] font-medium">novo</span>}
                        </td>
                        <td className="px-3 py-2">
                          {row.bankName}
                          {bankNamesToCreate.includes(row.bankName) && <span className="ml-1 text-orange-500 text-[10px] font-medium">novo</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(row.value)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${row.type === 'DEBIT' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {row.type === 'DEBIT' ? 'Débito' : 'Crédito'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${row.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {row.status === 'PAID' ? 'Pago' : 'A pagar'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 100 && (
                  <p className="text-xs text-gray-400 text-center py-2 border-t">... e mais {parsedRows.length - 100} lançamentos</p>
                )}
              </div>
            </div>
          )}

          {/* ── IMPORTANDO ── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              <p className="text-gray-700 font-medium">Importando lançamentos...</p>
              <p className="text-gray-400 text-sm">Criando cadastros e registrando transações</p>
            </div>
          )}

          {/* ── CONCLUÍDO ── */}
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
            <button onClick={onSuccess} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              Concluir
            </button>
          ) : step === 'preview' ? (
            <>
              <button onClick={() => { setParseError(''); setStep('mapping'); }} className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors">
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
          ) : step === 'mapping' ? (
            <>
              <button onClick={() => { setParseError(''); setCsvHeaders([]); setCsvRows([]); setStep('upload'); }} className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors">
                Voltar
              </button>
              <button
                onClick={applyMapping}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
                Continuar
              </button>
            </>
          ) : (
            <button onClick={onClose} className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors">
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
