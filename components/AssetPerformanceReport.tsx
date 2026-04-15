
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
  Clock,
  FileDown,
  FileSpreadsheet,
  Wallet as WalletIcon,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
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
    assetTypes?: any[];
    assetSectors?: any[];
    assetTickers?: any[];
  };
  onUpdateRegistry?: (forceRefresh?: boolean) => Promise<void>;
  selectedBankId: string;
  setSelectedBankId: (id: string) => void;
  selectedWalletId: string;
  setSelectedWalletId: (id: string) => void;
}

interface AssetPerformance {
  participantId: string;
  name: string;
  ticker: string;
  category: string;
  sector: string;
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
  onUpdateRegistry,
  selectedBankId,
  setSelectedBankId,
  selectedWalletId,
  setSelectedWalletId
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [prices, setPrices] = useState<Record<string, { current: number; target: number | null }>>({});
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, InvestmentSuggestion>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [detailAsset, setDetailAsset] = useState<AssetPerformance | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [selectedTab, setSelectedTab] = useState('TUDO');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  
  const baseCurrency = useMemo(() => {
    if (selectedBankId === 'ALL') return 'BRL';
    const bank = registries.banks.find(b => b.id === selectedBankId);
    return bank?.currency || 'BRL';
  }, [selectedBankId, registries.banks]);
  
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
      const isInvestmentParticipant = !!(participant?.category || participant?.sector || participant?.ticker);
      
      // Se tiver qualquer um dos 3 campos preenchidos, é considerado investimento
      const isInvestment = isInvestmentParticipant;

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
      
      // Busca o participante para ver se ele tem algum dado de investimento
      const participant = registries.participants.find(p => p.id === t.participantId);
      const isInvestmentParticipant = !!(participant?.category || participant?.sector || participant?.ticker);
      
      const matchesBank = selectedBankId === 'ALL' || t.bankId === selectedBankId;
      const matchesWallet = selectedWalletId === 'ALL' || t.walletId === selectedWalletId;
      
      // Lógica: É investimento se o Participante tiver Tipo, Setor OU Ticker
      const isInvestment = isInvestmentParticipant && !t.linkedId;
      
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
          sector: participant?.sector || 'Não Segmentado',
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

      const participant = registries.participants.find(p => p.id === t.participantId);
      const isInvestmentParticipant = !!(participant?.category || participant?.sector || participant?.ticker);

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

      const category = registries.categories.find(c => c.id === t.categoryId);
      const categoryName = category?.name.toLowerCase() || '';
      const description = t.description.toLowerCase();
      
      // Identifica se é algo relacionado a proventos (dividendos, JCP, rendimentos ou impostos sobre eles)
      const isProvento = 
        categoryName.includes('provento') || 
        categoryName.includes('divid') || 
        categoryName.includes('jcp') || 
        categoryName.includes('rendimento') ||
        description.includes('divid') || 
        description.includes('jcp') || 
        description.includes('rendimento') || 
        description.includes('aluguel') ||
        description.includes('yield');

      // Identifica se é um imposto ou taxa (geral ou sobre provento)
      const isTaxOrFee = 
        categoryName.includes('imposto') || 
        categoryName.includes('taxa') || 
        categoryName.includes('tarifa') ||
        categoryName.includes('tax') || 
        categoryName.includes('fee') ||
        description.includes('tax') || 
        description.includes('fee') || 
        description.includes('iof') || 
        description.includes('irrf') ||
        description.includes('imposto') ||
        description.includes('wht') ||
        description.includes('withholding');

      // CRITICAL: Se for um DÉBITO sem quantidade, tratamos como taxa/imposto APENAS se não for um investimento identificado
      const isDebitWithoutQty = t.type === 'DEBIT' && (!t.quantity || t.quantity <= 0);

      if (isProvento || isTaxOrFee || (isDebitWithoutQty && !isInvestmentParticipant)) {
        if (t.type === 'DEBIT') {
          // Imposto ou taxa -> subtrai do recebido líquido (proventos)
          asset.totalReceived -= valueInAsset;
        } else {
          // Recebimento de provento
          asset.totalReceived += valueInAsset;
        }
        // Nunca afeta o Total Investido ou Quantidade (Preço Médio)
        return; 
      }

