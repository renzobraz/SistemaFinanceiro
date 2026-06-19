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
import { extractStatementAnchors, extractStatementWithAI, extractStatementWithGemini, reconcileStatement } from '../services/cardStatementService';
import { reconcileStatementWithPayables } from '../services/reconciliationService';
import type { CardStatement, CardStatementItem, ReconciliationResult, MerchantAlias, Bank, Category, CostCenter, Wallet, Transaction, Participant } from '../types';

// FNV-1a hash para identificar arquivos CSV já importados
function hashCsv(str: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

interface CreditCardImportProps {
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

const addMonths = (dateStr: string, months: number): string => {
  const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
};

export const CreditCardImport: React.FC<CreditCardImportProps> = ({
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
  const [dueDate, setDueDate] = useState<string>('');
  
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [statement, setStatement] = useState<CardStatement | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);

  const [selectedMatchedCandidates, setSelectedMatchedCandidates] = useState<Record<number, string>>({});
  const [selectedCandidates, setSelectedCandidates] = useState<Record<number, string>>({});
  const [createdNews, setCreatedNews] = useState<Record<number, boolean>>({});
  const [ignoredItems, setIgnoredItems] = useState<Record<number, boolean>>({});
  const [itemCategories, setItemCategories] = useState<Record<number, string>>({});
  const [itemCostCenters, setItemCostCenters] = useState<Record<number, string>>({});
  const [itemParticipants, setItemParticipants] = useState<Record<number, string>>({});
  const [itemDescriptions, setItemDescriptions] = useState<Record<number, string>>({});
  const [localParticipants, setLocalParticipants] = useState<Participant[]>(participants);
  const [lastBatch, setLastBatch] = useState<{ id: string; date: string; count: number; description: string } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{ hash: string; fileName: string; importedAt: string } | null>(null);
  const [currentCsvHash, setCurrentCsvHash] = useState<string | null>(null);
  const bypassDuplicateCheck = useRef(false);

  useEffect(() => {
    setLocalParticipants(participants);
  }, [participants]);

  useEffect(() => {
    const stored = localStorage.getItem('last_import_batch');
    if (stored) {
      try { setLastBatch(JSON.parse(stored)); } catch {}
    }
  }, []);

  const handleUndoImport = async () => {
    if (!lastBatch) return;
    if (!confirm(`Desfazer a importação "${lastBatch.description}" com ${lastBatch.count} lançamentos?`)) return;
    setUndoing(true);
    try {
      await financeService.deleteImportBatch(lastBatch.id);
      localStorage.removeItem('last_import_batch');
      setLastBatch(null);
      onSuccess();
    } catch (e: any) {
      setError('Erro ao desfazer importação: ' + (e.message || ''));
    } finally {
      setUndoing(false);
    }
  };
  const [generateFutureInstallments, setGenerateFutureInstallments] = useState<Record<number, boolean>>({});

  const [sectionsOpen, setSectionsOpen] = useState({
    MATCHED: false,
    UNCERTAIN: true,
    NEW: true,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === 'application/pdf' || selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Por favor, selecione apenas arquivos PDF.');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      if (selectedFile.type === 'application/pdf' || selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Por favor, selecione apenas arquivos PDF.');
      }
    }
  };

  const handleImportAnyway = () => {
    bypassDuplicateCheck.current = true;
    setDuplicateWarning(null);
    handleProcess();
  };

  const handleProcess = async () => {
    if (!file || !selectedBankId) return;
    setError(null);

    try {
      // Se for CSV, usar endpoint específico
      let parsedStatement: CardStatement;
      if (file.name.endsWith('.csv')) {
        const csvText = await file.text();

        // Verificar se este CSV já foi importado antes (proteção contra duplicatas acidentais)
        if (!bypassDuplicateCheck.current) {
          const csvHash = hashCsv(csvText);
          const storedHashes: Array<{ hash: string; fileName: string; importedAt: string }> =
            JSON.parse(localStorage.getItem('imported_csv_hashes') || '[]');
          const existing = storedHashes.find(h => h.hash === csvHash);
          if (existing) {
            setDuplicateWarning(existing);
            return;
          }
          setCurrentCsvHash(csvHash);
        }
        bypassDuplicateCheck.current = false;

        setStep('processing');
        setProgressMsg('Extraindo texto...');
        const base64 = await fileToBase64(file);
        const regexRes = await fetch('/api/parse-fatura-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvContent: csvText }),
        });

        if (regexRes.ok) {
          const regexData = await regexRes.json();
          const cardMap = new Map<string, CardStatementItem[]>();
          for (const l of regexData.lancamentos) {
            if (!cardMap.has(l.cartao_final)) cardMap.set(l.cartao_final, []);
            cardMap.get(l.cartao_final)!.push({
              rawDescription: l.estabelecimento,
              purchaseDate: l.data_iso || '',
              value: Math.abs(l.valor),
              isRefund: l.e_estorno,
              installmentNumber: l.parcela_atual,
              installmentTotal: l.total_parcelas,
            });
          }
          const cards = Array.from(cardMap.entries()).map(([final, items]) => {
            const parsedTotal = items.reduce((acc, i) => i.isRefund ? acc - i.value : acc + i.value, 0);
            const roundedTotal = Math.round(parsedTotal * 100) / 100;
            return {
              cardLast4: final,
              holderName: regexData.titular || '',
              printedTotal: roundedTotal,
              anchorTotal: undefined,
              parsedTotal: roundedTotal,
              totalsMatch: true,
              items,
            };
          });
          const grandParsedTotal = Math.round(cards.reduce((acc, c) => acc + c.parsedTotal, 0) * 100) / 100;
          extractStatementAnchors('');
          parsedStatement = {
            issuer: 'Itau',
            metadata: { dueDate: '', closingDate: '', statementTotal: grandParsedTotal },
            cards,
            grandParsedTotal,
            grandAnchorTotal: grandParsedTotal,
            grandTotalsMatch: true,
          };

          // Pular direto para conciliação
          setProgressMsg('Conciliando com Contas a Pagar...');
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
          const initialGenerateFuture: Record<number, boolean> = {};
          reconResult.items.forEach((item, index) => {
            if (item.status === 'MATCHED') {
              initialMatchedCandidates[index] = item.candidates?.[0]?.transaction?.id || 'NEW';
            } else if (item.status === 'UNCERTAIN') {
              const installNum = item.statementItem.installmentNumber;
              const installTotal = item.statementItem.installmentTotal;
              let bestCandidate = item.candidates?.[0]?.transaction?.id || 'NEW';
              if (installNum && installTotal && item.candidates) {
                const matchingCandidate = item.candidates.find(c => {
                  const desc = c.transaction?.description || '';
                  return desc.includes('(' + installNum + '/' + installTotal + ')') ||
                         desc.includes(installNum + '/' + installTotal);
                });
                if (matchingCandidate) bestCandidate = matchingCandidate.transaction?.id || 'NEW';
              }
              initialCandidates[index] = bestCandidate;
            } else if (item.status === 'NEW') {
              initialNews[index] = true;
              if (item.statementItem.installmentTotal !== undefined && item.statementItem.installmentNumber !== undefined && item.statementItem.installmentTotal > item.statementItem.installmentNumber) {
                initialGenerateFuture[index] = true;
              }
            }
            const lowerDesc = item.statementItem.rawDescription.toLowerCase();
            const matchedAlias = aliases.find(alias => {
              if (!alias.rawPattern) return false;
              try { return new RegExp(alias.rawPattern, 'i').test(lowerDesc); }
              catch { return lowerDesc.includes(alias.rawPattern.toLowerCase()); }
            });
            if (matchedAlias) {
              if (matchedAlias.defaultCategoryId) initialCats[index] = matchedAlias.defaultCategoryId;
              if (matchedAlias.defaultCostCenterId) initialCCs[index] = matchedAlias.defaultCostCenterId;
              if (matchedAlias.defaultParticipantId) initialParts[index] = matchedAlias.defaultParticipantId;
            }
          });
          setSelectedMatchedCandidates(initialMatchedCandidates);
          setSelectedCandidates(initialCandidates);
          setCreatedNews(initialNews);
          setItemCategories(initialCats);
          setItemCostCenters(initialCCs);
          setItemParticipants(initialParts);
          setGenerateFutureInstallments(initialGenerateFuture);
          setStep('review');
          return;
        } else {
          const errData = await regexRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Erro ao processar CSV');
        }
      }

      setStep('processing');
      setProgressMsg('Extraindo texto...');
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

      // 2. Validando totais via regex (âncoras confiáveis)
      setProgressMsg('Validando totais...');
      const anchors = extractStatementAnchors(text);

      // 3. Tentando parser regex (rápido, determinístico, sem IA)
      setProgressMsg('Processando fatura...');

      const regexRes = await fetch('/api/parse-fatura-cartao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64, extractedText: text }),
      });

      if (regexRes.ok) {
        // Parser regex funcionou — converter FaturaParseResult → CardStatement
        const regexData = await regexRes.json();

        // Agrupar lançamentos por cartão
        const cardMap = new Map<string, CardStatementItem[]>();
        for (const l of regexData.lancamentos) {
          if (!cardMap.has(l.cartao_final)) cardMap.set(l.cartao_final, []);
          // Inferir ano pela data de vencimento
          const venc = anchors.dueDate || new Date().toISOString().split('T')[0];
          const vencYear = parseInt(venc.substring(0, 4));
          const vencMonth = parseInt(venc.substring(5, 7));
          const [day, month] = l.data.split('/').map(Number);
          const year = month > vencMonth ? vencYear - 1 : vencYear;
          const purchaseDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

          cardMap.get(l.cartao_final)!.push({
            rawDescription: l.estabelecimento,
            purchaseDate,
            value: Math.abs(l.valor),
            isRefund: l.e_estorno,
            installmentNumber: l.parcela_atual,
            installmentTotal: l.total_parcelas,
          });
        }

        const cards = Array.from(cardMap.entries()).map(([final, items]) => {
          const parsedTotal = items.reduce((acc, i) => i.isRefund ? acc - i.value : acc + i.value, 0);
          const roundedTotal = Math.round(parsedTotal * 100) / 100;
          const anchorTotal = anchors.cardTotals?.[final];
          const referenceTotal = anchorTotal !== undefined ? anchorTotal : roundedTotal;
          return {
            cardLast4: final,
            holderName: regexData.cartoes?.find((c: any) => c.final === final)?.titular || '',
            printedTotal: referenceTotal,
            anchorTotal,
            parsedTotal: roundedTotal,
            totalsMatch: anchorTotal !== undefined ? Math.abs(roundedTotal - anchorTotal) <= 0.02 : true,
            items,
          };
        });

        const grandParsedTotal = Math.round(cards.reduce((acc, c) => acc + c.parsedTotal, 0) * 100) / 100;
        const grandAnchorTotal = anchors.statementTotal || grandParsedTotal;

        parsedStatement = {
          issuer: 'Itau',
          metadata: {
            dueDate: anchors.dueDate || regexData.vencimento || '',
            closingDate: anchors.closingDate || '',
            statementTotal: grandAnchorTotal,
          },
          cards,
          grandParsedTotal,
          grandAnchorTotal,
          grandTotalsMatch: Math.abs(grandParsedTotal - grandAnchorTotal) <= 0.02,
        };
      } else {
        // Parser regex falhou — tentar fallback com Claude, depois Gemini
        setProgressMsg('Analisando com IA (fallback)...');
        let aiSuccess = false;

        try {
          const aiResult = await extractStatementWithAI(base64, 'application/pdf');
          parsedStatement = reconcileStatement(aiResult, anchors);
          aiSuccess = true;
        } catch (claudeErr) {
          console.warn('[Fallback] Claude falhou, tentando Gemini...', claudeErr);
        }

        if (!aiSuccess) {
          try {
            const aiResult = await extractStatementWithGemini(base64, 'application/pdf');
            parsedStatement = reconcileStatement(aiResult, anchors);
            aiSuccess = true;
          } catch (geminiErr) {
            console.warn('[Fallback] Gemini também falhou.', geminiErr);
          }
        }

        if (!aiSuccess) {
          throw new Error('Falha ao processar o PDF. O parser automático, Claude e Gemini não conseguiram extrair os dados. Tente exportar a fatura como CSV.');
        }
      }

      // 5. Conciliando com Contas a Pagar
      setProgressMsg('Conciliando com Contas a Pagar...');
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
      const initialGenerateFuture: Record<number, boolean> = {};

      reconResult.items.forEach((item, index) => {
        if (item.status === 'MATCHED') {
          const topCandidate = item.candidates?.[0]?.transaction?.id || 'NEW';
          initialMatchedCandidates[index] = topCandidate;
        } else if (item.status === 'UNCERTAIN') {
          const installNum = item.statementItem.installmentNumber;
          const installTotal = item.statementItem.installmentTotal;
          let bestCandidate = item.candidates?.[0]?.transaction?.id || 'NEW';
          if (installNum && installTotal && item.candidates) {
            const matchingCandidate = item.candidates.find(c => {
              const desc = c.transaction?.description || '';
              return desc.includes('(' + installNum + '/' + installTotal + ')') ||
                     desc.includes(installNum + '/' + installTotal);
            });
            if (matchingCandidate) bestCandidate = matchingCandidate.transaction?.id || 'NEW';
          }
          initialCandidates[index] = bestCandidate;
        } else if (item.status === 'NEW') {
          initialNews[index] = true;
          const hasRemainingInstallments =
            item.statementItem.installmentNumber !== undefined &&
            item.statementItem.installmentTotal !== undefined &&
            item.statementItem.installmentTotal > item.statementItem.installmentNumber;
          if (hasRemainingInstallments) {
            initialGenerateFuture[index] = true;
          }
        }

        const lowerDesc = item.statementItem.rawDescription.toLowerCase();
        const matchedAlias = aliases.find(alias => {
          if (!alias.rawPattern) return false;
          try {
            const regex = new RegExp(alias.rawPattern, 'i');
            return regex.test(lowerDesc);
          } catch {
            return lowerDesc.includes(alias.rawPattern.toLowerCase());
          }
        });

        if (matchedAlias) {
          if (matchedAlias.defaultCategoryId) initialCats[index] = matchedAlias.defaultCategoryId;
          if (matchedAlias.defaultCostCenterId) initialCCs[index] = matchedAlias.defaultCostCenterId;
          if (matchedAlias.defaultParticipantId) initialParts[index] = matchedAlias.defaultParticipantId;
        }
      });

      setSelectedMatchedCandidates(initialMatchedCandidates);
      setSelectedCandidates(initialCandidates);
      setCreatedNews(initialNews);
      setItemCategories(initialCats);
      setItemCostCenters(initialCCs);
      setItemParticipants(initialParts);
      setGenerateFutureInstallments(initialGenerateFuture);

      setStep('review');
    } catch (err: any) {
      console.error(err);
      const msg = typeof err === 'string' ? err
        : err?.message ? err.message
        : typeof err === 'object' ? JSON.stringify(err)
        : 'Houve um erro desconhecido durante o processamento.';
      setError(msg);
      setStep('upload');
    }
  };

  const handleConfirmImport = async () => {
    if (!statement || !reconciliation) return;

    try {
      const importBatchId = `fatura-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newTransactions: Transaction[] = [];
      const transactionIdsToMarkPaid: string[] = [];

      reconciliation.items.forEach((item, index) => {
        const installNum = item.statementItem.installmentNumber;
        const installTotal = item.statementItem.installmentTotal;
        const customDesc = itemDescriptions[index] || item.statementItem.rawDescription || '';
        const baseDesc = installNum
          ? `${customDesc} (${installNum}/${installTotal ?? '?'})`
          : customDesc;
        const baseDate = item.statementItem.purchaseDate
          || statement.metadata.dueDate
          || new Date().toISOString().split('T')[0];

        const buildNew = (status: 'PAID' | 'PENDING', desc: string, date: string) => ({
          id: '', date: status === 'PAID' ? dueDate : date, description: desc,
          value: item.statementItem.value,
          type: item.statementItem.isRefund ? 'CREDIT' : 'DEBIT',
          status,
          bankId: selectedBankId,
          walletId: selectedWalletId,
          categoryId: itemCategories[index] || '',
          costCenterId: itemCostCenters[index] || '',
          participantId: itemParticipants[index] || undefined,
          docNumber: '',
          organization_id: financeService.activeOrganizationId ?? undefined,
          importBatchId,
        } as Transaction);

        const pushFutureInstallments = () => {
          if (!(generateFutureInstallments[index] ?? true)) return;
          if (installNum === undefined || installTotal === undefined || installTotal <= installNum) return;
          const remaining = installTotal - installNum;
          for (let i = 1; i <= remaining; i++) {
            newTransactions.push(buildNew(
              'PENDING',
              `${item.statementItem.rawDescription} (${installNum + i}/${installTotal})`,
              addMonths(item.statementItem.purchaseDate || baseDate, i),
            ));
          }
        };

        if (item.status === 'MATCHED') {
          const choice = selectedMatchedCandidates[index] || item.candidates[0]?.transaction.id || 'NEW';
          if (choice !== 'NEW') {
            transactionIdsToMarkPaid.push(choice);
          } else {
            newTransactions.push(buildNew('PAID', baseDesc, baseDate));
          }
        } else if (item.status === 'UNCERTAIN') {
          if (ignoredItems[index]) return;
          const choice = selectedCandidates[index];
          if (choice && choice !== 'NEW') {
            transactionIdsToMarkPaid.push(choice);
          } else if (choice === 'NEW') {
            newTransactions.push(buildNew('PAID', baseDesc, baseDate));
            pushFutureInstallments();
          }
        } else if (item.status === 'NEW') {
          if (createdNews[index] ?? true) {
            newTransactions.push(buildNew('PAID', baseDesc, baseDate));
            pushFutureInstallments();
          }
        }
      });

      if (transactionIdsToMarkPaid.length > 0) {
        await financeService.updateTransactionsStatus(transactionIdsToMarkPaid, 'PAID');
        await financeService.updateTransactionsDate(transactionIdsToMarkPaid, dueDate);
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
          description: `Fatura ${file?.name || 'importada'}`,
        };
        localStorage.setItem('last_import_batch', JSON.stringify(batchInfo));
      }

      // Registrar hash do CSV para evitar reimportação acidental
      if (currentCsvHash) {
        const storedHashes: Array<{ hash: string; fileName: string; importedAt: string }> =
          JSON.parse(localStorage.getItem('imported_csv_hashes') || '[]');
        storedHashes.unshift({ hash: currentCsvHash, fileName: file?.name || '', importedAt: new Date().toISOString() });
        localStorage.setItem('imported_csv_hashes', JSON.stringify(storedHashes.slice(0, 20)));
        setCurrentCsvHash(null);
      }

      // Salvar aliases automaticamente para itens com categoria/CC/participante preenchidos
      const aliasPromises: Promise<void>[] = [];
      reconciliation.items.forEach((item: any, index: number) => {
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

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const toggleSection = (section: 'MATCHED' | 'UNCERTAIN' | 'NEW') => {
    setSectionsOpen(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const matchedItems = reconciliation?.items.filter(i => i.status === 'MATCHED') || [];
  const uncertainItems = reconciliation?.items.filter(i => i.status === 'UNCERTAIN') || [];
  const newItems = reconciliation?.items.filter(i => i.status === 'NEW') || [];

  const localizedTotal = reconciliation?.items
    .filter((item: any, index: number) => item.status === 'UNCERTAIN' && selectedCandidates[index] !== 'NEW' && !ignoredItems[index])
    .reduce((acc: number, item: any) => acc + item.statementItem.value, 0) || 0;

  const newTotal = reconciliation?.items
    .filter((item: any, index: number) =>
      (item.status === 'NEW' && createdNews[index] !== false) ||
      (item.status === 'UNCERTAIN' && selectedCandidates[index] === 'NEW')
    )
    .reduce((acc: number, item: any) => acc + item.statementItem.value, 0) || 0;

  const matchedTotal = reconciliation?.items
    .filter((item: any, index: number) =>
      item.status === 'MATCHED' && selectedMatchedCandidates[index] !== 'NEW'
    )
    .reduce((acc: number, item: any) => acc + item.statementItem.value, 0) || 0;

  const conferredTotal = localizedTotal + newTotal + matchedTotal;
  // Para PDF: usar o total âncora extraído da fatura
  // Para CSV: fallback para soma dos valores absolutos de todos os itens
  const statementTotal = (() => {
    if (statement?.grandAnchorTotal && statement.grandAnchorTotal > 0) {
      return statement.grandAnchorTotal;
    }
    return reconciliation?.items?.reduce((acc: number, item: any) =>
      acc + Math.abs(item.statementItem.value), 0) || 0;
  })();
  const totalsMatch = Math.abs(conferredTotal - statementTotal) < 0.05;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
              <FileUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Importar Fatura de Cartão</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Extração inteligente de fatura bancária</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {/* Content body */}
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

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group relative"
              >
                <input 
                  type="file" 
                  accept="application/pdf,.csv" 
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-100 transition-all">
                    <FileUp className="w-8 h-8 text-slate-400 group-hover:text-blue-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-700">Arraste a fatura PDF aqui ou clique para selecionar</p>
                    <p className="text-sm text-slate-400">PDF original ou CSV exportado do app Itaú</p>
                  </div>
                </div>
              </div>

              {lastBatch && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-amber-800">Última importação: </span>
                    <span className="text-amber-700">{lastBatch.description} · {lastBatch.count} lançamentos · {new Date(lastBatch.date).toLocaleString('pt-BR')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleUndoImport}
                    disabled={undoing}
                    className="ml-4 shrink-0 px-3 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
                  >
                    {undoing ? 'Desfazendo...' : 'Desfazer'}
                  </button>
                </div>
              )}

              {file && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 truncate pr-4">
                    <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 shrink-0">
                      <FileUp className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-bold text-slate-800 truncate">{file.name}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setFile(null)} 
                    className="text-xs text-slate-500 hover:text-red-500 font-bold transition-colors"
                  >
                    Remover
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                  Conta do cartão <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedBankId}
                  onChange={(e) => setSelectedBankId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-700 font-medium focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-sm transition-all"
                >
                  <option value="">Selecione a conta/banco do cartão...</option>
                  {banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                  Carteira de pagamento <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedWalletId}
                  onChange={(e) => setSelectedWalletId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-700 font-medium focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-sm transition-all"
                >
                  <option value="">Selecione a carteira de pagamento...</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                  Data de vencimento da fatura <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-700 font-medium focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-sm transition-all"
                />
              </div>

              {duplicateWarning && (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex gap-3 text-sm text-amber-900 items-start">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Arquivo já importado anteriormente</p>
                    <p className="mt-1 text-amber-800">
                      O arquivo <strong>{duplicateWarning.fileName}</strong> foi importado em{' '}
                      {new Date(duplicateWarning.importedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.
                      Importar novamente pode criar lançamentos duplicados.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => setDuplicateWarning(null)}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleImportAnyway}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 transition-all"
                      >
                        Importar mesmo assim
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all border border-transparent"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleProcess}
                  disabled={!file || !selectedBankId || !selectedWalletId || !dueDate}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-blue-200"
                >
                  Processar fatura
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Processing */}
          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-6">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-800">Processando e interpretando o arquivo...</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto mt-2">
                  Por favor, aguarde alguns instantes enquanto analisamos as informações extraídas da fatura.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl py-3 px-6 text-sm text-slate-600 font-semibold shadow-inner">
                Progresso: {progressMsg}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 'review' && statement && reconciliation && (
            <div className="space-y-6">
              {statement.grandTotalsMatch === false && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-sm text-amber-800 items-start">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Atenção total divergente!</p>
                    <p>
                      A soma dos itens extraídos ({formatCurrency(statement.grandParsedTotal)}) não bate com o total impresso da fatura ({formatCurrency(statement.grandAnchorTotal)}). Revise os itens antes de confirmar.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs text-slate-500 uppercase font-black tracking-wider">Status da Importação</h4>
                  <p className="text-sm text-slate-700 font-bold mt-1">
                    {reconciliation.matchedCount} já lançados · {reconciliation.uncertainCount} incertos · {reconciliation.newCount} novos
                  </p>
                </div>
                {statement.grandTotalsMatch ? (
                  <span className="self-start md:self-auto bg-green-50 text-green-700 border border-green-200 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Total conferido: {formatCurrency(statement.grandParsedTotal)}
                  </span>
                ) : (
                  <span className="self-start md:self-auto bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Total divergente: {formatCurrency(statement.grandParsedTotal)} vs {formatCurrency(statement.grandAnchorTotal)}
                  </span>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4 mb-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Resumo da Fatura
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Total da fatura:</span>
                    <span className="font-semibold text-slate-800">
                      {statementTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  <div className="border-t border-slate-100 pt-2 space-y-1.5">
                    {matchedTotal > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-green-600 flex items-center gap-1">
                          <span>✅ Já lançados</span>
                          <span className="text-xs text-slate-400">
                            ({reconciliation.items.filter((item, index) =>
                              item.status === 'MATCHED' && selectedMatchedCandidates[index] !== 'NEW'
                            ).length} itens)
                          </span>
                        </span>
                        <span className="text-green-600 font-medium">
                          {matchedTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-amber-600 flex items-center gap-1">
                        <span>⚡ Localizados (baixa)</span>
                        <span className="text-xs text-slate-400">
                          ({reconciliation.items.filter((item, index) =>
                            item.status === 'UNCERTAIN' && selectedCandidates[index] !== 'NEW'
                          ).length} itens)
                        </span>
                      </span>
                      <span className="text-amber-600 font-medium">
                        {localizedTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-blue-600 flex items-center gap-1">
                        <span>🆕 Gastos a lançar</span>
                        <span className="text-xs text-slate-400">
                          ({reconciliation.items.filter((item, index) =>
                            (item.status === 'NEW' && createdNews[index] !== false) ||
                            (item.status === 'UNCERTAIN' && selectedCandidates[index] === 'NEW')
                          ).length} itens)
                        </span>
                      </span>
                      <span className="text-blue-600 font-medium">
                        {newTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                    <span className="text-sm font-semibold text-slate-700">Total conferido:</span>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm ${totalsMatch ? 'text-green-600' : 'text-red-500'}`}>
                        {conferredTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                      <span>{totalsMatch ? '✅' : '⚠️'}</span>
                    </div>
                  </div>
                  {!totalsMatch && (
                    <p className="text-xs text-red-500">
                      Diferença de {Math.abs(conferredTotal - statementTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} —
                      verifique se todos os itens estão sendo considerados.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm mb-3">
                <span className="font-medium text-slate-600 mr-2">Ações em massa:</span>
                <button
                  type="button"
                  onClick={() => {
                    const newNews: Record<number, boolean> = {};
                    reconciliation.items.forEach((item, index) => {
                      if (item.status === 'NEW') newNews[index] = true;
                    });
                    setCreatedNews(newNews);
                  }}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  ✓ Selecionar todos gastos
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => {
                    const newNews: Record<number, boolean> = {};
                    reconciliation.items.forEach((item, index) => {
                      if (item.status === 'NEW') newNews[index] = false;
                    });
                    setCreatedNews(newNews);
                  }}
                  className="text-slate-500 hover:text-slate-700 font-medium"
                >
                  ✗ Desmarcar todos gastos
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => {
                    const newIgnored: Record<number, boolean> = {};
                    reconciliation.items.forEach((item, index) => {
                      if (item.status === 'UNCERTAIN') newIgnored[index] = true;
                    });
                    setIgnoredItems(prev => ({ ...prev, ...newIgnored }));
                  }}
                  className="text-slate-500 hover:text-slate-700 font-medium"
                >
                  ⊘ Ignorar todos localizados
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => {
                    const newIgnored: Record<number, boolean> = {};
                    reconciliation.items.forEach((item, index) => {
                      if (item.status === 'UNCERTAIN') newIgnored[index] = false;
                    });
                    setIgnoredItems(prev => ({ ...prev, ...newIgnored }));
                  }}
                  className="text-amber-600 hover:text-amber-800 font-medium"
                >
                  ↩ Restaurar todos localizados
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => {
                    const newFuture: Record<number, boolean> = {};
                    reconciliation.items.forEach((item, index) => {
                      if (item.status === 'NEW' || item.status === 'UNCERTAIN') newFuture[index] = true;
                    });
                    setGenerateFutureInstallments(newFuture);
                  }}
                  className="text-green-600 hover:text-green-800 font-medium"
                >
                  + Gerar parcelas futuras em todos
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => {
                    const newFuture: Record<number, boolean> = {};
                    reconciliation.items.forEach((item, index) => {
                      if (item.status === 'NEW' || item.status === 'UNCERTAIN') newFuture[index] = false;
                    });
                    setGenerateFutureInstallments(newFuture);
                  }}
                  className="text-slate-500 hover:text-slate-700 font-medium"
                >
                  − Remover parcelas futuras de todos
                </button>
              </div>

              <div className="space-y-4">
                {/* MATCHED SECTION */}
                {matchedItems.length > 0 && (
                  <div className="border border-green-200 rounded-2xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleSection('MATCHED')}
                      className="w-full px-5 py-3.5 bg-green-50 hover:bg-green-100/70 border-b border-green-200 flex items-center justify-between text-left transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="bg-green-600 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center font-bold">
                          {matchedItems.length}
                        </span>
                        <h3 className="font-bold text-green-900 text-sm sm:text-base">✅ JÁ LANÇADOS (MATCHED)</h3>
                      </div>
                      {sectionsOpen.MATCHED ? (
                        <ChevronUp className="w-5 h-5 text-green-700" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-green-700" />
                      )}
                    </button>

                    {sectionsOpen.MATCHED && (
                      <div className="divide-y divide-slate-100 bg-white">
                        {reconciliation.items.map((item, idx) => {
                          if (item.status !== 'MATCHED') return null;
                          const selectedValue = selectedMatchedCandidates[idx] || 'NEW';

                          return (
                            <div key={idx} className="p-4 sm:p-5 space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-bold text-slate-800">
                                    {item.statementItem.rawDescription}
                                    {item.statementItem.installmentNumber && item.statementItem.installmentTotal && (
                                      <span className="text-slate-500 font-normal"> ({item.statementItem.installmentNumber}/{item.statementItem.installmentTotal})</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-slate-500 font-medium">{formatDate(item.statementItem.purchaseDate)}</p>
                                </div>
                                <p className="text-sm font-black text-slate-800 whitespace-nowrap">{formatCurrency(item.statementItem.value)}</p>
                              </div>

                              <div className="bg-green-50/40 border border-green-100 rounded-xl p-3 space-y-2">
                                <p className="text-[10px] uppercase font-black text-green-800 tracking-wider">Candidatos correspondentes encontrados no Contas a Pagar:</p>
                                <div className="space-y-2">
                                  {item.candidates.map((cand) => {
                                    const participantName = participants.find(p => p.id === cand.transaction.participantId)?.name;
                                    return (
                                      <label key={cand.transaction.id} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer p-1 rounded hover:bg-white transition-colors">
                                        <input
                                          type="radio"
                                          name={`matched-${idx}`}
                                          value={cand.transaction.id}
                                          checked={selectedValue === cand.transaction.id}
                                          onChange={() => {
                                            setSelectedMatchedCandidates(prev => ({
                                              ...prev,
                                              [idx]: cand.transaction.id
                                            }));
                                          }}
                                          className="text-blue-600 focus:ring-blue-600 w-3.5 h-3.5 mt-0.5"
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
                                      onChange={() => {
                                        setSelectedMatchedCandidates(prev => ({
                                          ...prev,
                                          [idx]: 'NEW'
                                        }));
                                      }}
                                      className="text-blue-600 focus:ring-blue-600 w-3.5 h-3.5 mt-0.5"
                                    />
                                    <span className="font-bold text-slate-800 -mt-0.5">Nenhum — criar novo lançamento</span>
                                  </label>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* UNCERTAIN SECTION */}
                {uncertainItems.length > 0 && (
                  <div className="border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleSection('UNCERTAIN')}
                      className="w-full px-5 py-3.5 bg-amber-50 hover:bg-amber-100/70 border-b border-amber-200 flex items-center justify-between text-left transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-600 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center font-bold">
                          {uncertainItems.length}
                        </span>
                        <h3 className="font-bold text-amber-900 text-sm sm:text-base">⚠️ LANÇAMENTOS CONTAS A PAGAR LOCALIZADOS</h3>
                      </div>
                      {sectionsOpen.UNCERTAIN ? (
                        <ChevronUp className="w-5 h-5 text-amber-700" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-amber-700" />
                      )}
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
                                  <p className="text-sm font-bold text-slate-800">
                                    {item.statementItem.rawDescription}
                                    {item.statementItem.installmentNumber && item.statementItem.installmentTotal && (
                                      <span className="text-slate-500 font-normal"> ({item.statementItem.installmentNumber}/{item.statementItem.installmentTotal})</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-slate-500 font-medium">{formatDate(item.statementItem.purchaseDate)}</p>
                                </div>
                                <p className="text-sm font-black text-slate-800 whitespace-nowrap">{formatCurrency(item.statementItem.value)}</p>
                              </div>

                              <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-3 space-y-2">
                                <p className="text-[10px] uppercase font-black text-amber-800 tracking-wider">Candidatos possíveis no Contas a Pagar:</p>
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
                                          className="text-blue-600 focus:ring-blue-600 w-3.5 h-3.5 mt-0.5"
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
                                      className="text-blue-600 focus:ring-blue-600 w-3.5 h-3.5 mt-0.5"
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
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <select
                                      value={itemCategories[idx] || ''}
                                      onChange={e => setItemCategories(prev => ({ ...prev, [idx]: e.target.value }))}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                                    >
                                      <option value="">Categoria (opcional)...</option>
                                      {categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                    </select>
                                    <select
                                      value={itemCostCenters[idx] || ''}
                                      onChange={e => setItemCostCenters(prev => ({ ...prev, [idx]: e.target.value }))}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-blue-600"
                                    >
                                      <option value="">Centro de Custo (opcional)...</option>
                                      {costCenters.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="mt-1">
                                    <ParticipantAutocomplete
                                      participants={localParticipants}
                                      selectedParticipantId={itemParticipants[idx] || ''}
                                      onSelect={(id) => setItemParticipants(prev => ({ ...prev, [idx]: id }))}
                                      onAddParticipant={async (name) => {
                                        const newP = await financeService.saveRegistryItem<Participant>('participants', { id: '', name, active: true });
                                        setLocalParticipants(prev => [...prev, newP]);
                                        return newP;
                                      }}
                                      placeholder="Participante (opcional)..."
                                    />
                                  </div>
                                  {item.statementItem.installmentNumber !== undefined &&
                                   item.statementItem.installmentTotal !== undefined &&
                                   item.statementItem.installmentTotal > item.statementItem.installmentNumber && (
                                    <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none bg-slate-50 border border-slate-150 p-2.5 rounded-xl">
                                      <input
                                        type="checkbox"
                                        checked={generateFutureInstallments[idx] ?? true}
                                        onChange={e => setGenerateFutureInstallments(prev => ({ ...prev, [idx]: e.target.checked }))}
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-600 w-4 h-4"
                                      />
                                      <span className="text-xs leading-tight">
                                        Gerar automaticamente as{' '}
                                        <strong>{item.statementItem.installmentTotal - item.statementItem.installmentNumber}</strong>{' '}
                                        parcelas restantes (
                                        <strong>{item.statementItem.installmentNumber + 1}/{item.statementItem.installmentTotal}</strong>
                                        {' '}até{' '}
                                        <strong>{item.statementItem.installmentTotal}/{item.statementItem.installmentTotal}</strong>)
                                      </span>
                                    </label>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* NEW SECTION */}
                {newItems.length > 0 && (
                  <div className="border border-blue-200 rounded-2xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleSection('NEW')}
                      className="w-full px-5 py-3.5 bg-blue-50 hover:bg-blue-100/70 border-b border-blue-200 flex items-center justify-between text-left transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-600 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center font-bold">
                          {newItems.length}
                        </span>
                        <h3 className="font-bold text-blue-900 text-sm sm:text-base">🆕 GASTOS A SEREM LANÇADOS</h3>
                      </div>
                      {sectionsOpen.NEW ? (
                        <ChevronUp className="w-5 h-5 text-blue-700" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-blue-700" />
                      )}
                    </button>

                    {sectionsOpen.NEW && (
                      <div className="divide-y divide-slate-100 bg-white">
                        {reconciliation.items.map((item, idx) => {
                          if (item.status !== 'NEW') return null;
                          const isCreated = createdNews[idx] ?? true;
                          const itemCat = itemCategories[idx] || '';
                          const itemCC = itemCostCenters[idx] || '';

                          return (
                            <div key={idx} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-bold text-slate-800 truncate max-w-[240px] sm:max-w-md">{item.statementItem.rawDescription}</p>
                                      {item.statementItem.isRefund && (
                                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full ml-2">
                                          Crédito/Desconto
                                        </span>
                                      )}
                                      {item.statementItem.installmentNumber && (
                                        <span className="bg-blue-150 text-blue-800 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                                          Parcela {item.statementItem.installmentNumber}/{item.statementItem.installmentTotal ?? '?'}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium">{formatDate(item.statementItem.purchaseDate)}</p>
                                  </div>
                                  <p className="text-sm font-black text-slate-800 whitespace-nowrap">{formatCurrency(item.statementItem.value)}</p>
                                </div>

                                {isCreated && (
                                  <>
                                    <input
                                      type="text"
                                      placeholder="Descrição (opcional)..."
                                      value={itemDescriptions[idx] !== undefined ? itemDescriptions[idx] : item.statementItem.rawDescription || ''}
                                      onChange={e => setItemDescriptions(prev => ({ ...prev, [idx]: e.target.value }))}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                                    />
                                    <div className="grid grid-cols-2 gap-2 pt-1">
                                      <select
                                        value={itemCat}
                                        onChange={(e) => {
                                          setItemCategories(prev => ({
                                            ...prev,
                                            [idx]: e.target.value
                                          }));
                                        }}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                                      >
                                        <option value="">Categoria (opcional)...</option>
                                        {categories.map((cat) => (
                                          <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        value={itemCC}
                                        onChange={(e) => {
                                          setItemCostCenters(prev => ({
                                            ...prev,
                                            [idx]: e.target.value
                                          }));
                                        }}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-blue-600"
                                      >
                                        <option value="">Centro de Custo (opcional)...</option>
                                        {costCenters.map((cc) => (
                                          <option key={cc.id} value={cc.id}>
                                            {cc.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="mt-1">
                                      <ParticipantAutocomplete
                                        participants={participants}
                                        selectedParticipantId={itemParticipants[idx] || ''}
                                        onSelect={(id) => setItemParticipants(prev => ({ ...prev, [idx]: id }))}
                                        onAddParticipant={async (name) => {
                                          const newP = await financeService.saveRegistryItem<Participant>('participants', { id: '', name, active: true });
                                          return newP;
                                        }}
                                        placeholder="Participante (opcional)..."
                                      />
                                    </div>
                                    {item.statementItem.installmentTotal !== undefined &&
                                     item.statementItem.installmentNumber !== undefined &&
                                     item.statementItem.installmentTotal > item.statementItem.installmentNumber && (
                                      <label className="flex items-center gap-2 cursor-pointer mt-2 text-slate-600 select-none bg-slate-50 border border-slate-150 p-2.5 rounded-xl">
                                        <input
                                          type="checkbox"
                                          checked={generateFutureInstallments[idx] ?? true}
                                          onChange={(e) => setGenerateFutureInstallments(prev => ({
                                            ...prev,
                                            [idx]: e.target.checked
                                          }))}
                                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-600 w-4 h-4"
                                        />
                                        <span className="text-xs leading-tight">
                                          Gerar automaticamente as{' '}
                                          <strong>{item.statementItem.installmentTotal - item.statementItem.installmentNumber}</strong>{' '}
                                          parcelas restantes (
                                          <strong>{item.statementItem.installmentNumber + 1}/{item.statementItem.installmentTotal}</strong>
                                          {' '}até{' '}
                                          <strong>{item.statementItem.installmentTotal}/{item.statementItem.installmentTotal}</strong>)
                                        </span>
                                      </label>
                                    )}
                                  </>
                                )}
                              </div>

                              <div className="flex items-center shrink-0 self-end sm:self-auto">
                                <label className="flex items-center gap-2 cursor-pointer p-1">
                                  <input
                                    type="checkbox"
                                    checked={isCreated}
                                    onChange={(e) => {
                                      setCreatedNews(prev => ({
                                        ...prev,
                                        [idx]: e.target.checked
                                      }));
                                    }}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600 w-4 h-4"
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

              {/* Action Buttons footer */}
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
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-blue-200"
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
