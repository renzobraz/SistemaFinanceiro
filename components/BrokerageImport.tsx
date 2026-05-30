
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileUp, 
  Loader2, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  ArrowRight, 
  TrendingUp, 
  TrendingDown,
  Info,
  Save,
  Trash2,
  Plus,
  ClipboardList
} from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { financeService } from '../services/financeService';
import { 
  BrokerageNote, 
  BrokerageTrade, 
  Bank, 
  Participant, 
  Category, 
  Wallet, 
  CostCenter,
  Transaction,
  Currency
} from '../types';

interface BrokerageImportProps {
  onClose: () => void;
  onSuccess: () => void;
  banks: Bank[];
  wallets: Wallet[];
  categories: Category[];
  participants: Participant[];
  costCenters: CostCenter[];
  preSelectedBankId?: string;
  preSelectedWalletId?: string;
}

const findParticipantByPartialMatch = (ticker: string, assetName: string, list: Participant[]) => {
  if (!ticker && !assetName) return null;
  
  const cleanTicker = (ticker || '').trim().toUpperCase();
  const cleanName = (assetName || '').trim().toUpperCase();
  
  // 1. Match exato pelo ticker
  if (cleanTicker) {
    const exactTicker = list.find(p => p.ticker && p.ticker.toUpperCase() === cleanTicker);
    if (exactTicker) return exactTicker;
  }
  
  // 2. Match exato pelo sinacor_name
  if (cleanName || cleanTicker) {
    const exactSinacor = list.find(p => {
      if (!p.sinacorName) return false;
      const pSinacorUpper = p.sinacorName.trim().toUpperCase();
      return (cleanName && pSinacorUpper === cleanName) || (cleanTicker && pSinacorUpper === cleanTicker);
    });
    if (exactSinacor) return exactSinacor;
  }
  
  // 3. Match exato por nome do participante
  if (cleanName) {
    const exactName = list.find(p => p.name && p.name.toUpperCase() === cleanName);
    if (exactName) return exactName;
  }

  // 4. Match parcial / inteligente
  const getTickerRoot = (t: string) => {
    const m = t.match(/[A-Z]{4}/i);
    return m ? m[0].toUpperCase() : '';
  };

  const parsedTickerRoot = cleanTicker ? getTickerRoot(cleanTicker) : '';
  const parsedNameRoot = cleanName ? getTickerRoot(cleanName) : '';

  if (parsedTickerRoot || parsedNameRoot) {
    const rootToSearch = parsedTickerRoot || parsedNameRoot;
    
    for (const p of list) {
      if (!p.ticker) continue;
      const pTickerUpper = p.ticker.toUpperCase();
      const pTickerRoot = getTickerRoot(pTickerUpper);

      if (pTickerRoot && rootToSearch && pTickerRoot === rootToSearch) {
        return p;
      }
      
      if (pTickerUpper.length >= 4 && (cleanName.includes(pTickerUpper) || cleanTicker.includes(pTickerUpper))) {
        return p;
      }
    }
  }

  // 5. Fallback de busca parcial mais genérico
  for (const p of list) {
    if (!p.ticker) continue;
    const pTickerUpper = p.ticker.toUpperCase();
    const pNameUpper = p.name ? p.name.toUpperCase() : '';

    const words = cleanName.split(/[\s-]+/).filter(w => w.length >= 4 && w !== 'FUNDO' && w !== 'INVESTIMENTO' && w !== 'INVESTIMENTOS' && w !== 'IMOBILIARIO');
    for (const word of words) {
      if (pNameUpper.includes(word) || pTickerUpper.includes(word)) {
        return p;
      }
    }
  }
  
  return null;
};

