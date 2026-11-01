import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import {
  FileUp,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  PiggyBank,
} from 'lucide-react';
import { financeService } from '../services/financeService';
import { parseUsStyleReais } from '../services/cardStatementService';
import { parseDateToIso } from '../services/geminiService';
import type { Bank, Category, Wallet, Participant, Transaction, Consortium } from '../types';

interface ConsortiumImportProps {
  onClose: () => void;
  onSuccess: () => void;
  banks: Bank[];
  categories: Category[];
  wallets: Wallet[];
  participants: Participant[];
  preSelectedBankId?: string;
  preSelectedWalletId?: string;
}

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Fallback se falhar
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

interface ParsedRow {
  administrator: string;
  holderName: string;
  holderCnpj: string;
  groupNumber: string;
  quotaNumber: string;
  version: string;
  installmentNumber: string;
  transactionKind: string;
  dueDate: string;      // ISO
  paymentDate: string;  // ISO ou ''
  accountingDate: string; // ISO ou ''
  installmentValue: number;
  paidValue?: number;
  commonFund: number;
  commonFundPct: number;
  adminFee: number;
  adminFeePct: number;
  reserveFund: number;
  reserveFundPct: number;
  insurance: number;
  fine: number;
  interest: number;
  other: number;
  difference: number;
  notes: string;
  settledAt: string;
  occurrenceIndex: number; // 1ª, 2ª... ocorrência da mesma cota+vencimento+parcela+transação no extrato
}

type PlanAction = 'CREATE' | 'UPDATE' | 'SKIP';

interface PlannedRow {
  row: ParsedRow;
  key: string;
  action: PlanAction;
  consortiumId?: string;         // definido se o consórcio já existia
  existingTransactionId?: string; // definido para action === 'UPDATE'
}

interface ImportPlan {
  totalRows: number;
  newConsortiumKeys: string[];
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  planned: PlannedRow[];
}

const keyOf = (administrator: string, groupNumber: string, quotaNumber: string) =>
  `${administrator}|||${groupNumber}|||${quotaNumber}`;

