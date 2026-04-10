
import React, { useMemo, useState, useEffect } from 'react';
import { Transaction, Bank, Category, Participant, Wallet, Currency } from '../types';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart as PieChartIcon,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Info,
  RefreshCw,
  Brain,
  AlertCircle,
  X,
  Target,
  Check,
  Edit2,
  Clock
} from 'lucide-react';
import { geminiService, InvestmentSuggestion } from '../services/geminiService';
import { financeService } from '../services/financeService';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';

interface AssetPerformanceReportProps {
  transactions: Transaction[];
  registries: {
    banks: Bank[];
    categories: Category[];
    participants: Participant[];
    wallets: Wallet[];
  };
  onUpdateRegistry?: (forceRefresh?: boolean) => Promise<void>;
}

interface AssetPerformance {
  participantId: string;
  name: string;
  ticker: string;
  category: string;
  currency: Currency;
  totalInvested: number; // In asset currency
  totalReceived: number; // In asset currency
  totalSold: number;     // In asset currency
  currentQuantity: number;
  averagePrice: number;  // In asset currency
  lastPrice?: number;    // In asset currency
  targetPrice?: number;  // In asset currency
  variation?: number;
  marketValue?: number;  // In asset currency
  profit?: number;       // In asset currency
  totalInvestedBRL: number;
  averagePriceBRL: number;
  transactions: Transaction[];
}