export const BrokerageImport: React.FC<BrokerageImportProps> = ({
  onClose,
  onSuccess,
  banks,
  wallets,
  categories,
  participants,
  costCenters,
  preSelectedBankId,
  preSelectedWalletId
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingApi, setProcessingApi] = useState<'gemini' | 'claude' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsedNote, setParsedNote] = useState<BrokerageNote | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  
  // Settings for import
  const [selectedBankId, setSelectedBankId] = useState(() => {
    if (preSelectedBankId && preSelectedBankId !== 'ALL') {
      const exists = banks.some(b => b.id === preSelectedBankId);
      if (exists) return preSelectedBankId;
    }
    return banks[0]?.id || '';
  });
  
  const [selectedWalletId, setSelectedWalletId] = useState(() => {
    if (preSelectedWalletId && preSelectedWalletId !== 'ALL') {
      const exists = wallets.some(w => w.id === preSelectedWalletId);
      if (exists) return preSelectedWalletId;
    }
    return wallets[0]?.id || '';
  });
  
  const [selectedCostCenterId, setSelectedCostCenterId] = useState(() => {
    const invCc = costCenters.find(c => c.name.toLowerCase() === 'investimentos' || c.name.toLowerCase().includes('investimento'));
    return invCc?.id || costCenters[0]?.id || '';
  });
  
  const [investmentCategoryId, setInvestmentCategoryId] = useState(() => {
    const defaultCat = categories.find(c => c.name.toLowerCase() === 'compra/venda de ativos' || c.name.toLowerCase().includes('compra/venda'));
    if (defaultCat) return defaultCat.id;
    const inv = categories.find(c => c.name.toLowerCase().includes('investimento'));
    return inv?.id || categories[0]?.id || '';
  });

  // Date and Doc overrides
  const [tradeDate, setTradeDate] = useState('');
  const [settlementDate, setSettlementDate] = useState('');
  const [noteNumber, setNoteNumber] = useState('');

  // Helpers for interactive ticker review
  const registeredTickers = useMemo(() => {
    const list = participants
      .map(p => p.ticker)
      .filter((t): t is string => !!t);
    return Array.from(new Set(list)).sort();
  }, [participants]);

  const isTradeTickerValid = (ticker: string) => {
    if (!ticker) return false;
    const cleanT = ticker.trim().toUpperCase();
    return participants.some(p => {
      const matchTicker = p.ticker && p.ticker.toUpperCase() === cleanT;
      const matchSinacor = p.sinacorName && p.sinacorName.toUpperCase() === cleanT;
      return matchTicker || matchSinacor;
    });
  };

  const handleUpdateTradeTicker = (index: number, newTicker: string) => {
    if (!parsedNote) return;
    const updatedTrades = [...(parsedNote.trades || [])];
    updatedTrades[index] = {
      ...updatedTrades[index],
      ticker: newTicker.trim().toUpperCase()
    };
    setParsedNote({
      ...parsedNote,
      trades: updatedTrades
    });
  };

  const hasInvalidTickers = useMemo(() => {
    return parsedNote?.trades?.some(t => !isTradeTickerValid(t.ticker)) ?? false;
  }, [parsedNote, participants]);

  // States for unregistered assets modal
  const [showUnregisteredModal, setShowUnregisteredModal] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [importActionToExecute, setImportActionToExecute] = useState<'pure' | 'replace' | 'merge' | null>(null);
  const [registeredAssets, setRegisteredAssets] = useState<Record<string, { name: string; category: string }>>({});
  const [skippedAssets, setSkippedAssets] = useState<Set<string>>(new Set());
  const [quickFormInputs, setQuickFormInputs] = useState<Record<string, { name: string; category: string }>>({});

  const modalMissingTickers = React.useMemo(() => {
    if (!parsedNote) return [];
    return Array.from(new Set(
      (parsedNote.trades || [])
        .filter(t => t.ticker && !findParticipantByPartialMatch(t.ticker, t.assetName, participants) && !registeredAssets[t.ticker])
        .map(t => t.ticker)
    ));
  }, [parsedNote, participants, registeredAssets]);

  useEffect(() => {
    if (!parsedNote) {
      setShowUnregisteredModal(false);
      setIsRegisterMode(false);
      setImportActionToExecute(null);
      setRegisteredAssets({});
      setSkippedAssets(new Set());
      setQuickFormInputs({});
    } else {
      const missing = (parsedNote.trades || [])
        .filter(t => t.ticker && !findParticipantByPartialMatch(t.ticker, t.assetName, participants))
        .map(t => t.ticker)
        .filter((v, i, a) => a.indexOf(v) === i);
      
      const inputs: Record<string, { name: string; category: string }> = {};
      missing.forEach(ticker => {
        const trade = parsedNote.trades.find(t => t.ticker === ticker);
        const name = trade?.assetName || ticker;
        const isFII = name.toLowerCase().includes('fii') || ticker.endsWith('11');
        const category = isFII ? 'FII' : 'Ação';
        inputs[ticker] = { name, category };
      });
      setQuickFormInputs(inputs);
    }
  }, [parsedNote, participants]);

  // Auto-audit logic
  const auditResult = React.useMemo(() => {
    if (!parsedNote) return null;

    const totalSales = parsedNote.trades
      .filter(t => t.type === 'SELL')
      .reduce((sum, t) => sum + (t.total || 0), 0);
    
    const totalPurchases = parsedNote.trades
      .filter(t => t.type === 'BUY')
      .reduce((sum, t) => sum + (t.total || 0), 0);
    
    const totalCosts = parsedNote.costs?.total || 0;
    
    // Net = Sales - Purchases - Costs
    const calculatedNet = totalSales - totalPurchases - totalCosts;
    const reportedNet = parsedNote.metadata.liquidValue;
    
    // Determine sign: if it reported C, value is positive. If D, negative.
    // However, Geminis often just return the numeric value and we need the isCredit flag
    let diff = 0;
    if (parsedNote.metadata.isCredit !== undefined) {
      const signedReportedNet = parsedNote.metadata.isCredit ? reportedNet : -reportedNet;
      diff = Math.abs(calculatedNet - signedReportedNet);
    } else {
      // Fallback: try to match absolute or signed
      diff = Math.min(
        Math.abs(calculatedNet - reportedNet),
        Math.abs(calculatedNet - (-reportedNet))
      );
    }

    const isMatch = diff < 0.05; // 5 cents tolerance for rounding
    
    return {
      totalSales,
      totalPurchases,
      totalCosts,
      calculatedNet,
      reportedNet,
      isMatch,
      diff
    };
  }, [parsedNote]);

  const [existingTransactions, setExistingTransactions] = useState<Transaction[]>([]);
  const [showDiffModal, setShowDiffModal] = useState(false);

  // Check for duplicate note (mesmo número, mesma corretora, mesma data)
  const checkDuplicate = useCallback(async (number: string, bankId: string, date: string) => {
    if (!number || !bankId || !date) {
      setIsDuplicate(false);
      setExistingTransactions([]);
      return;
    }
    setIsCheckingDuplicate(true);
    try {
      const transactions = await financeService.getTransactions({ docNumber: number });
      
      const cleanDate = date.split('T')[0];
      const dupTransactions = transactions.filter(t => {
        const matchesBank = String(t.bankId) === String(bankId);
        const matchesDate = t.date?.split('T')[0] === cleanDate;
        return matchesBank && matchesDate;
      });

      setIsDuplicate(dupTransactions.length > 0);
      setExistingTransactions(dupTransactions);
    } catch (err) {
      console.error("Erro ao verificar duplicidade:", err);
    } finally {
      setIsCheckingDuplicate(false);
    }
  }, []);

  useEffect(() => {
    if (noteNumber && selectedBankId && tradeDate) {
      const timer = setTimeout(() => {
        checkDuplicate(noteNumber, selectedBankId, tradeDate);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setIsDuplicate(false);
      setExistingTransactions([]);
    }
  }, [noteNumber, selectedBankId, tradeDate, checkDuplicate]);

  // Compare parsed note with existing transactions
  const differences = React.useMemo(() => {
    if (!parsedNote || existingTransactions.length === 0) return null;

    const added: { ticker: string; type: 'BUY' | 'SELL'; quantity: number; price: number; total: number }[] = [];
    const removed: { ticker: string; type: 'DEBIT' | 'CREDIT'; quantity: number; unitPrice: number; value: number }[] = [];
    const modified: {
      ticker: string;
      type: 'BUY' | 'SELL';
      oldQty: number; oldPrice: number; oldTotal: number;
      newQty: number; newPrice: number; newTotal: number;
    }[] = [];

    // Separate trades from tax emoluments transactions
    const existingTrades = existingTransactions.filter(t => {
      const participant = participants.find(p => p.id === t.participantId);
      return participant && participant.name !== 'Taxas Corretagem' && !!participant.ticker;
    });

    const parsedTrades = parsedNote.trades || [];
    const matchedExistingIds = new Set<string>();

    parsedTrades.forEach(pTrade => {
      const matches = existingTrades.filter(t => {
        if (matchedExistingIds.has(t.id)) return false;
        const p = participants.find(part => part.id === t.participantId);
        const tickerMatch = p && p.ticker?.toLowerCase() === pTrade.ticker.toLowerCase();
        const directionMatch = (pTrade.type === 'BUY' && t.type === 'DEBIT') || (pTrade.type === 'SELL' && t.type === 'CREDIT');
        return tickerMatch && directionMatch;
      });

      if (matches.length > 0) {
        const match = matches[0];
        matchedExistingIds.add(match.id);

        const qtyDiff = Math.abs((match.quantity || 0) - pTrade.quantity) > 0.001;
        const priceDiff = Math.abs((match.unitPrice || 0) - pTrade.price) > 0.01;
        const totalDiff = Math.abs((match.value || 0) - pTrade.total) > 0.01;

        if (qtyDiff || priceDiff || totalDiff) {
          modified.push({
            ticker: pTrade.ticker,
            type: pTrade.type,
            oldQty: match.quantity || 0,
            oldPrice: match.unitPrice || 0,
            oldTotal: match.value || 0,
            newQty: pTrade.quantity,
            newPrice: pTrade.price,
            newTotal: pTrade.total
          });
        }
      } else {
        added.push({
          ticker: pTrade.ticker,
          type: pTrade.type,
          quantity: pTrade.quantity,
          price: pTrade.price,
          total: pTrade.total
        });
      }
    });

    existingTrades.forEach(t => {
      if (!matchedExistingIds.has(t.id)) {
        const p = participants.find(part => part.id === t.participantId);
        removed.push({
          ticker: p?.ticker || 'N/A',
          type: t.type as 'DEBIT' | 'CREDIT',
          quantity: t.quantity || 0,
          unitPrice: t.unitPrice || 0,
          value: t.value || 0
        });
      }
    });

    const existingFeesTx = existingTransactions.find(t => {
      const participant = participants.find(p => p.id === t.participantId);
      return participant?.name === 'Taxas Corretagem';
    });
    const parsedFee = parsedNote.costs?.total || 0;
    const existingFeeVal = existingFeesTx?.value || 0;
    const feeModified = Math.abs(parsedFee - existingFeeVal) > 0.01;

    return {
      added,
      removed,
      modified,
      feeModified,
      oldFee: existingFeeVal,
      newFee: parsedFee,
      hasChanges: added.length > 0 || removed.length > 0 || modified.length > 0 || feeModified
    };
  }, [parsedNote, existingTransactions, participants]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const processFile = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      setProcessingApi('gemini');
      const result = await geminiService.parseBrokerageNote(base64, file.type, (api) => {
        setProcessingApi(api);
      });

      const expected = result.metadata?.expectedTradesCount;
      const identified = result.trades?.length || 0;
      if (expected !== undefined && expected !== null && expected > 0 && expected !== identified) {
        setParsedNote(null);
        setError(`Atenção: a nota possui ${expected} negócios mas apenas ${identified} foram identificados. A importação foi cancelada para evitar dados incorretos. Tente importar novamente ou entre em contato com o suporte.`);
        setIsProcessing(false);
        setProcessingApi(null);
        return;
      }

      if (result.trades && result.trades.length > 0) {
        result.trades = result.trades.map((trade: any) => {
          const match = findParticipantByPartialMatch(trade.ticker, trade.assetName, participants);
          return {
            ...trade,
            ticker: (match?.ticker || trade.ticker || '').toUpperCase()
          };
        });
      }

      setParsedNote(result);
      
      // Initialize editable fields
      if (result.metadata?.date) setTradeDate(result.metadata.date);
      if (result.metadata?.settlementDate) setSettlementDate(result.metadata.settlementDate);
      if (result.metadata?.noteNumber) {
        setNoteNumber(result.metadata.noteNumber);
        checkDuplicate(
          result.metadata.noteNumber, 
          selectedBankId, 
          result.metadata.date || new Date().toISOString().split('T')[0]
        );
      }
    } catch (err: any) {
      console.error("Error processing brokerage note:", err);
      setError(err.message || "Erro ao processar a nota de corretagem.");
    } finally {
      setIsProcessing(false);
      setProcessingApi(null);
    }
  };

  const executePureImport = async () => {
    if (!parsedNote) return;
    
    // Check if there are unregistered assets (tickers) that have neither been registered nor skipped
    const missing = Array.from(new Set(
      (parsedNote.trades || [])
        .filter(t => t.ticker && !findParticipantByPartialMatch(t.ticker, t.assetName, participants) && !registeredAssets[t.ticker] && !skippedAssets.has(t.ticker))
        .map(t => t.ticker)
    ));
      
    if (missing.length > 0) {
      setImportActionToExecute('pure');
      setShowUnregisteredModal(true);
      return;
    }
    
    // 1. Ensure all participants (assets) exist
    const updatedParticipants = [...participants];
    
    const createParticipantIfMissing = async (trade: BrokerageTrade) => {
      // Usar a busca parcial por nome e ticker para encontrar o participante
      let p = findParticipantByPartialMatch(trade.ticker, trade.assetName, updatedParticipants);
      
      if (!p && registeredAssets[trade.ticker]) {
        const reg = registeredAssets[trade.ticker];
        p = await financeService.saveRegistryItem<Participant>('participants', {
          id: '',
          name: reg.name,
          ticker: trade.ticker,
          category: reg.category,
          currency: 'BRL'
        });
        updatedParticipants.push(p);
      }
      
      if (!p) {
        // Se pular, a importação continua mas aquele ativo fica marcado como 'sem cadastro'
        // Criamos participante básico sem ticker e sem categoria (não aparece na Performance)
        let skeleton = updatedParticipants.find(p => p.name === trade.assetName && !p.ticker);
        if (!skeleton) {
          skeleton = await financeService.saveRegistryItem<Participant>('participants', {
            id: '',
            name: trade.assetName,
            ticker: '',
            category: '',
            currency: 'BRL'
          });
          updatedParticipants.push(skeleton);
        }
        return skeleton;
      }
      return p;
    };

    // Create transactions
    const finalSettlementDate = settlementDate || tradeDate || new Date().toISOString().split('T')[0];
    const finalNoteNumber = noteNumber || parsedNote.metadata?.noteNumber || '';

    for (const trade of parsedNote.trades || []) {
      const participant = await createParticipantIfMissing(trade);
      
      const transaction: Transaction = {
        id: '',
        date: finalSettlementDate,
        description: `${trade.type === 'BUY' ? 'Compra' : 'Venda'} ${trade.ticker} - NC ${finalNoteNumber}`,
        docNumber: finalNoteNumber,
        value: trade.total || 0,
        quantity: trade.quantity || 0,
        unitPrice: trade.price || 0,
        type: trade.type === 'BUY' ? 'DEBIT' : 'CREDIT',
        status: 'PAID',
        bankId: selectedBankId,
        categoryId: investmentCategoryId,
        participantId: participant.id,
        costCenterId: selectedCostCenterId,
        walletId: selectedWalletId
      };
      
      await financeService.saveTransaction(transaction);
    }

    // Lança as taxas separadamente como solicitado para bater com o banco
    if (parsedNote.costs?.total > 0) {
      const feeCat = categories.find(c => c.name.toLowerCase().includes('taxa') || c.name.toLowerCase().includes('despesa')) || categories[0];
      
      // Garante participante "Taxas Corretagem"
      let feeParticipant = updatedParticipants.find(p => p.name === 'Taxas Corretagem');
      if (!feeParticipant) {
         feeParticipant = await financeService.saveRegistryItem<Participant>('participants', {
           id: '',
           name: 'Taxas Corretagem',
         });
      }

      const feesTransaction: Transaction = {
        id: "",
        date: finalSettlementDate,
        description: `Taxas/Emolumentos NC ${finalNoteNumber}`,
        docNumber: finalNoteNumber,
        value: parsedNote.costs.total,
        type: 'DEBIT',
        status: 'PAID',
        bankId: selectedBankId,
        categoryId: feeCat.id,
        participantId: feeParticipant.id, 
        costCenterId: selectedCostCenterId,
        walletId: selectedWalletId
      };
      
      await financeService.saveTransaction(feesTransaction);
    }

    onSuccess();
  };

  const handleConfirmImport = async () => {
    if (!parsedNote) return;

    setIsProcessing(true);
    setError(null);
    try {
      const number = noteNumber || parsedNote.metadata?.noteNumber || '';
      const date = tradeDate || parsedNote.metadata?.date || '';
      
      if (number && selectedBankId && date) {
        const transactions = await financeService.getTransactions({ docNumber: number });
        const cleanDate = date.split('T')[0];
        const dupTransactions = transactions.filter(t => {
          const matchesBank = String(t.bankId) === String(selectedBankId);
          const matchesDate = t.date?.split('T')[0] === cleanDate;
          return matchesBank && matchesDate;
        });

        if (dupTransactions.length > 0) {
          setIsDuplicate(true);
          setExistingTransactions(dupTransactions);
          setIsProcessing(false);
          setShowDiffModal(true);
          return;
        }
      }

      await executePureImport();
    } catch (err: any) {
      setError("Erro ao salvar transações: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReplaceImport = async () => {
    if (!parsedNote) return;

    // Check if there are unregistered assets (tickers) that have neither been registered nor skipped
    const missing = Array.from(new Set(
      (parsedNote.trades || [])
        .filter(t => t.ticker && !findParticipantByPartialMatch(t.ticker, t.assetName, participants) && !registeredAssets[t.ticker] && !skippedAssets.has(t.ticker))
        .map(t => t.ticker)
    ));
      
    if (missing.length > 0) {
      setImportActionToExecute('replace');
      setShowUnregisteredModal(true);
      return;
    }

    setIsProcessing(true);
    setShowDiffModal(false);
    try {
      const finalNoteNumber = noteNumber || parsedNote.metadata?.noteNumber || '';
      await financeService.deleteBrokerageNote(finalNoteNumber);
      
      await executePureImport();
    } catch (err: any) {
      setError("Erro ao substituir nota existente: " + err.message);
      setIsProcessing(false);
    }
  };

  const handleMergeImport = async () => {
    if (!parsedNote || !differences) return;

    // Check if there are unregistered assets (tickers) that have neither been registered nor skipped
    const missing = Array.from(new Set(
      (parsedNote.trades || [])
        .filter(t => t.ticker && !findParticipantByPartialMatch(t.ticker, t.assetName, participants) && !registeredAssets[t.ticker] && !skippedAssets.has(t.ticker))
        .map(t => t.ticker)
    ));
      
    if (missing.length > 0) {
      setImportActionToExecute('merge');
      setShowUnregisteredModal(true);
      return;
    }

    setIsProcessing(true);
    setShowDiffModal(false);
    try {
      const updatedParticipants = [...participants];
      
      const createParticipantIfMissing = async (ticker: string, assetName: string) => {
        // Usar a busca parcial por nome e ticker para encontrar o participante
        let p = findParticipantByPartialMatch(ticker, assetName, updatedParticipants);
        
        if (!p && registeredAssets[ticker]) {
          const reg = registeredAssets[ticker];
          p = await financeService.saveRegistryItem<Participant>('participants', {
            id: '',
            name: reg.name,
            ticker: ticker,
            category: reg.category,
            currency: 'BRL'
          });
          updatedParticipants.push(p);
        }
        
        if (!p) {
          // Se pular, criamos um participante sem ticker nem categoria para que fique "sem cadastro"
          let skeleton = updatedParticipants.find(p => p.name === assetName && !p.ticker);
          if (!skeleton) {
            skeleton = await financeService.saveRegistryItem<Participant>('participants', {
              id: '',
              name: assetName,
              ticker: '',
              category: '',
              currency: 'BRL'
            });
            updatedParticipants.push(skeleton);
          }
          return skeleton;
        }
        return p;
      };

      const finalSettlementDate = settlementDate || tradeDate || new Date().toISOString().split('T')[0];
      const finalNoteNumber = noteNumber || parsedNote.metadata?.noteNumber || '';

      // 1. Delete removed operations
      if (differences.removed.length > 0) {
        const txsToDelete: string[] = [];
        differences.removed.forEach(rem => {
          const tx = existingTransactions.find(t => {
            const p = participants.find(part => part.id === t.participantId);
            return p && p.ticker === rem.ticker && t.type === rem.type;
          });
          if (tx) txsToDelete.push(tx.id);
        });
        if (txsToDelete.length > 0) {
          await financeService.deleteTransactions(txsToDelete);
        }
      }

      // 2. Clear or update existing matched transactions (Modified ones)
      for (const mod of differences.modified) {
        const txToUpdate = existingTransactions.find(t => {
          const p = participants.find(part => part.id === t.participantId);
          const pMatch = p && p.ticker === mod.ticker;
          const directionMatch = (mod.type === 'BUY' && t.type === 'DEBIT') || (mod.type === 'SELL' && t.type === 'CREDIT');
          return pMatch && directionMatch;
        });

        if (txToUpdate) {
          const updatedTx: Transaction = {
            ...txToUpdate,
            value: mod.newTotal,
            quantity: mod.newQty,
            unitPrice: mod.newPrice,
            date: finalSettlementDate,
            bankId: selectedBankId,
            walletId: selectedWalletId,
            costCenterId: selectedCostCenterId,
            categoryId: investmentCategoryId
          };
          await financeService.saveTransaction(updatedTx);
        }
      }

      // 3. Add new ones
      for (const add of differences.added) {
        const tradeData = parsedNote.trades.find(t => t.ticker === add.ticker);
        const assetName = tradeData?.assetName || add.ticker;
        const participant = await createParticipantIfMissing(add.ticker, assetName);

        const transaction: Transaction = {
          id: '',
          date: finalSettlementDate,
          description: `${add.type === 'BUY' ? 'Compra' : 'Venda'} ${add.ticker} - NC ${finalNoteNumber}`,
          docNumber: finalNoteNumber,
          value: add.total,
          quantity: add.quantity,
          unitPrice: add.price,
          type: add.type === 'BUY' ? 'DEBIT' : 'CREDIT',
          status: 'PAID',
          bankId: selectedBankId,
          categoryId: investmentCategoryId,
          participantId: participant.id,
          costCenterId: selectedCostCenterId,
          walletId: selectedWalletId
        };
        await financeService.saveTransaction(transaction);
      }

      // 4. Update fees if modified
      if (differences.feeModified) {
        const existingFeesTx = existingTransactions.find(t => {
          const participant = participants.find(p => p.id === t.participantId);
          return participant?.name === 'Taxas Corretagem';
        });

        if (differences.newFee > 0) {
          if (existingFeesTx) {
            const updatedFeeTx: Transaction = {
              ...existingFeesTx,
              value: differences.newFee,
              date: finalSettlementDate,
              bankId: selectedBankId,
              walletId: selectedWalletId,
              costCenterId: selectedCostCenterId
            };
            await financeService.saveTransaction(updatedFeeTx);
          } else {
            let feeParticipant = updatedParticipants.find(p => p.name === 'Taxas Corretagem');
            if (!feeParticipant) {
               feeParticipant = await financeService.saveRegistryItem<Participant>('participants', {
                 id: '',
                 name: 'Taxas Corretagem',
               });
            }
            const feeCat = categories.find(c => c.name.toLowerCase().includes('taxa') || c.name.toLowerCase().includes('despesa')) || categories[0];

            const feesTransaction: Transaction = {
              id: "",
              date: finalSettlementDate,
              description: `Taxas/Emolumentos NC ${finalNoteNumber}`,
              docNumber: finalNoteNumber,
              value: differences.newFee,
              type: 'DEBIT',
              status: 'PAID',
              bankId: selectedBankId,
              categoryId: feeCat.id,
              participantId: feeParticipant.id, 
              costCenterId: selectedCostCenterId,
              walletId: selectedWalletId
            };
            await financeService.saveTransaction(feesTransaction);
          }
        } else if (existingFeesTx) {
          await financeService.deleteTransactions([existingFeesTx.id]);
        }
      }

      onSuccess();
    } catch (err: any) {
      setError("Erro ao mesclar transações: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkipUnregistered = () => {
    const missing = Array.from(new Set(
      (parsedNote?.trades || [])
        .filter(t => t.ticker && !findParticipantByPartialMatch(t.ticker, t.assetName, participants) && !registeredAssets[t.ticker])
        .map(t => t.ticker)
    )) || [];
    
    const newSkipped = new Set(skippedAssets);
    missing.forEach(t => newSkipped.add(t));
    setSkippedAssets(newSkipped);
    setShowUnregisteredModal(false);
    setIsRegisterMode(false);
    
    // Resume action
    const action = importActionToExecute;
    setImportActionToExecute(null);
    
    setTimeout(() => {
      if (action === 'pure') {
        executePureImport();
      } else if (action === 'replace') {
        handleReplaceImport();
      } else if (action === 'merge') {
        handleMergeImport();
      }
    }, 50);
  };

  const handleSaveAndImportUnregistered = () => {
    // Fill registeredAssets with current quickFormInputs
    const updatedRegistered = { ...registeredAssets, ...quickFormInputs };
    setRegisteredAssets(updatedRegistered);
    setShowUnregisteredModal(false);
    setIsRegisterMode(false);
    
    // Resume action
    const action = importActionToExecute;
    setImportActionToExecute(null);
    
    setTimeout(() => {
      if (action === 'pure') {
        executePureImport();
      } else if (action === 'replace') {
        handleReplaceImport();
      } else if (action === 'merge') {
        handleMergeImport();
      }
    }, 50);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
              <FileUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Importar Nota de Corretagem</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Área Transitória de Investimentos</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {!parsedNote ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-full max-w-md border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group relative">
                <input 
                  type="file" 
                  accept="application/pdf,image/*" 
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={isProcessing}
                />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-100 transition-all">
                    <FileUp className="w-8 h-8 text-slate-400 group-hover:text-blue-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-700">Arraste sua nota ou clique aqui</p>
                    <p className="text-sm text-slate-400">PDF ou Imagem da Nota de Corretagem</p>
                  </div>
                </div>
              </div>

              {file && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 w-full max-w-md bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-xl shadow-sm">
                      <FileUp className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{file.name}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button 
                    onClick={processFile}
                    disabled={isProcessing}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl font-bold text-sm transition-all shadow-md shadow-blue-200 disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{processingApi === 'claude' ? 'Processando com Claude...' : 'Processando com Gemini...'}</span>
                      </>
                    ) : 'Processar Agora'}
                  </button>
                </motion.div>
              )}
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Note Info */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Data do Pregão</p>
                  <p className="text-lg font-black text-slate-800">
                    {parsedNote.metadata?.date ? new Date(parsedNote.metadata.date).toLocaleDateString('pt-BR') : 'N/D'}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Nota Nº</p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-black text-slate-800">{noteNumber || 'N/D'}</p>
                    {isCheckingDuplicate && <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />}
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Líquido da Nota</p>
                  <p className={`text-lg font-black ${(parsedNote.metadata?.liquidValue || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parsedNote.metadata?.liquidValue || 0)}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Liquidação</p>
                  <p className="text-lg font-black text-slate-800">
                    {parsedNote.metadata?.settlementDate ? new Date(parsedNote.metadata.settlementDate).toLocaleDateString('pt-BR') : 'N/D'}
                  </p>
                </div>
              </div>

              {auditResult && !auditResult.isMatch && (
                <div className="bg-rose-50 border border-rose-200 p-6 rounded-3xl space-y-4">
                  <div className="flex items-center gap-3 text-rose-700">
                    <AlertCircle className="w-6 h-6 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-wider">Inconsistência de Valores Detectada</h4>
                      <p className="text-xs font-bold opacity-80">A soma das operações extraídas não bate com o valor total da nota. Isso pode ocorrer em notas muito longas.</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white/60 p-3 rounded-2xl border border-rose-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Calculado (Linhas)</p>
                      <p className="text-sm font-black text-slate-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(auditResult.calculatedNet)}
                      </p>
                    </div>
                    <div className="bg-white/60 p-3 rounded-2xl border border-rose-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Líquido na Nota</p>
                      <p className="text-sm font-black text-slate-700">
                         {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(auditResult.reportedNet)}
                         {parsedNote.metadata.isCredit !== undefined && (parsedNote.metadata.isCredit ? ' (C)' : ' (D)')}
                      </p>
                    </div>
                    <div className="bg-rose-600 p-3 rounded-2xl text-white">
                      <p className="text-[9px] font-black opacity-60 uppercase mb-1">Diferença</p>
                      <p className="text-sm font-black">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(auditResult.diff)}
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-rose-500 italic">Dica: Se a diferença for grande, tente reenviar apenas a página da nota que contém a tabela de negócios.</p>
                </div>
              )}

              {isDuplicate && (
                <div className="bg-amber-50 border border-amber-200 p-5 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-amber-800">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <p className="text-sm font-black">Atenção: Nota de corretagem já importada!</p>
                      <p className="text-xs font-bold opacity-90">Já existem registros no sistema com o número {noteNumber} para esta corretora e data.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDiffModal(true)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-4 py-2 rounded-xl transition-all shadow-md shadow-amber-200 flex items-center gap-1.5 self-start md:self-auto"
                  >
                    <ClipboardList className="w-4 h-4" />
                    Reimportar e Ver Diferenças
                  </button>
                </div>
              )}

              {/* Card de Totais na Área Transitória */}
              {auditResult && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100/30 p-5 rounded-2xl border border-amber-200 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest block mb-1">Total de Compras</span>
                      <span className="text-2xl font-black text-amber-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(auditResult.totalPurchases)}
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                      <TrendingDown className="w-5 h-5" />
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100/30 p-5 rounded-2xl border border-blue-200 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-blue-800 uppercase tracking-widest block mb-1">Total de Vendas</span>
                      <span className="text-2xl font-black text-blue-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(auditResult.totalSales)}
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              )}

              {/* Transactions List */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  Revisão das Operações Identificadas
                </h3>
                <p className="text-xs text-slate-500 font-medium mb-3">
                  Revise e corrija os tickers mapeados abaixo. Linhas destacadas em vermelho indicam tickers vazios ou não cadastrados nos Participantes.
                </p>
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Nome Sinacor (PDF)</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Ticker Mapeado</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Operação</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Qtd</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Preço</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(parsedNote.trades || []).map((trade, idx) => {
                        const isInvalid = !isTradeTickerValid(trade.ticker);
                        return (
                          <tr 
                            key={idx} 
                            className={isInvalid 
                              ? "bg-rose-50/70 hover:bg-rose-100/70 border-l-4 border-rose-500 transition-colors" 
                              : "hover:bg-slate-50 transition-colors"
                            }
                          >
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800 text-xs sm:text-sm">{trade.assetName}</span>
                                <span className="text-[10px] text-slate-400 font-mono">Original: {trade.ticker || "N/A"}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1.5 min-w-[210px]">
                                <div className="flex gap-2 items-center">
                                  <input
                                    type="text"
                                    value={trade.ticker}
                                    onChange={(e) => handleUpdateTradeTicker(idx, e.target.value)}
                                    className={`w-24 bg-white border rounded-lg px-2 py-1 text-xs font-black uppercase text-center outline-none focus:ring-2 focus:ring-blue-500 shadow-sm ${
                                      isInvalid ? 'border-rose-400 focus:ring-rose-500 animate-pulse' : 'border-slate-300'
                                    }`}
                                    placeholder="TICKER"
                                  />
                                  <select
                                    value={registeredTickers.includes(trade.ticker) ? trade.ticker : ""}
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        handleUpdateTradeTicker(idx, e.target.value);
                                      }
                                    }}
                                    className={`text-xs bg-slate-50 border rounded-lg px-2 py-1 outline-none text-slate-600 font-medium ${
                                      isInvalid ? 'border-rose-300 focus:ring-rose-500' : 'border-slate-300'
                                    }`}
                                  >
                                    <option value="">Vincular...</option>
                                    {registeredTickers.map(ticker => (
                                      <option key={ticker} value={ticker}>{ticker}</option>
                                    ))}
                                  </select>
                                </div>
                                {isInvalid && (
                                  <span className="text-[10px] text-rose-600 font-black block leading-none select-none">
                                    ⚠️ Ticker em branco ou não cadastrado
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${
                                trade.type === 'BUY' 
                                  ? 'bg-amber-50 text-amber-600 border-amber-200' 
                                  : 'bg-blue-50 text-blue-600 border-blue-200'
                              }`}>
                                {trade.type === 'BUY' ? 'COMPRA' : 'VENDA'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-slate-600">{trade.quantity}</td>
                            <td className="px-6 py-4 text-right font-bold text-slate-600">R$ {(trade.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="px-6 py-4 text-right font-black text-slate-800">R$ {(trade.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                      {(parsedNote.costs?.total || 0) > 0 && (
                         <tr className="bg-slate-50/50">
                           <td colSpan={4} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Taxas / Emolumentos / IRRF</td>
                           <td className="px-6 py-4 text-right font-black text-rose-600">R$ {parsedNote.costs.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                         </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Import Settings */}
              <div className="bg-blue-50 rounded-3xl p-6 border border-blue-100">
                <div className="flex items-center gap-2 mb-6">
                  <Info className="w-5 h-5 text-blue-600" />
                  <h3 className="text-sm font-black text-blue-900 uppercase tracking-widest">Configuração do Lançamento</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Data do Pregão</label>
                    <input 
                      type="date"
                      value={tradeDate}
                      onChange={(e) => setTradeDate(e.target.value)}
                      className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Data de Liquidação</label>
                    <input 
                      type="date"
                      value={settlementDate}
                      onChange={(e) => setSettlementDate(e.target.value)}
                      className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="hidden lg:block"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Número da Nota (Correção)</label>
                    <input 
                      type="text"
                      value={noteNumber}
                      onChange={(e) => setNoteNumber(e.target.value)}
                      className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                      placeholder="N/D"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Banco para Liquidação</label>
                    <select 
                      value={selectedBankId}
                      onChange={(e) => setSelectedBankId(e.target.value)}
                      className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Carteira Target</label>
                    <select 
                      value={selectedWalletId}
                      onChange={(e) => setSelectedWalletId(e.target.value)}
                      className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Centro de Custos</label>
                    <select 
                      value={selectedCostCenterId}
                      onChange={(e) => setSelectedCostCenterId(e.target.value)}
                      className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Categoria Padrão</label>
                    <select 
                      value={investmentCategoryId}
                      onChange={(e) => setInvestmentCategoryId(e.target.value)}
                      className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {hasInvalidTickers && (
            <div className="mt-6 bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3 text-amber-800 animate-pulse">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-black">Atenção: Tickers Pendentes de Correção</p>
                <p className="text-xs text-slate-600 mt-1">
                  Existem linhas com tickers vazios ou não cadastrados no sistema (destacadas em vermelho). Por favor, digite o ticker correto ou selecione um ativo válido na caixa de seleção para poder efetivar.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-600 animate-shake">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-bold">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button 
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          {parsedNote && (
            <div className="flex gap-3">
              <button 
                onClick={() => setParsedNote(null)}
                className="px-6 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200 transition-colors"
              >
                Voltar e Recarregar
              </button>
              <button 
                onClick={handleConfirmImport}
                disabled={isProcessing || isDuplicate || isCheckingDuplicate || hasInvalidTickers}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-2xl font-black text-sm transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Efetivar Lançamentos</>}
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Modal de Diferenças de Nota de Corretagem */}
      {showDiffModal && differences && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-blue-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slide-up">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 rounded-xl text-blue-600">
                  <ClipboardList className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">Comparativo de Diferenças</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Nota Nº {noteNumber} — {tradeDate ? new Date(tradeDate).toLocaleDateString('pt-BR') : 'N/D'}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDiffModal(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {!differences.hasChanges ? (
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl text-emerald-700 text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  <span>Nenhuma diferença detectada! O conteúdo da importação é idêntico ao que já está salvo no sistema.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-slate-600">
                    Encontramos as seguintes diferenças entre o arquivo que você subiu agora e o que já está salvo no banco de dados:
                  </p>

                  {/* Added Trades */}
                  {differences.added.length > 0 && (
                    <div className="space-y-2 border border-emerald-100 bg-emerald-50/20 p-4 rounded-2xl">
                      <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Novas Operações a Adicionar ({differences.added.length})
                      </h4>
                      <div className="divide-y divide-emerald-100/50 text-xs text-slate-600">
                        {differences.added.map((add, i) => (
                          <div key={i} className="py-2 flex items-center justify-between">
                            <span className="font-black text-slate-700">{add.ticker} ({add.type === 'BUY' ? 'Compra' : 'Venda'})</span>
                            <span className="font-medium text-emerald-700">{add.quantity} un @ R$ {add.price.toFixed(2)} = <strong>R$ {add.total.toFixed(2)}</strong></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Modified Trades */}
                  {differences.modified.length > 0 && (
                    <div className="space-y-2 border border-amber-100 bg-amber-50/20 p-4 rounded-2xl">
                      <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Operações com Valores Alterados ({differences.modified.length})
                      </h4>
                      <div className="divide-y divide-amber-100/50 text-xs text-slate-600">
                        {differences.modified.map((mod, i) => (
                          <div key={i} className="py-2.5 space-y-1">
                            <div className="flex items-center justify-between font-black text-slate-800">
                              <span>{mod.ticker} ({mod.type === 'BUY' ? 'Compra' : 'Venda'})</span>
                            </div>
                            <div className="flex items-center justify-between text-slate-500 font-bold">
                              <span>Anterior: {mod.oldQty} un @ R$ {mod.oldPrice.toFixed(2)} = R$ {mod.oldTotal.toFixed(2)}</span>
                              <span className="text-amber-700 font-black">Novo: {mod.newQty} un @ R$ {mod.newPrice.toFixed(2)} = R$ {mod.newTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Removed Trades */}
                  {differences.removed.length > 0 && (
                    <div className="space-y-2 border border-rose-100 bg-rose-50/20 p-4 rounded-2xl">
                      <h4 className="text-xs font-black text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        Operações Salvas que Não Existem no Arquivo Novo ({differences.removed.length})
                      </h4>
                      <div className="divide-y divide-rose-100/50 text-xs text-slate-600">
                        {differences.removed.map((rem, i) => (
                          <div key={i} className="py-2 flex items-center justify-between">
                            <span className="font-black text-slate-700">{rem.ticker} ({rem.type === 'DEBIT' ? 'Compra' : 'Venda'})</span>
                            <span className="font-bold text-rose-600">{rem.quantity} un @ R$ {rem.unitPrice.toFixed(2)} = R$ {rem.value.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fees Differences */}
                  {differences.feeModified && (
                    <div className="space-y-1 bg-slate-50 border border-slate-200 p-4 rounded-2xl text-xs text-slate-600 font-bold">
                      <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">Diferença de Taxas/Emolumentos</h4>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-500 font-bold">Valor Salvo: R$ {differences.oldFee.toFixed(2)}</span>
                        <span className="text-blue-700 font-black">Novo Valor: R$ {differences.newFee.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                onClick={() => setShowDiffModal(false)}
                className="w-full sm:w-auto px-6 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleMergeImport}
                  disabled={isProcessing}
                  title="Apenas adiciona novas operações, apaga as removidas e atualiza as alteradas."
                  className="w-full sm:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl text-xs transition-all shadow-md shadow-amber-200"
                >
                  Mesclar Alterações
                </button>
                <button
                  onClick={handleReplaceImport}
                  disabled={isProcessing}
                  title="Apaga por completo a nota salva e reinsere como nova importação."
                  className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs transition-all shadow-md shadow-emerald-200"
                >
                  Substituir Tudo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de ativos não cadastrados */}
      {showUnregisteredModal && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-blue-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 rounded-xl text-amber-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">Ativos não Encontrados</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Cadastro Pendente</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowUnregisteredModal(false);
                  setIsRegisterMode(false);
                  setImportActionToExecute(null);
                }}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {!isRegisterMode ? (
                // Modo Alerta Inicial
                <div className="space-y-6">
                  <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                    Os seguintes ativos não foram encontrados no cadastro: {modalMissingTickers.join(', ')}. Deseja cadastrá-los agora antes de importar?
                  </p>
                  
                  <div className="flex flex-wrap gap-2 py-2">
                    {modalMissingTickers.map(ticker => (
                      <span key={ticker} className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-black text-slate-800">
                        {ticker}
                      </span>
                    ))}
                  </div>

                  <p className="text-xs font-bold text-slate-400">
                    Dica: Se pular, a importação continua, mas esses ativos ficarão "sem cadastro" e não aparecerão na tela de Performance por Ativo.
                  </p>
                </div>
              ) : (
                // Modo Formulário Inline de Cadastro rápido
                <div className="space-y-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Preencha as informações para o cadastro rápido:
                  </p>
                  <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1">
                    {modalMissingTickers.map(ticker => {
                      const input = quickFormInputs[ticker] || { name: ticker, category: 'Ação' };
                      return (
                        <div key={ticker} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
                            <span className="text-sm font-black text-blue-600">{ticker}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-400">Novo Participante</span>
                          </div>
                          
                          <div className="space-y-2">
                            <div>
                              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Nome do Ativo</label>
                              <input 
                                type="text"
                                value={input.name}
                                onChange={(e) => {
                                  setQuickFormInputs(prev => ({
                                    ...prev,
                                    [ticker]: { ...prev[ticker], name: e.target.value }
                                  }));
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Categoria</label>
                              <select 
                                value={input.category}
                                onChange={(e) => {
                                  setQuickFormInputs(prev => ({
                                    ...prev,
                                    [ticker]: { ...prev[ticker], category: e.target.value }
                                  }));
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                              >
                                <option value="Ação">Ações (Stocks)</option>
                                <option value="FII">Fundos Imobiliários (FII)</option>
                                <option value="ETF">ETFs</option>
                                <option value="Cripto">Criptomoedas</option>
                                <option value="Renda Fixa">Renda Fixa</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              {!isRegisterMode ? (
                <>
                  <button
                    onClick={handleSkipUnregistered}
                    className="px-6 py-2 rounded-xl text-sm font-black text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Pular
                  </button>
                  <button
                    onClick={() => setIsRegisterMode(true)}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-sm transition-all shadow-md shadow-blue-200"
                  >
                    Ir ao Cadastro
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsRegisterMode(false)}
                    className="px-6 py-2 rounded-xl text-sm font-black text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleSaveAndImportUnregistered}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm transition-all shadow-md shadow-emerald-200"
                  >
                    Confirmar e Importar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