function parseConsortiumXlsx(rows: any[][]): ParsedRow[] {
  const norm = (v: any) => (v === undefined || v === null ? '' : String(v).trim());

  const headerRowIndex = rows.findIndex(r => norm(r[0]) === 'Administradora' && norm(r[1]) === 'Empresa');
  if (headerRowIndex === -1) {
    throw new Error('Não encontramos o cabeçalho esperado do extrato de consórcio (colunas "Administradora"/"Empresa"). Confirme se é o arquivo certo.');
  }

  const header = rows[headerRowIndex].map(norm);
  const colIndex = (name: string) => header.indexOf(name);

  const idx = {
    administrator: colIndex('Administradora'),
    empresa: colIndex('Empresa'),
    cnpj: colIndex('CNPJ'),
    grupo: colIndex('Grupo'),
    cota: colIndex('Cota'),
    versao: colIndex('Versão'),
    parcela: colIndex('Parcela'),
    transacao: colIndex('Transação'),
    vencimento: colIndex('Vencimento'),
    pagamento: colIndex('Pagamento'),
    contabilizacao: colIndex('Contabilização'),
    valorParcela: colIndex('Valor da parcela'),
    valorPago: colIndex('Valor pago'),
    fundoComum: colIndex('Fundo comum'),
    fundoComumPct: colIndex('% fundo comum'),
    taxaAdm: colIndex('Taxa de administração'),
    taxaAdmPct: colIndex('% taxa de administração'),
    fundoReserva: colIndex('Fundo de reserva'),
    fundoReservaPct: colIndex('% fundo de reserva'),
    seguro: colIndex('Seguro'),
    multa: colIndex('Multa'),
    juros: colIndex('Juros'),
    outros: colIndex('Outros'),
    diferenca: colIndex('Diferença'),
    observacao: colIndex('Observação'),
    baixadoEm: colIndex('Baixado em'),
  };

  if (idx.administrator === -1 || idx.grupo === -1 || idx.cota === -1 || idx.vencimento === -1) {
    throw new Error('O extrato não tem todas as colunas esperadas (Administradora, Grupo, Cota, Vencimento).');
  }

  const out: ParsedRow[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    const administrator = norm(r[idx.administrator]);
    const groupNumber = norm(r[idx.grupo]);
    const quotaNumber = norm(r[idx.cota]);
    const vencimento = norm(r[idx.vencimento]);
    if (!administrator || !groupNumber || !quotaNumber || !vencimento) continue; // linha em branco/rodapé

    const paidValueStr = idx.valorPago !== -1 ? norm(r[idx.valorPago]) : '';

    out.push({
      administrator,
      holderName: idx.empresa !== -1 ? norm(r[idx.empresa]) : '',
      holderCnpj: idx.cnpj !== -1 ? norm(r[idx.cnpj]) : '',
      groupNumber,
      quotaNumber,
      version: idx.versao !== -1 ? norm(r[idx.versao]) : '',
      installmentNumber: idx.parcela !== -1 ? norm(r[idx.parcela]) : '',
      transactionKind: idx.transacao !== -1 ? norm(r[idx.transacao]) : '',
      dueDate: parseDateToIso(vencimento),
      paymentDate: idx.pagamento !== -1 && norm(r[idx.pagamento]) ? parseDateToIso(norm(r[idx.pagamento])) : '',
      accountingDate: idx.contabilizacao !== -1 && norm(r[idx.contabilizacao]) ? parseDateToIso(norm(r[idx.contabilizacao])) : '',
      installmentValue: idx.valorParcela !== -1 ? parseUsStyleReais(norm(r[idx.valorParcela])) : 0,
      paidValue: paidValueStr ? parseUsStyleReais(paidValueStr) : undefined,
      commonFund: idx.fundoComum !== -1 ? parseUsStyleReais(norm(r[idx.fundoComum])) : 0,
      commonFundPct: idx.fundoComumPct !== -1 ? parseUsStyleReais(norm(r[idx.fundoComumPct])) : 0,
      adminFee: idx.taxaAdm !== -1 ? parseUsStyleReais(norm(r[idx.taxaAdm])) : 0,
      adminFeePct: idx.taxaAdmPct !== -1 ? parseUsStyleReais(norm(r[idx.taxaAdmPct])) : 0,
      reserveFund: idx.fundoReserva !== -1 ? parseUsStyleReais(norm(r[idx.fundoReserva])) : 0,
      reserveFundPct: idx.fundoReservaPct !== -1 ? parseUsStyleReais(norm(r[idx.fundoReservaPct])) : 0,
      insurance: idx.seguro !== -1 ? parseUsStyleReais(norm(r[idx.seguro])) : 0,
      fine: idx.multa !== -1 ? parseUsStyleReais(norm(r[idx.multa])) : 0,
      interest: idx.juros !== -1 ? parseUsStyleReais(norm(r[idx.juros])) : 0,
      other: idx.outros !== -1 ? parseUsStyleReais(norm(r[idx.outros])) : 0,
      difference: idx.diferenca !== -1 ? parseUsStyleReais(norm(r[idx.diferenca])) : 0,
      notes: idx.observacao !== -1 ? norm(r[idx.observacao]) : '',
      settledAt: idx.baixadoEm !== -1 && norm(r[idx.baixadoEm]) ? parseDateToIso(norm(r[idx.baixadoEm])) : '',
      occurrenceIndex: 1, // calculado abaixo, depois que todas as linhas foram lidas
    });
  }

  // Algumas administradoras repetem cota+vencimento+parcela+transação em eventos
  // genuinamente diferentes (ex.: dois "RECBTO. ANTECIPADO" com valores distintos).
  // Numera cada ocorrência na ordem em que aparece no extrato — estável entre
  // importação e reimportação, desde que a administradora mantenha a mesma ordem.
  const occurrenceCounters = new Map<string, number>();
  for (const row of out) {
    const occKey = `${row.administrator}|${row.groupNumber}|${row.quotaNumber}|${row.dueDate}|${row.installmentNumber}|${row.transactionKind}`;
    const next = (occurrenceCounters.get(occKey) || 0) + 1;
    occurrenceCounters.set(occKey, next);
    row.occurrenceIndex = next;
  }

  return out;
}