      if (t.type === 'DEBIT') {
        // Compra normal
        asset.totalInvested += valueInAsset;
        asset.totalInvestedBRL += valueInBRL;
        if (t.quantity) {
          asset.currentQuantity += t.quantity;
        }
      } else {
        // Venda normal
        asset.totalSold += valueInAsset;
        if (t.quantity) {
          asset.currentQuantity -= t.quantity;
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
        const marketData = prices[asset.ticker];
        const manualTarget = registries.participants.find(p => p.id === asset.participantId)?.targetPrice;
        
        if (marketData) {
          asset.lastPrice = marketData.current;
          asset.targetPrice = manualTarget || marketData.target || undefined;
          asset.marketValue = asset.currentQuantity * asset.lastPrice;
          // Excluímos totalReceived (proventos) do cálculo de lucro para focar em ganho de capital (venda/mercado)
          asset.profit = (asset.marketValue + asset.totalSold) - asset.totalInvested;
          asset.variation = asset.averagePrice > 0 ? (asset.lastPrice / asset.averagePrice - 1) * 100 : 0;
        } else {
          const manualPrice = registries.participants.find(p => p.id === asset.participantId)?.currentPrice;
          if (manualPrice) {
            asset.lastPrice = manualPrice;
            asset.targetPrice = manualTarget;
            asset.marketValue = asset.currentQuantity * asset.lastPrice;
            asset.profit = (asset.marketValue + asset.totalSold) - asset.totalInvested;
            asset.variation = asset.averagePrice > 0 ? (asset.lastPrice / asset.averagePrice - 1) * 100 : 0;
          }
        }

        result.push(asset);
      }
    });

    return result.sort((a, b) => (b.marketValue || b.totalInvested) - (a.marketValue || a.totalInvested));
  }, [transactions, registries.participants, registries.categories, registries.wallets, prices, exchangeRates, selectedBankId, selectedWalletId]);

  const fetchPrices = async (force: boolean = false) => {
    const tickers = performanceData
      .filter(a => a.currentQuantity > 0)
      .map(a => a.ticker)
      .filter(t => t && t.trim().length > 0);

    if (tickers.length === 0) return;

    setLoadingPrices(true);
    try {
      console.log("Iniciando busca de preços para:", tickers);
      // Usar geminiService (que agora está mockado para dados locais)
      const { prices: newPrices, timestamp: priceTime } = await geminiService.fetchAssetPrices(tickers, force);
      console.log("Novos preços recebidos:", newPrices);
      setPrices(prev => ({ ...prev, ...newPrices }));
      setLastUpdate(priceTime);

      // Atualizar taxas de câmbio
      const { rates, timestamp: rateTime } = await geminiService.getExchangeRates(force);
      console.log("Novas taxas de câmbio:", rates);
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
      // Prepara os dados para a IA: ticker, preço médio, preço atual, lucro/prejuízo e moeda
      const assetsForAi = performanceData.map(a => ({
        ticker: a.ticker,
        name: a.name,
        averagePrice: a.averagePrice,
        lastPrice: a.lastPrice || 0,
        currentQuantity: a.currentQuantity,
        currency: a.currency,
        variation: a.variation || 0,
        profit: a.profit || 0
      }));

      const suggestions = await geminiService.getInvestmentSuggestions(assetsForAi);
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

  const exportToExcel = () => {
    const data = filteredData.map(asset => {
      const assetRate = exchangeRates[asset.currency] || 1;
      const baseRate = exchangeRates[baseCurrency] || 1;
      const lastPriceDisplay = (asset.lastPrice || 0) * assetRate / baseRate;
      const avgPriceDisplay = (asset.averagePrice * assetRate) / baseRate;
      const totalInvestedDisplay = (asset.totalInvested * assetRate) / baseRate;
      const marketValueDisplay = asset.lastPrice ? (asset.currentQuantity * lastPriceDisplay) : 0;
      const profitDisplay = asset.lastPrice ? (marketValueDisplay - totalInvestedDisplay) : 0;

      return {
        'Ticker': asset.ticker,
        'Nome': asset.name,
        'Categoria': asset.category,
        'Quantidade': asset.currentQuantity,
        [`P. Médio (${baseCurrency})`]: avgPriceDisplay,
        [`Cotação Atual (${baseCurrency})`]: lastPriceDisplay,
        [`Total Compra (${baseCurrency})`]: totalInvestedDisplay,
        [`Total Atual (${baseCurrency})`]: marketValueDisplay,
        [`Resultado (${baseCurrency})`]: profitDisplay,
        'Variação (%)': asset.variation || 0
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Performance");
    XLSX.writeFile(wb, `Performance_Ativos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.text("Relatório de Performance de Ativos", 14, 15);
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleString()}`, 14, 22);
    doc.text(`Moeda Base: ${baseCurrency}`, 14, 27);

    const tableData = filteredData.map(asset => {
      const assetRate = exchangeRates[asset.currency] || 1;
      const baseRate = exchangeRates[baseCurrency] || 1;
      const lastPriceDisplay = (asset.lastPrice || 0) * assetRate / baseRate;
      const avgPriceDisplay = (asset.averagePrice * assetRate) / baseRate;
      const totalInvestedDisplay = (asset.totalInvested * assetRate) / baseRate;
      const marketValueDisplay = asset.lastPrice ? (asset.currentQuantity * lastPriceDisplay) : 0;
      const profitDisplay = asset.lastPrice ? (marketValueDisplay - totalInvestedDisplay) : 0;

      return [
        asset.ticker,
        asset.currentQuantity.toFixed(4),
        formatValue(avgPriceDisplay, 2),
        formatValue(lastPriceDisplay, 2),
        formatValue(totalInvestedDisplay, 2),
        formatValue(marketValueDisplay, 2),
        formatValue(profitDisplay, 2),
        `${(asset.variation || 0).toFixed(2)}%`
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [['Ticker', 'Qtd', 'P. Médio', 'Cotação', 'Total Compra', 'Total Atual', 'Resultado', 'Var %']],
      body: tableData,
    });

    doc.save(`Performance_Ativos_${new Date().toISOString().split('T')[0]}.pdf`);
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
    if (performanceData.length > 0) {
      fetchPrices();
      
      // Auto-refresh a cada 15 minutos
      const interval = setInterval(() => {
        fetchPrices();
      }, 15 * 60 * 1000);
      
      return () => clearInterval(interval);
    }
  }, [performanceData.length]);

  const formatCurrency = (val: number, currency: Currency = 'BRL') => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(val);
  };

  const formatValue = (val: number, decimals: number = 2) => {
    return new Intl.NumberFormat('pt-BR', { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
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

  const sectors = useMemo(() => {
    const s = new Set<string>();
    performanceData.forEach(a => s.add(a.sector));
    return Array.from(s).sort();
  }, [performanceData]);

  // Totais convertidos para a moeda base
  const filteredData = useMemo(() => {
    let data = performanceData.filter(a => {
      const matchesSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           a.ticker.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSector = sectorFilter === 'ALL' || a.sector === sectorFilter;
      
      if (!matchesSearch || !matchesSector) return false;
      
      if (selectedTab === 'TUDO') return true;
      
      const cat = a.category.toUpperCase();
      if (selectedTab === 'AÇÕES') return (cat.includes('AÇÃO') || cat.includes('ACAO') || cat.includes('STOCK'));
      if (selectedTab === 'FIIS') return (cat.includes('FII') || cat.includes('IMOBILIARIO'));
      if (selectedTab === 'RENDA FIXA') return (cat.includes('FIXA') || cat.includes('CDB') || cat.includes('TESOURO') || cat.includes('LCI') || cat.includes('LCA'));
      if (selectedTab === 'OUTROS') return !['AÇÃO', 'ACAO', 'STOCK', 'FII', 'IMOBILIARIO', 'FIXA', 'CDB', 'TESOURO', 'LCI', 'LCA'].some(k => cat.includes(k));
      
      return true;
    });

    if (sortConfig) {
      data = [...data].sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof AssetPerformance];
        let bValue: any = b[sortConfig.key as keyof AssetPerformance];

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [performanceData, searchTerm, selectedTab, sortConfig, sectorFilter]);

  const groupedData = useMemo(() => {
    const groups: Record<string, AssetPerformance[]> = {};
    filteredData.forEach(asset => {
      const cat = asset.category || 'Outros';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(asset);
    });
    return groups;
  }, [filteredData]);

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

  const cashBalance = useMemo(() => {
    const matchesBank = (t: Transaction) => selectedBankId === 'ALL' || t.bankId === selectedBankId;
    const matchesWallet = (t: Transaction) => selectedWalletId === 'ALL' || t.walletId === selectedWalletId;
    
    // Calcula o saldo de caixa (todas as transações PAID do banco/carteira selecionado)
    const balanceBRL = transactions
      .filter(t => t.status === 'PAID' && matchesBank(t) && matchesWallet(t))
      .reduce((acc, t) => {
        const bank = registries.banks.find(b => b.id === t.bankId);
        const transactionCurrency = bank?.currency || 'BRL';
        const rateToBRL = (transactionCurrency === 'BRL') ? 1 : (t.exchangeRate || exchangeRates[transactionCurrency] || 1);
        const valueInBRL = t.value * rateToBRL;
        
        return acc + (t.type === 'CREDIT' ? valueInBRL : -valueInBRL);
      }, 0);
      
    return balanceBRL;
  }, [transactions, selectedBankId, selectedWalletId, registries.banks, exchangeRates]);

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

  const sectorData = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.forEach(a => {
      const rate = exchangeRates[a.currency] || 1;
      const val = (a.marketValue || a.totalInvested) * rate;
      map.set(a.sector, (map.get(a.sector) || 0) + val);
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

  const tickerData = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.forEach(a => {
      const rate = exchangeRates[a.currency] || 1;
      const val = (a.marketValue || a.totalInvested) * rate;
      const ticker = a.ticker || 'N/A';
      map.set(ticker, (map.get(ticker) || 0) + val);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Top 10 assets
  }, [filteredData, exchangeRates]);

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
              <button 
                onClick={() => fetchPrices(true)}
                disabled={loadingPrices}
                className={`p-1.5 rounded-lg transition-all ${loadingPrices ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95'}`}
                title="Atualizar Cotações Agora"
              >
                <RefreshCw className={`w-3 h-3 ${loadingPrices ? 'animate-spin' : ''}`} />
              </button>
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
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm active:scale-95"
              title="Exportar para Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button
              onClick={exportToPDF}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-all shadow-sm active:scale-95"
              title="Exportar para PDF"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
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
              <br />1. O <strong>Participante</strong> deve ter um <strong>Tipo</strong> preenchido no cadastro (ex: Ação, Renda Fixa, CDB).
              <br />2. O lançamento deve estar com status <strong>Pago</strong>.
              <br />3. Não deve ser uma transferência (lançamentos vinculados).
              <br />Verifique seus cadastros de Participantes para garantir que o campo "Tipo" esteja preenchido.
            </p>
          </div>
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm group relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 rounded-lg">
              <WalletIcon className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Saldo em Conta</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">
            {formatCurrency(cashBalance / safeBaseRate, baseCurrency)}
          </div>
          
          {/* Tooltip com detalhamento por banco se estiver em "Todos os Bancos" */}
          {selectedBankId === 'ALL' && (
            <div className="absolute top-full left-0 mt-2 w-64 p-4 bg-slate-800 text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-xl border border-white/10">
              <div className="font-bold mb-2 border-b border-white/10 pb-1 uppercase tracking-wider">Saldo por Instituição</div>
              <div className="space-y-1.5">
                {registries.banks.map(bank => {
                  const balance = transactions
                    .filter(t => t.status === 'PAID' && t.bankId === bank.id && (selectedWalletId === 'ALL' || t.walletId === selectedWalletId))
                    .reduce((acc, t) => {
                      const rateToBRL = (bank.currency === 'BRL') ? 1 : (t.exchangeRate || exchangeRates[bank.currency] || 1);
                      const valueInBRL = t.value * rateToBRL;
                      return acc + (t.type === 'CREDIT' ? valueInBRL : -valueInBRL);
                    }, 0);
                  
                  if (Math.abs(balance) < 0.01) return null;

                  return (
                    <div key={bank.id} className="flex justify-between items-center">
                      <span className="text-slate-300 truncate mr-2">{bank.name}</span>
                      <span className="font-mono font-bold">{formatCurrency(balance / safeBaseRate, baseCurrency)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
            <span className="text-sm font-medium text-slate-500">Lucro Total</span>
          </div>
          <div className={`text-2xl font-bold ${totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(totals.profit / safeBaseRate, baseCurrency)}
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-2xl border border-blue-500 shadow-lg relative overflow-hidden group cursor-pointer active:scale-95 transition-all"
             onClick={getAiSuggestions}>
          <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform">
            <Brain className="w-24 h-24 text-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <Brain className={`w-5 h-5 text-white ${loadingSuggestions ? 'animate-pulse' : ''}`} />
              </div>
              <span className="text-sm font-medium text-blue-50">Insights da IA</span>
            </div>
            <div className="text-lg font-bold text-white flex items-center gap-2">
              {loadingSuggestions ? 'Analisando...' : 'Gerar Sugestões'}
              {!loadingSuggestions && <ArrowUpRight className="w-4 h-4" />}
            </div>
          </div>
        </div>
      </div>

      {/* Navegação por Abas */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {['TUDO', 'AÇÕES', 'FIIS', 'RENDA FIXA', 'OUTROS'].map(tab => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`px-4 py-2 text-[10px] font-black rounded-lg transition-all ${
              selectedTab === tab 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Gráfico de Alocação por Tipo */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-wider">
            <PieChartIcon className="w-4 h-4 text-blue-600" />
            Por Tipo
          </h3>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocationData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
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
          <div className="mt-4 space-y-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
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

        {/* Gráfico de Alocação por Setor */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-wider">
            <PieChartIcon className="w-4 h-4 text-indigo-600" />
            Por Setor
          </h3>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sectorData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {sectorData.map((entry, index) => (
                    <Cell key={`cell-sector-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value / safeBaseRate, baseCurrency)}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
            {sectorData.map((entry, index) => (
              <div key={entry.name} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[(index + 3) % COLORS.length] }}></div>
                  <span className="text-slate-600">{entry.name}</span>
                </div>
                <span className="font-bold text-slate-800">
                  {((entry.value / (totals.market || totals.invested)) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Gráfico de Alocação por Ativo (Ticker) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-wider">
            <PieChartIcon className="w-4 h-4 text-emerald-600" />
            Por Ativo
          </h3>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tickerData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {tickerData.map((entry, index) => (
                    <Cell key={`cell-ticker-${index}`} fill={COLORS[(index + 5) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value / safeBaseRate, baseCurrency)}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
            {tickerData.map((entry, index) => (
              <div key={entry.name} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[(index + 5) % COLORS.length] }}></div>
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
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={institutionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {institutionData.map((entry, index) => (
                    <Cell key={`cell-inst-${index}`} fill={COLORS[(index + 6) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value / safeBaseRate, baseCurrency)}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
            {institutionData.map((entry, index) => (
              <div key={entry.name} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[(index + 6) % COLORS.length] }}></div>
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
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
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

              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="ALL">Todos os Setores</option>
                  {sectors.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                {/* Linha de Totais Acima do Cabeçalho */}
                {filteredData.length > 0 && (
                  <tr className="bg-blue-50/30 border-b border-blue-100">
                    <td className="p-4 text-[10px] font-black text-blue-800 uppercase tracking-wider uppercase tracking-wider sticky left-0 bg-blue-50/30 z-10">TOTAIS ({baseCurrency})</td>
                    <td className="p-4"></td>
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
                  <th 
                    className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50/50 z-10 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'ticker', direction: prev?.key === 'ticker' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center gap-1">
                      Ativo
                      {sortConfig?.key === 'ticker' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'sector', direction: prev?.key === 'sector' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center gap-1">
                      Setor
                      {sortConfig?.key === 'sector' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'currentQuantity', direction: prev?.key === 'currentQuantity' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Qtd
                      {sortConfig?.key === 'currentQuantity' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-[10px] font-bold text-blue-500 uppercase tracking-wider text-right border-l border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'averagePrice', direction: prev?.key === 'averagePrice' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      P. Médio Compra
                      {sortConfig?.key === 'averagePrice' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right border-l border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'lastPrice', direction: prev?.key === 'lastPrice' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Cotação Atual
                      {sortConfig?.key === 'lastPrice' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-[10px] font-bold text-amber-600 uppercase tracking-wider text-right border-l border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'targetPrice', direction: prev?.key === 'targetPrice' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Preço Alvo
                      {sortConfig?.key === 'targetPrice' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-right border-l border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'totalInvested', direction: prev?.key === 'totalInvested' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Total Compra
                      {sortConfig?.key === 'totalInvested' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'marketValue', direction: prev?.key === 'marketValue' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Total Atual
                      {sortConfig?.key === 'marketValue' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right border-l border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'profit', direction: prev?.key === 'profit' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Resultado
                      {sortConfig?.key === 'profit' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Sugestão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {Object.entries(groupedData).map(([category, assets]) => (
                  <React.Fragment key={category}>
                    {selectedTab === 'TUDO' && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={10} className="px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest border-y border-slate-100">
                          {category}
                        </td>
                      </tr>
                    )}
                    {assets.map((asset) => {
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
                          <td className="p-4">
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full uppercase">
                              {asset.sector}
                            </span>
                          </td>
                          <td className="p-4 text-sm text-slate-600 text-right font-mono">{formatValue(asset.currentQuantity, 8)}</td>
                          
                          <td className="p-4 text-sm text-blue-600 text-right font-mono border-l border-slate-100">{formatValue(avgPriceDisplay, 2)}</td>
                          
                          <td className="p-4 text-right border-l border-slate-100">
                            {asset.lastPrice ? (
                              <div className="flex flex-col items-end">
                                <span className="text-sm font-bold text-slate-800 font-mono">{formatValue(lastPriceDisplay, 2)}</span>
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
                                    {asset.targetPrice ? formatValue(targetPriceDisplay, 2) : 'Definir'}
                                  </span>
                                  {prices[asset.ticker]?.target && !registries.participants.find(p => p.id === asset.participantId)?.targetPrice && (
                                    <span className="text-[8px] bg-blue-100 text-blue-600 px-1 rounded font-black">MERCADO</span>
                                  )}
                                  <Edit2 className="w-2.5 h-2.5 text-slate-300 transition-opacity" />
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
                              <div className="flex flex-col items-center gap-1 group/sug relative">
                                <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-tighter ${suggestion.color}`}>
                                  {suggestion.text}
                                </span>
                                {suggestion.reason && (
                                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 group-hover/sug:opacity-100 transition-opacity z-50 pointer-events-none shadow-xl">
                                    <div className="font-bold mb-1 flex items-center gap-1">
                                      <Brain className="w-3 h-3" /> Insight da IA
                                    </div>
                                    {suggestion.reason}
                                    {suggestion.risk && (
                                      <div className="mt-1 pt-1 border-t border-white/10 flex justify-between">
                                        <span>Risco:</span>
                                        <span className={
                                          suggestion.risk === 'HIGH' ? 'text-red-400' :
                                          suggestion.risk === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'
                                        }>{suggestion.risk}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
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
                    .filter(t => {
                      const category = registries.categories.find(c => c.id === t.categoryId);
                      const categoryName = category?.name.toLowerCase() || '';
                      const description = t.description.toLowerCase();
                      
                      const isProvento = 
                        categoryName.includes('provento') || 
                        categoryName.includes('divid') || 
                        categoryName.includes('jcp') || 
                        categoryName.includes('rendimento') ||
                        description.includes('divid') || 
                        description.includes('jcp') || 
                        description.includes('rendimento') ||
                        description.includes('aluguel') ||
                        description.includes('yield');
                      
                      const isTaxOrFee = 
                        categoryName.includes('imposto') || 
                        categoryName.includes('taxa') || 
                        categoryName.includes('tarifa') ||
                        categoryName.includes('tax') || 
                        categoryName.includes('fee') ||
                        description.includes('tax') || 
                        description.includes('fee') || 
                        description.includes('iof') || 
                        description.includes('irrf') ||
                        description.includes('imposto') ||
                        description.includes('wht') ||
                        description.includes('withholding');
                      
                      const isDebitWithoutQty = t.type === 'DEBIT' && (!t.quantity || t.quantity <= 0);
                      
                      // Filtra para remover proventos e impostos/taxas do detalhamento
                      return !isProvento && !isTaxOrFee && !isDebitWithoutQty;
                    })
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((t) => {
                      const bank = registries.banks.find(b => b.id === t.bankId);
                      
                      return (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-4 text-sm text-slate-600 font-mono">
                            {new Date(t.date).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-4">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              t.type === 'DEBIT' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                            }`}>
                              {t.type === 'DEBIT' ? 'Compra' : 'Venda'}
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
