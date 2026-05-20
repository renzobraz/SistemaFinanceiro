
import React, { useMemo, useState, useEffect } from 'react';
import { Transaction, Bank, Category, Participant, Wallet, Currency, CostCenter, AssetAccrual } from '../types';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart as PieChartIcon,
  Plus,
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
  Filter,
  List,
  LayoutGrid,
  Calculator,
  History as HistoryIcon,
  Trash2
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { geminiService, InvestmentSuggestion } from '../services/geminiService';
import { financeService } from '../services/financeService';
import { ConfirmModal } from './ConfirmModal';
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
  Pie,
  AreaChart,
  Area
} from 'recharts';

interface AssetPerformanceReportProps {
  transactions: Transaction[];
  registries: {
    banks: Bank[];
    categories: Category[];
    participants: Participant[];
    wallets: Wallet[];
    costCenters?: CostCenter[];
    assetTypes?: any[];
    assetSectors?: any[];
    assetTickers?: any[];
  };
  onUpdateRegistry?: (forceRefresh?: boolean) => Promise<void>;
  selectedBankId: string;
  setSelectedBankId: (id: string) => void;
  selectedWalletId: string;
  setSelectedWalletId: (id: string) => void;
  hideHeader?: boolean;
  onOpenManualAdjust?: (fn: () => void) => void;
  onOpenAccrualHistory?: (fn: () => void) => void;
  onExportExcel?: (fn: () => void) => void;
  onExportPDF?: (fn: () => void) => void;
}

interface AssetPerformance {
  participantId: string;
  name: string;
  ticker: string;
  category: string;
  sector: string;
  currency: Currency;
  totalInvested: number; // In asset currency (Cost Basis for standard PM)
  totalReceived: number; // In asset currency (Dividends)
  totalDividendTaxes: number; // New: Taxes on dividends
  totalSold: number;     // In asset currency (Gross sales)
  totalBoughtQty: number;      // New
  totalSoldQty: number;        // New
  totalBoughtValue: number;    // New (Gross buys in asset currency)
  totalBoughtValueBRL: number; // New
  currentQuantity: number;
  averagePrice: number;  // In asset currency (Standard Fiscal PM)
  averagePriceNet?: number; // New (Net Fin / Qty)
  averagePriceWithProceeds?: number; // New ((Net Fin - Proventos) / Qty)
  averagePriceBRL: number;
  lastPrice?: number;    // In asset currency
  targetPrice?: number;  // In asset currency
  variation?: number;
  marketValue?: number;  // In asset currency
  profit?: number;       // In asset currency
  rentability?: number;  // Appreciation %
  totalReturn?: number;   // Appreciation + Proceeds %
  totalInvestedBRL: number;
  transactions: Transaction[];
  isWatchlist?: boolean;
}