const toInstallmentData = (r: ParsedRow) => ({
  installmentNumber: r.installmentNumber,
  version: r.version,
  transactionKind: r.transactionKind,
  occurrenceIndex: r.occurrenceIndex,
  dueDate: r.dueDate,
  paymentDate: r.paymentDate || undefined,
  accountingDate: r.accountingDate || undefined,
  installmentValue: r.installmentValue,
  paidValue: r.paidValue,
  commonFund: r.commonFund,
  commonFundPct: r.commonFundPct,
  adminFee: r.adminFee,
  adminFeePct: r.adminFeePct,
  reserveFund: r.reserveFund,
  reserveFundPct: r.reserveFundPct,
  insurance: r.insurance,
  fine: r.fine,
  interest: r.interest,
  other: r.other,
  difference: r.difference,
  notes: r.notes || undefined,
  settledAt: r.settledAt || undefined,
});

export const ConsortiumImport: React.FC<ConsortiumImportProps> = ({
  onClose,
  onSuccess,
  banks,
  categories,
  wallets,
  participants,
  preSelectedBankId,
  preSelectedWalletId,
}) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'review' | 'done'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [selectedBankId, setSelectedBankId] = useState<string>(
    preSelectedBankId && preSelectedBankId !== 'ALL' && banks.some(b => b.id === preSelectedBankId) ? preSelectedBankId : ''
  );
  const [selectedWalletId, setSelectedWalletId] = useState<string>(
    preSelectedWalletId && preSelectedWalletId !== 'ALL' && wallets.some(w => w.id === preSelectedWalletId) ? preSelectedWalletId : ''
  );
  const [error, setError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);

  const isSupportedFile = (f: File) => f.name.toLowerCase().endsWith('.xlsx');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      if (isSupportedFile(f)) { setFile(f); setError(null); }
      else setError('Por favor, selecione o arquivo .xlsx do extrato de consórcio.');
    }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      if (isSupportedFile(f)) { setFile(f); setError(null); }
      else setError('Por favor, selecione o arquivo .xlsx do extrato de consórcio.');
    }
  };

  // Lê o arquivo, monta as linhas e calcula o plano de importação (o que é novo,
  // o que mudou de valor — ex. a administradora corrigiu a parcela num extrato mais
  // novo — e o que já está igual e será pulado), sem gravar nada ainda.
  const handleProcess = async () => {
    if (!file || !selectedBankId || !selectedWalletId) return;
    setError(null);
    try {
      setStep('processing');
      setProgressMsg('Lendo a planilha...');

      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

      const parsedRows = parseConsortiumXlsx(rawRows);
      if (parsedRows.length === 0) {
        throw new Error('Não encontramos nenhuma linha de parcela no extrato.');
      }

      setProgressMsg('Conferindo cotas e parcelas já cadastradas...');

      const existingConsortiums = await financeService.getRegistry<Consortium>('consortiums', true, selectedWalletId);
      const existingByKey = new Map<string, Consortium>();
      for (const c of existingConsortiums) {
        if (c.administrator && c.groupNumber && c.quotaNumber) {
          existingByKey.set(keyOf(c.administrator, c.groupNumber, c.quotaNumber), c);
        }
      }

      const newConsortiumKeys = new Set<string>();
      for (const r of parsedRows) {
        const key = keyOf(r.administrator, r.groupNumber, r.quotaNumber);
        if (!existingByKey.has(key)) newConsortiumKeys.add(key);
      }

      const existingConsortiumIds = [...existingByKey.values()].map(c => c.id);
      const installmentIndex = await financeService.getConsortiumInstallmentIndex(existingConsortiumIds);

      let toCreate = 0, toUpdate = 0, toSkip = 0;
      const planned: PlannedRow[] = parsedRows.map(r => {
        const key = keyOf(r.administrator, r.groupNumber, r.quotaNumber);
        const existingConsortium = existingByKey.get(key);
        if (!existingConsortium) {
          toCreate++;
          return { row: r, key, action: 'CREATE' };
        }
        // "Transação" + occurrenceIndex entram na chave porque a mesma cota pode ter
        // mais de um evento idêntico em vencimento/parcela/transação (ex.: lance
        // embutido e sua contrapartida, ou dois "RECBTO. ANTECIPADO" com valores
        // diferentes) — ver migrações add_consortiums.sql / fix_consortium_installments_unique_key.sql
        // / add_consortium_installment_occurrence.sql.
        const dedupeKey = `${existingConsortium.id}|${r.dueDate}|${r.installmentNumber}|${r.transactionKind}|${r.occurrenceIndex}`;
        const existingInst = installmentIndex.get(dedupeKey);
        if (!existingInst) {
          toCreate++;
          return { row: r, key, action: 'CREATE', consortiumId: existingConsortium.id };
        }
        // O lançamento sempre entra como Contas a Pagar (PENDING), mesmo que o extrato
        // diga que já foi pago — quem confirma o pagamento é o usuário, comparando com
        // o extrato do próprio banco. Por isso a reimportação nunca compara/mexe no
        // status: só o valor esperado da parcela é o que pode mudar (ex.: a
        // administradora corrigiu o valor num extrato mais novo).
        const rowValue = r.installmentValue;
        const changed = Math.abs((existingInst.value || 0) - rowValue) > 0.01;
        if (changed) {
          toUpdate++;
          return { row: r, key, action: 'UPDATE', consortiumId: existingConsortium.id, existingTransactionId: existingInst.transactionId };
        }
        toSkip++;
        return { row: r, key, action: 'SKIP' };
      });

      setPlan({
        totalRows: parsedRows.length,
        newConsortiumKeys: [...newConsortiumKeys],
        toCreate,
        toUpdate,
        toSkip,
        planned,
      });
      setStep('review');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao processar o extrato.');
      setStep('upload');
    }
  };

  const handleConfirmImport = async () => {
    if (!plan) return;
    setError(null);
    try {
      setStep('processing');
      setProgressMsg('Criando cotas novas no cadastro de Consórcios...');

      const keyToConsortiumId = new Map<string, string>();
      for (const item of plan.planned) {
        if (item.consortiumId) keyToConsortiumId.set(item.key, item.consortiumId);
      }
      for (const key of plan.newConsortiumKeys) {
        const sample = plan.planned.find(p => p.key === key)!.row;
        const created = await financeService.findOrCreateConsortium(
          { walletId: selectedWalletId, administrator: sample.administrator, groupNumber: sample.groupNumber, quotaNumber: sample.quotaNumber },
          { holderName: sample.holderName, holderCnpj: sample.holderCnpj }
        );
        keyToConsortiumId.set(key, created.id);
      }

      // Participante é quem recebe o pagamento (a Administradora do consórcio, ex.:
      // "Sicredi Consórcios", "Disal Consórcio") — não o titular da cota, que na
      // prática é a própria Holding (fica guardado em Cadastros > Consórcios).
      setProgressMsg('Localizando (ou criando) o participante (administradora)...');
      const administratorNames = [...new Set(plan.planned.map(p => p.row.administrator).filter(Boolean))];
      const freshParticipants = await financeService.getRegistry<Participant>('participants', true, selectedWalletId);
      const participantIdByName = new Map<string, string>();
      for (const name of administratorNames) {
        let p = freshParticipants.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (!p) {
          p = await financeService.saveRegistryItem<Participant>('participants', { id: '', name, walletId: selectedWalletId, active: true });
          freshParticipants.push(p);
        }
        participantIdByName.set(name, p.id);
      }

      setProgressMsg('Localizando a categoria "Consórcios"...');
      let consortioCategory = categories.find(c => c.name.trim().toLowerCase() === 'consórcios');
      if (!consortioCategory) {
        const allCats = await financeService.getRegistry<Category>('categories', true, selectedWalletId);
        consortioCategory = allCats.find(c => c.name.trim().toLowerCase() === 'consórcios');
      }
      if (!consortioCategory) {
        throw new Error('Categoria "Consórcios" não encontrada nesta carteira. Crie-a em Cadastros > Categorias antes de importar.');
      }
      const categoryId = consortioCategory.id;

      setProgressMsg('Criando lançamentos novos...');
      const toCreateItems = plan.planned.filter(p => p.action === 'CREATE');
      const newTxs: Transaction[] = [];
      const newInstallments: Array<{ transactionId: string; consortiumId: string; data: ReturnType<typeof toInstallmentData> }> = [];

      for (const item of toCreateItems) {
        const r = item.row;
        const consortiumId = item.consortiumId || keyToConsortiumId.get(item.key)!;
        const txId = generateUUID();
        newTxs.push({
          id: txId,
          date: r.dueDate,
          description: `Consórcio ${r.administrator} - Cota ${r.quotaNumber} (${r.installmentNumber})`,
          docNumber: '',
          value: r.installmentValue,
          type: 'DEBIT',
          // Sempre entra como Contas a Pagar — o usuário confirma o pagamento
          // manualmente comparando com o extrato do próprio banco (ver pergunta
          // respondida na implementação: extrato do consórcio marca "Pagamento" mas
          // isso não significa que já saiu da conta da Holding).
          status: 'PENDING',
          bankId: selectedBankId,
          walletId: selectedWalletId,
          categoryId,
          costCenterId: '',
          participantId: participantIdByName.get(r.administrator),
          organization_id: financeService.activeOrganizationId ?? undefined,
        } as Transaction);
        newInstallments.push({ transactionId: txId, consortiumId, data: toInstallmentData(r) });
      }

      for (let i = 0; i < newTxs.length; i += 500) {
        await financeService.createManyTransactions(newTxs.slice(i, i + 500));
      }

      setProgressMsg('Atualizando parcelas com valor diferente do já importado...');
      const toUpdateItems = plan.planned.filter(p => p.action === 'UPDATE');
      const updatedInstallments: Array<{ transactionId: string; consortiumId: string; data: ReturnType<typeof toInstallmentData> }> = [];
      for (const item of toUpdateItems) {
        const r = item.row;
        const txId = item.existingTransactionId!;
        // Não mexe no status — se o usuário já marcou como pago manualmente, a
        // reimportação não pode desfazer isso (ver findOrCreate/status sempre PENDING
        // na criação, acima).
        await financeService.updateTransactionsValue([txId], r.installmentValue);
        await financeService.updateTransactionsDatesBulk([{ id: txId, date: r.dueDate }]);
        updatedInstallments.push({ transactionId: txId, consortiumId: item.consortiumId!, data: toInstallmentData(r) });
      }

      setProgressMsg('Gravando o detalhe financeiro de cada parcela...');
      const allInstallments = [...newInstallments, ...updatedInstallments];
      for (let i = 0; i < allInstallments.length; i += 500) {
        await financeService.upsertConsortiumInstallmentsBatch(allInstallments.slice(i, i + 500));
      }

      setResult({ created: newTxs.length, updated: toUpdateItems.length, skipped: plan.toSkip });
      setStep('done');
    } catch (err: any) {
      console.error(err);
      setError('Erro ao importar o extrato: ' + (err.message || ''));
      setStep('review');
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden border border-slate-200"
      >
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <PiggyBank className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Importar Extrato de Consórcio</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Cria/atualiza cotas e parcelas automaticamente</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3 text-sm text-red-800 items-start">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Epa, algo deu errado:</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-900">
                Todo lançamento importado entra como <strong>Contas a Pagar (pendente)</strong>, mesmo que o extrato do
                consórcio já marque a parcela como paga — confirme o pagamento manualmente depois de conferir com o
                extrato do seu banco.
              </div>
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer group relative"
              >
                <input type="file" accept=".xlsx" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-indigo-100 transition-all">
                    <FileUp className="w-8 h-8 text-slate-400 group-hover:text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-700">Arraste o .xlsx do extrato de consórcio aqui ou clique para selecionar</p>
                    <p className="text-sm text-slate-400">Extrato com Administradora, Grupo, Cota, Parcela, Vencimento, Pagamento, Fundo Comum, Taxa Adm., Fundo de Reserva etc.</p>
                  </div>
                </div>
              </div>

              {file && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 truncate pr-4">
                    <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 shrink-0">
                      <FileUp className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-bold text-slate-800 truncate">{file.name}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button onClick={() => setFile(null)} className="text-xs text-slate-500 hover:text-red-500 font-bold transition-colors">Remover</button>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                  Carteira <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedWalletId}
                  onChange={(e) => setSelectedWalletId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-700 font-medium focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 text-sm transition-all"
                >
                  <option value="">Selecione a carteira...</option>
                  {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                  Banco/Conta (da Holding) <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedBankId}
                  onChange={(e) => setSelectedBankId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-700 font-medium focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 text-sm transition-all"
                >
                  <option value="">Selecione o banco/conta...</option>
                  {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
                </select>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all border border-transparent">Cancelar</button>
                <button
                  onClick={handleProcess}
                  disabled={!file || !selectedBankId || !selectedWalletId}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-indigo-200"
                >
                  Processar extrato
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-6">
              <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-800">Processando o extrato de consórcio...</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto mt-2">Isso pode levar um tempo quando o extrato tem muitas linhas.</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl py-3 px-6 text-sm text-slate-600 font-semibold shadow-inner">
                Progresso: {progressMsg}
              </div>
            </div>
          )}

          {step === 'review' && plan && (
            <div className="space-y-6">
              <div className="rounded-2xl p-4 flex items-center justify-between border bg-indigo-50 border-indigo-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm font-bold text-indigo-800">{plan.totalRows} linhas encontradas no extrato</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-2xl font-black text-blue-700">{plan.toCreate}</p>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mt-1">Novos lançamentos</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <p className="text-2xl font-black text-amber-700">{plan.toUpdate}</p>
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mt-1">Serão atualizados</p>
                </div>
                <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-center">
                  <p className="text-2xl font-black text-slate-600">{plan.toSkip}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mt-1">Já importados (sem mudança)</p>
                </div>
              </div>

              {plan.newConsortiumKeys.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-sm text-indigo-900">
                  <p className="font-bold flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-indigo-600" />
                    {plan.newConsortiumKeys.length} cota(s) nova(s) serão cadastradas em "Consórcios"
                  </p>
                  <p className="text-indigo-800 mb-2">
                    Vão entrar com um nome provisório (Grupo/Cota) — depois é só renomear em Cadastros &gt; Consórcios pra um nome que faça sentido pra você (ex. "Apto Centro").
                  </p>
                  <ul className="max-h-40 overflow-y-auto space-y-1 text-xs text-indigo-700 list-disc list-inside">
                    {plan.newConsortiumKeys.slice(0, 50).map(key => {
                      const [administrator, groupNumber, quotaNumber] = key.split('|||');
                      return <li key={key}>{administrator} — Grupo {groupNumber} / Cota {quotaNumber}</li>;
                    })}
                    {plan.newConsortiumKeys.length > 50 && <li>... e mais {plan.newConsortiumKeys.length - 50}</li>}
                  </ul>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setStep('upload')} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all border border-transparent">Voltar</button>
                <button
                  onClick={handleConfirmImport}
                  disabled={plan.toCreate === 0 && plan.toUpdate === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-indigo-200"
                >
                  Confirmar importação
                </button>
              </div>
            </div>
          )}

          {step === 'done' && result && (
            <div className="space-y-6 text-center py-8">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
              <div>
                <h3 className="text-lg font-bold text-slate-800">Importação concluída</h3>
                <p className="text-sm text-slate-500 mt-2">
                  {result.created} lançamento(s) novo(s), {result.updated} atualizado(s) e {result.skipped} já estavam importados (sem mudança).
                </p>
              </div>
              <button onClick={onSuccess} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-indigo-200">
                Concluir
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
