
import React, { useEffect, useState, useMemo, useCallback, useRef, type FC } from 'react';
import { Sidebar } from './components/Sidebar';
import { TransactionList } from './components/TransactionList';
import { TransactionForm } from './components/TransactionForm';
import { RegistryManager } from './components/RegistryManager';
import { Summary } from './components/Summary';
import { SettingsView } from './components/SettingsView';
import { CashFlowReport } from './components/CashFlowReport';
import { ExpenseAnalysisReport } from './components/ExpenseAnalysisReport';
import { AssetPerformanceReport } from './components/AssetPerformanceReport';
import { BrokerageNotesReport } from './components/BrokerageNotesReport';
import ReportsDashboard from './src/components/reports/ReportsDashboard';
import { HelpManual } from './components/HelpManual';
import { SettingsPage } from './components/SettingsPage';
import { financeService, DEFAULT_SUPABASE_CONFIG } from './services/financeService';
import { Transaction, Bank, Category, CostCenter, Participant, Wallet, TransactionStatus, AssetType, AssetSector, AssetTicker } from './types';
import { BrokerageImport } from './components/BrokerageImport';
import { Auth } from './components/Auth';
import { 
  Plus, 
  Wallet as WalletIcon, 
  CheckCircle2, 
  WifiOff, 
  Building2, 
  Tags, 
  Users, 
  Briefcase,
  Calendar,
  AlertCircle,
  RefreshCcw,
  SearchX,
  FileUp,
  Database,
  Layers,
  Loader2,
  XCircle,
  PieChart,
  LayoutGrid,
  Hash,
  LogOut,
  User,
  History as HistoryIcon
} from 'lucide-react';
import { ConfirmModal } from './components/ConfirmModal';

