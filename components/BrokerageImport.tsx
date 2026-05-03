
import React, { useState, useCallback, useEffect } from 'react';
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
  Plus
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
}

export const BrokerageImport: React.FC<BrokerageImportProps> = ({
  onClose,
  onSuccess,
  banks,
  wallets,
  categories,
  participants,
  costCenters
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedNote, setParsedNote] = useState<BrokerageNote | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  
  // Settings for import
  const [selectedBankId, setSelectedBankId] = useState(banks[0]?.id || '');
  const [selectedWalletId, setSelectedWalletId] = useState(wallets[0]?.id || '');
  const [selectedCostCenterId, setSelectedCostCenterId] = useState(costCenters[0]?.id || '');
  const [investmentCategoryId, setInvestmentCategoryId] = useState(() => {
    const inv = categories.find(c => c.name.toLowerCase().includes('investimento'));
    return inv?.id || categories[0]?.id || '';
  });

  // Date and Doc overrides
  const [tradeDate, setTradeDate] = useState('');
  const [settlementDate, setSettlementDate] = useState('');
  const [noteNumber, setNoteNumber] = useState('');

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

  // Check for duplicate note
  const checkDuplicate = useCallback(async (number: string) => {
    if (!number) return;
    setIsCheckingDuplicate(true);
    try {
      const transactions = await financeService.getTransactions({ docNumber: number });
      // Only consider it a duplicate if we found transactions with that doc number
      // We check for length > 0
      setIsDuplicate(transactions.length > 0);
    } catch (err) {
      console.error("Erro ao verificar duplicidade:", err);
    } finally {
      setIsCheckingDuplicate(false);
    }
  }, []);

  useEffect(() => {
    if (noteNumber) {
      const timer = setTimeout(() => {
        checkDuplicate(noteNumber);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [noteNumber, checkDuplicate]);

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

      const result = await geminiService.parseBrokerageNote(base64, file.type);
      setParsedNote(result);
      
      // Initialize editable fields
      if (result.metadata?.date) setTradeDate(result.metadata.date);
      if (result.metadata?.settlementDate) setSettlementDate(result.metadata.settlementDate);
      if (result.metadata?.noteNumber) {
        setNoteNumber(result.metadata.noteNumber);
        checkDuplicate(result.metadata.noteNumber);
      }
    } catch (err: any) {
      console.error("Error processing brokerage note:", err);
      setError(err.message || "Erro ao processar a nota de corretagem.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedNote || isDuplicate) return;

    setIsProcessing(true);
    try {
      // 1. Ensure all participants (assets) exist
      const updatedParticipants = [...participants];
      
      const createParticipantIfMissing = async (trade: BrokerageTrade) => {
        let p = updatedParticipants.find(p => p.ticker === trade.ticker || p.name.toLowerCase() === trade.assetName.toLowerCase());
        
        if (!p) {
          // Identify if it's a FII or Stock (Simple heuristic)
          const isFII = trade.assetName.toLowerCase().includes('fii') || trade.ticker.endsWith('11');
          const category = isFII ? 'FII' : 'Ação';
          
          const newP = await financeService.saveRegistryItem<Participant>('participants', {
            id: '',
            name: trade.assetName,
            ticker: trade.ticker,
            category: category,
            currency: 'BRL'
          });
          updatedParticipants.push(newP);
          return newP;
        }
        return p;
      };

      // Create transactions
      const finalSettlementDate = settlementDate || tradeDate || new Date().toISOString().split('T')[0];
      const finalTradeDate = tradeDate || new Date().toISOString().split('T')[0];
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

      // Add costs entry if relevant
      if (parsedNote.costs?.total > 0) {
        // Find a category for fees
        const feeCat = categories.find(c => c.name.toLowerCase().includes('taxa') || c.name.toLowerCase().includes('despesa')) || categories[0];
        
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
          participantId: 'taxas-corretagem', 
          costCenterId: selectedCostCenterId,
          walletId: selectedWalletId
        };
        
        // Ensure "Taxas Corretagem" participant exists or use a dummy
        let feeParticipant = updatedParticipants.find(p => p.name === 'Taxas Corretagem');
        if (!feeParticipant) {
           feeParticipant = await financeService.saveRegistryItem<Participant>('participants', {
             id: '',
             name: 'Taxas Corretagem',
           });
        }
        feesTransaction.participantId = feeParticipant.id;
        
        await financeService.saveTransaction(feesTransaction);
      }

      onSuccess();
    } catch (err: any) {
      setError("Erro ao salvar transações: " + err.message);
    } finally {
      setIsProcessing(false);
    }
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
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Processar Agora'}
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
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 text-amber-700 animate-pulse">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-black">Atenção: Nota de corretagem já importada!</p>
                    <p className="text-[11px] font-bold">Já existem registros no sistema com o número {noteNumber}.</p>
                  </div>
                </div>
              )}

              {/* Transactions List */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  Operações Identificadas
                </h3>
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Ticker</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Operação</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Qtd</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Preço</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(parsedNote.trades || []).map((trade, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-black text-slate-800">{trade.ticker}</td>
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
                      ))}
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
                disabled={isProcessing || isDuplicate || isCheckingDuplicate}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-2xl font-black text-sm transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Efetivar Lançamentos</>}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
