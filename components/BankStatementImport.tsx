import React, { useState, useEffect, useRef } from 'react';
import { ParticipantAutocomplete } from './ParticipantAutocomplete';
import { motion } from 'motion/react';
import {
  FileUp,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle
} from 'lucide-react';
import { financeService } from '../services/financeService';
import { parseMercadoPagoExtratoPdf } from '../services/bankStatementService';
import { reconcileStatementWithPayables } from '../services/reconciliationService';
import type { CardStatement, ReconciliationResult, MerchantAlias, Bank, Category, CostCenter, Wallet, Transaction, Participant } from '../types';

// FNV-1a hash — identifica o extrato pelo conjunto de IDs de operação (estáveis e
// únicos), evitando reimportação acidental do mesmo período.
function hashOperationIds(ids: string[]): string {
  const str = [...ids].sort().join(',');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

interface BankStatementImportProps {
  onClose: () => void;
  onSuccess: () => void;
  banks: Bank[];
  categories: Category[];
  costCenters: CostCenter[];
  wallets: Wallet[];
  participants: Participant[];
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1] || reader.result;
        resolve(base64);
      } else {
        reject(new Error('Falha ao converter arquivo para Base64'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

export const BankStatementImport: React.FC<BankStatementImportProps> = ({
  onClose,
  onSuccess,
  banks,
  categories,
  costCenters,
  wallets,
  participants,
}) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');

  const [progressMsg, setProgressMsg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [statement, setStatement] = useState<CardStatement | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [operationIds, setOperationIds] = useState<string[]>([]);

  const [selectedMatchedCandidates, setSelectedMatchedCandidates] = useState<Record<number, string>>({});
  const [selectedCandidates, setSelectedCandidates] = useState<Record<number, string>>({});
  const [createdNews, setCreatedNews] = useState<Record<number, boolean>>({});
  const [ignoredItems, setIgnoredItems] = useState<Record<number, boolean>>({});
  const [itemCategories, setItemCategories] = useState<Record<number, string>>({});
  const [itemCostCenters, setItemCostCenters] = useState<Record<number, string>>({});
  const [itemParticipants, setItemParticipants] = useState<Record<number, string>>({});
  const [itemDescriptions, setItemDescriptions] = useState<Record<number, string>>({});
  const [localParticipants, setLocalParticipants] = useState<Participant[]>(participants);
  const [batchHistory, setBatchHistory] = useState<{ id: string; date: string; count: number; description: string }[]>([]);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ hash: string; fileName: string; importedAt: string } | null>(null);
  const [currentHash, setCurrentHash] = useState<string | null>(null);
  const bypassDuplicateCheck = useRef(false);

  const [sectionsOpen, setSectionsOpen] = useState({
    MATCHED: false,
    UNCERTAIN: true,
    NEW: true,
  });

  useEffect(() => {
    setLocalParticipants(participants);
  }, [participants]);

  useEffect(() => {
    const history = localStorage.getItem('import_extrato_batch_history');
    if (history) {
      try { setBatchHistory(JSON.parse(history)); } catch {}
    }
  }, []);

  const handleUndoImport = async (batch: { id: string; description: string; count: number }) => {
    if (!confirm(`Desfazer a importação "${batch.description}" com ${batch.count} lançamentos?`)) return;
    setUndoingId(batch.id);
    try {
      await financeService.deleteImportBatch(batch.id);
      const updated = batchHistory.filter(b => b.id !== batch.id);
      setBatchHistory(updated);
      localStorage.setItem('import_extrato_batch_history', JSON.stringify(updated));
      if (updated.length === 0) onSuccess();
    } catch (e: any) {
      setError('Erro ao desfazer importação: ' + (e.message || ''));
    } finally {
      setUndoingId(null);
    }
  };

  const isSupportedStatementFile = (f: File) => f.type === 'application/pdf';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (isSupportedStatementFile(selectedFile)) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Por favor, selecione o PDF do extrato de conta.');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      if (isSupportedStatementFile(selectedFile)) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Por favor, selecione o PDF do extrato de conta.');
      }
    }
  };

  const handleImportAnyway = () => {
    bypassDuplicateCheck.current = true;
    setDuplicateWarning(null);
    handleProcess();
  };

  // Concilia o extrato já parseado com Contas a Pagar e monta o estado inicial da
  // revisão — mesma lógica usada na importação de fatura de cartão (reaproveitada aqui
  // porque é genérica: não depende de nada específico de cartão/parcelamento).
  const finishParsing = async (parsedStatement: CardStatement) => {
    setProgressMsg('Conciliando com os lançamentos pendentes...');
    const aliases: MerchantAlias[] = await financeService.getMerchantAliases();
    const reconResult = await reconcileStatementWithPayables(
      parsedStatement,
      selectedBankId,
      aliases,
      (bankId) => financeService.getTransactions({ bankId, status: 'PENDING' })
    );

    setStatement(parsedStatement);
    setReconciliation(reconResult);

    const initialMatchedCandidates: Record<number, string> = {};
    const initialCandidates: Record<number, string> = {};
    const initialNews: Record<number, boolean> = {};
    const initialCats: Record<number, string> = {};
    const initialCCs: Record<number, string> = {};
    const initialParts: Record<number, string> = {};

    // Participantes não são mais compartilhados entre carteiras: resolve a sugestão do
    // Merchant Alias pelo NOME dentro da carteira sendo importada (criando o cadastro
    // aqui se ainda não existir), em vez de reusar o id de origem — mesmo padrão já
    // usado na importação de fatura de cartão.
    const allParticipants = await financeService.getRegistry('participants', false, 'ALL') as Participant[];
    const resolvedParticipantCache = new Map<string, string>();
    const resolveAliasParticipant = async (participantId: string): Promise<string | undefined> => {
      const referenced = allParticipants.find(p => p.id === participantId);
      if (!referenced) return undefined;
      if (referenced.walletId === selectedWalletId) return referenced.id;

      const cached = resolvedParticipantCache.get(referenced.name);
      if (cached) return cached;

      let sameNameHere = allParticipants.find(p => p.name === referenced.name && p.walletId === selectedWalletId);
      if (!sameNameHere) {
        sameNameHere = await financeService.saveRegistryItem<Participant>('participants', {
          id: '',
          name: referenced.name,
          walletId: selectedWalletId,
          category: referenced.category,
          sector: referenced.sector,
          ticker: referenced.ticker,
          currency: referenced.currency,
        });
        allParticipants.push(sameNameHere);
      }
      resolvedParticipantCache.set(referenced.name, sameNameHere.id);
      return sameNameHere.id;
    };

    for (const [index, item] of reconResult.items.entries()) {
      if (item.status === 'MATCHED') {
        initialMatchedCandidates[index] = item.candidates?.[0]?.transaction?.id || 'NEW';
      } else if (item.status === 'UNCERTAIN') {
        initialCandidates[index] = item.candidates?.[0]?.transaction?.id || 'NEW';
      } else if (item.status === 'NEW') {
        initialNews[index] = true;
      }

      const lowerDesc = item.statementItem.rawDescription.toLowerCase();
      const matchedAlias = aliases.find(alias => {
        if (!alias.rawPattern) return false;
        const escaped = alias.rawPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          const regex = new RegExp(escaped, 'i');
          return regex.test(lowerDesc);
        } catch {
          return lowerDesc.includes(alias.rawPattern.toLowerCase());
        }
      });

      if (matchedAlias) {
        if (matchedAlias.defaultCategoryId) initialCats[index] = matchedAlias.defaultCategoryId;
        if (matchedAlias.defaultCostCenterId) initialCCs[index] = matchedAlias.defaultCostCenterId;
        if (matchedAlias.defaultParticipantId) {
          const resolvedId = await resolveAliasParticipant(matchedAlias.defaultParticipantId);
          if (resolvedId) initialParts[index] = resolvedId;
        }
      }
    }

    setSelectedMatchedCandidates(initialMatchedCandidates);
    setSelectedCandidates(initialCandidates);
    setCreatedNews(initialNews);
    setItemCategories(initialCats);
    setItemCostCenters(initialCCs);
    setItemParticipants(initialParts);

    setStep('review');
  };

  const handleProcess = async () => {
    if (!file || !selectedBankId || !selectedWalletId) return;
    setError(null);

    try {
      setStep('processing');
      setProgressMsg('Extraindo texto do PDF...');
      const base64 = await fileToBase64(file);

      const textRes = await fetch('/api/extract-pdf-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64 }),
      });
      if (!textRes.ok) {
        const errorData = await textRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao extrair texto do PDF. Tente novamente.');
      }
      const { text } = await textRes.json();

      setProgressMsg('Interpretando o extrato...');
      const { statement: parsedStatement, operationIds: ids } = parseMercadoPagoExtratoPdf(text);

      if (parsedStatement.cards[0].items.length === 0) {
        throw new Error('Não encontramos lançamentos no extrato. Confirme se é o PDF do extrato de conta do Mercado Pago.');
      }

      if (!bypassDuplicateCheck.current) {
        const fileHash = hashOperationIds(ids);
        const storedHashes: Array<{ hash: string; fileName: string; importedAt: string }> =
          JSON.parse(localStorage.getItem('imported_extrato_hashes') || '[]');
        const existing = storedHashes.find(h => h.hash === fileHash);
        if (existing) {
          setDuplicateWarning(existing);
          setStep('upload');
          return;
        }
        setCurrentHash(fileHash);
      }
      bypassDuplicateCheck.current = false;
      setOperationIds(ids);

      await finishParsing(parsedStatement);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao processar o extrato.');
      setStep('upload');
    }
  };

  const handleConfirmImport = async () => {
    if (!statement || !reconciliation) return;

    try {
      const importBatchId = `extrato-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newTransactions: Transaction[] = [];
      const transactionIdsToMarkPaid: string[] = [];
      const dateUpdates: { id: string; date: string }[] = [];

      reconciliation.items.forEach((item, index) => {
        const desc = itemDescriptions[index] || item.statementItem.rawDescription || '';
        const date = item.statementItem.purchaseDate || new Date().toISOString().split('T')[0];

        const buildNew = (): Transaction => ({
          id: '', date, description: desc,
          value: item.statementItem.value,
          type: item.statementItem.isRefund ? 'CREDIT' : 'DEBIT',
          status: 'PAID',
          bankId: selectedBankId,
          walletId: selectedWalletId,
          categoryId: itemCategories[index] || '',
          costCenterId: itemCostCenters[index] || '',
          participantId: itemParticipants[index] || undefined,
          docNumber: '',
          organization_id: financeService.activeOrganizationId ?? undefined,
          importBatchId,
        } as Transaction);

        if (item.status === 'MATCHED') {
          const choice = selectedMatchedCandidates[index] || item.candidates[0]?.transaction.id || 'NEW';
          if (choice !== 'NEW') {
            transactionIdsToMarkPaid.push(choice);
            dateUpdates.push({ id: choice, date });
          } else {
            newTransactions.push(buildNew());
          }
        } else if (item.status === 'UNCERTAIN') {
          if (ignoredItems[index]) return;
          const choice = selectedCandidates[index];
          if (choice && choice !== 'NEW') {
            transactionIdsToMarkPaid.push(choice);
            dateUpdates.push({ id: choice, date });
          } else if (choice === 'NEW') {
            newTransactions.push(buildNew());
          }
        } else if (item.status === 'NEW') {
          if (createdNews[index] ?? true) {
            newTransactions.push(buildNew());
          }
        }
      });

      if (transactionIdsToMarkPaid.length > 0) {
        await financeService.updateTransactionsStatus(transactionIdsToMarkPaid, 'PAID');
        // Cada item casado pode ter sua própria data real (diferente de fatura de
        // cartão, que usa uma única data de vencimento para o lote inteiro).
        for (const { id, date } of dateUpdates) {
          await financeService.updateTransactionsDate([id], date);
        }
      }

      if (newTransactions.length > 0) {
        await financeService.createManyTransactions(newTransactions);
      }

      const totalOperations = transactionIdsToMarkPaid.length + newTransactions.length;
      if (totalOperations > 0) {
        const batchInfo = {
          id: importBatchId,
          date: new Date().toISOString(),
          count: totalOperations,
          description: `Extrato ${file?.name || 'importado'}`,
        };
        const updated = [batchInfo, ...batchHistory].slice(0, 5);
        setBatchHistory(updated);
        localStorage.setItem('import_extrato_batch_history', JSON.stringify(updated));
      }

      if (currentHash) {
        const storedHashes: Array<{ hash: string; fileName: string; importedAt: string }> =
          JSON.parse(localStorage.getItem('imported_extrato_hashes') || '[]');
        storedHashes.unshift({ hash: currentHash, fileName: file?.name || '', importedAt: new Date().toISOString() });
        localStorage.setItem('imported_extrato_hashes', JSON.stringify(storedHashes.slice(0, 20)));
        setCurrentHash(null);
      }

      const aliasPromises: Promise<void>[] = [];
      reconciliation.items.forEach((item, index) => {
        if (ignoredItems[index]) return;
        const categoryId = itemCategories[index];
        const costCenterId = itemCostCenters[index];
        const participantId = itemParticipants[index];
        if (!categoryId && !costCenterId && !participantId) return;
        const rawDesc = item.statementItem.rawDescription || '';
        if (!rawDesc) return;
        aliasPromises.push(
          financeService.saveMerchantAlias({
            rawPattern: rawDesc,
            canonicalName: rawDesc,
            defaultCategoryId: categoryId || null,
            defaultCostCenterId: costCenterId || null,
            defaultParticipantId: participantId || null,
          }).catch((e: any) => console.warn('[alias] erro ao salvar:', e))
        );
      });
      await Promise.all(aliasPromises);

      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError('Erro ao salvar os lançamentos: ' + (err.message || ''));
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const toggleSection = (section: 'MATCHED' | 'UNCERTAIN' | 'NEW') => {
    setSectionsOpen(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const matchedItems = reconciliation?.items.filter(i => i.status === 'MATCHED') || [];
  const uncertainItems = reconciliation?.items.filter(i => i.status === 'UNCERTAIN') || [];
  const newItems = reconciliation?.items.filter(i => i.status === 'NEW') || [];

  const conferredTotal = reconciliation?.items?.reduce((acc: number, item, index) => {
    if (item.status === 'NEW' && !(createdNews[index] ?? true)) return acc;
    if (item.status === 'UNCERTAIN' && ignoredItems[index]) return acc;
    return acc + Math.abs(item.statementItem.value);
  }, 0) || 0;
  const statementTotal = statement?.grandAnchorTotal ?? 0;
  const totalsMatch = Math.abs(conferredTotal - Math.abs(statementTotal)) < 0.05 || statementTotal === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden border border-slate-200"
      >
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-600 flex items-center justify-center shadow-lg shadow-teal-200">
              <FileUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Importar Extrato de Conta</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Conciliação automática com entradas e saídas</p>
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
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center hover:border-teal-400 hover:bg-teal-50/30 transition-all cursor-pointer group relative"
              >
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-teal-100 transition-all">
                    <FileUp className="w-8 h-8 text-slate-400 group-hover:text-teal-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-700">Arraste o PDF do extrato aqui ou clique para selecionar</p>
                    <p className="text-sm text-slate-400">Extrato de conta do Mercado Pago (PDF)</p>
                  </div>
                </div>
              </div>

              {batchHistory.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Importações recentes</p>
                  {batchHistory.map(batch => (
                    <div key={batch.id} className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-sm gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-amber-800">{batch.description}</span>
                        <span className="text-amber-600 ml-2">· {batch.count} lançamentos · {new Date(batch.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUndoImport(batch)}
                        disabled={undoingId === batch.id}
                        className="shrink-0 px-3 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
                      >
                        {undoingId === batch.id ? 'Desfazendo...' : 'Desfazer'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {file && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 truncate pr-4">
                    <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 shrink-0">
                      <FileUp className="w-5 h-5 text-teal-600" />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-bold text-slate-800 truncate">{file.name}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button onClick={() => setFile(null)} className="text-xs text-slate-500 hover:text-red-500 font-bold transition-colors">
                    Remover
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                  Banco/Conta <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedBankId}
                  onChange={(e) => setSelectedBankId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-700 font-medium focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 text-sm transition-all"
                >
                  <option value="">Selecione o banco/conta do extrato...</option>
                  {banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>{bank.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                  Carteira <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedWalletId}
                  onChange={(e) => setSelectedWalletId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-700 font-medium focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 text-sm transition-all"
                >
                  <option value="">Selecione a carteira...</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                  ))}
                </select>
              </div>

              {duplicateWarning && (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex gap-3 text-sm text-amber-900 items-start">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Extrato já importado anteriormente</p>
                    <p className="mt-1 text-amber-800">
                      O arquivo <strong>{duplicateWarning.fileName}</strong> foi importado em{' '}
                      {new Date(duplicateWarning.importedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.
                      Importar novamente pode criar lançamentos duplicados.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => setDuplicateWarning(null)} className="px-4 py-2 rounded-xl text-sm font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 transition-all">
                        Cancelar
                      </button>
                      <button onClick={handleImportAnyway} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 transition-all">
                        Importar mesmo assim
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all border border-transparent">
                  Cancelar
                </button>
                <button
                  onClick={handleProcess}
                  disabled={!file || !selectedBankId || !selectedWalletId}
                  className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-teal-200"
                >
                  Processar extrato
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-6">
              <Loader2 className="w-12 h-12 text-teal-600 animate-spin" />
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-800">Processando e interpretando o extrato...</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto mt-2">
                  Por favor, aguarde enquanto lemos e conferimos os lançamentos do arquivo.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl py-3 px-6 text-sm text-slate-600 font-semibold shadow-inner">
                Progresso: {progressMsg}
              </div>
            </div>
          )}

          {step === 'review' && statement && reconciliation && (
            <div className="space-y-6">
              {statement.grandTotalsMatch === false && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-sm text-amber-900 items-start">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p>A soma dos lançamentos extraídos não bateu exatamente com o total de Entradas/Saídas impresso no extrato. Confira os valores antes de confirmar.</p>
                </div>
              )}

              <div className={`rounded-2xl p-4 flex items-center justify-between border ${totalsMatch ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`w-5 h-5 ${totalsMatch ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span className={`text-sm font-bold ${totalsMatch ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {reconciliation.items.length} lançamentos encontrados — {matchedItems.length} já lançados, {uncertainItems.length} incertos, {newItems.length} novos
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                {matchedItems.length > 0 && (
                  <div className="border border-green-200 rounded-2xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleSection('MATCHED')}
                      className="w-full px-5 py-3.5 bg-green-50 hover:bg-green-100/70 border-b border-green-200 flex items-center justify-between text-left transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="bg-green-600 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center font-bold">{matchedItems.length}</span>
                        <h3 className="font-bold text-green-900 text-sm sm:text-base">✅ JÁ LANÇADOS</h3>
                      </div>
                      {sectionsOpen.MATCHED ? <ChevronUp className="w-5 h-5 text-green-700" /> : <ChevronDown className="w-5 h-5 text-green-700" />}
                    </button>
                    {sectionsOpen.MATCHED && (
                      <div className="divide-y divide-slate-100 bg-white">
                        {reconciliation.items.map((item, idx) => {
                          if (item.status !== 'MATCHED') return null;
                          const selectedValue = selectedMatchedCandidates[idx] || item.candidates[0]?.transaction.id || 'NEW';
                          return (
                            <div key={idx} className="p-4 sm:p-5 space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{item.statementItem.rawDescription}</p>
                                  <p className="text-xs text-slate-500 font-medium">{formatDate(item.statementItem.purchaseDate)}</p>
                                </div>
                                <p className={`text-sm font-black whitespace-nowrap ${item.statementItem.isRefund ? 'text-emerald-600' : 'text-slate-800'}`}>
                                  {item.statementItem.isRefund ? '+' : '-'}{formatCurrency(item.statementItem.value)}
                                </p>
                              </div>
                              <div className="bg-green-50/40 border border-green-100 rounded-xl p-3 space-y-2">
                                {item.candidates.map((cand) => {
                                  const participantName = participants.find(p => p.id === cand.transaction.participantId)?.name;
                                  return (
                                    <label key={cand.transaction.id} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer p-1 rounded hover:bg-white transition-colors">
                                      <input
                                        type="radio"
                                        name={`matched-${idx}`}
                                        value={cand.transaction.id}
                                        checked={selectedValue === cand.transaction.id}
                                        onChange={() => setSelectedMatchedCandidates(prev => ({ ...prev, [idx]: cand.transaction.id }))}
                                        className="text-teal-600 focus:ring-teal-600 w-3.5 h-3.5 mt-0.5"
                                      />
                                      <div className="-mt-0.5">
                                        <p className="font-bold text-slate-800">
                                          {cand.transaction.description}
                                          {participantName && <span className="text-slate-500 font-normal"> · Participante: {participantName}</span>}
                                        </p>
                                        <p className="text-[10px] text-slate-500">{formatDate(cand.transaction.date)} · {formatCurrency(cand.transaction.value)} ({cand.reason})</p>
                                      </div>
                                    </label>
                                  );
                                })}
                                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer p-1 rounded hover:bg-white transition-colors">
                                  <input
                                    type="radio"
                                    name={`matched-${idx}`}
                                    value="NEW"
                                    checked={selectedValue === 'NEW'}
                                    onChange={() => setSelectedMatchedCandidates(prev => ({ ...prev, [idx]: 'NEW' }))}
                                    className="text-teal-600 focus:ring-teal-600 w-3.5 h-3.5 mt-0.5"
                                  />
                                  <span className="font-bold text-slate-800 -mt-0.5">Nenhum — criar novo lançamento</span>
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {uncertainItems.length > 0 && (
                  <div className="border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleSection('UNCERTAIN')}
                      className="w-full px-5 py-3.5 bg-amber-50 hover:bg-amber-100/70 border-b border-amber-200 flex items-center justify-between text-left transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-600 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center font-bold">{uncertainItems.length}</span>
                        <h3 className="font-bold text-amber-900 text-sm sm:text-base">⚠️ LANÇAMENTOS PENDENTES ENCONTRADOS</h3>
                      </div>
                      {sectionsOpen.UNCERTAIN ? <ChevronUp className="w-5 h-5 text-amber-700" /> : <ChevronDown className="w-5 h-5 text-amber-700" />}
                    </button>
                    {sectionsOpen.UNCERTAIN && (
                      <div className="divide-y divide-slate-100 bg-white">
                        {reconciliation.items.map((item, idx) => {
                          if (item.status !== 'UNCERTAIN') return null;
                          const selectedValue = ignoredItems[idx] ? '' : (selectedCandidates[idx] || 'NEW');
                          return (
                            <div key={idx} className="p-4 sm:p-5 space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{item.statementItem.rawDescription}</p>
                                  <p className="text-xs text-slate-500 font-medium">{formatDate(item.statementItem.purchaseDate)}</p>
                                </div>
                                <p className={`text-sm font-black whitespace-nowrap ${item.statementItem.isRefund ? 'text-emerald-600' : 'text-slate-800'}`}>
                                  {item.statementItem.isRefund ? '+' : '-'}{formatCurrency(item.statementItem.value)}
                                </p>
                              </div>
                              <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-3 space-y-2">
                                <p className="text-[10px] uppercase font-black text-amber-800 tracking-wider">Candidatos possíveis:</p>
                                <div className="space-y-2">
                                  {item.candidates.map((cand) => {
                                    const participantName = participants.find(p => p.id === cand.transaction.participantId)?.name;
                                    return (
                                      <label key={cand.transaction.id} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer p-1 rounded hover:bg-white transition-colors">
                                        <input
                                          type="radio"
                                          name={`candidate-${idx}`}
                                          value={cand.transaction.id}
                                          checked={selectedValue === cand.transaction.id}
                                          onChange={() => {
                                            setIgnoredItems(prev => ({ ...prev, [idx]: false }));
                                            setSelectedCandidates(prev => ({ ...prev, [idx]: cand.transaction.id }));
                                          }}
                                          className="text-teal-600 focus:ring-teal-600 w-3.5 h-3.5 mt-0.5"
                                        />
                                        <div className="-mt-0.5">
                                          <p className="font-bold text-slate-800">
                                            {cand.transaction.description}
                                            {participantName && <span className="text-slate-500 font-normal"> · Participante: {participantName}</span>}
                                          </p>
                                          <p className="text-[10px] text-slate-500">{formatDate(cand.transaction.date)} · {formatCurrency(cand.transaction.value)} ({cand.reason})</p>
                                        </div>
                                      </label>
                                    );
                                  })}
                                  <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer p-1 rounded hover:bg-white transition-colors">
                                    <input
                                      type="radio"
                                      name={`candidate-${idx}`}
                                      value="NEW"
                                      checked={selectedValue === 'NEW'}
                                      onChange={() => {
                                        setIgnoredItems(prev => ({ ...prev, [idx]: false }));
                                        setSelectedCandidates(prev => ({ ...prev, [idx]: 'NEW' }));
                                      }}
                                      className="text-teal-600 focus:ring-teal-600 w-3.5 h-3.5 mt-0.5"
                                    />
                                    <span className="font-bold text-slate-800 -mt-0.5">Nenhum — tratar como novo</span>
                                  </label>
                                  <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer p-1 rounded hover:bg-white transition-colors">
                                    <input
                                      type="radio"
                                      name={`candidate-${idx}`}
                                      checked={ignoredItems[idx] === true}
                                      onChange={() => {
                                        setIgnoredItems(prev => ({ ...prev, [idx]: true }));
                                        setSelectedCandidates(prev => ({ ...prev, [idx]: '' }));
                                      }}
                                      className="text-slate-400 focus:ring-slate-400 w-3.5 h-3.5 mt-0.5"
                                    />
                                    <span className="text-slate-400 italic -mt-0.5">Não lançar (ignorar este item)</span>
                                  </label>
                                </div>
                              </div>

                              {selectedValue === 'NEW' && (
                                <div className="mt-1 space-y-2">
                                  <input
                                    type="text"
                                    placeholder="Descrição (opcional)..."
                                    value={itemDescriptions[idx] !== undefined ? itemDescriptions[idx] : item.statementItem.rawDescription || ''}
                                    onChange={e => setItemDescriptions(prev => ({ ...prev, [idx]: e.target.value }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <select
                                      value={itemCategories[idx] || ''}
                                      onChange={e => setItemCategories(prev => ({ ...prev, [idx]: e.target.value }))}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                                    >
                                      <option value="">Categoria (opcional)...</option>
                                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <select
                                      value={itemCostCenters[idx] || ''}
                                      onChange={e => setItemCostCenters(prev => ({ ...prev, [idx]: e.target.value }))}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-teal-600"
                                    >
                                      <option value="">Centro de Custo (opcional)...</option>
                                      {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                                    </select>
                                  </div>
                                  <div className="mt-1">
                                    <ParticipantAutocomplete
                                      participants={localParticipants}
                                      selectedParticipantId={itemParticipants[idx] || ''}
                                      onSelect={(id) => setItemParticipants(prev => ({ ...prev, [idx]: id }))}
                                      onAddParticipant={async (name) => {
                                        const newP = await financeService.saveRegistryItem<Participant>('participants', { id: '', name, walletId: selectedWalletId, active: true });
                                        setLocalParticipants(prev => [...prev, newP]);
                                        return newP;
                                      }}
                                      placeholder="Participante (opcional)..."
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {newItems.length > 0 && (
                  <div className="border border-blue-200 rounded-2xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleSection('NEW')}
                      className="w-full px-5 py-3.5 bg-blue-50 hover:bg-blue-100/70 border-b border-blue-200 flex items-center justify-between text-left transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-600 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center font-bold">{newItems.length}</span>
                        <h3 className="font-bold text-blue-900 text-sm sm:text-base">🆕 NOVOS LANÇAMENTOS</h3>
                      </div>
                      {sectionsOpen.NEW ? <ChevronUp className="w-5 h-5 text-blue-700" /> : <ChevronDown className="w-5 h-5 text-blue-700" />}
                    </button>
                    {sectionsOpen.NEW && (
                      <div className="divide-y divide-slate-100 bg-white">
                        {reconciliation.items.map((item, idx) => {
                          if (item.status !== 'NEW') return null;
                          const isCreated = createdNews[idx] ?? true;
                          return (
                            <div key={idx} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-bold text-slate-800 truncate max-w-[240px] sm:max-w-md">{item.statementItem.rawDescription}</p>
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 border ${item.statementItem.isRefund ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-red-800 bg-red-50 border-red-200'}`}>
                                        {item.statementItem.isRefund ? 'Entrada' : 'Saída'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium">{formatDate(item.statementItem.purchaseDate)}</p>
                                  </div>
                                  <p className={`text-sm font-black whitespace-nowrap ${item.statementItem.isRefund ? 'text-emerald-600' : 'text-slate-800'}`}>
                                    {item.statementItem.isRefund ? '+' : '-'}{formatCurrency(item.statementItem.value)}
                                  </p>
                                </div>

                                {isCreated && (
                                  <>
                                    <input
                                      type="text"
                                      placeholder="Descrição (opcional)..."
                                      value={itemDescriptions[idx] !== undefined ? itemDescriptions[idx] : item.statementItem.rawDescription || ''}
                                      onChange={e => setItemDescriptions(prev => ({ ...prev, [idx]: e.target.value }))}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                                    />
                                    <div className="grid grid-cols-2 gap-2 pt-1">
                                      <select
                                        value={itemCategories[idx] || ''}
                                        onChange={(e) => setItemCategories(prev => ({ ...prev, [idx]: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                                      >
                                        <option value="">Categoria (opcional)...</option>
                                        {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                      </select>
                                      <select
                                        value={itemCostCenters[idx] || ''}
                                        onChange={(e) => setItemCostCenters(prev => ({ ...prev, [idx]: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-teal-600"
                                      >
                                        <option value="">Centro de Custo (opcional)...</option>
                                        {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                                      </select>
                                    </div>
                                    <div className="mt-1">
                                      <ParticipantAutocomplete
                                        participants={localParticipants}
                                        selectedParticipantId={itemParticipants[idx] || ''}
                                        onSelect={(id) => setItemParticipants(prev => ({ ...prev, [idx]: id }))}
                                        onAddParticipant={async (name) => {
                                          const newP = await financeService.saveRegistryItem<Participant>('participants', { id: '', name, walletId: selectedWalletId, active: true });
                                          setLocalParticipants(prev => [...prev, newP]);
                                          return newP;
                                        }}
                                        placeholder="Participante (opcional)..."
                                      />
                                    </div>
                                  </>
                                )}
                              </div>

                              <div className="flex items-center shrink-0 self-end sm:self-auto">
                                <label className="flex items-center gap-2 cursor-pointer p-1">
                                  <input
                                    type="checkbox"
                                    checked={isCreated}
                                    onChange={(e) => setCreatedNews(prev => ({ ...prev, [idx]: e.target.checked }))}
                                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-600 w-4 h-4"
                                  />
                                  <span className="text-xs font-bold text-slate-700">Criar lançamento (desmarque para ignorar)</span>
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setStep('upload')}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all border border-transparent"
                >
                  Voltar
                </button>
                <button
                  onClick={handleConfirmImport}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-teal-200"
                >
                  Confirmar importação
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
