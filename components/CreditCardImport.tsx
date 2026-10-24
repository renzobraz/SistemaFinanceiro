import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
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
  AlertTriangle,
  Search
} from 'lucide-react';
import { financeService } from '../services/financeService';
import { extractStatementAnchors, extractStatementWithAI, extractStatementWithGemini, reconcileStatement, parseFaturaXlsxRows } from '../services/cardStatementService';
import { reconcileStatementWithPayables } from '../services/reconciliationService';
import type { CardStatement, CardStatementItem, ReconciliationResult, MerchantAlias, Bank, Category, CostCenter, Wallet, Transaction, Participant, CandidateMatch } from '../types';

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
  preSelectedBankId?: string;
  preSelectedWalletId?: string;
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
  preSelectedBankId,
  preSelectedWalletId,
}) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  // Se a tela já foi aberta com uma conta/carteira em contexto (filtro ativo na
  // tela de Contas a Pagar), já vem selecionado — evita reescolher toda vez.
  const [selectedBankId, setSelectedBankId] = useState<string>(() => {
    if (preSelectedBankId && preSelectedBankId !== 'ALL' && banks.some(b => b.id === preSelectedBankId)) {
      return preSelectedBankId;
    }
    return '';
  });
  const [selectedWalletId, setSelectedWalletId] = useState<string>(() => {
    if (preSelectedWalletId && preSelectedWalletId !== 'ALL' && wallets.some(w => w.id === preSelectedWalletId)) {
      return preSelectedWalletId;
    }
    return '';
  });
  // Vencimento agora é opcional antes de processar: é preenchido automaticamente
  // com a data extraída do arquivo (ver finishParsing) assim que ele é lido. O
  // usuário ainda pode digitar antes (ex. CSV, que não traz vencimento) ou corrigir
  // depois, na tela de revisão.
  const [dueDate, setDueDate] = useState<string>('');
  
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [statement, setStatement] = useState<CardStatement | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  // Guardado para sugerir categoria/centro de custo pelo participante escolhido
  // (ver suggestFromParticipant) — os aliases já são carregados em finishParsing.
  const [merchantAliases, setMerchantAliases] = useState<MerchantAlias[]>([]);

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
  const [currentCsvHash, setCurrentCsvHash] = useState<string | null>(null);
  const bypassDuplicateCheck = useRef(false);

  // Todos os lançamentos PENDING da conta, para a busca manual no Contas a Pagar —
  // diferente dos `candidates` calculados automaticamente por item, aqui o usuário
  // pode escolher qualquer lançamento pendente, caso a sugestão automática esteja
  // errada ou o candidato correto não tenha aparecido na lista.
  const [allPendingTxs, setAllPendingTxs] = useState<Transaction[]>([]);
  const [manualSearchOpen, setManualSearchOpen] = useState<Record<number, boolean>>({});
  const [manualSearchQuery, setManualSearchQuery] = useState<Record<number, string>>({});

  useEffect(() => {
    setLocalParticipants(participants);
  }, [participants]);

  useEffect(() => {
    // Lê histórico novo; faz fallback para formato legado (last_import_batch)
    const history = localStorage.getItem('import_batch_history');
    if (history) {
      try { setBatchHistory(JSON.parse(history)); } catch {}
    } else {
      const legacy = localStorage.getItem('last_import_batch');
      if (legacy) {
        try {
          const parsed = JSON.parse(legacy);
          setBatchHistory([parsed]);
        } catch {}
      }
    }
  }, []);

  const handleUndoImport = async (batch: { id: string; description: string; count: number }) => {
    if (!confirm(`Desfazer a importação "${batch.description}" com ${batch.count} lançamentos?`)) return;
    setUndoingId(batch.id);
    try {
      await financeService.deleteImportBatch(batch.id);
      const updated = batchHistory.filter(b => b.id !== batch.id);
      setBatchHistory(updated);
      localStorage.setItem('import_batch_history', JSON.stringify(updated));
      localStorage.removeItem('last_import_batch');
      if (updated.length === 0) onSuccess();
    } catch (e: any) {
      setError('Erro ao desfazer importação: ' + (e.message || ''));
    } finally {
      setUndoingId(null);
    }
  };
  const [generateFutureInstallments, setGenerateFutureInstallments] = useState<Record<number, boolean>>({});

  const [sectionsOpen, setSectionsOpen] = useState({
    MATCHED: false,
    UNCERTAIN: true,
    NEW: true,
  });

  const isSupportedStatementFile = (f: File) =>
    f.type === 'application/pdf' || f.name.endsWith('.csv') || f.name.endsWith('.xlsx');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (isSupportedStatementFile(selectedFile)) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Por favor, selecione apenas arquivos PDF, CSV ou XLSX.');
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
      if (isSupportedStatementFile(selectedFile)) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Por favor, selecione apenas arquivos PDF, CSV ou XLSX.');
      }
    }
  };

  const handleImportAnyway = () => {
    bypassDuplicateCheck.current = true;
    setDuplicateWarning(null);
    handleProcess();
  };

  // Concilia o extrato já parseado com Contas a Pagar e monta o estado inicial da
  // revisão. Compartilhado pelas três vias de importação (PDF, CSV e XLSX).
  const finishParsing = async (parsedStatement: CardStatement) => {
    setProgressMsg('Conciliando com Contas a Pagar...');

    // Vencimento: se o usuário não digitou nada antes de processar, usa o que foi
    // extraído do próprio arquivo (PDF traz isso nas âncoras; CSV não traz nada,
    // então o campo fica vazio e o usuário preenche na tela de revisão).
    const effectiveDueDate = dueDate || parsedStatement.metadata.dueDate || '';
    if (!dueDate && parsedStatement.metadata.dueDate) {
      setDueDate(parsedStatement.metadata.dueDate);
    }

    const aliases: MerchantAlias[] = await financeService.getMerchantAliases();
    setMerchantAliases(aliases);

    // Janela de busca de lançamentos já PAGOS para checar duplicidade (reimportação parcial
    // ou repetida da mesma fatura): cobre desde a compra mais antiga do extrato até a data de
    // vencimento, pois os itens "Gastos a Lançar" são salvos com data = vencimento, não a data
    // de compra.
    const itemDates = parsedStatement.cards.flatMap(c => c.items.map(i => i.purchaseDate)).filter(Boolean).sort();
    const periodStart = itemDates[0];
    const periodEnd = [itemDates[itemDates.length - 1], effectiveDueDate].filter(Boolean).sort().slice(-1)[0];

    const reconResult = await reconcileStatementWithPayables(
      parsedStatement,
      selectedBankId,
      aliases,
      async (bankId) => {
        const pending = await financeService.getTransactions({ bankId, status: 'PENDING' });
        // Guarda a lista completa para a busca manual na revisão — não só os
        // candidatos que o algoritmo de conciliação escolheu automaticamente.
        setAllPendingTxs(pending);
        return pending;
      },
      // Fatura de cartão costuma ser confirmada em etapas (meia fatura hoje, resto depois) —
      // checa também contra o que já está pago para não duplicar quem já foi importado.
      (bankId) => financeService.getTransactions({ bankId, status: 'PAID', startDate: periodStart, endDate: periodEnd })
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

    // Participantes não são mais compartilhados entre carteiras: o Merchant Alias
    // pode ter sido ensinado em outra carteira, então a sugestão de participante
    // é resolvida pelo NOME dele dentro da carteira sendo importada agora (criando
    // o cadastro aqui se ainda não existir), em vez de reusar o id de origem.
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
        // candidates já vem ordenado priorizando a parcela exata (ver findCandidates
        // em reconciliationService.ts), então o primeiro é o melhor palpite.
        initialCandidates[index] = item.candidates?.[0]?.transaction?.id || 'NEW';
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
    setGenerateFutureInstallments(initialGenerateFuture);

    setStep('review');
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
          await finishParsing(parsedStatement);
          return;
        } else {
          const errData = await regexRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Erro ao processar CSV');
        }
      }

      // Se for XLSX, ler a planilha já estruturada e pular direto para a
      // conciliação, sem precisar de OCR/IA (mesmo espírito do caminho CSV).
      if (file.name.endsWith('.xlsx')) {
        const base64 = await fileToBase64(file);

        if (!bypassDuplicateCheck.current) {
          const fileHash = hashCsv(base64);
          const storedHashes: Array<{ hash: string; fileName: string; importedAt: string }> =
            JSON.parse(localStorage.getItem('imported_csv_hashes') || '[]');
          const existing = storedHashes.find(h => h.hash === fileHash);
          if (existing) {
            setDuplicateWarning(existing);
            return;
          }
          setCurrentCsvHash(fileHash);
        }
        bypassDuplicateCheck.current = false;

        setStep('processing');
        setProgressMsg('Lendo planilha...');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

        const parsedStatement = parseFaturaXlsxRows(rows);

        await finishParsing(parsedStatement);
        return;
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
            merchantCategory: l.categoria,
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
      await finishParsing(parsedStatement);
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
    if (!dueDate) {
      setError('Informe a data de vencimento da fatura antes de confirmar.');
      return;
    }

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
            pushFutureInstallments();
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
        const updated = [batchInfo, ...batchHistory].slice(0, 5);
        setBatchHistory(updated);
        localStorage.setItem('import_batch_history', JSON.stringify(updated));
        localStorage.removeItem('last_import_batch');
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

  // Quando o usuário escolhe um lançamento pela busca manual (não pelos candidatos
  // automáticos), o id selecionado não existe em `item.candidates` — isso identifica
  // esse caso para mostrar um resumo de quem foi escolhido, já que nenhum dos radios
  // dos candidatos vai aparecer marcado.
  const getManualSelection = (selectedId: string | undefined, candidates: CandidateMatch[]): Transaction | undefined => {
    if (!selectedId || selectedId === 'NEW' || selectedId === 'IGNORE') return undefined;
    if (candidates.some(c => c.transaction.id === selectedId)) return undefined;
    return allPendingTxs.find(tx => tx.id === selectedId);
  };

  // Campo de busca livre em TODOS os lançamentos PENDING da conta — não só os
  // candidatos que o algoritmo de conciliação sugeriu. Resolve o caso em que a
  // sugestão automática bate por coincidência (mesmo valor, texto parecido) mas é
  // de um estabelecimento totalmente diferente do item da fatura.
  const renderManualSearch = (idx: number, onSelect: (txId: string) => void) => {
    const isOpen = manualSearchOpen[idx] ?? false;
    const query = manualSearchQuery[idx] || '';
    const normalizedQuery = query.trim().toLowerCase();
    const results = normalizedQuery.length >= 2
      ? allPendingTxs.filter(tx => tx.description.toLowerCase().includes(normalizedQuery)).slice(0, 8)
      : [];

    return (
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setManualSearchOpen(prev => ({ ...prev, [idx]: !isOpen }))}
          className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
        >
          <Search className="w-3.5 h-3.5" />
          {isOpen ? 'Fechar busca' : 'Buscar outro lançamento no Contas a Pagar'}
        </button>

        {isOpen && (
          <div className="mt-2 space-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-2">
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setManualSearchQuery(prev => ({ ...prev, [idx]: e.target.value }))}
              placeholder="Digite parte da descrição do lançamento..."
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            />
            {normalizedQuery.length > 0 && normalizedQuery.length < 2 && (
              <p className="text-[10px] text-slate-400 px-1">Digite ao menos 2 caracteres...</p>
            )}
            {normalizedQuery.length >= 2 && results.length === 0 && (
              <p className="text-[10px] text-slate-400 px-1">Nenhum lançamento pendente encontrado com esse termo.</p>
            )}
            {results.map(tx => {
              const participantName = participants.find(p => p.id === tx.participantId)?.name;
              return (
                <button
                  type="button"
                  key={tx.id}
                  onClick={() => {
                    onSelect(tx.id);
                    setManualSearchOpen(prev => ({ ...prev, [idx]: false }));
                    setManualSearchQuery(prev => ({ ...prev, [idx]: '' }));
                  }}
                  className="w-full text-left flex items-start gap-2 text-xs text-slate-700 p-1.5 rounded-lg hover:bg-white border border-transparent hover:border-blue-200 transition-colors"
                >
                  <div>
                    <p className="font-bold text-slate-800">
                      {tx.description}
                      {participantName && <span className="text-slate-500 font-normal"> · Participante: {participantName}</span>}
                    </p>
                    <p className="text-[10px] text-slate-500">{formatDate(tx.date)} · {formatCurrency(tx.value)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Sugere categoria/centro de custo a partir do histórico de Merchant Alias desse
  // participante: olha todos os aliases que já apontam para ele e pega a categoria/CC
  // mais usada entre eles. É uma aproximação de "como eu costumo lançar para esse
  // participante", sem precisar de uma consulta nova ao histórico de transações.
  const suggestFromParticipant = (participantId: string): { categoryId?: string; costCenterId?: string } => {
    const relevant = merchantAliases.filter(a => a.defaultParticipantId === participantId);
    const mostCommon = (values: (string | null | undefined)[]): string | undefined => {
      const counts = new Map<string, number>();
      for (const v of values) {
        if (!v) continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
      let best: string | undefined;
      let bestCount = 0;
      for (const [v, count] of counts) {
        if (count > bestCount) { best = v; bestCount = count; }
      }
      return best;
    };
    return {
      categoryId: mostCommon(relevant.map(a => a.defaultCategoryId)),
      costCenterId: mostCommon(relevant.map(a => a.defaultCostCenterId)),
    };
  };

  // Cabeçalho comum aos três status (MATCHED/UNCERTAIN/NEW): descrição, badges de
  // parcela/estorno, categoria impressa na fatura (quando disponível) e data à
  // esquerda; valor em destaque à direita.
  const renderItemHeader = (item: ReconciliationResult['items'][number]) => (
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="flex items-center flex-wrap gap-2">
          <p className="text-sm font-bold text-slate-800">{item.statementItem.rawDescription}</p>
          {item.statementItem.isRefund && (
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              Crédito/Desconto
            </span>
          )}
          {item.statementItem.installmentNumber && (
            <span className="bg-blue-150 text-blue-800 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
              Parcela {item.statementItem.installmentNumber}/{item.statementItem.installmentTotal ?? '?'}
            </span>
          )}
          {item.statementItem.merchantCategory && (
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
              {item.statementItem.merchantCategory}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 font-medium mt-0.5">{formatDate(item.statementItem.purchaseDate)}</p>
      </div>
      <p className="text-sm font-black text-slate-800 whitespace-nowrap">{formatCurrency(item.statementItem.value)}</p>
    </div>
  );

  // Painel de edição para "criar novo lançamento": descrição, categoria, centro de
  // custo, participante (sugerindo categoria/CC ao escolher) e, quando a fatura trouxer
  // parcela, a opção de gerar automaticamente as parcelas futuras. Usado pelas três
  // seções (NEW sempre, MATCHED/UNCERTAIN quando a opção "criar novo" é escolhida).
  const renderEntryFields = (idx: number, item: ReconciliationResult['items'][number]) => (
    <div className="space-y-2">
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
          onSelect={(id) => {
            setItemParticipants(prev => ({ ...prev, [idx]: id }));
            const suggestion = suggestFromParticipant(id);
            if (suggestion.categoryId && !itemCategories[idx]) {
              setItemCategories(prev => ({ ...prev, [idx]: suggestion.categoryId! }));
            }
            if (suggestion.costCenterId && !itemCostCenters[idx]) {
              setItemCostCenters(prev => ({ ...prev, [idx]: suggestion.costCenterId! }));
            }
          }}
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
  );

  // Seletor compacto do candidato (MATCHED/UNCERTAIN): mostra a melhor sugestão já
  // escolhida (candidates já vem ordenado priorizando a parcela exata), com opção de
  // trocar por outro candidato, tratar como novo ou (só UNCERTAIN) ignorar. Substitui
  // a lista grande de radio buttons por um <select>, no mesmo espírito compacto do
  // GASTOS A LANÇAR.
  const renderCandidateSelector = (
    idx: number,
    item: ReconciliationResult['items'][number],
    selectedValue: string,
    onChange: (value: string) => void,
    allowIgnore: boolean
  ) => {
    const selectedCandidate = item.candidates.find(c => c.transaction.id === selectedValue);
    const selectedParticipantName = selectedCandidate
      ? participants.find(p => p.id === selectedCandidate.transaction.participantId)?.name
      : undefined;
    // Se a seleção veio da busca manual, o id não está em item.candidates — precisa de
    // uma option própria no <select>, senão o navegador mostra nada selecionado.
    const manualSelection = getManualSelection(selectedValue, item.candidates);

    return (
      <div className="space-y-1.5">
        <select
          value={selectedValue}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        >
          {item.candidates.map(cand => (
            <option key={cand.transaction.id} value={cand.transaction.id}>
              ✅ {cand.transaction.description} · {formatDate(cand.transaction.date)} · {formatCurrency(cand.transaction.value)}
            </option>
          ))}
          {manualSelection && (
            <option value={manualSelection.id}>
              🔍 {manualSelection.description} · {formatDate(manualSelection.date)} · {formatCurrency(manualSelection.value)}
            </option>
          )}
          <option value="NEW">🆕 Nenhum — criar novo lançamento</option>
          {allowIgnore && <option value="IGNORE">🚫 Não lançar (ignorar este item)</option>}
        </select>

        {selectedCandidate && (
          <p className="text-[10px] text-slate-500 px-0.5">
            {selectedCandidate.reason}
            {selectedParticipantName && ` · Participante: ${selectedParticipantName}`}
          </p>
        )}

        {renderManualSearch(idx, onChange)}
      </div>
    );
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
                  accept="application/pdf,.csv,.xlsx"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-100 transition-all">
                    <FileUp className="w-8 h-8 text-slate-400 group-hover:text-blue-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-700">Arraste a fatura PDF aqui ou clique para selecionar</p>
                    <p className="text-sm text-slate-400">PDF original, CSV ou XLSX exportado do app Itaú</p>
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
                  Data de vencimento da fatura
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  placeholder="Detectado automaticamente a partir do arquivo"
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-700 font-medium focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-sm transition-all"
                />
                <p className="text-[11px] text-slate-400">
                  Opcional: se vazio, é preenchido com o vencimento detectado no arquivo (PDF). CSV não traz essa informação — nesse caso, preencha aqui ou na revisão.
                </p>
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
                  disabled={!file || !selectedBankId || !selectedWalletId}
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
                <div className="flex items-center justify-between gap-3 pb-3 mb-2 border-b border-slate-100">
                  <label htmlFor="review-due-date" className="text-sm text-slate-600 shrink-0">
                    Vencimento{!dueDate && <span className="text-red-500"> *</span>}:
                  </label>
                  <input
                    id="review-due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={`bg-white border rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-600 ${!dueDate ? 'border-red-300' : 'border-slate-300 focus:border-blue-600'}`}
                  />
                </div>
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
                      if (item.status === 'NEW' || item.status === 'UNCERTAIN' || item.status === 'MATCHED') newFuture[index] = true;
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
                      if (item.status === 'NEW' || item.status === 'UNCERTAIN' || item.status === 'MATCHED') newFuture[index] = false;
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
                              {renderItemHeader(item)}

                              {renderCandidateSelector(
                                idx,
                                item,
                                selectedValue,
                                (value) => setSelectedMatchedCandidates(prev => ({ ...prev, [idx]: value })),
                                false
                              )}

                              {selectedValue === 'NEW' && renderEntryFields(idx, item)}
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
                          const selectedValue = ignoredItems[idx] ? 'IGNORE' : (selectedCandidates[idx] || 'NEW');
                          const handleChange = (value: string) => {
                            setIgnoredItems(prev => ({ ...prev, [idx]: value === 'IGNORE' }));
                            setSelectedCandidates(prev => ({ ...prev, [idx]: value === 'IGNORE' ? '' : value }));
                          };

                          return (
                            <div key={idx} className="p-4 sm:p-5 space-y-3">
                              {renderItemHeader(item)}

                              {renderCandidateSelector(idx, item, selectedValue, handleChange, true)}

                              {selectedValue === 'NEW' && renderEntryFields(idx, item)}
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

                          return (
                            <div key={idx} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                {renderItemHeader(item)}
                                {isCreated && renderEntryFields(idx, item)}
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
                  disabled={!dueDate}
                  title={!dueDate ? 'Informe a data de vencimento antes de confirmar' : undefined}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-blue-200"
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