export const AssetPerformanceReport: React.FC<AssetPerformanceReportProps> = ({ 
  transactions, 
  registries,
  onUpdateRegistry
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBankId, setSelectedBankId] = useState<string>('ALL');
  const [selectedWalletId, setSelectedWalletId] = useState<string>('ALL');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, InvestmentSuggestion>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [detailAsset, setDetailAsset] = useState<AssetPerformance | null>(null);
  const [baseCurrency, setBaseCurrency] = useState<Currency>('BRL');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [tempTargetPrice, setTempTargetPrice] = useState<string>('');
  const [isSavingTarget, setIsSavingTarget] = useState(false);

  const [exchangeRates, setExchangeRates] = useState<Record<Currency, number>>({
    'BRL': 1,
    'USD': 5.0,
    'EUR': 5.5,
    'GBP': 6.5,
    'JPY': 0.033,
    'CHF': 5.6,
    'CAD': 3.7,
    'AUD': 3.3,
    'CNY': 0.7
  });

  // Identifica bancos que possuem transações de investimento
  const banksWithInvestments = useMemo(() => {
    const bankIds = new Set<string>();
    
    transactions.forEach(t => {
      if (t.status !== 'PAID') return;
      
      const participant = registries.participants.find(p => p.id === t.participantId);
      const bank = registries.banks.find(b => b.id === t.bankId);
      const isInvestmentBank = bank?.type === 'INVESTMENT';
      const hasParticipantType = !!participant?.category;
      
      const isInvestment = hasParticipantType && isInvestmentBank;

      if (isInvestment) {
        bankIds.add(t.bankId);
      }
    });

    return registries.banks
      .filter(b => bankIds.has(b.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [transactions, registries.participants, registries.categories, registries.banks]);

  const performanceData = useMemo(() => {
    const assetMap = new Map<string, AssetPerformance>();

    // Filtra apenas transações de investimento confirmadas
    const relevantTransactions = transactions.filter(t => {
      const isConfirmed = t.status === 'PAID';
      
      // Busca o participante para ver se ele tem um Tipo (indicativo de investimento)
      const participant = registries.participants.find(p => p.id === t.participantId);
      const hasParticipantType = !!participant?.category;
      
      const bank = registries.banks.find(b => b.id === t.bankId);
      const isInvestmentBank = bank?.type === 'INVESTMENT';
      
      const matchesBank = selectedBankId === 'ALL' || t.bankId === selectedBankId;
      const matchesWallet = selectedWalletId === 'ALL' || t.walletId === selectedWalletId;
      
      // Lógica de Ouro: É investimento se tiver Tipo E for banco de investimento
      // IGNORAMOS transferências (linkedId) para evitar que o aporte de capital seja contado como venda/lucro
      const isInvestment = hasParticipantType && isInvestmentBank && !t.linkedId;
      
      return isConfirmed && isInvestment && matchesBank && matchesWallet;
    });

    relevantTransactions.forEach(t => {
      if (!assetMap.has(t.participantId)) {
        const participant = registries.participants.find(p => p.id === t.participantId);
        const name = participant?.name || 'Desconhecido';
        const ticker = participant?.ticker || name.split('-')[0].trim().toUpperCase();
        const currency = participant?.currency || 'BRL';
        
        assetMap.set(t.participantId, {
          participantId: t.participantId,
          name,
          ticker,
          category: participant?.category || 'Outros',
          currency,
          totalInvested: 0,
          totalInvestedBRL: 0,
          totalReceived: 0,
          totalSold: 0,
          currentQuantity: 0,
          averagePrice: 0,
          averagePriceBRL: 0,
          targetPrice: participant?.targetPrice,
          transactions: []
        });
      }

      const asset = assetMap.get(t.participantId)!;
      asset.transactions.push(t);

      const bank = registries.banks.find(b => b.id === t.bankId);
      const transactionCurrency = bank?.currency || 'BRL';
      const assetCurrency = asset.currency;

      // Valor em BRL (para total da carteira)
      const rateToBRL = (transactionCurrency === 'BRL') ? 1 : (t.exchangeRate || exchangeRates[transactionCurrency] || 1);
      const valueInBRL = t.value * rateToBRL;

      // Valor na moeda do Ativo (para Preço Médio estável)
      let valueInAsset = 0;
      if (transactionCurrency === assetCurrency) {
        valueInAsset = t.value;
      } else {
        // Se temos a taxa da transação (ex: BRL/USD), usamos ela
        if (t.exchangeRate) {
          // Se a transação é BRL e o ativo é USD, exchangeRate costuma ser BRL/USD (ex: 5.10)
          // Então USD = BRL / 5.10
          valueInAsset = t.value / t.exchangeRate;
        } else {
          // Fallback para taxa de hoje
          const assetRateToBRL = exchangeRates[assetCurrency] || 1;
          valueInAsset = valueInBRL / assetRateToBRL;
        }
      }

      if (t.type === 'DEBIT') {
        const category = registries.categories.find(c => c.id === t.categoryId);
        const isDividendTax = category?.name.toLowerCase().includes('imposto') && 
                             (category?.name.toLowerCase().includes('provento') || category?.name.toLowerCase().includes('divid'));

        if (isDividendTax) {
          // Imposto sobre dividendo reduz o recebimento líquido
          asset.totalReceived += valueInAsset;
        } else {
          // Compra normal
          asset.totalInvested += valueInAsset;
          asset.totalInvestedBRL += valueInBRL;
          if (t.quantity) {
            asset.currentQuantity += t.quantity;
          }
        }
      } else {
        // Venda ou Rendimento
        const category = registries.categories.find(c => c.id === t.categoryId);
        const isDividend = (category?.name.toLowerCase() === 'proventos') ||
                          t.description.toLowerCase().includes('divid') || 
                          t.description.toLowerCase().includes('jcp') || 
                          t.description.toLowerCase().includes('rendimento') ||
                          t.description.toLowerCase().includes('aluguel');
        
        if (isDividend) {
          asset.totalReceived += valueInAsset;
        } else {
          asset.totalSold += valueInAsset;
          if (t.quantity) {
            asset.currentQuantity -= t.quantity;
          }
        }
      }
    });

    // Calcula Preço Médio e limpa ativos sem quantidade
    const result: AssetPerformance[] = [];
    assetMap.forEach(asset => {
      if (asset.totalInvested > 0 || asset.currentQuantity > 0) {
        const totalBoughtQty = asset.transactions
          .filter(t => t.type === 'DEBIT' && t.quantity)
          .reduce((acc, t) => acc + (t.quantity || 0), 0);
        
        asset.averagePrice = totalBoughtQty > 0 ? asset.totalInvested / totalBoughtQty : 0;
        asset.averagePriceBRL = totalBoughtQty > 0 ? asset.totalInvestedBRL / totalBoughtQty : 0;
        
        // Adiciona dados de mercado se disponíveis
        const marketPrice = prices[asset.ticker] || registries.participants.find(p => p.id === asset.participantId)?.currentPrice;
        if (marketPrice) {
          asset.lastPrice = marketPrice;
          asset.marketValue = asset.currentQuantity * asset.lastPrice;
          asset.profit = (asset.marketValue + asset.totalSold + asset.totalReceived) - asset.totalInvested;
          asset.variation = asset.averagePrice > 0 ? (asset.lastPrice / asset.averagePrice - 1) * 100 : 0;
        }

        result.push(asset);
      }
    });

    return result.sort((a, b) => (b.marketValue || b.totalInvested) - (a.marketValue || a.totalInvested));
  }, [transactions, registries.participants, registries.categories, registries.wallets, prices, exchangeRates, selectedBankId, selectedWalletId]);

  const fetchPrices = async () => {
    const tickers = performanceData
      .filter(a => a.currentQuantity > 0)
      .map(a => a.ticker)
      .filter(t => t && t.trim().length > 0);

    if (tickers.length === 0) return;

    try {
      // Usar geminiService (que agora está mockado para dados locais)
      const { prices: newPrices, timestamp: priceTime } = await geminiService.fetchAssetPrices(tickers, true);
      setPrices(prev => ({ ...prev, ...newPrices }));
      setLastUpdate(priceTime);

      // Atualizar taxas de câmbio
      const { rates, timestamp: rateTime } = await geminiService.getExchangeRates(true);
      setExchangeRates(prev => ({ ...prev, ...rates }));
      if (!lastUpdate || rateTime > lastUpdate) setLastUpdate(rateTime);

    } catch (error) {
      console.error("Erro ao buscar cotações", error);
    } finally {
      setLoadingPrices(false);
    }
  };

  const getAiSuggestions = async () => {
    if (performanceData.length === 0) return;
    
    setLoadingSuggestions(true);
    try {
      const suggestions = await geminiService.getInvestmentSuggestions(performanceData);
      const suggestionMap: Record<string, InvestmentSuggestion> = {};
      suggestions.forEach(s => {
        suggestionMap[s.ticker] = s;
      });
      setAiSuggestions(suggestionMap);
    } catch (error) {
      console.error("Erro ao buscar sugestões de IA", error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleSaveTargetPrice = async (asset: AssetPerformance) => {
    const newPrice = parseFloat(tempTargetPrice.replace(',', '.'));
    if (isNaN(newPrice)) {
      setEditingTargetId(null);
      return;
    }

    setIsSavingTarget(true);
    try {
      const participant = registries.participants.find(p => p.id === asset.participantId);
      if (participant) {
        await financeService.saveRegistryItem('participants', {
          ...participant,
          targetPrice: newPrice
        });
        if (onUpdateRegistry) {
          await onUpdateRegistry(true);
        }
      }
    } catch (error) {
      console.error("Erro ao salvar preço alvo", error);
    } finally {
      setIsSavingTarget(false);
      setEditingTargetId(null);
    }
  };

  useEffect(() => {
    // Busca taxas de câmbio iniciais
    const initRates = async () => {
      try {
        const { rates, timestamp } = await geminiService.getExchangeRates();
        setExchangeRates(prev => ({ ...prev, ...rates }));
        setLastUpdate(timestamp);
      } catch (e) {
        console.error("Erro ao carregar taxas iniciais", e);
      }
    };
    initRates();
  }, []);

  useEffect(() => {
    if (performanceData.length > 0 && Object.keys(prices).length === 0) {
      fetchPrices();
    }
  }, [performanceData.length]);

  const formatCurrency = (val: number, currency: Currency = 'BRL') => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(val);
  };

  const formatValue = (val: number, decimals: number = 2) => {
    // Se o valor for muito pequeno mas não zero, mostra mais decimais para não parecer 0,00
    const finalDecimals = (val > 0 && val < 0.01 && decimals === 2) ? 4 : decimals;
    return new Intl.NumberFormat('pt-BR', { 
      minimumFractionDigits: finalDecimals, 
      maximumFractionDigits: finalDecimals 
    }).format(val);
  };

  const getSuggestion = (asset: AssetPerformance) => {
    const aiSug = aiSuggestions[asset.ticker];
    if (aiSug) {
      const colors: Record<string, string> = {
        'BUY': 'text-emerald-600 bg-emerald-50',
        'SELL': 'text-red-600 bg-red-50',
        'HOLD': 'text-slate-500 bg-slate-50'
      };
      const labels: Record<string, string> = {
        'BUY': 'COMPRA',
        'SELL': 'VENDA',
        'HOLD': 'MANTER'
      };
      return { 
        text: labels[aiSug.action] || aiSug.action, 
        color: colors[aiSug.action] || 'text-slate-500 bg-slate-50',
        reason: aiSug.reason,
        risk: aiSug.riskLevel
      };
    }

    if (!asset.lastPrice || !asset.averagePrice || asset.averagePrice === 0) return null;
    
    const variation = (asset.lastPrice / asset.averagePrice - 1) * 100;
    
    if (variation < -15) return { text: 'COMPRA FORTE', color: 'text-emerald-600 bg-emerald-50' };
    if (variation < -5) return { text: 'COMPRA', color: 'text-emerald-500 bg-emerald-50/50' };
    if (variation > 20) return { text: 'VENDA', color: 'text-orange-600 bg-orange-50' };
    if (variation > 40) return { text: 'VENDA FORTE', color: 'text-red-600 bg-red-50' };
    
    return { text: 'MANTER', color: 'text-slate-500 bg-slate-50' };
  };

  // Totais convertidos para a moeda base
  const filteredData = performanceData.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.ticker.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totals = useMemo(() => {
    return filteredData.reduce((acc, curr) => {
      const rate = exchangeRates[curr.currency] || 1;
      return {
        invested: acc.invested + (curr.totalInvested * rate),
        received: acc.received + (curr.totalReceived * rate),
        market: acc.market + ((curr.marketValue || 0) * rate),
        profit: acc.profit + ((curr.profit || 0) * rate)
      };
    }, { invested: 0, received: 0, market: 0, profit: 0 });
  }, [filteredData, exchangeRates]);

  const safeBaseRate = useMemo(() => exchangeRates[baseCurrency] || 1, [exchangeRates, baseCurrency]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const allocationData = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.forEach(a => {
      const rate = exchangeRates[a.currency] || 1;
      const val = (a.marketValue || a.totalInvested) * rate;
      map.set(a.category, (map.get(a.category) || 0) + val);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredData, exchangeRates]);

  const institutionData = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.forEach(a => {
      const rate = exchangeRates[a.currency] || 1;
      const val = (a.marketValue || a.totalInvested) * rate;
      
      // Encontrar o banco/carteira para cada transação do ativo
      // Como um ativo pode estar em vários bancos, aqui somamos a posição atual
      // vinculada aos filtros selecionados.
      a.transactions.forEach(t => {
        const bank = registries.banks.find(b => b.id === t.bankId);
        const bankName = bank?.name || 'Outros';
        const tVal = (t.type === 'DEBIT' ? t.value : -t.value) * rate;
        map.set(bankName, (map.get(bankName) || 0) + tVal);
      });
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredData, exchangeRates, registries.banks]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filtros e Moeda Base */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-800">Relatório de Performance</h2>
          </div>
          {lastUpdate && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Atualizado em: {new Date(lastUpdate).toLocaleString('pt-BR')}
                {Date.now() - lastUpdate > 1000 * 60 * 15 && (
                  <span className="text-amber-500 font-bold ml-1">(Cache)</span>
                )}
              </span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 border border-blue-100 rounded-full">
                <span className="text-[9px] font-black text-blue-600 uppercase">Dólar:</span>
                <span className="text-[10px] font-mono font-bold text-blue-700">R$ {exchangeRates['USD']?.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Conta/Banco:</span>
            <select
              value={selectedBankId}
              onChange={(e) => {
                setSelectedBankId(e.target.value);
              }}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="ALL">Todos os Bancos</option>
              {banksWithInvestments.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Carteira/Portfólio:</span>
            <select
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="ALL">Todas as Carteiras</option>
              {registries.wallets.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Moeda Base:</span>
            <select
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value as Currency)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="BRL">BRL (R$)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </div>

          <button
            onClick={fetchPrices}
            disabled={loadingPrices}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
              loadingPrices 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
            }`}
          >
            {loadingPrices ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {loadingPrices ? 'Atualizando...' : 'Atualizar Cotações'}
          </button>
        </div>
      </div>

      {/* Alerta se não houver ativos identificados */}
      {performanceData.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-800">Nenhum Investimento Identificado</h4>
            <p className="text-xs text-amber-700 leading-relaxed">
              Para que um ativo apareça neste relatório, ele deve atender aos seguintes critérios:
              <br />1. O <strong>Banco/Conta</strong> deve ser do tipo <strong>Investimento</strong> (ajuste no cadastro de Bancos).
              <br />2. O <strong>Participante</strong> deve ter um <strong>Tipo</strong> preenchido (ex: Ação, Renda Fixa, CDB).
              <br />Verifique seus cadastros e lançamentos para garantir que os campos estejam corretos.
            </p>
          </div>
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Total Investido</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {formatCurrency(totals.invested / safeBaseRate, baseCurrency)}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Proventos Recebidos</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">
            {formatCurrency(totals.received / safeBaseRate, baseCurrency)}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Valor de Mercado</span>
          </div>
          <div className="text-2xl font-bold text-purple-600">
            {totals.market > 0 ? formatCurrency(totals.market / safeBaseRate, baseCurrency) : '---'}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-slate-50 rounded-lg">
              {totals.profit >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-600" /> : <TrendingDown className="w-5 h-5 text-red-600" />}
            </div>
            <span className="text-sm font-medium text-slate-500">Lucro/Prejuízo Total</span>
          </div>
          <div className={`text-2xl font-bold ${totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(totals.profit / safeBaseRate, baseCurrency)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Alocação */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-wider">
            <PieChartIcon className="w-4 h-4 text-blue-600" />
            Por Tipo
          </h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocationData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {allocationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value / safeBaseRate, baseCurrency)}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-1">
            {allocationData.map((entry, index) => (
              <div key={entry.name} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span className="text-slate-600">{entry.name}</span>
                </div>
                <span className="font-bold text-slate-800">
                  {((entry.value / (totals.market || totals.invested)) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Gráfico de Instituição */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-wider">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Por Instituição
          </h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={institutionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {institutionData.map((entry, index) => (
                    <Cell key={`cell-inst-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value / safeBaseRate, baseCurrency)}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-1">
            {institutionData.map((entry, index) => (
              <div key={entry.name} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[(index + 2) % COLORS.length] }}></div>
                  <span className="text-slate-600">{entry.name}</span>
                </div>
                <span className="font-bold text-slate-800">
                  {((entry.value / (totals.market || totals.invested)) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Tabela de Ativos */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              Performance por Ativo
            </h3>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Filtrar ticker ou nome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <button 
                onClick={getAiSuggestions}
                disabled={loadingSuggestions || performanceData.length === 0}
                className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50 flex items-center gap-2"
                title="Obter Sugestões de IA"
              >
                <Brain className={`w-5 h-5 ${loadingSuggestions ? 'animate-pulse' : ''}`} />
                <span className="text-xs font-bold hidden sm:inline">Sugestões IA</span>
              </button>
              <button 
                onClick={fetchPrices}
                disabled={loadingPrices}
                className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                title="Atualizar Cotações"
              >
                <RefreshCw className={`w-5 h-5 ${loadingPrices ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                {/* Linha de Totais Acima do Cabeçalho */}
                {filteredData.length > 0 && (
                  <tr className="bg-blue-50/30 border-b border-blue-100">
                    <td className="p-4 text-[10px] font-black text-blue-800 uppercase tracking-wider">TOTAIS ({baseCurrency})</td>
                    <td className="p-4"></td>
                    <td className="p-4 border-l border-slate-100"></td>
                    <td className="p-4 border-l border-slate-100"></td>
                    <td className="p-4 border-l border-slate-100"></td>
                    
                    <td className="p-4 text-sm font-black text-blue-700 text-right font-mono border-l border-slate-100">
                      {formatCurrency(totals.invested / safeBaseRate, baseCurrency)}
                    </td>
                    <td className="p-4 text-sm font-black text-emerald-700 text-right font-mono">
                      {formatCurrency(totals.market / safeBaseRate, baseCurrency)}
                    </td>

                    <td className="p-4 text-sm font-black text-slate-700 text-right font-mono border-l border-slate-100">
                      <span className={totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                        {formatCurrency(totals.profit / safeBaseRate, baseCurrency)}
                      </span>
                    </td>
                    <td className="p-4"></td>
                  </tr>
                )}
                <tr className="bg-slate-50/50">
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50/50 z-10">Ativo</th>
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Qtd</th>
                  <th className="p-4 text-[10px] font-bold text-blue-500 uppercase tracking-wider text-right border-l border-slate-200">P. Médio Compra ({baseCurrency})</th>
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right border-l border-slate-200">Cotação Atual ({baseCurrency})</th>
                  <th className="p-4 text-[10px] font-bold text-amber-600 uppercase tracking-wider text-right border-l border-slate-200">Preço Alvo ({baseCurrency})</th>
                  <th className="p-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-right border-l border-slate-200">Total Compra ({baseCurrency})</th>
                  <th className="p-4 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-right">Total Atual ({baseCurrency})</th>
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right border-l border-slate-200">Resultado ({baseCurrency})</th>
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Sugestão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredData.map((asset) => {
                  const suggestion = getSuggestion(asset);
                  const baseRate = exchangeRates[baseCurrency] || 1;
                  const assetRate = exchangeRates[asset.currency] || 1;
                  
                  // Conversão para a Moeda Base selecionada (Dólar do dia)
                  const avgPriceDisplay = (asset.averagePrice * assetRate) / baseRate;
                  const lastPriceDisplay = (asset.lastPrice || 0) * assetRate / baseRate;
                  const targetPriceDisplay = (asset.targetPrice || 0) * assetRate / baseRate;
                  const totalInvestedDisplay = (asset.totalInvested * assetRate) / baseRate;
                  const marketValueDisplay = asset.lastPrice ? (asset.currentQuantity * lastPriceDisplay) : 0;
                  const profitDisplay = asset.lastPrice ? (marketValueDisplay - totalInvestedDisplay) : 0;
                  const totalReceivedDisplay = (asset.totalReceived * assetRate) / baseRate;

                  return (
                    <tr 
                      key={asset.participantId} 
                      className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                      onClick={() => setDetailAsset(asset)}
                    >
                      <td className="p-4 sticky left-0 bg-white group-hover:bg-slate-50/50 z-10">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-800">{asset.ticker}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 truncate max-w-[150px]">{asset.name.split('-')[1]?.trim() || asset.name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-600 text-right font-mono">{formatValue(asset.currentQuantity, 8)}</td>
                      
                      <td className="p-4 text-sm text-blue-600 text-right font-mono border-l border-slate-100">{formatValue(avgPriceDisplay, 4)}</td>
                      
                      <td className="p-4 text-right border-l border-slate-100">
                        {asset.lastPrice ? (
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-bold text-slate-800 font-mono">{formatValue(lastPriceDisplay, 4)}</span>
                            <span className={`text-[10px] font-bold flex items-center gap-0.5 ${asset.variation! >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {asset.variation! >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                              {Math.abs(asset.variation!).toFixed(2)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 italic">N/A</span>
                        )}
                      </td>

                      <td className="p-4 text-right border-l border-slate-100" onClick={(e) => e.stopPropagation()}>
                        {editingTargetId === asset.participantId ? (
                          <div className="flex items-center justify-end gap-1">
                            <input 
                              autoFocus
                              type="text"
                              value={tempTargetPrice}
                              onChange={(e) => setTempTargetPrice(e.target.value)}
                              onBlur={() => {
                                // Small delay to allow clicking the check button
                                setTimeout(() => setEditingTargetId(null), 200);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveTargetPrice(asset);
                                if (e.key === 'Escape') setEditingTargetId(null);
                              }}
                              className="w-20 px-2 py-1 bg-white border border-amber-300 rounded text-xs font-mono text-right outline-none focus:ring-2 focus:ring-amber-500"
                            />
                            <button 
                              onMouseDown={(e) => e.preventDefault()} // Prevent blur before click
                              onClick={() => handleSaveTargetPrice(asset)}
                              disabled={isSavingTarget}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              {isSavingTarget ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            </button>
                          </div>
                        ) : (
                          <div 
                            className="flex flex-col items-end group/target cursor-pointer"
                            onClick={() => {
                              setEditingTargetId(asset.participantId);
                              setTempTargetPrice(asset.targetPrice ? asset.targetPrice.toString() : '');
                            }}
                          >
                            <div className="flex items-center gap-1">
                              <span className={`text-sm font-bold font-mono ${asset.targetPrice ? 'text-amber-600' : 'text-slate-300 italic'}`}>
                                {asset.targetPrice ? formatValue(targetPriceDisplay, 4) : 'Definir'}
                              </span>
                              <Edit2 className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover/target:opacity-100 transition-opacity" />
                            </div>
                            {asset.targetPrice && asset.lastPrice && (
                              <span className={`text-[9px] font-black px-1 rounded ${
                                Math.abs(asset.lastPrice - asset.targetPrice) / asset.targetPrice < 0.05 
                                  ? 'bg-amber-500 text-white animate-pulse' 
                                  : 'text-slate-400'
                              }`}>
                                {Math.abs(1 - asset.lastPrice / asset.targetPrice) < 0.05 ? 'ALVO PRÓXIMO' : `${(Math.abs(1 - asset.lastPrice / asset.targetPrice) * 100).toFixed(0)}% p/ Alvo`}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-sm text-blue-600 text-right font-mono border-l border-slate-100">{formatValue(totalInvestedDisplay, 2)}</td>
                      <td className="p-4 text-sm text-emerald-600 text-right font-mono">
                        {asset.lastPrice ? formatValue(marketValueDisplay, 2) : '---'}
                      </td>
                      
                      <td className="p-4 text-right border-l border-slate-100">
                        <div className="flex flex-col items-end">
                          <span className={`text-sm font-bold font-mono ${profitDisplay >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {asset.lastPrice ? formatValue(profitDisplay, 2) : '---'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Prov. Líq: {formatValue(totalReceivedDisplay, 2)}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {suggestion && (
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-tighter ${suggestion.color}`}>
                              {suggestion.text}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-slate-400 italic text-sm">
                      Nenhum ativo encontrado com os critérios selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            <p className="text-[10px] text-slate-500">
              O cálculo de performance considera: (Valor de Mercado + Vendas + Proventos) - Total Investido. 
              Cotações via Brapi API (atraso de 15min).
            </p>
          </div>
        </div>

      {/* Modal de Detalhes das Transações */}
      {detailAsset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-xl text-white">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Histórico de {detailAsset.ticker}</h3>
                  <p className="text-xs text-slate-500">{detailAsset.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setDetailAsset(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Banco/Corretora</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Qtd</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">P. Unit</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {detailAsset.transactions
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((t) => {
                      const bank = registries.banks.find(b => b.id === t.bankId);
                      const isDividend = t.description.toLowerCase().includes('divid') || 
                                        t.description.toLowerCase().includes('jcp') || 
                                        t.description.toLowerCase().includes('rendimento');
                      
                      return (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-4 text-sm text-slate-600 font-mono">
                            {new Date(t.date).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-4">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              isDividend ? 'bg-purple-50 text-purple-600' :
                              t.type === 'DEBIT' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                            }`}>
                              {isDividend ? 'Provento' : t.type === 'DEBIT' ? 'Compra' : 'Venda'}
                            </span>
                          </td>
                          <td className="py-4 text-sm text-slate-600">
                            {bank?.name || '---'}
                          </td>
                          <td className="py-4 text-sm text-slate-600 text-right font-mono">
                            {t.quantity ? t.quantity.toFixed(4) : '---'}
                          </td>
                          <td className="py-4 text-sm text-slate-600 text-right font-mono">
                            {t.unitPrice ? formatCurrency(t.unitPrice, detailAsset.currency) : '---'}
                          </td>
                          <td className="py-4 text-sm font-bold text-slate-800 text-right font-mono">
                            {formatCurrency(t.value, detailAsset.currency)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <div className="flex gap-6">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Investido</span>
                  <span className="text-sm font-bold text-slate-800">{formatCurrency(detailAsset.totalInvested, detailAsset.currency)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Recebido</span>
                  <span className="text-sm font-bold text-emerald-600">{formatCurrency(detailAsset.totalReceived, detailAsset.currency)}</span>
                </div>
              </div>
              <button 
                onClick={() => setDetailAsset(null)}
                className="px-6 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors shadow-lg shadow-slate-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