const App: FC = () => {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeRegistryTab, setActiveRegistryTab] = useState('wallets'); 
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const initialPrefsApplied = useRef(false);
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  // Armazena o saldo acumulado ANTES da data de início do filtro
  const [previousBalances, setPreviousBalances] = useState<{ total: number, byBank: Record<string, number> }>({ total: 0, byBank: {} });

  const [registries, setRegistries] = useState<{
    banks: Bank[];
    categories: Category[];
    costCenters: CostCenter[];
    participants: Participant[];
    wallets: Wallet[];
    assetTypes: AssetType[];
    assetSectors: AssetSector[];
    assetTickers: AssetTicker[];
  }>({
    banks: [],
    categories: [],
    costCenters: [],
    participants: [],
    wallets: [],
    assetTypes: [],
    assetSectors: [],
    assetTickers: []
  });

  const [selectedWalletId, setSelectedWalletId] = useState<string>(() => financeService.getUserPreferences().defaultWalletId);
  const [selectedBankId, setSelectedBankId] = useState<string>(() => financeService.getUserPreferences().defaultBankId);
  const [performanceBankId, setPerformanceBankId] = useState<string>(() => financeService.getUserPreferences().defaultPerformanceBankId || 'ALL');
  const [performanceWalletId, setPerformanceWalletId] = useState<string>(() => financeService.getUserPreferences().defaultPerformanceWalletId || 'ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING'>(() => financeService.getUserPreferences().defaultStatus); 
  
  // Salvar preferências automaticamente quando mudarem
  useEffect(() => {
    const currentPrefs = financeService.getUserPreferences();
    financeService.saveUserPreferences({
      ...currentPrefs,
      defaultBankId: selectedBankId,
      defaultWalletId: selectedWalletId,
      defaultPerformanceBankId: performanceBankId,
      defaultPerformanceWalletId: performanceWalletId,
      defaultStatus: statusFilter
    });
  }, [selectedBankId, selectedWalletId, performanceBankId, performanceWalletId, statusFilter]);
  
  const [startDate, setStartDate] = useState<string>(() => financeService.getDateRangeFromPreference(financeService.getUserPreferences().defaultDateRange).start);
  const [endDate, setEndDate] = useState<string>(() => financeService.getDateRangeFromPreference(financeService.getUserPreferences().defaultDateRange).end);
  
  // Triggers para exportação e ajustes no relatório de performance
  const excelExportFn = useRef<(() => void) | null>(null);
  const pdfExportFn = useRef<(() => void) | null>(null);
  const manualAdjustFn = useRef<(() => void) | null>(null);
  const accrualHistoryFn = useRef<(() => void) | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [partnerTransaction, setPartnerTransaction] = useState<Transaction | null>(null);

  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: '', message: '' });

  // Controle de concorrência para evitar Race Conditions nos filtros
  const lastRequestIdRef = useRef(0);
  const lastRegistryRequestIdRef = useRef(0);

  const showAlert = (title: string, message: any) => {
    const msg = typeof message === 'string' ? message : (message?.message || message?.details || JSON.stringify(message));
    setAlertState({ isOpen: true, title, message: msg });
  };

  // Carrega apenas os cadastros (uma única vez ou quando conectar)
  const loadRegistries = useCallback(async (forceRefresh = false) => {
    const requestId = ++lastRegistryRequestIdRef.current;
    try {
      // Tenta carregar do localStorage primeiro para exibição imediata
      if (!forceRefresh) {
        const keyMap: any = { 
          banks: 'fincontrol_banks', 
          categories: 'fincontrol_categories', 
          costCenters: 'fincontrol_cost_centers', 
          participants: 'fincontrol_participants', 
          wallets: 'fincontrol_wallets',
          assetTypes: 'fincontrol_asset_types',
          assetSectors: 'fincontrol_asset_sectors',
          assetTickers: 'fincontrol_asset_tickers'
        };
        const localData = {
          banks: JSON.parse(localStorage.getItem(keyMap.banks) || '[]'),
          categories: JSON.parse(localStorage.getItem(keyMap.categories) || '[]'),
          costCenters: JSON.parse(localStorage.getItem(keyMap.costCenters) || '[]'),
          participants: JSON.parse(localStorage.getItem(keyMap.participants) || '[]'),
          wallets: JSON.parse(localStorage.getItem(keyMap.wallets) || '[]'),
          assetTypes: JSON.parse(localStorage.getItem(keyMap.assetTypes) || '[]'),
          assetSectors: JSON.parse(localStorage.getItem(keyMap.assetSectors) || '[]'),
          assetTickers: JSON.parse(localStorage.getItem(keyMap.assetTickers) || '[]'),
        };
        
        const hasAnyData = Object.values(localData).some(arr => Array.isArray(arr) && arr.length > 0);
        
        if (hasAnyData) {
          if (requestId === lastRegistryRequestIdRef.current) {
            setRegistries(localData as any);
          }
        }
      }

      const [bk, cat, cc, pt, wa, at, as, atk] = await Promise.all([
        financeService.getRegistry<Bank>('banks', forceRefresh),
        financeService.getRegistry<Category>('categories', forceRefresh),
        financeService.getRegistry<CostCenter>('costCenters', forceRefresh),
        financeService.getRegistry<Participant>('participants', forceRefresh),
        financeService.getRegistry<Wallet>('wallets', forceRefresh),
        financeService.getRegistry<AssetType>('assetTypes', forceRefresh),
        financeService.getRegistry<AssetSector>('assetSectors', forceRefresh),
        financeService.getRegistry<AssetTicker>('assetTickers', forceRefresh),
      ]);

      if (requestId === lastRegistryRequestIdRef.current) {
        setRegistries({ 
          banks: bk, 
          categories: cat, 
          costCenters: cc, 
          participants: pt, 
          wallets: wa,
          assetTypes: at,
          assetSectors: as,
          assetTickers: atk
        });

        // Sincroniza tabelas auxiliares se necessário (especialmente importante se sumiram)
        if (at.length === 0 || as.length === 0) {
           const stats = await financeService.syncAuxiliaryRegistries();
           if (stats.types > 0 || stats.sectors > 0 || stats.tickers > 0) {
              // Recarrega se houve novos cadastros criados pela sincronização
              const [newAt, newAs, newAtk] = await Promise.all([
                financeService.getRegistry<AssetType>('assetTypes', true),
                financeService.getRegistry<AssetSector>('assetSectors', true),
                financeService.getRegistry<AssetTicker>('assetTickers', true)
              ]);
              
              setRegistries(prev => ({
                ...prev,
                assetTypes: newAt,
                assetSectors: newAs,
                assetTickers: newAtk
              }));
           }
        }
      }
    } catch (error: any) {
      console.error("Failed to load registries", error);
    }
  }, []);

  // Carrega transações baseado nos filtros atuais (Database-side)
  const loadTransactions = useCallback(async () => {
    const requestId = ++lastRequestIdRef.current;
    setRefreshing(true);
    
    try {
      // Na aba de investimentos, precisamos de TODO o histórico para calcular preço médio e quantidade corretamente
      const isInvestmentsTab = activeTab === 'investments';

      // 1. Busca transações filtradas
      const trPromise = financeService.getTransactions({
        startDate: isInvestmentsTab ? undefined : startDate,
        endDate: isInvestmentsTab ? undefined : endDate,
        bankId: isInvestmentsTab 
          ? undefined 
          : (selectedBankId === 'ALL' ? undefined : selectedBankId),
        walletId: isInvestmentsTab 
          ? undefined 
          : (selectedWalletId === 'ALL' ? undefined : selectedWalletId),
        status: isInvestmentsTab ? 'PAID' : statusFilter
      });

      // 2. Busca saldo anterior (se houver data de início)
      let balPromise = Promise.resolve({ total: 0, byBank: {} });
      if (startDate && !isInvestmentsTab) {
        balPromise = financeService.getBalancesBefore(startDate, selectedBankId, selectedWalletId);
      }

      const [tr, bal] = await Promise.all([trPromise, balPromise]);
      
      // Só atualiza o estado se esta for a última requisição feita
      if (requestId === lastRequestIdRef.current) {
        setTransactions(tr);
        setPreviousBalances(bal);
      }
    } catch (error: any) {
      if (requestId === lastRequestIdRef.current) {
        console.error("Failed to load transactions", error);
        
        const msg = error.message || '';
        // Detect Permission Denied (42501) or general permission errors
        if (msg.includes('permission denied') || msg.includes('42501') || msg.includes('policy')) {
            setActiveTab('settings');
            showAlert('Configuração Necessária', 'Detectamos um erro de permissão no banco de dados. Por favor, execute o "Código SQL" na aba de Configurações para corrigir.');
        } else {
            showAlert('Erro de Sincronização', error.message);
        }
      }
    } finally {
      if (requestId === lastRequestIdRef.current) {
        setRefreshing(false);
      }
    }
  }, [startDate, endDate, selectedBankId, selectedWalletId, statusFilter, activeTab]);

  const loadAll = async (isInitialFetch = false) => {
    if (isInitialFetch) setLoading(true);
    
    // Verifica conexão
    const supabase = financeService.getSupabase();
    setIsConnected(!!supabase);
    setIsLocalMode(!supabase);
    setIsOffline(false);

    if (supabase) {
        try {
            // Verifica sessão atual
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user || null);
            if (session?.user) {
                localStorage.setItem('supabase_user_id', session.user.id);
            }

            // Teste rápido de conexão
            const { error } = await supabase.from('banks').select('id').limit(1);
            if (error && (error.message?.includes('fetch') || error.name === 'TypeError')) {
                setIsOffline(true);
            }
        } catch (e: any) {
            if (e.message?.includes('fetch') || e.name === 'TypeError') {
                setIsOffline(true);
            }
        }
    }

    // Se já temos registros no localStorage, podemos liberar o loading mais cedo
    const keyMap: any = { banks: 'fincontrol_banks', categories: 'fincontrol_categories' };
    const hasLocalData = !!localStorage.getItem(keyMap.banks) || !!localStorage.getItem(keyMap.categories);

    // Se é o carregamento inicial, busca as preferências ANTES de buscar as transações
    // para que a busca de transações já use os filtros corretos
    if (!initialPrefsApplied.current) {
        try {
            const savedPrefs = await financeService.getUserSettings();
            if (savedPrefs.defaultTab) setActiveTab(savedPrefs.defaultTab);
            if (savedPrefs.defaultWalletId) setSelectedWalletId(savedPrefs.defaultWalletId);
            if (savedPrefs.defaultBankId) setSelectedBankId(savedPrefs.defaultBankId);
            if (savedPrefs.defaultPerformanceBankId) setPerformanceBankId(savedPrefs.defaultPerformanceBankId);
            if (savedPrefs.defaultPerformanceWalletId) setPerformanceWalletId(savedPrefs.defaultPerformanceWalletId);
            if (savedPrefs.defaultStatus) setStatusFilter(savedPrefs.defaultStatus);
            
            const range = financeService.getDateRangeFromPreference(savedPrefs.defaultDateRange);
            if (range.start) setStartDate(range.start);
            if (range.end) setEndDate(range.end);
            
            initialPrefsApplied.current = true;
        } catch (e) {
            console.warn("Falha ao carregar preferências", e);
        }
    }

    // Carrega registros e transações
    const registriesPromise = loadRegistries();
    const transactionsPromise = loadTransactions();

    if (isInitialFetch) {
        if (hasLocalData) {
            // Se tem dados locais, esperamos apenas as transações (que são o dado principal)
            await transactionsPromise;
        } else {
            // Se não tem nada local, esperamos tudo para não mostrar tela vazia
            await Promise.all([registriesPromise, transactionsPromise]);
        }
        setLoading(false);
    }
  };

  useEffect(() => {
    loadAll(true);

    // Listen for auth changes
    const supabase = financeService.getSupabase();
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        const newUser = session?.user || null;
        
        // Evita recarregar se o usuário for o mesmo
        setUser((prevUser: any) => {
            if (prevUser?.id === newUser?.id) return prevUser;
            
            if (newUser) {
                localStorage.setItem('supabase_user_id', newUser.id);
                // Se o usuário mudou (de null para algo ou mudou conta), recarrega
                if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                    loadAll(false);
                }
            } else {
                localStorage.removeItem('supabase_user_id');
            }
            return newUser;
        });
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [isConnected]);

  // Recarrega transações quando os filtros mudam
  useEffect(() => {
    if (!loading) {
        loadTransactions();
    }
  }, [startDate, endDate, selectedBankId, selectedWalletId, performanceBankId, performanceWalletId, statusFilter, activeTab, loadTransactions]);

  useEffect(() => {
    if (activeTab === 'registries') {
      loadRegistries();
    }
  }, [activeTab, loadRegistries]);

  useEffect(() => {
    if (activeTab === 'payables') {
      setStatusFilter('PENDING');
    } else if (activeTab === 'bank-transactions') {
      setStatusFilter('PAID');
    } else if (['dashboard', 'cashflow', 'expenses-analysis', 'investments'].includes(activeTab)) {
      setStatusFilter(financeService.getUserPreferences().defaultStatus);
    }
  }, [activeTab]);

  const globalBalanceMap = useMemo(() => {
    let relevant = transactions.filter(t => t.status === 'PAID');
    
    // Ordena cronologicamente para calcular o saldo corrente
    relevant.sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return da - db;
      
      // Secondary sort: Oldest creation first for balance calculation
      if (a.createdAt && b.createdAt) {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return (a.id || '').localeCompare(b.id || '');
    });

    const map: Record<string, number> = {};
    
    // O saldo corrente começa com o Saldo Anterior (Histórico)
    // Se o filtro de banco estiver ativo, pegamos o saldo anterior específico do banco, senão o total
    let running = selectedBankId && previousBalances.byBank[selectedBankId] !== undefined 
        ? previousBalances.byBank[selectedBankId] 
        : previousBalances.total;

    relevant.forEach(t => {
      running += (t.type === 'CREDIT' ? t.value : -t.value);
      map[t.id] = running;
    });
    return map;
  }, [transactions, previousBalances, selectedBankId]);

  const handleSaveTransaction = async (t: Transaction | Transaction[]) => {
    try {
        if (Array.isArray(t)) {
            await financeService.createManyTransactions(t);
        } else {
            await financeService.saveTransaction(t);
        }
        await loadTransactions(); 
    } catch (e: any) {
       showAlert('Erro ao Salvar', e);
    }
  };

  const handleDeleteTransactions = async (ids: string[]) => {
    try {
        await financeService.deleteTransactions(ids);
        await loadTransactions();
    } catch (e: any) {
        showAlert('Erro ao Excluir', e);
    }
  };
  
  const handleUpdateTransactionsStatus = async (ids: string[], status: 'PAID' | 'PENDING') => {
    try {
        await financeService.updateTransactionsStatus(ids, status);
        await loadTransactions();
    } catch (e: any) {
        showAlert('Erro ao Atualizar Status', e);
    }
  };

  const handleUpdateTransactionsDate = async (ids: string[], date: string) => {
    try {
        await financeService.updateTransactionsDate(ids, date);
        await loadTransactions();
    } catch (e: any) {
        showAlert('Erro ao Atualizar Data', e);
    }
  };

  const handleUpdateTransactionsValue = async (ids: string[], value: number) => {
    try {
        await financeService.updateTransactionsValue(ids, value);
        await loadTransactions();
    } catch (e: any) {
        showAlert('Erro ao Atualizar Valor', e);
    }
  };

  const handleQuickAddParticipant = async (name: string): Promise<Participant> => {
      const newP = await financeService.saveRegistryItem('participants', { id: '', name });
      setRegistries(prev => ({ ...prev, participants: [...prev.participants, newP] }));
      return newP;
  };

  const registryTabs = [
    { id: 'wallets', label: 'Carteiras', icon: WalletIcon },
    { id: 'banks', label: 'Bancos', icon: Building2 },
    { id: 'categories', label: 'Categorias', icon: Tags },
    { id: 'costCenters', label: 'Centros de Custo', icon: Briefcase },
    { id: 'participants', label: 'Participantes', icon: Users },
    { id: 'assetTypes', label: 'Tipos de Ativos', icon: PieChart },
    { id: 'assetSectors', label: 'Setores', icon: LayoutGrid },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white flex-col gap-6">
        <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            <Database className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-blue-600" />
        </div>
        <div className="text-center">
            <p className="text-slate-800 font-bold text-lg">Sincronizando Dados</p>
            <p className="text-slate-500 text-sm">Carregando seus registros do Supabase...</p>
        </div>
      </div>
    );
  }

  const selectClass = "bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 font-medium cursor-pointer hover:bg-gray-50 transition-colors h-[38px] flex items-center min-w-[140px]";

  if (!user && isConnected && !isLocalMode) {
    return <Auth onLogin={loadAll} />;
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="py-2.5 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between px-6 flex-shrink-0 z-10 gap-3 shadow-sm">
          <div className="flex items-center gap-4">
              <h1 className="text-lg font-black text-slate-800 whitespace-nowrap tracking-tight">
                  {activeTab === 'dashboard' && 'Dashboard'}
                  {activeTab === 'reports' && 'Relatórios'}
                  {activeTab === 'cashflow' && 'Fluxo de Caixa'}
                  {activeTab === 'expenses-analysis' && 'Análise de Gastos'}
                  {activeTab === 'investments' && 'Investimentos'}
                  {activeTab === 'brokerage-notes' && 'Notas de Corretagem'}
                  {activeTab === 'payables' && 'Contas a Pagar'}
                  {activeTab === 'bank-transactions' && 'Extrato'}
                  {activeTab === 'registries' && 'Cadastros'}
                  {activeTab === 'settings' && 'Ajustes'}
                  {activeTab === 'manual' && 'Ajuda'}
              </h1>

              <div className="flex items-center gap-2">
                {user && (
                  <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-full">
                      <User className="w-2.5 h-2.5 text-slate-400" />
                      <span className="text-[9px] font-bold text-slate-500 truncate max-w-[80px]">
                        {user.email.split('@')[0]}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border transition-colors ${isLocalMode ? 'bg-blue-50 text-blue-700 border-blue-200' : isConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {isLocalMode ? <Database className="w-2.5 h-2.5" /> : isConnected ? <CheckCircle2 className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                    <span className="hidden sm:inline">{isLocalMode ? 'Local' : isConnected ? 'Supabase' : 'Offline'}</span>
                </div>

                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 text-slate-500 rounded-full text-[9px] font-black uppercase tracking-wider border border-slate-200 shadow-sm">
                    {refreshing ? <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-500" /> : <Layers className="w-2.5 h-2.5 opacity-50" />}
                    <span>{refreshing ? '...' : `${transactions.length}`}</span>
                </div>
              </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {['dashboard', 'cashflow', 'expenses-analysis', 'payables', 'bank-transactions', 'brokerage-notes', 'investments'].includes(activeTab) && activeTab !== 'reports' && (
                <div className="flex flex-wrap items-center gap-2">
                    {activeTab !== 'investments' && (
                      <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-lg px-2 py-1.5 shadow-sm h-[34px] group hover:border-blue-300 transition-colors">
                          <Calendar className="w-3 h-3 text-gray-400 group-hover:text-blue-500" />
                          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent border-none text-[10px] w-[95px] outline-none font-bold text-slate-700" title="Início" />
                          <span className="text-gray-300">-</span>
                          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent border-none text-[10px] w-[95px] outline-none font-bold text-slate-700" title="Fim" />
                      </div>
                    )}

                    {activeTab !== 'investments' && (
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="bg-white border border-gray-300 rounded-lg px-2 text-[10px] focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 font-bold h-[34px] min-w-[110px]">
                        <option value="ALL">Status</option>
                        <option value="PAID">Pagas</option>
                        <option value="PENDING">Pendentes</option>
                      </select>
                    )}

                    <select 
                      value={activeTab === 'investments' ? performanceBankId : selectedBankId} 
                      onChange={(e) => activeTab === 'investments' ? setPerformanceBankId(e.target.value) : setSelectedBankId(e.target.value)} 
                      className="bg-white border border-gray-300 rounded-lg px-2 text-[10px] focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 font-bold h-[34px] min-w-[130px]"
                    >
                      <option value={activeTab === 'investments' ? 'ALL' : ''}>{activeTab === 'investments' ? 'Todos Bancos' : 'Banco'}</option>
                      {registries.banks.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>

                    <select 
                      value={activeTab === 'investments' ? performanceWalletId : selectedWalletId} 
                      onChange={(e) => activeTab === 'investments' ? setPerformanceWalletId(e.target.value) : setSelectedWalletId(e.target.value)} 
                      className="bg-white border border-gray-300 rounded-lg px-2 text-[10px] focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 font-bold h-[34px] min-w-[130px]"
                    >
                      <option value={activeTab === 'investments' ? 'ALL' : ''}>{activeTab === 'investments' ? 'Todas Carteiras' : 'Carteira'}</option>
                      {registries.wallets.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>

                    {activeTab === 'investments' && (
                      <div className="flex items-center gap-1 ml-2">
                        <button 
                          onClick={() => manualAdjustFn.current?.()} 
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all shadow-sm h-[34px]"
                          title="Ajuste Manual"
                        >
                          <Plus className="w-3 h-3" /> <span className="hidden md:inline">Ajuste</span>
                        </button>
                        <button 
                          onClick={() => accrualHistoryFn.current?.()} 
                          className="p-2 bg-slate-50 text-slate-500 rounded-lg hover:bg-slate-100 transition-all shadow-sm border border-gray-200 h-[34px]"
                          title="Histórico de Ajustes"
                        >
                          <HistoryIcon className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => excelExportFn.current?.()} 
                          className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all shadow-sm border border-emerald-100 h-[34px]"
                          title="Exportar Excel"
                        >
                          <FileUp className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => pdfExportFn.current?.()} 
                          className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all shadow-sm border border-red-100 h-[34px]"
                          title="Exportar PDF"
                        >
                          <FileUp className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <button onClick={() => loadTransactions()} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-gray-200 h-[34px]" title="Sincronizar">
                      <RefreshCcw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-500' : ''}`} />
                    </button>

                    <button 
                      onClick={() => financeService.signOut()}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all border border-gray-200 h-[34px]"
                      title="Sair"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {!['registries', 'settings', 'manual'].includes(activeTab) && (
              <div className="flex gap-2">
                {(activeTab === 'investments' || activeTab === 'bank-transactions' || activeTab === 'brokerage-notes') && (
                  <button 
                    onClick={() => setIsImportOpen(true)} 
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors h-[38px] shadow-sm"
                  >
                    <FileUp className="w-4 h-4 text-blue-600" /> <span>Incluir nota</span>
                  </button>
                )}
                <button onClick={() => { setEditingTransaction(null); setIsFormOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm shadow-blue-100 h-[38px]">
                    <Plus className="w-4 h-4" /> <span>Lançar</span>
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 flex flex-col overflow-hidden relative">
          {isOffline && (
            <div className="bg-amber-50 border-b border-amber-100 px-6 py-2 flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-3 text-amber-800">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider">Modo de Emergência (Offline)</span>
                <span className="text-xs opacity-75 hidden md:inline">Não conseguimos conectar ao Supabase. Usando dados locais.</span>
              </div>
              <button 
                onClick={() => loadAll()} 
                className="text-[10px] font-black uppercase text-amber-700 hover:text-amber-900 underline underline-offset-2"
              >
                Tentar Reconectar
              </button>
            </div>
          )}
          {refreshing && (
              <div className="absolute top-0 left-0 w-full h-1 bg-blue-100 overflow-hidden z-50">
                  <div className="w-full h-full bg-blue-600 animate-progress"></div>
              </div>
          )}

          {transactions.length === 0 && !loading && !refreshing && activeTab !== 'settings' && activeTab !== 'registries' && activeTab !== 'manual' && (
              <div className="absolute inset-0 flex items-center justify-center flex-col gap-5 bg-gray-50/90 z-20">
                  <div className="p-6 bg-white rounded-full shadow-lg text-slate-200 border border-slate-100">
                    <SearchX className="w-16 h-16" />
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Vazio por aqui...</h2>
                    <p className="text-slate-500 text-sm max-w-sm px-6 mx-auto">
                      Não encontramos lançamentos para os filtros aplicados.
                    </p>
                  </div>
                  <div className="flex gap-3">
                      <button onClick={() => { setStartDate(''); setEndDate(''); setSelectedBankId(''); setStatusFilter('ALL'); }} className="px-6 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm">Remover Filtros</button>
                  </div>
              </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="flex-1 overflow-auto p-8">
              <div className="max-w-7xl mx-auto animate-fade-in">
                <Summary transactions={transactions} banks={registries.banks} previousBalances={previousBalances} />
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="flex-1 overflow-hidden">
               <ReportsDashboard transactions={transactions} registries={registries} />
            </div>
          )}

          {activeTab === 'cashflow' && (
            <div className="flex-1 overflow-auto p-8">
              <div className="max-w-7xl mx-auto">
                <CashFlowReport 
                  allTransactions={transactions} 
                  startDate={startDate} 
                  endDate={endDate} 
                  previousBalances={previousBalances}
                  registries={registries} 
                />
              </div>
            </div>
          )}

          {activeTab === 'expenses-analysis' && (
            <div className="flex-1 overflow-auto p-2 sm:p-4">
              <div className="w-full">
                <ExpenseAnalysisReport transactions={transactions} registries={registries} />
              </div>
            </div>
          )}

          {activeTab === 'investments' && (
            <div className="flex-1 overflow-auto p-2 sm:p-4">
              <div className="w-full">
                <AssetPerformanceReport 
                  transactions={transactions} 
                  registries={{
                    ...registries,
                    wallets: registries.wallets
                  }} 
                  onUpdateRegistry={loadRegistries}
                  selectedBankId={performanceBankId}
                  setSelectedBankId={setPerformanceBankId}
                  selectedWalletId={performanceWalletId}
                  setSelectedWalletId={setPerformanceWalletId}
                  hideHeader={true}
                  onOpenManualAdjust={(fn) => { manualAdjustFn.current = fn; }}
                  onOpenAccrualHistory={(fn) => { accrualHistoryFn.current = fn; }}
                  onExportExcel={(fn) => { excelExportFn.current = fn; }}
                  onExportPDF={(fn) => { pdfExportFn.current = fn; }}
                />
              </div>
            </div>
          )}

          {(activeTab === 'payables' || activeTab === 'bank-transactions') && (
            <div className="flex-1 flex flex-col animate-fade-in bg-white h-full relative">
               <div className="absolute inset-0 overflow-hidden flex flex-col">
                   <TransactionList 
                    transactions={transactions} 
                    registries={registries} 
                    onEdit={(t) => { 
                      const handleEdit = async () => {
                        const transactionToEdit = { ...t };
                        if (activeTab === 'payables' && t.status === 'PENDING') {
                          transactionToEdit.status = 'PAID';
                        }
                        setEditingTransaction(transactionToEdit); 
                        if (t.linkedId) {
                          const partner = transactions.find(x => x.linkedId === t.linkedId && x.id !== t.id);
                          if (partner) {
                            setPartnerTransaction(partner);
                          } else {
                            try {
                              const linkedTxs = await financeService.getTransactionsByLinkedId(t.linkedId);
                              const p = linkedTxs.find(x => x.id !== t.id);
                              setPartnerTransaction(p || null);
                            } catch (e) {
                              console.error("Error fetching partner transaction", e);
                              setPartnerTransaction(null);
                            }
                          }
                        } else {
                          setPartnerTransaction(null);
                        }
                        setIsFormOpen(true); 
                      };
                      handleEdit();
                    }} 
                    onDelete={handleDeleteTransactions} 
                    onUpdateStatus={handleUpdateTransactionsStatus}
                    onUpdateDate={handleUpdateTransactionsDate}
                    onUpdateValue={handleUpdateTransactionsValue}
                    onImport={() => {}} 
                    variant="full" 
                    externalBalanceMap={globalBalanceMap} 
                    initialSortByStatus={statusFilter === 'ALL' ? undefined : statusFilter as any}
                    totalInDatabase={transactions.length}
                   />
               </div>
            </div>
          )}

          {activeTab === 'registries' && (
            <div className="flex-1 overflow-auto p-8">
                <div className="h-full flex flex-col animate-fade-in">
                  <div className="flex flex-wrap gap-2 mb-6">
                    {registryTabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveRegistryTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeRegistryTab === tab.id ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}`}>
                          <tab.icon className="w-4 h-4" /> {tab.label}
                        </button>
                    ))}
                  </div>
                  <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <RegistryManager 
                        title={registryTabs.find(t => t.id === activeRegistryTab)?.label || ''} 
                        items={registries[activeRegistryTab as keyof typeof registries]} 
                        // @ts-ignore
                        onAdd={(name, extra) => financeService.saveRegistryItem(activeRegistryTab, {id:'', name, ...extra}).then(() => loadRegistries())}
                        onDelete={(id) => financeService.deleteRegistryItem(activeRegistryTab, id).then(() => loadRegistries())}
                        // @ts-ignore
                        onEdit={(id, name, extra) => financeService.saveRegistryItem(activeRegistryTab, {id, name, ...extra}).then(() => loadRegistries())}
                        onImport={async (data) => {
                            try {
                                const newItems = [];
                                const existingItems = registries[activeRegistryTab] || [];
                                
                                for (const item of data) {
                                    let name = item;
                                    let extra: any = {};
                                    
                                    // Suporte a CSV: "Nome,Categoria,Ticker,Moeda" ou "Nome,BancoId"
                                    if (item.includes(',')) {
                                        const parts = item.split(',');
                                        name = parts[0].trim();
                                        const val1 = parts[1]?.trim() || '';
                                        const val2 = parts[2]?.trim() || '';
                                        const val3 = parts[3]?.trim() || '';
                                        
                                        if (activeRegistryTab === 'participants') {
                                            extra.category = val1;
                                            if (val2) extra.ticker = val2.toUpperCase();
                                            if (val3) extra.currency = val3.toUpperCase();
                                        } else if (activeRegistryTab === 'wallets') {
                                            extra.bankId = val1;
                                        }
                                    }

                                    // Busca se já existe um item com o mesmo nome para atualizar em vez de duplicar
                                    const existing = existingItems.find(x => x.name.toLowerCase() === name.toLowerCase());
                                    const idToUse = existing ? existing.id : '';

                                    // @ts-ignore
                                    const newItem = await financeService.saveRegistryItem(activeRegistryTab, { id: idToUse, name, ...extra });
                                    newItems.push(newItem);
                                }
                                await loadRegistries();
                                showAlert('Importação Concluída', `${newItems.length} itens processados com sucesso.`);
                            } catch (e: any) {
                                showAlert('Erro na Importação', e);
                            }
                        }}
                        onDeduplicate={async (onProgress) => {
                            const res = await financeService.deduplicateRegistry(activeRegistryTab, onProgress);
                            await loadRegistries();
                            await loadTransactions();
                            return res;
                        }}
                        onFindSimilar={() => financeService.findSimilarGroups(activeRegistryTab)}
                        onIgnoreSimilar={(masterId, duplicateIds) => financeService.ignoreUnification(activeRegistryTab, masterId, duplicateIds)}
                        onGetIgnored={() => financeService.getIgnoredUnifications(activeRegistryTab)}
                        onRemoveIgnored={(pairId) => financeService.removeIgnoredUnification(activeRegistryTab, pairId)}
                        onMerge={async (masterId, duplicateIds) => {
                            await financeService.mergeItems(activeRegistryTab, masterId, duplicateIds);
                            await loadRegistries();
                            await loadTransactions();
                        }}
                        onAutoFillTickers={activeRegistryTab === 'participants' ? async () => {
                            const count = await financeService.autoFillTickers();
                            await loadRegistries();
                            return count;
                        } : undefined}
                        foreignItems={activeRegistryTab === 'wallets' ? registries.banks : undefined}
                        foreignLabel={activeRegistryTab === 'wallets' ? 'Selecionar Banco' : undefined}
                        foreignKey={activeRegistryTab === 'wallets' ? 'bankId' : undefined}
                        assetTypes={registries.assetTypes}
                        assetSectors={registries.assetSectors}
                    />
                  </div>
                </div>
            </div>
          )}

          {activeTab === 'brokerage-notes' && (
            <div className="flex-1 overflow-auto p-2 sm:p-4 bg-slate-50">
              <div className="max-w-7xl mx-auto">
                <BrokerageNotesReport 
                  transactions={transactions} 
                  participants={registries.participants} 
                />
              </div>
            </div>
          )}

          {activeTab.startsWith('settings') && (
            <div className="flex-1 overflow-auto p-8">
               <SettingsPage 
                 activeSubTab={activeTab} 
                 registries={registries}
                 onSaveConfig={() => setIsConnected(true)}
                 onUpdatePrefs={(prefs) => {
                    setSelectedWalletId(prefs.defaultWalletId);
                    setSelectedBankId(prefs.defaultBankId);
                    setPerformanceBankId(prefs.defaultPerformanceBankId || 'ALL');
                    setPerformanceWalletId(prefs.defaultPerformanceWalletId || 'ALL');
                    setStatusFilter(prefs.defaultStatus);
                    const range = financeService.getDateRangeFromPreference(prefs.defaultDateRange);
                    setStartDate(range.start);
                    setEndDate(range.end);
                 }}
               />
            </div>
          )}
        </div>
      </main>

      {isImportOpen && (
        <BrokerageImport 
          onClose={() => setIsImportOpen(false)}
          onSuccess={() => {
            setIsImportOpen(false);
            loadTransactions();
            loadRegistries(true);
          }}
          banks={registries.banks}
          wallets={registries.wallets}
          categories={registries.categories}
          participants={registries.participants}
          costCenters={registries.costCenters}
        />
      )}

      <TransactionForm 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        onSave={handleSaveTransaction} 
        onDelete={handleDeleteTransactions}
        onAddParticipant={handleQuickAddParticipant}
        initialData={editingTransaction} 
        partnerData={partnerTransaction}
        defaultStatus={statusFilter === 'ALL' ? 'PENDING' : statusFilter} 
        preSelectedBankId={selectedBankId}
        preSelectedWalletId={selectedWalletId}
        registries={registries} 
        transactions={transactions}
      />

      <ConfirmModal isOpen={alertState.isOpen} onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))} onConfirm={() => setAlertState(prev => ({ ...prev, isOpen: false }))} title={alertState.title} message={alertState.message} confirmText="OK" showCancel={false} isDestructive={alertState.title.toLowerCase().includes('erro')} />
    </div>
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-red-100 max-w-md w-full text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Ops! Algo deu errado.</h1>
            <p className="text-slate-600 mb-6">Ocorreu um erro inesperado na aplicação. Tente recarregar a página.</p>
            <div className="bg-red-50 p-4 rounded-lg text-left mb-6 overflow-auto max-h-40">
              <code className="text-xs text-red-700 whitespace-pre-wrap">
                {this.state.error?.toString() || 'Erro desconhecido'}
              </code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
            >
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