export const AssetPerformanceReport: React.FC<AssetPerformanceReportProps> = ({ 
  transactions, 
  registries,
  onUpdateRegistry,
  selectedBankId,
  setSelectedBankId,
  selectedWalletId,
  setSelectedWalletId,
  hideHeader = false,
  onOpenManualAdjust,
  onOpenAccrualHistory,
  onExportExcel,
  onExportPDF
}) => {
  const getSafeDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    // Pega apenas a parte da data (YYYY-MM-DD) caso seja uma ISO string
    const dateOnly = dateStr.substring(0, 10);
    const parts = dateOnly.split('-');
    if (parts.length !== 3) return new Date(dateStr);
    const [year, month, day] = parts.map(Number);
    // Cria a data usando componentes locais para evitar shifts de timezone
    return new Date(year, month - 1, day);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [prices, setPrices] = useState<Record<string, { current: number | null; target: number | null; debugTicker?: string }>>({});
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, InvestmentSuggestion>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [detailAsset, setDetailAsset] = useState<AssetPerformance | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [selectedTab, setSelectedTab] = useState('TUDO');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [showClosedPositions, setShowClosedPositions] = useState(false);
  const [isUnifiedView, setIsUnifiedView] = useState(false);
  const [chartView, setChartView] = useState<'TYPE' | 'SECTOR' | 'ASSET' | 'INSTITUTION'>('TYPE');
  const [equityTimeRange, setEquityTimeRange] = useState<'12M' | '24M' | '5Y' | 'ALL'>('12M');
  const [equityTypeFilter, setEquityTypeFilter] = useState<string>('ALL');
  
  const [chartTicker, setChartTicker] = useState<string | null>(null);
  const [chartHistory, setChartHistory] = useState<{date: string, close: number}[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isChartClosing, setIsChartClosing] = useState(false);

  useEffect(() => {
    const fetchAccruals = async () => {
      setLoadingAccruals(true);
      try {
        const data = await financeService.getAssetAccruals();
        setAccruals(data);
      } catch (e) {
        console.error("Erro ao buscar acréscimos", e);
      } finally {
        setLoadingAccruals(false);
      }
    };
    fetchAccruals();
  }, []);

  const baseCurrency = useMemo(() => {
    if (selectedBankId === 'ALL') return 'BRL';
    const bank = registries.banks.find(b => String(b.id) === String(selectedBankId));
    return bank?.currency || 'BRL';
  }, [selectedBankId, registries.banks]);

  const isBalanceBased = (asset: AssetPerformance) => {
    const cat = asset.category.toUpperCase();
    return cat.includes('RENDA FIXA') || cat.includes('PREV') || cat.includes('PENS') || asset.name.toUpperCase().includes('PREVID');
  };
  
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [tempTargetPrice, setTempTargetPrice] = useState<string>('');
  const [isSavingTarget, setIsSavingTarget] = useState(false);

  const [simulatingAssetId, setSimulatingAssetId] = useState<string | null>(null);
  const [simQty, setSimQty] = useState<number>(0);
  const [simPrice, setSimPrice] = useState<number>(0);
  const [accruals, setAccruals] = useState<AssetAccrual[]>([]);
  const [loadingAccruals, setLoadingAccruals] = useState(false);
  const [detailTab, setDetailTab] = useState<'TRANS' | 'ACCRUALS'>('TRANS');
  const [isAddingAccrual, setIsAddingAccrual] = useState(false);
  const [newAccrualValue, setNewAccrualValue] = useState<number>(0);
  const [newAccrualDate, setNewAccrualDate] = useState(new Date().toISOString().substring(0, 10));
  const [newAccrualDesc, setNewAccrualDesc] = useState('');

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
      
      const participant = registries.participants.find(p => String(p.id).trim() === String(t.participantId).trim());
      
      // Regra do Usuário: Se tem Tipo (category) preenchido, é um investimento.
      const isInvestmentParticipant = !!participant?.category;
      const isInvestment = isInvestmentParticipant;

      if (isInvestment) {
        bankIds.add(t.bankId);
      }
    });

    // Também inclui bancos que possuem acréscimos manuais
    accruals.forEach(a => {
      if (a.bankId) bankIds.add(a.bankId);
    });

    return registries.banks
      .filter(b => bankIds.has(b.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [transactions, accruals, registries.participants, registries.categories, registries.banks]);

  const [isManualAccrualModalOpen, setIsManualAccrualModalOpen] = useState(false);
  const [isAccrualHistoryModalOpen, setIsAccrualHistoryModalOpen] = useState(false);
  const [manualAccrualParticipantId, setManualAccrualParticipantId] = useState('');
  const [manualAccrualBankId, setManualAccrualBankId] = useState('');
  const [manualAccrualValue, setManualAccrualValue] = useState<number>(0);
  const [manualAccrualDate, setManualAccrualDate] = useState(new Date().toISOString().substring(0, 10));
  const [manualAccrualDesc, setManualAccrualDesc] = useState('');
  const [editingAccrual, setEditingAccrual] = useState<AssetAccrual | null>(null);

  // Estados para o Modal de Confirmação de Exclusão
  const [isConfirmDeleteAccrualOpen, setIsConfirmDeleteAccrualOpen] = useState(false);
  const [accrualToDeleteId, setAccrualToDeleteId] = useState<string | null>(null);

  const performanceData = useMemo(() => {
    const assetMap = new Map<string, AssetPerformance>();

    // Pre-calcular totais de acréscimos por ativo
    const accrualsByAsset = new Map<string, number>();
    accruals.forEach(a => {
      // Filtro de banco para acréscimos manuais
      // REGRA: Se o lançamento TEM banco, ele deve bater com o filtro.
      // Se o lançamento NÃO TEM banco (Global), ele aparece sempre para o ativo.
      if (selectedBankId !== 'ALL' && a.bankId) {
        const aBankId = String(a.bankId);
        const sBankId = String(selectedBankId);
        
        if (aBankId !== sBankId) {
          // Busca os bancos para comparar nomes (caso de duplicatas após merge ou IDs diferentes para o mesmo banco)
          const accrualBank = registries.banks.find(b => String(b.id) === aBankId);
          const selectedBank = registries.banks.find(b => String(b.id) === sBankId);
          
          // Se nomes são diferentes (e ambos existem), então realmente é outro banco
          if (accrualBank && selectedBank && accrualBank.name.trim() !== selectedBank.name.trim()) {
            return;
          }
          // Se o banco do acréscimo não existe mais, permitimos (trata como global ou assume que era o selecionado)
          // Se names batem, permitimos.
        }
      }
      
      const assetIdStr = String(a.assetId);
      accrualsByAsset.set(assetIdStr, (accrualsByAsset.get(assetIdStr) || 0) + a.value);
    });

    // 1. Incluir ativos que possuem acréscimos mas podem não ter transações
    accruals.forEach(acc => {
      // REGRA: Se o lançamento TEM banco, ele deve bater com o filtro.
      // Se o lançamento NÃO TEM banco (Global), ele aparece sempre para o ativo.
      if (selectedBankId !== 'ALL' && acc.bankId) {
        const aBankId = String(acc.bankId);
        const sBankId = String(selectedBankId);
        
        if (aBankId !== sBankId) {
          const accrualBank = registries.banks.find(b => String(b.id) === aBankId);
          const selectedBank = registries.banks.find(b => String(b.id) === sBankId);
          
          if (accrualBank && selectedBank && accrualBank.name.trim() !== selectedBank.name.trim()) {
            return;
          }
        }
      }

      const accAssetIdStr = String(acc.assetId);
      if (!assetMap.has(accAssetIdStr)) {
        const participant = registries.participants.find(p => String(p.id) === accAssetIdStr);
        if (participant) {
          assetMap.set(accAssetIdStr, {
            participantId: participant.id,
            ticker: participant.ticker || participant.name,
            name: participant.name,
            category: participant.category || 'Outros',
            sector: participant.sector || 'N/A',
            currency: (participant.currency as Currency) || 'BRL',
            totalBoughtQty: 0,
            totalSoldQty: 0,
            currentQuantity: 0,
            totalBoughtValue: 0,
            totalSold: 0,
            totalInvested: 0,
            totalReceived: 0,
            averagePrice: 0,
            averagePriceNet: 0,
            averagePriceWithProceeds: 0,
            averagePriceBRL: 0,
            totalDividendTaxes: 0,
            totalBoughtValueBRL: 0,
            totalInvestedBRL: 0,
            marketValue: 0,
            profit: 0,
            variation: 0,
            rentability: 0,
            totalReturn: 0,
            transactions: []
          });
        }
      }
    });

    // 2. Garante que as transações estejam em ordem cronológica
    const sortedTransactions = [...transactions].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return da - db;
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });

    // Filtra apenas transações de investimento confirmadas
    const relevantTransactions = sortedTransactions.filter(t => {
      const isConfirmed = t.status === 'PAID';
      
      const participant = registries.participants.find(p => String(p.id).trim() === String(t.participantId).trim());
      // Consideramos investimento se tiver Tipo (category) OU Ticker
      const isInvestmentParticipant = !!participant?.category || !!participant?.ticker;
      
      const matchesBank = selectedBankId === 'ALL' || t.bankId === selectedBankId;
      const matchesWallet = selectedWalletId === 'ALL' || t.walletId === selectedWalletId;
      
      return isConfirmed && isInvestmentParticipant && matchesBank && matchesWallet;
    });

    relevantTransactions.forEach(t => {
      if (!assetMap.has(t.participantId)) {
        const participant = registries.participants.find(p => String(p.id).trim() === String(t.participantId).trim());
        const name = participant?.name || 'Desconhecido';
        const ticker = participant?.ticker || name.split('-')[0].trim().toUpperCase();
        const currency = participant?.currency || 'BRL';
        
        assetMap.set(t.participantId, {
          participantId: t.participantId,
          name,
          ticker,
          category: participant?.category || '',
          sector: participant?.sector || 'Não Segmentado',
          currency,
          totalInvested: 0,
          totalInvestedBRL: 0,
          totalReceived: 0,
          totalDividendTaxes: 0,
          totalSold: 0,
          totalBoughtQty: 0,
          totalSoldQty: 0,
          totalBoughtValue: 0,
          totalBoughtValueBRL: 0,
          currentQuantity: 0,
          averagePrice: 0,
          averagePriceBRL: 0,
          targetPrice: participant?.targetPrice,
          transactions: []
        });
      }

      const asset = assetMap.get(t.participantId)!;
      asset.transactions.push(t);

      const participant = registries.participants.find(p => String(p.id).trim() === String(t.participantId).trim());
      // Regra: Tipo ou Ticker preenchido = Investimento
      const isInvestmentParticipant = !!participant?.category || !!participant?.ticker;

      const bank = registries.banks.find(b => String(b.id) === String(t.bankId));
      const transactionCurrency = bank?.currency || 'BRL';
      const assetCurrency = asset.currency;

      const rateToBRL = (transactionCurrency === 'BRL') ? 1 : (t.exchangeRate || exchangeRates[transactionCurrency] || 1);
      const valueInBRL = t.value * rateToBRL;

      let valueInAsset = 0;
      if (transactionCurrency === assetCurrency) {
        valueInAsset = t.value;
      } else {
        if (t.exchangeRate) {
          valueInAsset = t.value / t.exchangeRate;
        } else {
          const assetRateToBRL = exchangeRates[assetCurrency] || 1;
          valueInAsset = valueInBRL / assetRateToBRL;
        }
      }

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

      if (isProvento || isTaxOrFee || (isDebitWithoutQty && !isInvestmentParticipant)) {
        if (t.type === 'DEBIT') {
          if (isTaxOrFee) {
            asset.totalDividendTaxes += valueInAsset;
          }
          asset.totalReceived -= valueInAsset;
        } else {
          asset.totalReceived += valueInAsset;
        }
        return; 
      }

      if (t.type === 'DEBIT') {
        // COMPRA: Aumenta quantidade e custo total
        asset.totalInvested += valueInAsset;
        asset.totalInvestedBRL += valueInBRL;
        
        asset.totalBoughtValue += valueInAsset;
        asset.totalBoughtValueBRL += valueInBRL;

        // Para ativos como Renda Fixa que podem não ter quantidade, tratamos como 1 unidade apenas se for a primeira compra ou se não houver saldo
        const qtyToUse = t.quantity || (isInvestmentParticipant && asset.currentQuantity === 0 ? 1 : 0);

        if (qtyToUse > 0 || (isInvestmentParticipant && !t.quantity)) {
          const finalQty = t.quantity || (asset.currentQuantity === 0 ? 1 : 0);
          asset.totalBoughtQty += finalQty;
          asset.currentQuantity += finalQty;
          
          // Preço Médio Atualizado = Custo Total / Quantidade Total
          asset.averagePrice = asset.currentQuantity > 0 ? asset.totalInvested / asset.currentQuantity : 0;
          asset.averagePriceBRL = asset.currentQuantity > 0 ? asset.totalInvestedBRL / asset.currentQuantity : 0;
        }
      } else {
        // VENDA: Reduz quantidade e reduz o custo total proporcionalmente ao preço médio atual
        // Se não houver quantidade informada e for um investimento, não assumimos venda total automaticamente para evitar sumiço por ajustes de saldo
        const qtyToUse = t.quantity || 0;

        if (qtyToUse > 0) {
          asset.totalSoldQty += qtyToUse;
          const currentAvg = asset.averagePrice;
          const currentAvgBRL = asset.averagePriceBRL;
          
          asset.totalInvested -= (qtyToUse * currentAvg);
          asset.totalInvestedBRL -= (qtyToUse * currentAvgBRL);
          asset.currentQuantity -= qtyToUse;
          
          if (asset.currentQuantity <= 0) {
            asset.currentQuantity = 0;
            asset.totalInvested = 0;
            asset.totalInvestedBRL = 0;
            asset.averagePrice = 0;
            asset.averagePriceBRL = 0;
          }
        } else if (isInvestmentParticipant && !t.quantity) {
          // Se for crédito sem quantidade, apenas reduzimos o custo investido (amortização/ajuste) sem mexer na quantidade 
          // a menos que seja um provento (já tratado acima). Isso evita que o ativo "suma" por ter quantidade zero.
          asset.totalInvested -= valueInAsset;
          asset.totalInvestedBRL -= valueInBRL;
          
          // Recalcula preço médio
          asset.averagePrice = asset.currentQuantity > 0 ? asset.totalInvested / asset.currentQuantity : 0;
          asset.averagePriceBRL = asset.currentQuantity > 0 ? asset.totalInvestedBRL / asset.currentQuantity : 0;
        }
        asset.totalSold += valueInAsset;
      }
    });

    // Finaliza cálculos e limpa ativos sem posição
    const result: AssetPerformance[] = [];
    assetMap.forEach(asset => {
      asset.ticker = asset.ticker.trim();
      const cleanTicker = asset.ticker;
      
      const totalAccruals = accrualsByAsset.get(String(asset.participantId)) || 0;

      if (asset.totalInvested > 0 || asset.currentQuantity > 0 || asset.totalSold > 0 || totalAccruals !== 0) {
        
        // Integrar Acréscimos (Rendimentos manuais)
        const marketData = prices[cleanTicker];
        const manualParticipant = registries.participants.find(p => String(p.id).trim() === String(asset.participantId).trim());
        const manualTarget = manualParticipant?.targetPrice;
        
        // Determinar se é Renda Fixa ou se deve ignorar quantidades
        const isRendaFixa = manualParticipant?.category?.toUpperCase().includes('RENDA FIXA');
        
        if (marketData && !isRendaFixa) {
          asset.lastPrice = marketData.current || 0;
          asset.targetPrice = manualTarget || marketData.target || undefined;
          asset.marketValue = (asset.currentQuantity * (asset.lastPrice || 0)) + totalAccruals;
          asset.profit = (asset.marketValue + asset.totalSold) - asset.totalInvested;
          asset.variation = asset.averagePrice > 0 ? ((asset.lastPrice || 0) / asset.averagePrice - 1) * 100 : 0;
          
          // Rentabilidade: (Total Atual + Vendas) / Total Investido
          asset.rentability = asset.totalInvested > 0 ? ((asset.marketValue + asset.totalSold) / asset.totalInvested - 1) * 100 : 0;
          
          // Total Return: (Total Atual + Vendas + Proventos) / Total Investido
          asset.totalReturn = asset.totalInvested > 0 ? ((asset.marketValue + asset.totalSold + asset.totalReceived) / asset.totalInvested - 1) * 100 : 0;

          const netFinancial = asset.totalBoughtValue - asset.totalSold;
          asset.averagePriceNet = asset.currentQuantity > 0 ? netFinancial / asset.currentQuantity : 0;
          asset.averagePriceWithProceeds = asset.currentQuantity > 0 ? (netFinancial - asset.totalReceived) / asset.currentQuantity : 0;
        } else {
          const manualPrice = isRendaFixa ? null : manualParticipant?.currentPrice;
          if (manualPrice && !isRendaFixa) {
            asset.lastPrice = manualPrice;
            asset.targetPrice = manualTarget;
            asset.marketValue = (asset.currentQuantity * asset.lastPrice) + totalAccruals;
            asset.profit = (asset.marketValue + asset.totalSold) - asset.totalInvested;
            asset.variation = asset.averagePrice > 0 ? (asset.lastPrice / asset.averagePrice - 1) * 100 : 0;
            asset.rentability = asset.totalInvested > 0 ? ((asset.marketValue + asset.totalSold) / asset.totalInvested - 1) * 100 : 0;
            asset.totalReturn = asset.totalInvested > 0 ? ((asset.marketValue + asset.totalSold + asset.totalReceived) / asset.totalInvested - 1) * 100 : 0;
            
            const netFinancial = asset.totalBoughtValue - asset.totalSold;
            asset.averagePriceNet = asset.currentQuantity > 0 ? netFinancial / asset.currentQuantity : 0;
            asset.averagePriceWithProceeds = asset.currentQuantity > 0 ? (netFinancial - asset.totalReceived) / asset.currentQuantity : 0;
          } else {
            // Se for Renda Fixa ou não tem preço manual nem ticker, o valor de mercado é o fluxo financeiro líquido + acréscimos
            // Lógica Específica para Renda Fixa / Manuais (Solicitação do Usuário)
            // 1. Valor Investido -> Total Compra
            // 2. Total Atual -> Soma do capital + Rendimentos (interpretado como o saldo atual)
            // 3. Resultado -> Valor dos Rendimentos (Acréscimos)
            const netCost = asset.totalBoughtValue - asset.totalSold;
            asset.totalInvested = netCost; 
            asset.marketValue = netCost + totalAccruals;
            asset.profit = totalAccruals; 
            
            // Rentabilidade % solicitada
            asset.rentability = asset.totalInvested !== 0 ? (asset.profit / Math.abs(asset.totalInvested)) * 100 : 0;
            asset.totalReturn = asset.rentability;
            
            asset.lastPrice = 1;
            asset.currentQuantity = asset.marketValue; 
            asset.variation = 0;
          }
        }
        result.push(asset);
      }
    });

    // Nova Lógica: Incluir itens do Radar (Participantes com Ticker mas sem investimentos)
    const isFiltered = (selectedBankId && selectedBankId !== 'ALL') || (selectedWalletId && selectedWalletId !== 'ALL');
    
    if (!isFiltered) {
      registries.participants.forEach(p => {
        const cleanTicker = (p.ticker || '').trim();
        if (cleanTicker && !assetMap.has(p.id)) {
        const resultItem: AssetPerformance = {
          participantId: p.id,
          name: p.name,
          ticker: cleanTicker,
          category: p.category || 'Monitoramento',
          sector: p.sector || 'Radar',
          currency: p.currency || 'BRL',
          totalInvested: 0,
          totalInvestedBRL: 0,
          totalReceived: 0,
          totalDividendTaxes: 0,
          totalSold: 0,
          totalBoughtQty: 0,
          totalSoldQty: 0,
          totalBoughtValue: 0,
          totalBoughtValueBRL: 0,
          currentQuantity: 0,
          averagePrice: 0,
          averagePriceBRL: 0,
          targetPrice: p.targetPrice,
          transactions: [],
          isWatchlist: true,
          rentability: 0,
          totalReturn: 0
        };

        const marketData = prices[cleanTicker];
        if (marketData) {
          resultItem.lastPrice = marketData.current;
          resultItem.targetPrice = p.targetPrice || marketData.target || undefined;
          resultItem.variation = 0;
        } else if (p.currentPrice) {
          resultItem.lastPrice = p.currentPrice;
        }

        result.push(resultItem);
      }
    });
    }

    return result.sort((a, b) => {
      const rateA = exchangeRates[a.currency] || 1;
      const rateB = exchangeRates[b.currency] || 1;
      const valA = (a.marketValue || a.totalInvested) * rateA;
      const valB = (b.marketValue || b.totalInvested) * rateB;
      return valB - valA;
    });
  }, [transactions, accruals, registries.participants, registries.categories, registries.wallets, prices, exchangeRates, selectedBankId, selectedWalletId]);

  const fetchPrices = async (force: boolean = false) => {
    // Busca tickers de investimentos reais e da watchlist
    const tickers = Array.from(new Set([
      ...performanceData.map(a => a.ticker.trim()),
      ...registries.participants.filter(p => p.ticker).map(p => p.ticker!.trim())
    ])).filter(t => t && t.length > 0);

    if (tickers.length === 0) return;

    setLoadingPrices(true);
    try {
      console.log("[Debug] Iniciando busca de preços para ativos:", tickers);
      const { prices: newPrices, timestamp: priceTime } = await geminiService.fetchAssetPrices(tickers, force);
      
      // Mantemos todas as entradas para que o debugTicker (se existir) chegue à UI
      const validPrices: Record<string, any> = {};
      Object.entries(newPrices).forEach(([t, data]: [string, any]) => {
        if (data) {
          validPrices[t] = data;
          if (data.current === null) {
            console.warn(`[Debug] Preço não encontrado para: ${t}. Info:`, data);
          }
        }
      });

      console.log("[Debug] Novos preços válidos recebidos:", validPrices);
      setPrices(prev => ({ ...prev, ...validPrices }));
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

  const loadHistory = async (ticker: string) => {
    setChartTicker(ticker);
    setLoadingHistory(true);
    try {
      const history = await geminiService.fetchAssetHistory(ticker);
      setChartHistory(history);
    } catch (e) {
      console.error("Erro ao carregar histórico", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const closeChart = () => {
    setIsChartClosing(true);
    setTimeout(() => {
      setChartTicker(null);
      setChartHistory([]);
      setIsChartClosing(false);
    }, 300);
  };

  const handleSaveTargetPrice = async (asset: AssetPerformance) => {
    const newPrice = parseFloat(tempTargetPrice.replace(',', '.'));
    if (isNaN(newPrice)) {
      setEditingTargetId(null);
      return;
    }

    setIsSavingTarget(true);
    try {
      const participant = registries.participants.find(p => String(p.id).trim() === String(asset.participantId).trim());
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

  const handleDeleteAccrual = async (id: string) => {
    if (!id) return;
    try {
      await financeService.deleteAssetAccrual(id);
      setAccruals(prev => prev.filter(a => String(a.id) !== String(id)));
    } catch (e) {
      console.error("Erro ao excluir acréscimo", e);
      alert("Não foi possível excluir o lançamento. Verifique sua conexão ou permissões.");
    } finally {
      setIsConfirmDeleteAccrualOpen(false);
      setAccrualToDeleteId(null);
    }
  };

  const handleSaveManualAccrual = async () => {
    const numericValue = manualAccrualValue;

    if (!manualAccrualParticipantId || isNaN(numericValue)) return;
    
    const accrualToSave: AssetAccrual = {
      id: editingAccrual?.id || '',
      assetId: manualAccrualParticipantId,
      bankId: manualAccrualBankId,
      date: manualAccrualDate,
      value: numericValue,
      description: manualAccrualDesc || 'Lançamento Manual'
    };

    try {
      const saved = await financeService.saveAssetAccrual(accrualToSave);
      
      // Log para depuração de retorno
      console.log('[DEBUG] Acréscimo salvo retornado:', saved);

      setAccruals(prev => {
        const index = prev.findIndex(a => String(a.id) === String(saved.id));
        if (index >= 0) {
          const newList = [...prev];
          newList[index] = saved;
          return newList;
        }
        return [saved, ...prev];
      });
      setIsManualAccrualModalOpen(false);
      setEditingAccrual(null);
      setManualAccrualParticipantId('');
      setManualAccrualBankId('');
      setManualAccrualValue(0);
      setManualAccrualDesc('');
      setIsAddingAccrual(false); // Fecha o form se estiver no detalhe
    } catch (e) {
      console.error("Erro ao salvar acréscimo manual", e);
      alert("Erro ao salvar o lançamento. Tente novamente.");
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
      const rentability = asset.rentability || 0;
      const totalReturn = asset.totalReturn || 0;

      return {
        'Ticker': asset.ticker,
        'Nome': asset.name,
        'Categoria': asset.category,
        'Quantidade': asset.currentQuantity,
        [`P. Médio (${baseCurrency})`]: avgPriceDisplay,
        [`Preço Atual (${baseCurrency})`]: lastPriceDisplay,
        [`Total Compra (${baseCurrency})`]: totalInvestedDisplay,
        [`Total Atual (${baseCurrency})`]: marketValueDisplay,
        [`Resultado (${baseCurrency})`]: profitDisplay,
        'Rentabilidade (%)': rentability,
        'Total Return (%)': totalReturn,
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
        `${(asset.rentability || 0).toFixed(2)}%`,
        `${(asset.totalReturn || 0).toFixed(2)}%`,
        `${(asset.variation || 0).toFixed(2)}%`
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [['Ticker', 'Qtd', 'P. Médio', 'Preço Atual', 'Total Compra', 'Total Atual', 'Resultado', 'Rent %', 'TR %', 'Var %']],
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

  const formatCurrencyInput = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  const handleCurrencyInputChange = (e: React.ChangeEvent<HTMLInputElement>, callback: (val: number) => void) => {
    // Permite digitar apenas números
    const digits = e.target.value.replace(/\D/g, "");
    // Transforma em decimal (centavos / 100)
    const numericValue = digits ? parseFloat(digits) / 100 : 0;
    callback(numericValue);
  };

  const formatCurrency = (val: number, currencyValue: Currency = 'BRL') => {
    const absoluteVal = Math.abs(val) < 0.005 ? 0 : val;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currencyValue }).format(absoluteVal);
  };

  const formatValue = (val: number, decimals: number = 2) => {
    const absoluteVal = Math.abs(val) < 0.005 ? 0 : val;
    return new Intl.NumberFormat('pt-BR', { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    }).format(absoluteVal);
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
  const [isUpdatingBalanceId, setIsUpdatingBalanceId] = useState<string | null>(null);
  const [newBalanceValue, setNewBalanceValue] = useState<string>('');
  const [isSavingBalance, setIsSavingBalance] = useState(false);

  // CÁLCULO DE CÂMBIO MÉDIO (SOLICITAÇÃO DO USUÁRIO)
  const usdExchangeStats = useMemo(() => {
    let totalUsdReceived = 0;
    let totalBrlSpentWithoutFees = 0;
    let totalBrlSpentWithFees = 0;

    // Filtramos transações que alimentaram a conta USD com BRL
    // Geralmente são CREDIT na conta USD vindo de BRL (t.exchangeRate ou t.vet)
    // OU DEBIT de ativos em USD onde a fonte foi BRL (toda compra gera um câmbio implícito)
    transactions.forEach(t => {
      if (t.status !== 'PAID') return;
      
      const bank = registries.banks.find(b => b.id === t.bankId);
      const isUsdTransaction = bank?.currency === 'USD';
      
      // Consideramos créditos em USD com taxa de câmbio (Remessas)
      if (isUsdTransaction && t.type === 'CREDIT' && (t.exchangeRate || t.vet)) {
        const usdValue = t.value;
        const rate = t.exchangeRate || 1;
        const vet = t.vet || rate;
        
        totalUsdReceived += usdValue;
        totalBrlSpentWithoutFees += usdValue * rate;
        totalBrlSpentWithFees += usdValue * vet;
      }
      
      // Também consideramos compras diretas de ativos se o usuário informou o câmbio no lançamento
      // Mas evitamos duplicar se ele lanca a remessa e depois a compra com saldo.
      // Geralmente, a "Compra de Dólar" é a Remessa (CREDIT).
    });

    if (totalUsdReceived === 0) return null;

    return {
      avgRateWithoutFees: totalBrlSpentWithoutFees / totalUsdReceived,
      avgRateWithFees: totalBrlSpentWithFees / totalUsdReceived,
      totalUsd: totalUsdReceived,
      totalBrl: totalBrlSpentWithFees
    };
  }, [transactions, registries.banks]);

  const [isSimulatorMode, setIsSimulatorMode] = useState(false);
  const [simulationData, setSimulationData] = useState<Record<string, number>>({}); // Armazena a quantidade simulada por ID do participante

  const handleUpdateBalance = async (asset: AssetPerformance) => {
    // Tratamento robusto para vírgula e ponto
    const normalizedValue = newBalanceValue.replace(/\./g, '').replace(',', '.');
    const newVal = parseFloat(normalizedValue);
    
    if (isNaN(newVal)) {
      setIsUpdatingBalanceId(null);
      return;
    }

    setIsSavingBalance(true);
    try {
      // 1. Calcular a diferença para o rendimento
      const currentBookValue = asset.totalInvested - asset.totalReceived - asset.totalSold;
      const diff = newVal - currentBookValue;

      if (Math.abs(diff) > 0.01) {
        // Busca o bankId e walletId do último lançamento ou do filtro atual
        // Evitamos selecionar o primeiro banco da lista se não houver contexto claro
        const lastTx = asset.transactions[asset.transactions.length - 1];
        
        let bankId = '';
        if (lastTx?.bankId) {
          bankId = String(lastTx.bankId);
        } else if (selectedBankId && selectedBankId !== 'ALL') {
          bankId = String(selectedBankId);
        } else if (accruals.length > 0) {
          // Tenta pegar de algum acréscimo existente do mesmo ativo
          const lastAcc = accruals.find(a => a.assetId === asset.participantId && a.bankId);
          if (lastAcc?.bankId) bankId = String(lastAcc.bankId);
        }

        let walletId = '';
        if (lastTx?.walletId) {
          walletId = String(lastTx.walletId);
        } else if (selectedWalletId && selectedWalletId !== 'ALL') {
          walletId = String(selectedWalletId);
        }

        // Se ainda estiver vazio e não houver contexto, não forçamos o banco [0]
        // O financeService deve conseguir salvar sem banco se o banco for opcional
        // Mas para transações reais, o banco costuma ser necessário.
        // Se ainda não temos nada, aí sim usamos o primeiro apenas como último recurso
        if (!bankId && registries.banks.length > 0) bankId = String(registries.banks[0].id);
        if (!walletId && registries.wallets.length > 0) walletId = String(registries.wallets[0].id);
        
        // Categoria de rendimentos
        let yieldCat = registries.categories.find(c => 
          c.name.toLowerCase().includes('rendimento') || 
          c.name.toLowerCase().includes('provento') ||
          c.name.toLowerCase().includes('ajuste')
        );

        const dateStr = new Date().toISOString().split('T')[0];

        if (diff > 0) {
          // Rendimento (CRÉDITO)
          await financeService.saveTransaction({
            id: '',
            date: dateStr,
            description: `Rendimento/Ajuste: ${asset.ticker || asset.name}`,
            docNumber: 'RENDTO',
            value: diff,
            type: 'CREDIT',
            status: 'PAID',
            bankId: bankId,
            walletId: walletId,
            participantId: asset.participantId,
            categoryId: yieldCat?.id || (registries.categories[0]?.id || ''),
            costCenterId: lastTx?.costCenterId || (registries.costCenters && registries.costCenters[0]?.id) || ''
          });

          // Adiciona também ao histórico de acréscimos manuais para visibilidade
          await financeService.saveAssetAccrual({
            id: '',
            assetId: asset.participantId,
            bankId: bankId,
            date: dateStr,
            value: diff,
            description: `Ajuste Automático via Atualização de Saldo`
          });
        } else {
          // Ajuste Negativo (DÉBITO)
          await financeService.saveTransaction({
            id: '',
            date: dateStr,
            description: `Ajuste Saldo: ${asset.ticker || asset.name}`,
            docNumber: 'AJUSTE',
            value: Math.abs(diff),
            type: 'DEBIT',
            status: 'PAID',
            bankId: bankId,
            walletId: walletId,
            participantId: asset.participantId,
            categoryId: registries.categories.find(c => c.name.toLowerCase().includes('taxa') || c.name.toLowerCase().includes('imposto'))?.id || yieldCat?.id || (registries.categories[0]?.id || ''),
            costCenterId: lastTx?.costCenterId || (registries.costCenters && registries.costCenters[0]?.id) || ''
          });

          // Registra o ajuste negativo também
          await financeService.saveAssetAccrual({
            id: '',
            assetId: asset.participantId,
            bankId: bankId,
            date: dateStr,
            value: diff, // Valor negativo como ajuste
            description: `Ajuste Saldo Negativo via Atualização`
          });
        }
      }

      // 2. Atualizar o Preço Atual do participante para refletir o novo valor unitário
      const participant = registries.participants.find(p => String(p.id).trim() === String(asset.participantId).trim());
      if (participant) {
        const newUnitPrice = asset.currentQuantity > 0 ? newVal / asset.currentQuantity : newVal;
        await financeService.saveRegistryItem('participants', {
          ...participant,
          currentPrice: newUnitPrice
        });
      }

      if (onUpdateRegistry) {
        await onUpdateRegistry(true);
      }

      setIsUpdatingBalanceId(null);
      setNewBalanceValue('');
      // Recarregar para atualizar todos os cálculos
      window.location.reload();
    } catch (e) {
      console.error("Erro ao atualizar saldo", e);
      alert("Erro ao salvar rendimento. Verifique se há um banco/conta vinculado.");
    } finally {
      setIsSavingBalance(false);
      setIsUpdatingBalanceId(null);
      setNewBalanceValue('');
    }
  };

  const filteredData = useMemo(() => {
    let data = performanceData.filter(a => {
      const matchesSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           a.ticker.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSector = sectorFilter === 'ALL' || a.sector === sectorFilter;
      
      if (!matchesSearch || !matchesSector) return false;

      // Ativos Ativos vs Zerados (Histórico)
      if (!a.isWatchlist) {
        if (showClosedPositions) {
          // Histórico: mostra o que está zerado (ou quase)
          if (a.currentQuantity > 0.0001 || a.totalInvested > 0.01) return false;
        } else {
          // Carteira: mostra o que tem saldo ou quantidade
          const hasBalance = a.currentQuantity > 0.0001 || Math.abs(a.totalInvested) > 0.01 || Math.abs(a.marketValue || 0) > 0.01;
          if (!hasBalance) return false;
        }
      }
      
      // Nova lógica de abas incluindo RADAR
      if (selectedTab === 'TUDO') return !a.isWatchlist;
      if (selectedTab === 'RADAR') return !!a.isWatchlist;
      
      // Se estiver em abas de categorias, não mostra watchlist (radar)
      if (a.isWatchlist) return false;
      
      const participant = registries.participants.find(p => String(p.id).trim() === String(a.participantId).trim());
      const hasRealTicker = !!participant?.ticker && participant.ticker.trim().length > 0;
      const cat = (a.category || "").toUpperCase();
      
      if (selectedTab === 'AÇÕES') {
        const isAcao = cat.includes('AÇÃO') || cat.includes('ACAO') || cat.includes('STOCK') || cat.includes('RENDA VARIÁVEL') || cat.includes('RENDA VARIAVEL') || cat.includes('ETF');
        return hasRealTicker && (isAcao || cat.length === 0);
      }
      
      if (selectedTab === 'FIIS') {
        const isFii = cat.includes('FII') || cat.includes('IMOBILIARIO') || cat.includes('IMOBILIÁRIO');
        return hasRealTicker && isFii;
      }

      if (selectedTab === 'PREVIDÊNCIA') {
        const isPrev = cat.includes('PREV') || 
                       cat.includes('PENS') || 
                       a.name.toUpperCase().includes('PREV') || 
                       a.name.toUpperCase().includes('APOSENTAD');
        return isPrev;
      }
      
      if (selectedTab === 'RENDA FIXA') {
        // Regra do Usuário: Se tem Tipo (Category) mas NÃO tem Ticker -> Renda Fixa
        // Isso independe do nome da categoria, basta não ter ticker.
        return !hasRealTicker && cat.length > 0 && !cat.includes('PREV');
      }
      
      if (selectedTab === 'OUTROS') {
        const isAcao = cat.includes('AÇÃO') || cat.includes('ACAO') || cat.includes('STOCK') || cat.includes('RENDA VARIÁVEL') || cat.includes('RENDA VARIAVEL') || cat.includes('ETF');
        const isFii = cat.includes('FII') || cat.includes('IMOBILIARIO') || cat.includes('IMOBILIÁRIO');
        const isPrev = cat.includes('PREV');
        const isRendaFixa = !hasRealTicker && cat.length > 0 && !isPrev;
        return !isAcao && !isFii && !isRendaFixa && !isPrev;
      }
      
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

  const totalsByCurrency = useMemo(() => {
    const map: Record<string, { invested: number, received: number, market: number, profit: number }> = {};
    filteredData.forEach(curr => {
      const currency = curr.currency;
      if (!map[currency]) {
        map[currency] = { invested: 0, received: 0, market: 0, profit: 0 };
      }
      map[currency].invested += curr.totalInvested;
      map[currency].received += curr.totalReceived;
      map[currency].market += (curr.marketValue || 0);
      map[currency].profit += (curr.profit || 0);
    });
    return map;
  }, [filteredData]);

  const totals = useMemo(() => {
    return filteredData.reduce((acc, curr) => {
      const rate = exchangeRates[curr.currency] || 1;
      return {
        invested: acc.invested + (curr.totalInvested * rate),
        received: acc.received + (curr.totalReceived * rate),
        taxes: acc.taxes + (curr.totalDividendTaxes * rate),
        market: acc.market + ((curr.marketValue || 0) * rate),
        profit: acc.profit + ((curr.profit || 0) * rate),
        boughtValue: acc.boughtValue + (curr.totalBoughtValue * rate),
        soldValue: acc.soldValue + (curr.totalSold * rate),
        boughtQty: acc.boughtQty + curr.totalBoughtQty,
        soldQty: acc.soldQty + curr.totalSoldQty,
        currentQty: acc.currentQty + curr.currentQuantity
      };
    }, { 
      invested: 0, 
      received: 0, 
      taxes: 0,
      market: 0, 
      profit: 0, 
      boughtValue: 0, 
      soldValue: 0, 
      boughtQty: 0, 
      soldQty: 0,
      currentQty: 0
    });
  }, [filteredData, exchangeRates]);

  const cashBalanceByCurrency = useMemo(() => {
    const map: Record<string, number> = {};
    const matchesBank = (t: Transaction) => selectedBankId === 'ALL' || t.bankId === selectedBankId;
    const matchesWallet = (t: Transaction) => selectedWalletId === 'ALL' || t.walletId === selectedWalletId;
    
    transactions
      .filter(t => t.status === 'PAID' && matchesBank(t) && matchesWallet(t))
      .forEach(t => {
      const bank = registries.banks.find(b => String(b.id) === String(t.bankId));
      const currency = bank?.currency || 'BRL';
        if (!map[currency]) map[currency] = 0;
        map[currency] += (t.type === 'CREDIT' ? t.value : -t.value);
      });
      
    return map;
  }, [transactions, selectedBankId, selectedWalletId, registries.banks]);

  const cashBalance = useMemo(() => {
    let totalsBRL = 0;
    Object.entries(cashBalanceByCurrency).forEach(([cur, val]) => {
      const rate = exchangeRates[cur as Currency] || 1;
      totalsBRL += val * rate;
    });
    return totalsBRL;
  }, [cashBalanceByCurrency, exchangeRates]);

  const safeBaseRate = useMemo(() => exchangeRates[baseCurrency] || 1, [exchangeRates, baseCurrency]);
  
  const simulationSummary = useMemo(() => {
    if (!isSimulatorMode) return null;

    const costs: Record<string, number> = {};
    Object.entries(simulationData).forEach(([participantId, qty]) => {
      if (qty <= 0) return;
      const asset = performanceData.find(a => a.participantId === participantId);
      if (!asset) return;
      
      const price = asset.lastPrice || asset.averagePrice || 0;
      const currency = asset.currency || baseCurrency;
      costs[currency] = (costs[currency] || 0) + (qty * price);
    });

    return costs;
  }, [isSimulatorMode, simulationData, performanceData, baseCurrency]);

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
        const bank = registries.banks.find(b => String(b.id) === String(t.bankId));
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

  const equityEvolutionData = useMemo(() => {
    // 1. Definir o range de datas
    const now = new Date();
    let start = new Date(now.getFullYear(), now.getMonth() - 11, 1); // Default 12M
    
    if (equityTimeRange === '24M') start = new Date(now.getFullYear(), now.getMonth() - 23, 1);
    else if (equityTimeRange === '5Y') start = new Date(now.getFullYear() - 5, now.getMonth(), 1);
    else if (equityTimeRange === 'ALL') {
      const allDates = transactions.map(t => getSafeDate(t.date).getTime());
      if (allDates.length > 0) start = new Date(Math.min(...allDates));
      else start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      start.setDate(1);
    }

    // 2. Gerar meses
    const months: Date[] = [];
    let current = new Date(start);
    while (current <= now) {
      months.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }

    // 3. Processar dados para cada mês
    return months.map(monthEnd => {
      const label = `${(monthEnd.getMonth() + 1).toString().padStart(2, '0')}/${monthEnd.getFullYear().toString().slice(2)}`;
      
      const checkMatchesType = (t: any) => {
         if (equityTypeFilter === 'ALL') return true;
         // Tentar encontrar categoria pelo ID ou pelo Asset se disponível através de registries
         const category = registries.categories.find(c => String(c.id) === String(t.categoryId));
         const catName = category?.name.toUpperCase() || t.category?.toUpperCase() || '';
         
         if (equityTypeFilter === 'AÇÕES') return catName.includes('AÇÃO') || catName.includes('STOCK') || catName.includes('VARIÁVEL');
         if (equityTypeFilter === 'FII') return catName.includes('FII') || catName.includes('IMOBILIARIO');
         if (equityTypeFilter === 'RENDA FIXA') return catName.includes('RENDA FIXA');
         return catName.includes(equityTypeFilter.toUpperCase());
      };

      // Investido Acumulado até o final do mês
      const relevantTransactions = transactions.filter(t => {
        const transDate = getSafeDate(t.date);
        return transDate <= monthEnd && checkMatchesType(t);
      });

      let invested = 0;
      relevantTransactions.forEach(t => {
        const bank = registries.banks.find(b => String(b.id) === String(t.bankId));
        const rate = exchangeRates[bank?.currency || 'BRL'] || 1;
        invested += (t.type === 'DEBIT' ? t.value : -t.value) * rate;
      });

      // Ganho de Capital Estimado
      // Usamos os accruals (acréscimos manuais) acumulados para representar o ganho/valorização
      const relevantAccruals = accruals.filter(a => {
        const accDate = getSafeDate(a.date);
        return accDate <= monthEnd && checkMatchesType(a);
      });
      
      let accruedGain = 0;
      relevantAccruals.forEach(a => {
        const bank = registries.banks.find(b => String(b.id) === String(a.bankId));
        const rate = exchangeRates[bank?.currency || 'BRL'] || 1;
        accruedGain += a.value * rate;
      });

      // Se for o mês atual e estivermos em visão total, usamos o lucro calculado real como âncora de ganho
      let displayGain = accruedGain;
      let displayInvested = invested;

      const isCurrentMonth = monthEnd.getMonth() === now.getMonth() && monthEnd.getFullYear() === now.getFullYear();
      if (isCurrentMonth && equityTypeFilter === 'ALL') {
        displayInvested = totals.invested;
        displayGain = totals.profit > 0 ? totals.profit : 0;
      } else if (isCurrentMonth) {
        // Tentar filtrar o lucro do totals para o tipo selecionado
        const filteredTotals = filteredData.reduce((acc, curr) => {
            const currentCat = curr.category.toUpperCase();
            let matches = false;
            if (equityTypeFilter === 'AÇÕES') matches = currentCat.includes('AÇÃO') || currentCat.includes('STOCK');
            else if (equityTypeFilter === 'FII') matches = currentCat.includes('FII') || currentCat.includes('IMOBILIARIO');
            else if (equityTypeFilter === 'RENDA FIXA') matches = currentCat.includes('RENDA FIXA');
            
            if (matches) {
                const rate = exchangeRates[curr.currency] || 1;
                return { 
                    invested: acc.invested + (curr.totalInvested * rate),
                    profit: acc.profit + ((curr.profit || 0) * rate)
                };
            }
            return acc;
        }, { invested: 0, profit: 0 });
        
        if (filteredTotals.invested > 0) {
            displayInvested = filteredTotals.invested;
            displayGain = filteredTotals.profit > 0 ? filteredTotals.profit : 0;
        }
      }

      return {
        month: label,
        invested: Math.max(0, displayInvested / safeBaseRate),
        gain: Math.max(0, displayGain / safeBaseRate),
        total: (displayInvested + displayGain) / safeBaseRate
      };
    });
  }, [transactions, accruals, equityTimeRange, equityTypeFilter, exchangeRates, totals, registries, safeBaseRate, filteredData]);

  const openManualAdjust = () => {
    setEditingAccrual(null);
    setManualAccrualParticipantId('');
    setManualAccrualBankId(selectedBankId !== 'ALL' ? String(selectedBankId) : '');
    setManualAccrualValue(0);
    setManualAccrualDate(new Date().toISOString().split('T')[0]);
    setManualAccrualDesc('');
    setIsManualAccrualModalOpen(true);
  };

  const openAccrualHistory = () => {
    setIsAccrualHistoryModalOpen(true);
  };

  useEffect(() => {
    if (onOpenManualAdjust) onOpenManualAdjust(openManualAdjust);
  }, [onOpenManualAdjust, selectedBankId]);

  useEffect(() => {
    if (onOpenAccrualHistory) onOpenAccrualHistory(openAccrualHistory);
  }, [onOpenAccrualHistory]);

  useEffect(() => {
    if (onExportExcel) onExportExcel(exportToExcel);
  }, [onExportExcel, filteredData, exchangeRates, baseCurrency]);

  useEffect(() => {
    if (onExportPDF) onExportPDF(exportToPDF);
  }, [onExportPDF, filteredData, exchangeRates, baseCurrency]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filtros e Moeda Base */}
      {!hideHeader && (
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
            <div className="flex items-center bg-indigo-50 rounded-xl border border-indigo-100 shadow-sm overflow-hidden">
              <button
                onClick={() => {
                  setEditingAccrual(null);
                  setManualAccrualParticipantId('');
                  setManualAccrualBankId(selectedBankId !== 'ALL' ? String(selectedBankId) : '');
                  setManualAccrualValue(0);
                  setManualAccrualDate(new Date().toISOString().split('T')[0]);
                  setManualAccrualDesc('');
                  setIsManualAccrualModalOpen(true);
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-indigo-600 hover:bg-indigo-100 transition-all text-xs font-bold border-r border-indigo-100"
                title="Lançar valor em um ativo (ex: Previdência ou Renda Fixa)"
              >
                <Plus className="w-3.5 h-3.5" /> Ajuste Manual
              </button>
              <button
                onClick={() => setIsAccrualHistoryModalOpen(true)}
                className="px-2 py-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 transition-all"
                title="Ver Histórico de Ajustes"
              >
                <HistoryIcon className="w-4 h-4" />
              </button>
            </div>
            
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
      )}

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

      {/* Câmbio Médio (USD) - Somente se for conta USD ou visão global */}
      {usdExchangeStats && (selectedBankId === 'ALL' || baseCurrency === 'USD') && (
        <div className="bg-blue-50/30 border border-blue-100 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm animate-fade-in mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <RefreshCw className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h4 className="text-sm font-black text-blue-900 uppercase tracking-tight">Câmbio Médio de Compra (USD)</h4>
              <p className="text-[10px] text-blue-600 font-medium tracking-wide">Baseado no fluxo histórico de remessas e compras</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 w-full md:w-auto">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Sem Taxas</span>
              <span className="text-lg font-black text-slate-700 font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4 }).format(usdExchangeStats.avgRateWithoutFees)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-0.5 flex items-center gap-1" title="Inclui Spread e IOF declarados nos lançamentos (VET)">
                Com Taxas <Info className="w-2.5 h-2.5" />
              </span>
              <span className="text-lg font-black text-blue-600 font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4 }).format(usdExchangeStats.avgRateWithFees)}
              </span>
            </div>
            <div className="hidden sm:flex flex-col border-l border-blue-100 pl-6">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Enviado</span>
              <span className="text-sm font-bold text-slate-500 font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(usdExchangeStats.totalUsd)}
              </span>
            </div>
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
          <div className="space-y-1">
            <div className="text-2xl font-black text-slate-800 tracking-tight">
              {formatCurrency(totals.invested / safeBaseRate, baseCurrency)}
            </div>
            {Object.keys(totalsByCurrency).length > 1 && selectedBankId === 'ALL' && (
              <div className="flex flex-wrap gap-x-2 text-[10px] text-slate-400 font-medium">
                {Object.entries(totalsByCurrency).map(([cur, data]) => (
                  <span key={cur}>{formatCurrency(data.invested, cur as Currency)}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm group relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 rounded-lg">
              <WalletIcon className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Saldo em Conta</span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-black text-amber-600 tracking-tight">
              {formatCurrency(cashBalance / safeBaseRate, baseCurrency)}
            </div>
            {Object.keys(cashBalanceByCurrency).length > 1 && selectedBankId === 'ALL' && (
              <div className="flex flex-wrap gap-x-2 text-[10px] text-slate-400 font-medium">
                {Object.entries(cashBalanceByCurrency).map(([cur, val]) => (
                  <span key={cur}>{formatCurrency(val, cur as Currency)}</span>
                ))}
              </div>
            )}
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
                      return acc + (t.type === 'CREDIT' ? t.value : -t.value);
                    }, 0);
                  
                  if (Math.abs(balance) < 0.01) return null;

                  return (
                    <div key={bank.id} className="flex justify-between items-center">
                      <span className="text-slate-300 truncate mr-2">{bank.name}</span>
                      <span className="font-mono font-bold">{formatCurrency(balance, bank.currency)}</span>
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
          <div className="space-y-1">
            <div className="text-2xl font-black text-emerald-600 tracking-tight">
              {formatCurrency(totals.received / safeBaseRate, baseCurrency)}
            </div>
            {Object.keys(totalsByCurrency).length > 1 && selectedBankId === 'ALL' && (
              <div className="flex flex-wrap gap-x-2 text-[10px] text-slate-400 font-medium">
                {Object.entries(totalsByCurrency).map(([cur, data]) => (
                  <span key={cur}>{formatCurrency(data.received, cur as Currency)}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Valor de Mercado</span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-black text-purple-600 tracking-tight">
              {formatCurrency(totals.market / safeBaseRate, baseCurrency)}
            </div>
            {Object.keys(totalsByCurrency).length > 1 && selectedBankId === 'ALL' && (
              <div className="flex flex-wrap gap-x-2 text-[10px] text-slate-400 font-medium">
                {Object.entries(totalsByCurrency).map(([cur, data]) => (
                  <span key={cur}>{formatCurrency(data.market, cur as Currency)}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-slate-50 rounded-lg">
              {totals.profit >= -0.005 ? <TrendingUp className="w-5 h-5 text-emerald-600" /> : <TrendingDown className="w-5 h-5 text-red-600" />}
            </div>
            <span className="text-sm font-medium text-slate-500">Lucro Total</span>
          </div>
          <div className="space-y-1">
            <div className={`text-2xl font-black tracking-tight ${totals.profit >= -0.005 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(totals.profit / safeBaseRate, baseCurrency)}
            </div>
            {Object.keys(totalsByCurrency).length > 1 && selectedBankId === 'ALL' && (
              <div className="flex flex-wrap gap-x-2 text-[10px] text-slate-400 font-medium">
                {Object.entries(totalsByCurrency).map(([cur, data]) => (
                  <span key={cur} className={data.profit >= -0.005 ? 'text-emerald-600/70' : 'text-red-600/70'}>
                    {formatCurrency(data.profit, cur as Currency)}
                  </span>
                ))}
              </div>
            )}
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
        {['TUDO', 'AÇÕES', 'FIIS', 'RENDA FIXA', 'PREVIDÊNCIA', 'RADAR', 'OUTROS'].map(tab => (
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

      {/* Gráficos Principais: Evolução e Alocação */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Evolução Patrimonial */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                Evolução Patrimonial
              </h3>
            </div>
            
            <div className="flex items-center gap-2">
              <select 
                value={equityTimeRange} 
                onChange={(e) => setEquityTimeRange(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500 transition-all cursor-pointer"
              >
                <option value="12M">12 Meses</option>
                <option value="24M">24 Meses</option>
                <option value="5Y">5 Anos</option>
                <option value="ALL">Desde o Início</option>
              </select>

              <select 
                value={equityTypeFilter} 
                onChange={(e) => setEquityTypeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500 transition-all cursor-pointer"
              >
                <option value="ALL">Todos os tipos</option>
                <option value="AÇÕES">Ações</option>
                <option value="FII">FIIs</option>
                <option value="RENDA FIXA">Renda Fixa</option>
              </select>
            </div>
          </div>

          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={equityEvolutionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 'bold' }}
                />
                <YAxis 
                   axisLine={false} 
                   tickLine={false} 
                   tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 'bold' }}
                   tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100 min-w-[160px] animate-in fade-in zoom-in duration-200">
                          <p className="text-[9px] font-black text-slate-400 mb-2 uppercase tracking-widest">{label}</p>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[10px] text-slate-500 font-bold">Patrimônio:</span>
                              <span className="text-[10px] text-slate-900 font-black">{formatCurrency(data.total, baseCurrency)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 border-t border-slate-50 pt-1.5">
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                <span className="text-[10px] text-slate-500 font-bold">Aplicado:</span>
                              </div>
                              <span className="text-[10px] text-emerald-600 font-black">{formatCurrency(data.invested, baseCurrency)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-300"></div>
                                <span className="text-[10px] text-slate-500 font-bold">Ganho:</span>
                              </div>
                              <span className="text-[10px] text-blue-600 font-black">{formatCurrency(data.gain, baseCurrency)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="invested" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} barSize={24} animationDuration={1000} />
                <Bar dataKey="gain" stackId="a" fill="#34d399" opacity={0.5} radius={[4, 4, 0, 0]} barSize={24} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-50">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#10b981]"></div>
              <span className="text-[10px] font-bold text-slate-500">Valor aplicado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#34d399] opacity-50"></div>
              <span className="text-[10px] font-bold text-slate-500">Ganho de Capital</span>
            </div>
          </div>
        </div>

        {/* Gráfico de Alocação Unificados */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <PieChartIcon className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                Alocação da Carteira
              </h3>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto no-scrollbar">
              <button
                onClick={() => setChartView('TYPE')}
                className={`px-3 py-1.5 text-[9px] font-black rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none ${
                  chartView === 'TYPE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                TIPO
              </button>
              <button
                onClick={() => setChartView('SECTOR')}
                className={`px-3 py-1.5 text-[9px] font-black rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none ${
                  chartView === 'SECTOR' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                SETOR
              </button>
              <button
                onClick={() => setChartView('ASSET')}
                className={`px-3 py-1.5 text-[9px] font-black rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none ${
                  chartView === 'ASSET' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                ATIVO
              </button>
              <button
                onClick={() => setChartView('INSTITUTION')}
                className={`px-3 py-1.5 text-[9px] font-black rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none ${
                  chartView === 'INSTITUTION' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                BANCO
              </button>
            </div>
          </div>

          <div className="flex flex-col xl:flex-row items-center gap-6">
            <div className="h-[220px] w-full xl:w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={
                      chartView === 'TYPE' ? allocationData :
                      chartView === 'SECTOR' ? sectorData :
                      chartView === 'ASSET' ? tickerData :
                      institutionData
                    }
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={800}
                  >
                    {(
                      chartView === 'TYPE' ? allocationData :
                      chartView === 'SECTOR' ? sectorData :
                      chartView === 'ASSET' ? tickerData :
                      institutionData
                    ).map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[(index + (chartView === 'SECTOR' ? 3 : chartView === 'ASSET' ? 5 : chartView === 'INSTITUTION' ? 6 : 0)) % COLORS.length]} 
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value / safeBaseRate, baseCurrency)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="w-full xl:w-1/2 flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
              {(
                chartView === 'TYPE' ? allocationData :
                chartView === 'SECTOR' ? sectorData :
                chartView === 'ASSET' ? tickerData :
                institutionData
              ).map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between text-[10px] py-1 border-b border-slate-50 last:border-0 border-dashed">
                  <div className="flex items-center gap-2 truncate flex-1 mr-2">
                    <div 
                      className="w-2 h-2 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: COLORS[(index + (chartView === 'SECTOR' ? 3 : chartView === 'ASSET' ? 5 : chartView === 'INSTITUTION' ? 6 : 0)) % COLORS.length] }}
                    ></div>
                    <span className="text-slate-600 truncate font-medium">{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 font-mono text-[9px] hidden sm:inline">
                      {formatCurrency(entry.value / safeBaseRate, baseCurrency)}
                    </span>
                    <span className="font-black text-slate-800 font-mono min-w-[40px] text-right">
                      {((entry.value / (totals.market || totals.invested || 1)) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Ativos */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                Performance por Ativo
                <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] rounded-full">
                  {filteredData.length} {filteredData.length === 1 ? 'Ativo' : 'Ativos'}
                </span>
              </h3>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                Exibindo: <span className="text-blue-600">{showClosedPositions ? 'Histórico de Operações Encerradas' : 'Carteira Posição Ativa'}</span>
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              {/* Toggle de Posições Ativas / Encerradas */}
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setShowClosedPositions(false)}
                  className={`px-3 py-1.5 text-[10px] font-black rounded-md transition-all flex items-center gap-2 ${!showClosedPositions ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Target className="w-3 h-3" />
                  CARTEIRA
                </button>
                <button
                  onClick={() => setShowClosedPositions(true)}
                  className={`px-3 py-1.5 text-[10px] font-black rounded-md transition-all flex items-center gap-2 ${showClosedPositions ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Clock className="w-3 h-3" />
                  HISTÓRICO
                </button>
              </div>

              {/* Toggle de Visualização Agrupada / Unificada */}
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setIsUnifiedView(false)}
                  className={`px-3 py-1.5 text-[10px] font-black rounded-md transition-all flex items-center gap-2 ${!isUnifiedView ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  title="Visualização Agrupada por Tipo"
                >
                  <LayoutGrid className="w-3 h-3" />
                  AGRUPADO
                </button>
                <button
                  onClick={() => setIsUnifiedView(true)}
                  className={`px-3 py-1.5 text-[10px] font-black rounded-md transition-all flex items-center gap-2 ${isUnifiedView ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  title="Visualização Unificada (Lista Única)"
                >
                  <List className="w-3 h-3" />
                  UNIFICADO
                </button>
              </div>

              <button
                onClick={() => setIsSimulatorMode(!isSimulatorMode)}
                className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all flex items-center gap-2 border ${
                  isSimulatorMode 
                  ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' 
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
                title="Ativar Simulador de Compras"
              >
                <Calculator className={`w-3.5 h-3.5 ${isSimulatorMode ? 'animate-pulse' : ''}`} />
                {isSimulatorMode ? 'SIMULADOR ATIVO' : 'SIMULADOR'}
              </button>

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

          <div className="overflow-auto flex-1 max-h-[80vh] relative border border-slate-200 rounded-xl shadow-sm custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1150px]">
              <thead className="sticky top-0 z-40 bg-white shadow-md">
                {/* Linha de Totais Acima do Cabeçalho */}
                {filteredData.length > 0 && (
                    <tr className="bg-slate-900 text-white border-b border-slate-800">
                      <td className="p-3 text-[10px] font-black uppercase tracking-wider sticky left-0 bg-slate-900 z-50">TOTAIS ({baseCurrency})</td>
                      <td className="p-3 bg-slate-900 sticky left-12 z-50"></td>
                      <td className="p-3"></td>
                      <td className="p-3"></td>
                      <td className="p-3 text-right text-[10px] font-black font-mono text-slate-400 border-l border-slate-800">
                        {formatValue(totals.currentQty, 2)}
                      </td>
                      <td className="p-3 border-l border-slate-800"></td>
                      <td className="p-3 border-l border-slate-800"></td>
                      <td className="p-3 border-l border-slate-800"></td>
                      
                      <td className="p-3 text-sm font-black text-blue-400 text-right font-mono border-l border-slate-800">
                        {formatCurrency(totals.invested / safeBaseRate, baseCurrency)}
                      </td>
                      <td className="p-3 text-sm font-black text-emerald-400 text-right font-mono">
                        {formatCurrency(totals.market / safeBaseRate, baseCurrency)}
                      </td>

                      <td className="p-3 text-sm font-black text-slate-700 text-right font-mono border-l border-slate-100">
                        <span className={totals.profit >= -0.005 ? 'text-emerald-600' : 'text-red-600'}>
                          {formatCurrency(totals.profit / safeBaseRate, baseCurrency)}
                        </span>
                      </td>
                      <td className="p-3 border-l border-slate-100 text-right text-sm font-black font-mono">
                        <span className={totals.profit >= -0.005 ? 'text-emerald-600' : 'text-red-600'}>
                          {(totals.invested > 0 ? (totals.profit / totals.invested * 100) : 0).toFixed(2)}%
                        </span>
                      </td>
                      <td className="p-3 border-l border-slate-100 text-right text-sm font-black font-mono">
                        <span className={(totals.profit + totals.received) >= -0.005 ? 'text-emerald-600' : 'text-red-600'}>
                          {(totals.invested > 0 ? ((totals.profit + totals.received) / totals.invested * 100) : 0).toFixed(2)}%
                        </span>
                      </td>
                      <td className="p-3 text-center border-l border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400">SUMARIZADO</span>
                      </td>
                    </tr>
                )}
                <tr className="bg-slate-50">
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center w-8 sticky left-0 bg-slate-50 z-50">
                    #
                  </th>
                  <th 
                    className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky left-12 bg-slate-50 z-50 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'ticker', direction: prev?.key === 'ticker' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center gap-1">
                      Ticker
                      {sortConfig?.key === 'ticker' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'name', direction: prev?.key === 'name' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center gap-1">
                      Nome do Ativo
                      {sortConfig?.key === 'name' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'sector', direction: prev?.key === 'sector' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center gap-1">
                      Setor
                      {sortConfig?.key === 'sector' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                   <th 
                    className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'currentQuantity', direction: prev?.key === 'currentQuantity' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Qtd
                      {sortConfig?.key === 'currentQuantity' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-3 text-[10px] font-bold text-blue-500 uppercase tracking-wider text-right border-l border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'averagePrice', direction: prev?.key === 'averagePrice' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      P. Médio
                      {sortConfig?.key === 'averagePrice' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right border-l border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'lastPrice', direction: prev?.key === 'lastPrice' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Preço Atual
                      {sortConfig?.key === 'lastPrice' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-3 text-[10px] font-bold text-amber-600 uppercase tracking-wider text-right border-l border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'targetPrice', direction: prev?.key === 'targetPrice' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Alvo
                      {sortConfig?.key === 'targetPrice' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-3 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-right border-l border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'totalInvested', direction: prev?.key === 'totalInvested' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      T. Compra
                      {sortConfig?.key === 'totalInvested' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'marketValue', direction: prev?.key === 'marketValue' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Total Atual
                      {sortConfig?.key === 'marketValue' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    className="p-3 text-[10px] font-bold text-slate-700 uppercase tracking-wider text-right border-l border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSortConfig(prev => ({ key: 'profit', direction: prev?.key === 'profit' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Resultado
                      {sortConfig?.key === 'profit' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />) : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
                    </div>
                  </th>

                  {isSimulatorMode && (
                    <>
                      <th className="p-3 text-[10px] font-black text-blue-500 uppercase tracking-widest text-center bg-blue-50/50">Qtd Sim.</th>
                      <th className="p-3 text-[10px] font-black text-blue-500 uppercase tracking-widest text-right bg-blue-50/50">Custo Sim.</th>
                      <th className="p-3 text-[10px] font-black text-blue-500 uppercase tracking-widest text-right bg-blue-50/50">Novo Total</th>
                      <th className="p-3 text-[10px] font-black text-blue-500 uppercase tracking-widest text-right bg-blue-50/50">Novo P.M.</th>
                    </>
                  )}

                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right border-l border-slate-200">Rent %</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right border-l border-slate-200">Return %</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Sugestão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(isUnifiedView ? [['UNIFICADO', filteredData]] as [string, AssetPerformance[]][] : Object.entries(groupedData)).map(([category, assets]) => (
                  <React.Fragment key={category}>
                    {selectedTab === 'TUDO' && !isUnifiedView && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={14} className="px-3 py-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest border-y border-slate-100">
                          {category}
                        </td>
                      </tr>
                    )}
                    {assets.map((asset, assetIndex) => {
                      const absoluteIndex = filteredData.indexOf(asset) + 1;
                      const suggestion = getSuggestion(asset);
                      const baseRate = exchangeRates[baseCurrency] || 1;
                      const assetRate = exchangeRates[asset.currency] || 1;
                      
                      // Conversão para a Moeda Base selecionada utilizando os valores já calculados e tratados no loop de performance
                      const totalInvestedDisplay = (asset.totalInvested * assetRate) / baseRate;
                      const marketValueDisplay = (asset.marketValue * assetRate) / baseRate;
                      const profitDisplay = (asset.profit * assetRate) / baseRate;
                      const avgPriceDisplay = (asset.averagePrice * assetRate) / baseRate;
                      const lastPriceDisplay = (asset.lastPrice || 0) * assetRate / baseRate;
                      const targetPriceDisplay = (asset.targetPrice || 0) * assetRate / baseRate;
                      const totalReceivedDisplay = (asset.totalReceived * assetRate) / baseRate;

                      return (
                        <tr 
                          key={asset.participantId} 
                          className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                          onClick={() => setDetailAsset(asset)}
                        >
                          <td className="p-3 sticky left-0 bg-white group-hover:bg-slate-50/50 z-10 text-center text-[10px] font-mono text-slate-400 border-r border-slate-50">
                            {absoluteIndex}
                          </td>
                          <td className="p-3 sticky left-12 bg-white group-hover:bg-slate-50/50 z-10">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[12px] font-bold text-slate-800">{asset.ticker}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    loadHistory(asset.ticker);
                                  }}
                                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                                  title="Ver Gráfico de 1 Ano"
                                >
                                  <TrendingUp className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="text-[10px] text-slate-600 font-medium truncate max-w-[150px] block">
                              {asset.name.split('-')[1]?.trim() || asset.name}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full uppercase">
                              {asset.sector}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-slate-800 text-right font-black font-mono border-l border-slate-100">
                            {isBalanceBased(asset) ? '---' : formatValue(asset.currentQuantity, 2)}
                          </td>
                          
                          <td className="p-3 text-xs text-blue-600 text-right font-mono border-l border-slate-100 group/pm relative">
                            {isBalanceBased(asset) ? (
                              <span className="text-slate-300">---</span>
                            ) : (
                              <div className="flex flex-col items-end">
                                <div className="flex items-center gap-1">
                                  {formatValue(avgPriceDisplay, 2)}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (simulatingAssetId === asset.participantId) {
                                        setSimulatingAssetId(null);
                                      } else {
                                        setSimulatingAssetId(asset.participantId);
                                        setSimQty(0);
                                        setSimPrice(asset.lastPrice || avgPriceDisplay);
                                      }
                                    }}
                                    className="p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                                    title="Simular Novo Preço Médio"
                                  >
                                    <Activity className="w-3 h-3" />
                                  </button>
                                </div>
                                
                                {asset.currency === 'USD' && asset.averagePrice > 0 && asset.averagePriceBRL > 0 && (
                                  <div className="text-[8px] text-slate-400 font-medium font-mono leading-none mt-0.5 bg-slate-50 px-1 py-0.5 rounded border border-slate-100" title="Taxa de Câmbio média ponderada para este ativo (VET)">
                                    Câmbio: {(asset.averagePriceBRL / asset.averagePrice).toFixed(4)}
                                  </div>
                                )}
                                
                                {/* Simulador de PM Popover */}
                                {simulatingAssetId === asset.participantId && (
                                  <div 
                                    className="absolute top-full mt-1 right-0 w-60 bg-white border border-blue-100 shadow-xl rounded-2xl z-[50] p-4 animate-fade-in text-left cursor-default ring-4 ring-blue-50/50"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex items-center justify-between mb-3 border-b border-blue-50 pb-2">
                                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
                                        <Activity className="w-3.5 h-3.5" /> Simulador de PM
                                      </span>
                                      <button 
                                        onClick={() => setSimulatingAssetId(null)} 
                                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                    
                                    <div className="space-y-3 mb-4">
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Qtd p/ Comprar</label>
                                        <input 
                                          type="number" 
                                          autoFocus
                                          value={simQty || ''}
                                          onChange={(e) => setSimQty(parseFloat(e.target.value) || 0)}
                                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                          placeholder="0"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Preço Compra ({asset.currency})</label>
                                        <input 
                                          type="number" 
                                          step="0.01"
                                          value={simPrice || ''}
                                          onChange={(e) => setSimPrice(parseFloat(e.target.value) || 0)}
                                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                          placeholder="0.00"
                                        />
                                      </div>
                                    </div>
  
                                    {simQty > 0 && simPrice > 0 ? (() => {
                                      const newQty = asset.currentQuantity + simQty;
                                      const newTotalValue = (asset.currentQuantity * asset.averagePrice) + (simQty * simPrice);
                                      const newAvgPrice = newTotalValue / newQty;
                                      const priceDiff = newAvgPrice - asset.averagePrice;
                                      const pctDiff = (newAvgPrice / asset.averagePrice - 1) * 100;
  
                                      return (
                                        <div className="pt-3 border-t border-blue-50 space-y-2">
                                          <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500 font-medium tracking-tight">Novo PM:</span>
                                            <span className="font-black text-blue-700 font-mono">
                                              {formatValue(newAvgPrice, 2)}
                                            </span>
                                          </div>
                                          <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500 font-medium tracking-tight">Economia:</span>
                                            <span className={`font-bold font-mono py-0.5 px-1.5 rounded-md ${priceDiff <= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                                              {priceDiff > 0 ? '+' : ''}{formatValue(priceDiff, 2)} ({pctDiff.toFixed(2)}%)
                                            </span>
                                          </div>
                                          <p className="text-[9px] text-slate-400 mt-2 italic leading-tight">
                                            * Cálculo baseado na moeda original do ativo ({asset.currency}).
                                          </p>
                                        </div>
                                      );
                                    })() : (
                                      <div className="text-[10px] text-slate-400 italic text-center py-2 bg-slate-50/50 rounded-lg border border-dashed border-slate-100">
                                        Preencha os valores para calcular
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          
                          <td className="p-3 text-right border-l border-slate-100">
                            {isBalanceBased(asset) ? (
                              <span className="text-slate-300 italic text-[10px]">FLUXO FINANCEIRO</span>
                            ) : (asset.lastPrice !== undefined && asset.lastPrice !== null && asset.lastPrice > 0) ? (
                              <div className="flex flex-col items-end">
                                <span className="text-xs font-bold text-slate-800 font-mono">{formatValue(lastPriceDisplay, 2)}</span>
                                <span className={`text-[9px] font-bold flex items-center gap-0.5 ${asset.variation! >= -0.005 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {asset.variation! >= -0.005 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                                  {formatValue(Math.abs(asset.variation!), 2)}%
                                </span>
                              </div>
                            ) : (
                              <span 
                                className="text-[10px] text-slate-300 italic cursor-help" 
                                title={`Tentativa de busca: ${prices[asset.ticker.trim()]?.debugTicker || 'Desconhecido'}`}
                              >
                                N/A
                              </span>
                            )}
                          </td>

                          <td className="p-3 text-right border-l border-slate-100" onClick={(e) => e.stopPropagation()}>
                            {isBalanceBased(asset) ? (
                              <span className="text-slate-300 italic text-[10px]">---</span>
                            ) : editingTargetId === asset.participantId ? (
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
                                  className="w-16 px-1.5 py-0.5 bg-white border border-amber-300 rounded text-[10px] font-mono text-right outline-none focus:ring-2 focus:ring-amber-500"
                                />
                                <button 
                                  onMouseDown={(e) => e.preventDefault()} // Prevent blur before click
                                  onClick={() => handleSaveTargetPrice(asset)}
                                  disabled={isSavingTarget}
                                  className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"
                                >
                                  {isSavingTarget ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
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
                                  <span className={`text-xs font-bold font-mono ${asset.targetPrice ? 'text-amber-600' : 'text-slate-300 italic'}`}>
                                    {asset.targetPrice ? formatValue(targetPriceDisplay, 2) : 'Definir'}
                                  </span>
                                  {prices[asset.ticker.trim()]?.target && !registries.participants.find(p => String(p.id) === String(asset.participantId))?.targetPrice && (
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

                          <td className="p-3 text-xs text-blue-600 text-right font-mono border-l border-slate-100">{formatValue(totalInvestedDisplay, 2)}</td>
                          <td className="p-3 text-xs text-emerald-600 text-right font-mono flex items-center justify-end gap-2 pr-3 relative">
                            {isUpdatingBalanceId === asset.participantId ? (
                              <div className="flex items-center justify-end gap-1 bg-white p-0.5 rounded-lg border border-emerald-200 shadow-sm z-10">
                                <input 
                                  autoFocus
                                  type="text"
                                  value={newBalanceValue}
                                  onChange={(e) => setNewBalanceValue(e.target.value)}
                                  onBlur={() => {
                                    setTimeout(() => setIsUpdatingBalanceId(null), 200);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleUpdateBalance(asset);
                                    if (e.key === 'Escape') setIsUpdatingBalanceId(null);
                                  }}
                                  placeholder="Novo total..."
                                  className="w-20 px-1.5 py-0.5 bg-slate-50 border border-emerald-300 rounded text-[10px] font-mono text-right outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                                <button 
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleUpdateBalance(asset)}
                                  disabled={isSavingBalance}
                                  className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"
                                  title="Confirmar Rendimento"
                                >
                                  {isSavingBalance ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
                                </button>
                              </div>
                            ) : (
                              <>
                                {(asset.lastPrice || isBalanceBased(asset)) ? formatValue(marketValueDisplay, 2) : '---'}
                                {!asset.ticker && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setIsUpdatingBalanceId(asset.participantId);
                                      const currentVal = asset.marketValue || (asset.totalInvested - asset.totalReceived - asset.totalSold);
                                      setNewBalanceValue(currentVal.toFixed(2));
                                    }}
                                    className="p-1 text-emerald-500 hover:bg-emerald-50 rounded-full transition-all group/upd"
                                    title="Atualizar Saldo (Lançar Rendimento)"
                                  >
                                    <RefreshCw className="w-3 h-3 group-hover/upd:rotate-180 transition-transform duration-500" />
                                  </button>
                                )}
                              </>
                            )}
                          </td>
                          
                          <td className="p-3 text-right border-l border-slate-100">
                            <div className="flex flex-col items-end">
                              <span className={`text-xs font-bold font-mono ${profitDisplay >= -0.005 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {(asset.lastPrice || isBalanceBased(asset)) ? formatValue(profitDisplay, 2) : '---'}
                              </span>
                              <span className="text-[9px] text-slate-400">
                                Prov. Líq: {formatValue(totalReceivedDisplay, 2)}
                              </span>
                            </div>
                          </td>

                          {isSimulatorMode && (() => {
                            const simQty = simulationData[asset.participantId] || 0;
                            const simPrice = asset.lastPrice || asset.averagePrice || 0;
                            const currentRate = (exchangeRates[asset.currency] || 1) / (exchangeRates[baseCurrency] || 1);
                            
                            const simCostOriginal = simQty * simPrice;
                            const simCostDisplay = simCostOriginal * currentRate;
                            
                            const newQty = asset.currentQuantity + simQty;
                            const newTotalInvestedOrig = (asset.currentQuantity * asset.averagePrice) + (simQty * simPrice);
                            const newAvgPriceOrig = newQty > 0 ? newTotalInvestedOrig / newQty : 0;
                            const newAvgPriceDisplay = newAvgPriceOrig * currentRate;
                            
                            const newMarketValueDisplay = newQty * (simPrice * currentRate);
                            
                            return (
                              <>
                                <td className="p-3 text-center bg-blue-50/20 border-l border-blue-50 min-w-[80px]" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="number"
                                    value={simulationData[asset.participantId] || ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setSimulationData(prev => ({
                                        ...prev,
                                        [asset.participantId]: isNaN(val) ? 0 : val
                                      }));
                                    }}
                                    placeholder="0"
                                    className="w-16 p-1 text-xs font-mono font-bold text-center border border-blue-200 rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                                  />
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-blue-600 bg-blue-50/20 text-xs">
                                  {formatCurrency(simCostDisplay, baseCurrency)}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-slate-600 bg-blue-50/20 text-xs">
                                  {formatCurrency(newMarketValueDisplay, baseCurrency)}
                                </td>
                                <td className="p-3 text-right bg-blue-50/20 border-r border-blue-50">
                                  <div className="flex flex-col items-end">
                                    <span className="text-xs font-black text-indigo-600 font-mono">
                                      {formatCurrency(newAvgPriceDisplay, baseCurrency)}
                                    </span>
                                    {simQty > 0 && (
                                      <span className={`text-[8px] font-bold px-1 rounded ${newAvgPriceOrig < asset.averagePrice ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {(((newAvgPriceOrig / asset.averagePrice) - 1) * 100).toFixed(2)}%
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </>
                            );
                          })()}

                          <td className="p-3 text-right border-l border-slate-100">
                            <span className={`text-xs font-bold font-mono ${(asset.rentability || 0) >= -0.005 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {(asset.rentability || 0).toFixed(2)}%
                            </span>
                          </td>

                          <td className="p-3 text-right border-l border-slate-100">
                            <span className={`text-xs font-bold font-mono ${(asset.totalReturn || 0) >= -0.005 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {(asset.totalReturn || 0).toFixed(2)}%
                            </span>
                          </td>
                          <td className="p-3 text-center">
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
              Preços Atuais via Yahoo Finance, Brapi e HG Brasil (atraso de 15min).
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

            <div className="flex-1 overflow-auto p-6 space-y-8">
              {/* Tabs */}
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-6 w-fit">
                <button
                  onClick={() => setDetailTab('TRANS')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${detailTab === 'TRANS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Activity className="w-3.5 h-3.5 inline mr-1.5" /> Transações
                </button>
                <button
                  onClick={() => setDetailTab('ACCRUALS')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${detailTab === 'ACCRUALS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <TrendingUp className="w-3.5 h-3.5 inline mr-1.5" /> Acréscimos/Rendimentos
                </button>
              </div>

              {/* Resumo Matemático Completo */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Quantidades / Resumo de Fluxo */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">
                    {isBalanceBased(detailAsset) ? 'Fluxo de Capital' : 'Quantidades'}
                  </span>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">{isBalanceBased(detailAsset) ? 'Total Aplicado:' : 'T. Comprado:'}</span>
                      <span className="font-bold text-slate-800 font-mono">
                        {isBalanceBased(detailAsset) ? formatValue(detailAsset.totalBoughtQty, 2) : formatValue(detailAsset.totalBoughtQty, 2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">{isBalanceBased(detailAsset) ? 'Total Resgatado:' : 'T. Vendido:'}</span>
                      <span className="font-semibold text-slate-500 font-mono">-{formatValue(detailAsset.totalSoldQty, 2)}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between text-sm">
                      <span className="text-slate-600 font-bold">
                        {isBalanceBased(detailAsset) ? 'Custo Atual:' : 'Saldo Atual:'}
                      </span>
                      <span className="font-black text-blue-600 font-mono">
                        {isBalanceBased(detailAsset) ? formatValue(detailAsset.totalBoughtValue - detailAsset.totalSold, 2) : formatValue(detailAsset.currentQuantity, 2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Financeiro */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">Financeiro ({detailAsset.currency})</span>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">R$ Comprado:</span>
                      <span className="font-bold text-slate-800 font-mono">{formatValue(detailAsset.totalBoughtValue, 2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">R$ Vendido:</span>
                      <span className="font-semibold text-slate-500 font-mono">{formatValue(detailAsset.totalSold, 2)}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between text-sm">
                      <span className="text-slate-600 font-bold">Saldo Fin:</span>
                      <span className={`font-black font-mono ${(detailAsset.totalBoughtValue - detailAsset.totalSold) >= -0.005 ? 'text-slate-800' : 'text-red-500'}`}>
                        {formatValue(detailAsset.totalBoughtValue - detailAsset.totalSold, 2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Proventos & Impostos */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-3">Proventos</span>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-700/70">Dividendos:</span>
                      <span className="font-bold text-emerald-700 font-mono">{formatValue(detailAsset.totalReceived, 2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-red-400">Impostos:</span>
                      <span className="font-semibold text-red-500 font-mono">-{formatValue(detailAsset.totalDividendTaxes, 2)}</span>
                    </div>
                    <div className="pt-2 border-t border-emerald-200 flex justify-between text-sm">
                      <span className="text-emerald-800 font-bold">Líquido:</span>
                      <span className="font-black text-emerald-600 font-mono">{formatValue(detailAsset.totalReceived - detailAsset.totalDividendTaxes, 2)}</span>
                    </div>
                  </div>
                </div>

                {/* Preços Médios / Rendimento Acumulado */}
                <div className={`p-4 rounded-2xl border ${isBalanceBased(detailAsset) ? 'bg-indigo-50/50 border-indigo-100' : 'bg-blue-50/50 border-blue-100'}`}>
                  <span className={`text-[10px] font-black uppercase tracking-widest block mb-3 ${isBalanceBased(detailAsset) ? 'text-indigo-600' : 'text-blue-600'}`}>
                    {isBalanceBased(detailAsset) ? 'Posição Atual' : 'Preços Médios'}
                  </span>
                  {isBalanceBased(detailAsset) ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-indigo-700/70">Custo Base:</span>
                        <span className="font-bold text-indigo-700 font-mono">{formatCurrency(detailAsset.totalBoughtValue - detailAsset.totalSold, detailAsset.currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-indigo-700/70">Ajustes/Rendimento:</span>
                        <span className="font-bold text-emerald-600 font-mono">+{formatCurrency(detailAsset.profit || 0, detailAsset.currency)}</span>
                      </div>
                      <div className="pt-2 border-t border-indigo-200 flex justify-between text-sm">
                        <span className="text-indigo-800 font-bold">Total Líquido:</span>
                        <span className="font-black text-indigo-900 font-mono">{formatCurrency(detailAsset.marketValue || 0, detailAsset.currency)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs" title="Preço Médio Fiscal (Base de Custo)">
                        <span className="text-blue-700/70 border-b border-dotted border-blue-200">PM Fiscal:</span>
                        <span className="font-bold text-blue-700 font-mono">{formatValue(detailAsset.averagePrice, 2)}</span>
                      </div>
                      <div className="flex justify-between text-xs" title="Preço Médio Líquido = (Saldo Fin / Qtd Atual)">
                        <span className="text-blue-700/70 border-b border-dotted border-blue-200">PM Net:</span>
                        <span className="font-bold text-blue-700 font-mono">{formatValue(detailAsset.averagePriceNet || 0, 2)}</span>
                      </div>
                      <div className="pt-2 border-t border-blue-200 flex justify-between text-sm" title="PM com Proventos = ((Saldo Fin - Dividendos) / Qtd Atual)">
                        <span className="text-blue-800 font-bold">PM c/ Prov:</span>
                        <span className="font-black text-blue-900 font-mono">{formatValue(detailAsset.averagePriceWithProceeds || 0, 2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {detailTab === 'TRANS' ? (
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Lista de Transações</h4>
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
                      .sort((a, b) => {
                        const dateA = a.date.split('-').join('');
                        const dateB = b.date.split('-').join('');
                        return dateB.localeCompare(dateA);
                      })
                      .map((t) => {
                        const bank = registries.banks.find(b => String(b.id) === String(t.bankId));
                        const category = registries.categories.find(c => String(c.id) === String(t.categoryId));
                        const categoryName = category?.name.toLowerCase() || '';
                        const description = t.description.toLowerCase();
                        const isBalance = isBalanceBased(detailAsset);
                        
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

                        let typeLabel = t.type === 'DEBIT' ? (isBalance ? 'Aplicação' : 'Compra') : (isBalance ? 'Resgate' : 'Venda');
                        let typeColor = t.type === 'DEBIT' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600';

                        if (isProvento) {
                          typeLabel = t.type === 'DEBIT' ? 'Imposto s/ Prov.' : 'Dividendo/JCP';
                          typeColor = t.type === 'DEBIT' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600';
                        } else if (isTaxOrFee) {
                          typeLabel = 'Taxa/Ajuste';
                          typeColor = 'bg-slate-100 text-slate-500';
                        }
                        
                        return (
                          <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-4 text-sm text-slate-600 font-mono">
                              {t.date.split('-').reverse().join('/')}
                            </td>
                            <td className="py-4">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${typeColor}`}>
                                {typeLabel}
                              </span>
                            </td>
                            <td className="py-4 text-sm text-slate-600">
                              {bank?.name || '---'}
                            </td>
                            {!isBalance && (
                              <>
                                <td className="py-4 text-sm text-slate-600 text-right font-mono">
                                  {t.quantity ? t.quantity.toFixed(4) : '---'}
                                </td>
                                <td className="py-4 text-sm text-slate-600 text-right font-mono">
                                  {t.unitPrice ? formatCurrency(t.unitPrice, detailAsset.currency) : (t.quantity ? formatCurrency(t.value / t.quantity, detailAsset.currency) : '---')}
                                </td>
                              </>
                            )}
                            {isBalance && <td colSpan={2}></td>}
                            <td className="py-4 text-sm font-bold text-slate-800 text-right font-mono">
                              {formatCurrency(t.value, detailAsset.currency)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ajustes de Valor (Rendimentos manuais)</h4>
                    <button
                      onClick={() => {
                        setIsAddingAccrual(true);
                        setEditingAccrual(null);
                        setManualAccrualParticipantId(detailAsset?.participantId || '');
                        setManualAccrualBankId(selectedBankId !== 'ALL' ? String(selectedBankId) : '');
                        setManualAccrualValue(0);
                        setManualAccrualDate(new Date().toISOString().split('T')[0]);
                        setManualAccrualDesc('');
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" /> Novo Ajuste
                    </button>
                  </div>

                        {isAddingAccrual && (
                          <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data</label>
                              <input
                                type="date"
                                value={manualAccrualDate}
                                onChange={(e) => setManualAccrualDate(e.target.value)}
                                className="w-full p-2 bg-white rounded-lg border border-slate-200 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Valor</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={formatCurrencyInput(manualAccrualValue)}
                                onChange={(e) => handleCurrencyInputChange(e, setManualAccrualValue)}
                                placeholder="Ex: 50,00"
                                className="w-full p-2 bg-white rounded-lg border border-slate-200 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Descrição</label>
                              <input
                                type="text"
                                value={manualAccrualDesc}
                                onChange={(e) => setManualAccrualDesc(e.target.value)}
                                placeholder="Rendimento..."
                                className="w-full p-2 bg-white rounded-lg border border-slate-200 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Banco</label>
                              <select
                                value={manualAccrualBankId}
                                onChange={(e) => setManualAccrualBankId(e.target.value)}
                                className="w-full p-2 bg-white rounded-lg border border-slate-200 text-sm"
                              >
                                <option value="">Nenhum</option>
                                {registries.banks.map(b => (
                                  <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-end gap-2">
                              <button
                                onClick={handleSaveManualAccrual}
                                className="flex-1 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                              >
                                <Check className="w-5 h-5 mx-auto" />
                              </button>
                              <button
                                onClick={() => {
                                  setIsAddingAccrual(false);
                                  setEditingAccrual(null);
                                  setManualAccrualValue(0);
                                  setManualAccrualDesc('');
                                }}
                                className="p-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors"
                              >
                                <X className="w-5 h-5 mx-auto" />
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-100/50 text-[10px] text-slate-400 font-bold uppercase tracking-widest border-b border-slate-100">
                                <th className="p-3">Data</th>
                                <th className="p-3">Descrição</th>
                                <th className="p-3 text-right">Valor</th>
                                <th className="p-3 w-20 text-center">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {accruals
                                .filter(a => a.assetId === detailAsset.participantId)
                                .sort((a, b) => b.date.localeCompare(a.date))
                                .map(acc => (
                                  <tr key={acc.id} className="border-b border-slate-100 last:border-0 hover:bg-white transition-colors">
                                    <td className="p-3 text-sm text-slate-600 font-mono">{acc.date.split('-').reverse().join('/')}</td>
                                    <td className="p-3 text-sm text-slate-600">{acc.description || 'Ajuste de rendimento'}</td>
                                    <td className={`p-3 text-sm font-bold text-right font-mono ${acc.value >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                      {formatCurrency(acc.value, detailAsset.currency)}
                                    </td>
                                    <td className="p-3">
                                      <div className="flex items-center justify-center gap-2">
                                        <button
                                          onClick={() => {
                                            setEditingAccrual(acc);
                                            setManualAccrualParticipantId(acc.assetId);
                                            setManualAccrualBankId(acc.bankId || '');
                                            setManualAccrualValue(acc.value);
                                            setManualAccrualDate(acc.date);
                                            setManualAccrualDesc(acc.description);
                                            setIsAddingAccrual(true);
                                          }}
                                          className="text-slate-400 hover:text-blue-600 transition-colors"
                                          title="Editar"
                                        >
                                          <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            setAccrualToDeleteId(acc.id);
                                            setIsConfirmDeleteAccrualOpen(true);
                                          }}
                                          className="text-slate-400 hover:text-red-500 transition-colors"
                                          title="Excluir"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                        {accruals.filter(a => a.assetId === detailAsset.participantId).length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-slate-400 italic text-xs">
                              Nenhum acréscimo manual registrado para este ativo.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
          </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end items-center">
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

      {/* Modal de Gráfico (Histórico 1 Ano) */}
      {chartTicker && (
        <div className={`fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 transition-all duration-300 ${isChartClosing ? 'opacity-0' : 'opacity-100'}`}>
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={closeChart}
          />
          <div className={`bg-white w-full max-w-4xl rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh] transition-all duration-300 transform ${isChartClosing ? 'scale-95 translate-y-4' : 'scale-100 translate-y-0'}`}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Histórico de Preço (1 Ano)</h3>
                  <p className="text-xs text-slate-500">{chartTicker}</p>
                </div>
              </div>
              <button 
                onClick={closeChart}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-visible min-h-[400px] flex flex-col">
              {loadingHistory ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
                  <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-sm font-medium text-slate-500">Buscando dados históricos...</p>
                </div>
              ) : chartHistory.length > 0 ? (
                <div className="flex-1 w-full bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={chartHistory}>
                      <defs>
                        <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(str) => {
                          const date = getSafeDate(str);
                          return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
                        }}
                        tick={{fontSize: 10, fill: '#64748b'}}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={30}
                      />
                      <YAxis 
                        domain={['auto', 'auto']}
                        tickFormatter={(val) => `R$ ${val.toFixed(2)}`}
                        tick={{fontSize: 10, fill: '#64748b'}}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          borderRadius: '12px', 
                          border: 'none', 
                          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                          fontSize: '12px'
                        }}
                        labelFormatter={(label) => getSafeDate(label).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        formatter={(val: number) => [`R$ ${val.toFixed(2)}`, 'Preço']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="close" 
                        stroke="#2563eb" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorClose)" 
                        animationDuration={1000}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 text-slate-400">
                  <AlertCircle className="w-12 h-12 opacity-20" />
                  <p className="text-sm">Nenhum dado histórico encontrado para este ativo.</p>
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={closeChart}
                className="px-6 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Barra Flutuante do Simulador */}
      {isSimulatorMode && Object.keys(simulationData).some(id => simulationData[id] > 0) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-white/10 p-4 md:p-6 flex flex-col md:flex-row items-center gap-6 backdrop-blur-md bg-opacity-95">
            <div className="flex items-center gap-3 pr-6 md:border-r border-white/10">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Calculator className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo da Simulação</h4>
                <p className="text-sm font-bold">Total de Novas Compras</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8">
              {Object.entries(simulationSummary || {}).map(([cur, cost]) => {
                const available = cashBalanceByCurrency[cur] || 0;
                const hasBalance = available >= cost;
                
                return (
                  <div key={cur} className="flex flex-col items-center md:items-start">
                    <span className="text-[9px] font-black text-slate-500 uppercase mb-1">{cur}</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-black text-blue-400 font-mono">
                        {formatCurrency(cost, cur as Currency)}
                      </span>
                      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${hasBalance ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {hasBalance ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                        {hasBalance ? 'Saldo OK' : 'Sem Saldo'}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      Disponível: {formatCurrency(available, cur as Currency)}
                    </span>
                  </div>
                );
              })}
            </div>

            <button
               onClick={() => setSimulationData({})}
               className="ml-0 md:ml-4 p-2 text-slate-400 hover:text-white transition-colors"
               title="Limpar Simulação"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Ajustes */}
      {isAccrualHistoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <HistoryIcon className="w-5 h-5 text-indigo-600" /> Histórico de Ajustes e Rendimentos
              </h3>
              <button onClick={() => setIsAccrualHistoryModalOpen(false)} className="p-2 hover:bg-white rounded-full text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {accruals.length === 0 ? (
                <div className="text-center py-12 text-slate-400 italic">
                  Nenhum ajuste manual encontrado.
                </div>
              ) : (
                <div className="overflow-hidden border border-slate-100 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400 border-b border-slate-100">
                      <tr>
                        <th className="p-4">Data</th>
                        <th className="p-4">Ativo</th>
                        <th className="p-4">Banco / Corretora</th>
                        <th className="p-4">Descrição</th>
                        <th className="p-4 text-right">Valor</th>
                        <th className="p-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {[...accruals].sort((a,b) => b.date.localeCompare(a.date)).map(acc => {
                        const asset = registries.participants.find(p => String(p.id) === String(acc.assetId));
                        // Buscar banco no acréscimo de forma estrita (sem inferência nebulosa)
                        const bankId = acc.bankId || '';
                        const bank = registries.banks.find(b => String(b.id) === String(bankId));
                        
                        return (
                          <tr key={acc.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-4 text-xs font-mono text-slate-500 whitespace-nowrap">{acc.date.split('-').reverse().join('/')}</td>
                            <td className="p-4 text-xs font-bold text-slate-700">
                              <div className="flex flex-col">
                                <span>{asset?.name || 'Ativo Desconhecido'}</span>
                                {asset?.ticker && <span className="text-[9px] text-blue-600 font-black">{asset.ticker}</span>}
                              </div>
                            </td>
                            <td className="p-4 text-xs text-slate-500">
                              {bank ? (
                                <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg w-fit border border-blue-100">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                  <span className="font-medium">{bank.name}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 text-slate-400 rounded-lg w-fit border border-slate-100">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                  <span className="font-medium italic">Todo o Ativo (Global)</span>
                                </div>
                              )}
                            </td>
                            <td className="p-4 text-xs text-slate-500 max-w-[150px] truncate">{acc.description}</td>
                            <td className="p-4 text-xs font-bold text-emerald-600 text-right font-mono">
                              {acc.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-center gap-1">
                                <button 
                                  onClick={() => {
                                    setEditingAccrual(acc);
                                    setManualAccrualParticipantId(String(acc.assetId));
                                    setManualAccrualBankId(acc.bankId ? String(acc.bankId) : '');
                                    setManualAccrualValue(acc.value);
                                    setManualAccrualDate(acc.date);
                                    setManualAccrualDesc(acc.description);
                                    setIsManualAccrualModalOpen(true);
                                    setIsAccrualHistoryModalOpen(false);
                                  }}
                                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                  title="Editar lançamento"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => {
                                    setAccrualToDeleteId(String(acc.id));
                                    setIsConfirmDeleteAccrualOpen(true);
                                    // Comentado para não fechar o histórico, facilitando a gestão
                                    // setIsAccrualHistoryModalOpen(false);
                                  }}
                                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                  title="Excluir lançamento"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsAccrualHistoryModalOpen(false)}
                className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-all shadow-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Lançamento Manual */}
      {isManualAccrualModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" /> {editingAccrual ? 'Editar Rendimento/Ajuste' : 'Lançar Rendimento/Ajuste'}
              </h3>
              <button 
                onClick={() => {
                  setIsManualAccrualModalOpen(false);
                  setEditingAccrual(null);
                  setManualAccrualParticipantId('');
                  setManualAccrualBankId('');
                  setManualAccrualValue(0);
                  setManualAccrualDesc('');
                }} 
                className="p-2 hover:bg-white rounded-full text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Ativo / Participante</label>
                <select
                  value={manualAccrualParticipantId}
                  onChange={(e) => setManualAccrualParticipantId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">Selecione um ativo...</option>
                  {registries.participants
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.ticker ? `(${p.ticker})` : ''} {p.category ? `[${p.category}]` : ''}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1 italic leading-tight">
                  Se o ativo não aparecer, cadastre-o primeiro no menu "Participantes".
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Data</label>
                  <input
                    type="date"
                    value={manualAccrualDate}
                    onChange={(e) => setManualAccrualDate(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Valor do Rendimento</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatCurrencyInput(manualAccrualValue)}
                    onChange={(e) => handleCurrencyInputChange(e, setManualAccrualValue)}
                    placeholder="Ex: 500,00"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-emerald-600 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Banco / Corretora</label>
                <select
                  value={manualAccrualBankId}
                  onChange={(e) => setManualAccrualBankId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">Selecione o banco (Opcional)</option>
                  {registries.banks
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1 italic leading-tight">
                  Vincule a um banco para que este valor apareça quando você filtrar por instituição.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Descrição</label>
                <input
                  type="text"
                  value={manualAccrualDesc}
                  onChange={(e) => setManualAccrualDesc(e.target.value)}
                  placeholder="Ex: Aporte Mensal Empresa"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              {editingAccrual && (
                <button
                  onClick={() => {
                    setAccrualToDeleteId(editingAccrual.id);
                    setIsConfirmDeleteAccrualOpen(true);
                    setIsManualAccrualModalOpen(false);
                  }}
                  className="px-4 py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Excluir
                </button>
              )}
              <div className="flex-1 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setIsManualAccrualModalOpen(false);
                    setEditingAccrual(null);
                    setManualAccrualParticipantId('');
                    setManualAccrualBankId('');
                    setManualAccrualValue(0);
                    setManualAccrualDesc('');
                  }}
                  className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveManualAccrual}
                  disabled={!manualAccrualParticipantId || manualAccrualValue === 0}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                  {editingAccrual ? 'Salvar Alterações' : 'Confirmar Lançamento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Confirmação de Exclusão */}
      <ConfirmModal
        isOpen={isConfirmDeleteAccrualOpen}
        onClose={() => setIsConfirmDeleteAccrualOpen(false)}
        onConfirm={() => accrualToDeleteId && handleDeleteAccrual(accrualToDeleteId)}
        title="Excluir Lançamento"
        message="Tem certeza que deseja excluir este rendimento/ajuste? Esta ação não pode ser desfeita."
        confirmText="Excluir"
        isDestructive={true}
      />
    </div>
  );
};
