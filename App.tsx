
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
import { ProfitDistributionReport } from './components/ProfitDistributionReport';
import ReportsDashboard from './src/components/reports/ReportsDashboard';
import { HelpManual } from './components/HelpManual';
import { SettingsPage } from './components/SettingsPage';
import { AcceptInvite } from './components/AcceptInvite';
import { financeService, DEFAULT_SUPABASE_CONFIG } from './services/financeService';
import { Transaction, Bank, Category, CostCenter, Participant, Wallet, TransactionStatus, AssetType, AssetSector, AssetTicker, Organization } from './types';
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
  History as HistoryIcon,
  Scaling,
  Menu,
  SlidersHorizontal
} from 'lucide-react';
import { ConfirmModal } from './components/ConfirmModal';

// Implementação segura e à prova de sandbox do window.localStorage para o ambiente de IFrames do AI Studio
const safeStorage = (() => {
  let hasLocalStorage = false;
  try {
    const testKey = '__test_ls__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    hasLocalStorage = true;
  } catch (e) {
    hasLocalStorage = false;
    console.warn('[Storage] Modo IFrame/Sandbox detectado. Usando armazenamento em memória ao invés do localStorage nativo.');
  }

  const memoryStore: Record<string, string> = {};

  return {
    getItem(key: string): string | null {
      if (hasLocalStorage) {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return memoryStore[key] || null;
        }
      }
      return memoryStore[key] || null;
    },
    setItem(key: string, value: string): void {
      if (hasLocalStorage) {
        try {
          window.localStorage.setItem(key, value);
          return;
        } catch {}
      }
      memoryStore[key] = value;
    },
    removeItem(key: string): void {
      if (hasLocalStorage) {
        try {
          window.localStorage.removeItem(key);
          return;
        } catch {}
      }
      delete memoryStore[key];
    },
    clear(): void {
      if (hasLocalStorage) {
        try {
          window.localStorage.clear();
          return;
        } catch {}
      }
      for (const key in memoryStore) {
        delete memoryStore[key];
      }
    }
  };
})();

// Sombreia localmente o localStorage global para uso seguro sem quebras de SecurityError
const localStorage = safeStorage;

const App: FC = () => {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeRegistryTab, setActiveRegistryTab] = useState('wallets'); 
  const [loading, setLoading] = useState(true);
  const [loadingSubText, setLoadingSubText] = useState('Carregando registros do Supabase...');
  const [refreshing, setRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHeaderFiltersOpen, setIsHeaderFiltersOpen] = useState(false);
  const initialPrefsApplied = useRef(false);
  const loadedRegistriesRef = useRef<Record<string, boolean>>({});
  const currentUserIdRef = useRef<string | null>(null);
  const loadAllRetryCountRef = useRef(0);
  const isLoadingAllRef = useRef(false);
  
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [userModulePermissions, setUserModulePermissions] = useState<Record<string, any>>({});
  const [userRole, setUserRole] = useState<string>('');

  // FLUXO DE ACEITAR CONVITE
  const [inviteToken, setInviteToken] = useState<string>(() => {
    const hash = window.location.hash || window.location.search || '';
    const params = new URLSearchParams(hash.replace('#', '?'));
    return params.get('access_token') || '';
  });

  const [inviteRefreshToken, setInviteRefreshToken] = useState<string>(() => {
    const hash = window.location.hash || window.location.search || '';
    const params = new URLSearchParams(hash.replace('#', '?'));
    return params.get('refresh_token') || '';
  });

  const [showCreatePassword, setShowCreatePassword] = useState<boolean>(() => {
    const hash = window.location.hash || window.location.search || '';
    const params = new URLSearchParams(hash.replace('#', '?'));
    const accessToken = params.get('access_token');
    const type = params.get('type');
    const isInvitePath = window.location.pathname.includes('aceitar-convite');
    const isValidType = type === 'invite' || type === 'recovery' || isInvitePath;
    // Limpa a URL imediatamente para não reprocessar
    if (accessToken && isValidType) {
      window.history.replaceState(null, '', window.location.pathname);
      return true;
    }
    return false;
  });

  const showCreatePasswordRef = useRef(showCreatePassword);

  useEffect(() => {
    showCreatePasswordRef.current = showCreatePassword;
  }, [showCreatePassword]);

  // ESTADOS LOCAIS PARA O FLUXO DE ONBOARDING
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [newBankName, setNewBankName] = useState('');
  const [newBankType, setNewBankType] = useState('CHECKING');
  const [newWalletName, setNewWalletName] = useState('');
  const [newTxDescription, setNewTxDescription] = useState('Saldo Inicial');
  const [newTxValue, setNewTxValue] = useState('1000.00');
  const [newTxType, setNewTxType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [newTxDate, setNewTxDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [createdBankId, setCreatedBankId] = useState('');
  const [createdWalletId, setCreatedWalletId] = useState('');

  const loadOrganizations = useCallback(async (selectedOrgId?: string, forceUser?: any) => {
    if (showCreatePasswordRef.current) {
      console.log('[loadOrganizations] Convite em andamento — onboarding bloqueado.');
      return;
    }
    try {
      const supabase = financeService.getSupabase();
      if (!supabase) {
        console.log("[loadOrganizations] Supabase não configurado. Modo local.");
        setIsOnboarding(false);
        return;
      }

      let activeUser = forceUser || user;
      
      if (!activeUser) {
        console.log("[loadOrganizations] Sem activeUser direto. Obtendo sessão...");
        try {
          const sessionPromise = supabase.auth.getSession();
          const sessionTimeout = new Promise<any>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout ao obter sessão em loadOrganizations')), 45000)
          );
          const { data: sessionData } = await Promise.race([sessionPromise, sessionTimeout]);
          activeUser = sessionData?.session?.user || null;
        } catch (sessErr: any) {
          console.warn("[loadOrganizations] Falha ou timeout ao obter sessão em loadOrganizations:", sessErr.message);
          activeUser = null;
        }
      }
      
      console.log("[loadOrganizations] Buscando organizações. Usuário atual:", activeUser?.email || 'Nenhum');

      if (!activeUser) {
        console.log("[loadOrganizations] Nenhum usuário logado. Cancelando verificação de onboarding.");
        setIsOnboarding(false);
        return;
      }

      let orgs = await financeService.getMyOrganizations(activeUser.id);
      console.log("[loadOrganizations] Organizações retornadas do banco:", orgs);

      // Se não houver nenhuma organização no banco de dados e temos um usuário logado remoto,
      // podemos estar diante de um Cold Start do Supabase. Vamos aguardar 3s e tentar novamente antes de ativar onboarding.
      if (orgs.length === 0) {
        console.log("[loadOrganizations] Nenhuma organização encontrada inicial. Aguardando 3 segundos para re-tentar fluxo devido a possível cold start...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log("[loadOrganizations] Re-tentando carregar organizações...");
        orgs = await financeService.getMyOrganizations(activeUser.id);
        console.log("[loadOrganizations] Organizações retornadas após re-tentativa:", orgs);
      }

      setOrganizations(orgs);

      // Se não houver mesmo após re-tentativa, ativa onboarding
      if (orgs.length === 0) {
        console.log("[loadOrganizations] Nenhuma organização encontrada mesmo após re-tentativa. Ativando Onboarding.");
        setIsOnboarding(true);
        setActiveTab('onboarding');
        setActiveOrg(null);
        financeService.setActiveOrganizationId(null);
        loadedRegistriesRef.current = {}; // Limpar cache
        return;
      }

      console.log("[loadOrganizations] Organização(ões) encontrada(s). Desativando onboarding.");
      setIsOnboarding(false);
      // Carrega ID preferido armazenado localmente
      const savedOrgId = selectedOrgId || localStorage.getItem('fincontrol_active_org_id');
      const foundOrg = orgs.find(o => o.id === savedOrgId) || orgs[0];
      
      if (foundOrg) {
        console.log("[loadOrganizations] Definindo organização ativa:", foundOrg.name, "ID:", foundOrg.id);
        setActiveOrg(foundOrg);
        financeService.setActiveOrganizationId(foundOrg.id);
        localStorage.setItem('fincontrol_active_org_id', foundOrg.id);
        loadedRegistriesRef.current = {}; // Limpar cache de registros ao definir organização ativa
        console.log("[loadOrganizations] Cache de cadastros loadedRegistriesRef limpo ao definir a organização ativa.");

        // Carrega permissões do usuário
        const perms = await financeService.getUserModulePermissions();
        setUserModulePermissions(perms);

        // Obtém o pápel do usuário logado na organização ativa para repassar ao Sidebar
        let role = '';
        if (supabase && activeUser) {
          const { data: memberData } = await supabase
            .from('organization_members')
            .select('role')
            .eq('organization_id', foundOrg.id)
            .eq('user_id', activeUser.id)
            .maybeSingle();
          role = memberData?.role || '';
        }
        setUserRole(role || 'owner'); // fallback para owner
      } else {
        console.log("[loadOrganizations] Nenhuma organização correspondente encontrada nos registros carregados.");
        setActiveOrg(null);
        financeService.setActiveOrganizationId(null);
        loadedRegistriesRef.current = {}; // Limpar cache se não encontrar organização ativa
        setUserModulePermissions({});
        setUserRole('');
      }
    } catch (e) {
      console.error("Erro ao carregar organizações no App:", e);
    }
  }, []);
  
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

  // Fechar barra de filtros mobile ao mudar de aba
  useEffect(() => {
    setIsHeaderFiltersOpen(false);
  }, [activeTab]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (['dashboard', 'cashflow', 'expenses-analysis', 'payables', 'bank-transactions', 'brokerage-notes'].includes(activeTab)) {
      if (statusFilter !== 'ALL') count++;
      if (selectedBankId) count++;
      if (selectedWalletId) count++;
    } else if (activeTab === 'investments') {
      if (performanceBankId !== 'ALL') count++;
      if (performanceWalletId !== 'ALL') count++;
    }
    return count;
  }, [activeTab, statusFilter, selectedBankId, selectedWalletId, performanceBankId, performanceWalletId]);
  
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
  const loadRegistries = useCallback(async (forceRefresh = false, walletId?: string) => {
    const requestId = ++lastRegistryRequestIdRef.current;
    
    const supabase = financeService.getSupabase();
    console.log(`[Rastreamento] [loadRegistries] Iniciando carregamento do cadastro para '${activeRegistryTab}'. ForceRefresh: ${forceRefresh}, WalletId: ${walletId}. Modo Supabase: ${!!supabase}, Active Org ID: ${financeService.activeOrganizationId}`);
    
    // Proteção contra queries sem organization_id no Supabase
    if (supabase && currentUserIdRef.current && !financeService.activeOrganizationId) {
       console.warn("[Rastreamento] [loadRegistries] Bloqueando queries no Supabase porque o activeOrganizationId está nulo para evitar violação do RLS.");
       return;
    }

    // Se não quiser filtrar por carteira (ex: aba de carteiras em si), removemos o walletId
    const actualWalletId = (activeRegistryTab === 'wallets') ? undefined : (walletId === 'ALL' ? undefined : walletId);
    const cacheKey = `${actualWalletId || 'all'}_${activeRegistryTab}`;

    if (forceRefresh) {
      loadedRegistriesRef.current = {};
    } else if (loadedRegistriesRef.current[cacheKey]) {
      // Retorna imediatamente se os registros para essa combinação já foram carregados
      console.log(`[Rastreamento] [loadRegistries] Registros para a chave '${cacheKey}' já foram carregados anteriormente.`);
      return;
    }

    try {
      const [bk, cat, cc, pt, wa, at, as, atk] = await Promise.all([
        financeService.getRegistry<Bank>('banks', forceRefresh, actualWalletId),
        financeService.getRegistry<Category>('categories', forceRefresh, actualWalletId),
        financeService.getRegistry<CostCenter>('costCenters', forceRefresh, actualWalletId),
        financeService.getRegistry<Participant>('participants', forceRefresh, actualWalletId),
        financeService.getRegistry<Wallet>('wallets', forceRefresh), // Carteiras sempre carregam todas
        financeService.getRegistry<AssetType>('assetTypes', forceRefresh, actualWalletId),
        financeService.getRegistry<AssetSector>('assetSectors', forceRefresh, actualWalletId),
        financeService.getRegistry<AssetTicker>('assetTickers', forceRefresh, actualWalletId),
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

        // Só marca o cache como carregado se possuir dados reais (impedindo congelar array vazio devido a consultas prematuras)
        const hasData = bk.length > 0 || cat.length > 0 || pt.length > 0 || wa.length > 0 || cc.length > 0 || at.length > 0 || as.length > 0 || atk.length > 0;
        if (hasData) {
          loadedRegistriesRef.current[cacheKey] = true;
          console.log(`[Rastreamento] [loadRegistries] Registros para a chave '${cacheKey}' carregados com dados. Cache marcado como ativo.`);
        } else {
          console.log(`[Rastreamento] [loadRegistries] Registros para a chave '${cacheKey}' retornaram vazios. Cache NÃO será mantido para forçar recarga limpa posterior.`);
        }

        // Sincroniza tabelas auxiliares se necessário (especialmente importante se sumiram)
        if (at.length === 0 || as.length === 0) {
           const stats = await financeService.syncAuxiliaryRegistries();
           if (stats.types > 0 || stats.sectors > 0 || stats.tickers > 0) {
              // Recarrega se houve novos cadastros criados pela sincronização
              const [newAt, newAs, newAtk] = await Promise.all([
                financeService.getRegistry<AssetType>('assetTypes', true, actualWalletId),
                financeService.getRegistry<AssetSector>('assetSectors', true, actualWalletId),
                financeService.getRegistry<AssetTicker>('assetTickers', true, actualWalletId)
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
  }, [activeRegistryTab]);

  // Carrega transações baseado nos filtros atuais (Database-side)
  const loadTransactions = useCallback(async () => {
    const requestId = ++lastRequestIdRef.current;
    
    const supabase = financeService.getSupabase();
    console.log(`[Rastreamento] [loadTransactions] Iniciando carregamento das transações. Modo Supabase: ${!!supabase}, Active Org ID: ${financeService.activeOrganizationId}`);

    // Proteção contra queries sem organization_id no Supabase
    if (supabase && currentUserIdRef.current && !financeService.activeOrganizationId) {
       console.warn("[Rastreamento] [loadTransactions] Bloqueando queries de transações no Supabase porque o activeOrganizationId está nulo.");
       setRefreshing(false);
       return;
    }

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
    if (isLoadingAllRef.current) {
      console.log(`[Rastreamento] [loadAll] Já existe um processo de carga em andamento. Ignorando chamada duplicada.`);
      return;
    }
    
    isLoadingAllRef.current = true;
    console.log(`[Rastreamento] [loadAll] Iniciando carregamento de tudo. isInitialFetch: ${isInitialFetch}`);
    
    if (isInitialFetch) {
      setLoading(true);
      setLoadingSubText('Iniciando sincronização...');
    }
    
    // Configura o temporizador de Cold Start
    let coldStartTimer: any = null;
    if (isInitialFetch) {
      coldStartTimer = setTimeout(() => {
        setLoadingSubText('O banco de dados do Supabase está acordando (Cold Start)... Aguarde, isso pode levar de 15 a 30 segundos.');
      }, 3500);
    }
    
    try {
      // Verifica conexão
      const supabase = financeService.getSupabase();
      const isSupabaseConfigured = !!supabase;
      setIsConnected(isSupabaseConfigured);
      setIsLocalMode(!supabase);
      setIsOffline(false);

      console.log(`[Rastreamento] [loadAll] Conexão remota Supabase configurada: ${isSupabaseConfigured}`);

      let loggedInUser = null;

      if (supabase) {
          try {
              if (isInitialFetch) setLoadingSubText('Obtendo sessão ativa do Supabase...');
              console.log("[Rastreamento] [loadAll] Obtendo sessão atual do Supabase com timeout de 45s...");
              const getSessionPromise = supabase.auth.getSession();
              const getSessionTimeout = new Promise<any>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout ao obter sessão do Supabase no loadAll')), 45000)
              );
              let { data: { session } } = await Promise.race([getSessionPromise, getSessionTimeout]);
              
              if (session) {
                const expiresAt = session.expires_at || 0;
                const now = Math.floor(Date.now() / 1000);
                const isExpiredOrExpiring = expiresAt - now < 60; // menos de 60 segundos
                
                if (isExpiredOrExpiring) {
                  if (isInitialFetch) setLoadingSubText('Sessão expirada. Renovando credenciais de acesso...');
                  console.log('[Rastreamento] [loadAll] Token próximo de expirar ou expirado, fazendo refresh com timeout de 45s...');
                  try {
                    const refreshPromise = supabase.auth.refreshSession();
                    const refreshTimeout = new Promise<any>((_, reject) =>
                      setTimeout(() => reject(new Error('Timeout ao renovar token do Supabase no loadAll')), 45000)
                    );
                    const { data: refreshData } = await Promise.race([refreshPromise, refreshTimeout]);
                    if (refreshData.session) {
                      session = refreshData.session;
                      console.log('[Rastreamento] [loadAll] Token renovado com sucesso.');
                    }
                  } catch (refreshErr: any) {
                    console.warn('[Rastreamento] [loadAll] Falha ao renovar sessão:', refreshErr.message);
                  }
                }
              }
              
              const sessionUser = session?.user || null;
              loggedInUser = sessionUser;
              currentUserIdRef.current = sessionUser?.id || null;
              setUser(sessionUser);
              
              console.log(`[Rastreamento] [loadAll] Usuário ativo: ${sessionUser ? sessionUser.email : 'Nenhum'}`);
              if (sessionUser) {
                  if (isInitialFetch) setLoadingSubText('Carregando informações da sua organização...');
                  console.log("[Rastreamento] [loadAll] Passo 1: Carregando organizações de forma assíncrona garantindo conclusão...");
                  await loadOrganizations(undefined, sessionUser);
                  console.log(`[Rastreamento] [loadAll] Passo 1 concluído. activeOrganizationId de financeService: ${financeService.activeOrganizationId}`);
              }
              setIsOffline(false);
          } catch (e: any) {
              console.warn("Supabase connection check failed:", e.message);
              
              // Limpar estado inconsistente do localStorage para evitar bloqueios em recargas futuras (I2)
              localStorage.removeItem('fincontrol_active_org_id');
              
              if (e.message?.includes('fetch') || e.name === 'TypeError' || e.message?.includes('Network') || e.message?.includes('Timeout')) {
                  setIsOffline(true);
              }
              
              if (isInitialFetch) {
                  if (coldStartTimer) clearTimeout(coldStartTimer);
                  setLoading(false);
              }
          }
      }

      // Se estiver em modo Supabase e o usuário não estiver logado (ou se ocorreu timeout / conexão falhou),
      // interrompemos o loading imediatamente e exibimos a tela de login.
      if (isSupabaseConfigured && !loggedInUser) {
          console.warn("[Rastreamento] [loadAll] Supabase configurado, mas nenhum usuário ativo encontrado (sessão nula ou timeout de conexão). Encerrando carregamento de dados e forçando exibição da tela de login.");
          setUser(null);
          if (isInitialFetch) {
              if (coldStartTimer) clearTimeout(coldStartTimer);
              setLoading(false);
          }
          return;
      }

      // Proteção contra chamadas sem organização ativa definida em modo Supabase remoto
      const activeOrgId = financeService.activeOrganizationId;
      console.log(`[Rastreamento] [loadAll] Verificando integridade das informações organizacionais. Supabase: ${isSupabaseConfigured}, Usuário ativo: ${!!loggedInUser}, ID da Orga Ativa: ${activeOrgId}`);

      if (isSupabaseConfigured && loggedInUser && !activeOrgId) {
          console.warn("[Rastreamento] [loadAll] Supabase ativo e usuário logado, mas activeOrganizationId continua nulo (fluxo de Onboarding ou carregamento). Cancelando carga sequencial subsequente de cadastros e transações.");
          if (isInitialFetch) {
              if (coldStartTimer) clearTimeout(coldStartTimer);
              setLoading(false);
          }
          return;
      }

      // Se já temos registros no localStorage, podemos liberar o loading mais cedo
      const keyMap: any = { banks: 'fincontrol_banks', categories: 'fincontrol_categories' };
      const hasLocalData = !!localStorage.getItem(keyMap.banks) || !!localStorage.getItem(keyMap.categories);

      // Se é o carregamento inicial, busca as preferências ANTES de buscar as transações
      // para que a busca de transações já use os filtros corretos
      if (!initialPrefsApplied.current) {
          try {
              if (isInitialFetch) setLoadingSubText('Carregando preferências de visualização...');
              console.log("[Rastreamento] [loadAll] Buscando preferências de usuário...");
              const savedPrefs = await financeService.getUserSettings();
              console.log("[Rastreamento] [loadAll] Preferências do usuário recuperadas:", savedPrefs);
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

      // Carrega registros e transações de forma sequencial para garantir consistência
      try {
          if (isInitialFetch) setLoadingSubText('Carregando bancos, carteiras e cadastros...');
          console.log("[Rastreamento] [loadAll] Passo 2: Chamando loadRegistries()...");
          await loadRegistries();
          
          if (isInitialFetch) setLoadingSubText('Sincronizando fluxo de caixa e transações...');
          console.log("[Rastreamento] [loadAll] Passo 3: Chamando loadTransactions()...");
          await loadTransactions();
          console.log("[Rastreamento] [loadAll] Todos os passos concluídos com êxito.");
      } catch (e) {
          console.error("Erro na carga inicial de dados", e);
      }

      if (isInitialFetch) {
          if (coldStartTimer) clearTimeout(coldStartTimer);
          setLoading(false);
      }
    } finally {
      isLoadingAllRef.current = false;
      if (isInitialFetch && coldStartTimer) {
        clearTimeout(coldStartTimer);
      }
    }
  };


  useEffect(() => {
    loadAll(true);

    const supabase = financeService.getSupabase();
    if (!supabase) return;

    // ─── 1. Listener de mudança de autenticação ───────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const newUser    = session?.user || null;
      const newUserId  = newUser?.id   || null;
      const prevUserId = currentUserIdRef.current;

      console.log(`[onAuthStateChange] Evento: ${event} | Prev: ${prevUserId} | New: ${newUserId}`);

      // Token renovado pelo Supabase automaticamente — singleton já gerencia internamente
      if (event === 'TOKEN_REFRESHED') {
        console.log('[onAuthStateChange] Token renovado automaticamente pelo Supabase.');
        return;
      }

      if (prevUserId !== newUserId) {
        console.log(`[onAuthStateChange] Mudança de usuário detectada (${prevUserId} -> ${newUserId}).`);
        currentUserIdRef.current = newUserId;
        setUser(newUser);

        if (newUser) {
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            if (showCreatePasswordRef.current) {
              console.log('[onAuthStateChange] Convite em andamento — onboarding ou load de organizações bloqueados.');
              return;
            }
            if (isLoadingAllRef.current) {
              console.log('[onAuthStateChange] Carregamento principal (loadAll) já está em andamento. Ignorando re-trigger redundante no listener de auth.');
              return;
            }
            console.log('[onAuthStateChange] Carregando organizações para o novo usuário...');
            await loadOrganizations(undefined, newUser);
            await loadAll(false);
          }
        } else {
          console.log('[onAuthStateChange] Logout detectado. Limpando estado organizacional.');
          setOrganizations([]);
          setActiveOrg(null);
          financeService.setActiveOrganizationId(null);
          setIsOnboarding(false);
          loadedRegistriesRef.current = {};
        }
      } else {
        console.log('[onAuthStateChange] Mesmo usuário. Side-effects ignorados.');
      }
    });

    // ─── 2. Refresh proativo a cada 4 minutos ─────────────────────────────────
    // Renova o token se restar menos de 5 minutos para expirar.
    // Garante que sessões longas (usuário idle) não expirem silenciosamente.
    const FOUR_MINUTES = 4 * 60 * 1000;

    const tokenRefreshInterval = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const now         = Math.floor(Date.now() / 1000);
        const secondsLeft = (session.expires_at || 0) - now;

        if (secondsLeft < 5 * 60) {
          console.log(`[tokenRefreshInterval] Token expira em ${secondsLeft}s — renovando...`);
          const { error } = await supabase.auth.refreshSession();
          if (error) {
            console.error('[tokenRefreshInterval] Falha ao renovar:', error.message);
          } else {
            console.log('[tokenRefreshInterval] Token renovado com sucesso.');
          }
        }
      } catch (e: any) {
        console.warn('[tokenRefreshInterval] Erro inesperado:', e.message);
      }
    }, FOUR_MINUTES);

    // ─── 3. Visibilidade da aba ────────────────────────────────────────────────
    // Quando o usuário volta à aba após longo período em background, o browser
    // pode ter pausado os setIntervals internos do Supabase. Forçamos um check.
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;

      console.log('[visibilityChange] Aba voltou ao foco — verificando sessão...');
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          console.warn('[visibilityChange] Sem sessão ativa. Forçando logout visual.');
          setUser(null);
          return;
        }

        const now         = Math.floor(Date.now() / 1000);
        const secondsLeft = (session.expires_at || 0) - now;

        if (secondsLeft < 5 * 60) {
          console.log(`[visibilityChange] Token expira em ${secondsLeft}s — renovando...`);
          await supabase.auth.refreshSession();
        } else {
          console.log(`[visibilityChange] Sessão válida. Expira em ${Math.round(secondsLeft / 60)}min.`);
        }
      } catch (e: any) {
        console.warn('[visibilityChange] Erro ao verificar sessão:', e.message);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ─── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      subscription.unsubscribe();
      clearInterval(tokenRefreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Array vazio: listener criado uma única vez, nunca recriado por re-renders

  // Proteção e Debounce de 300ms para evitar requisições consecutivas ao trocar filtros
  useEffect(() => {
    if (loading || !initialPrefsApplied.current) return;

    const timer = setTimeout(() => {
        loadTransactions();
    }, 300);

    return () => {
        clearTimeout(timer);
    };
  }, [startDate, endDate, selectedBankId, selectedWalletId, performanceBankId, performanceWalletId, statusFilter, activeTab, loadTransactions, loading]);

  useEffect(() => {
    if (loading || (isConnected && !financeService.activeOrganizationId)) return;
    // Carrega registros para quase todas as abas que usam o formulário ou exibem nomes
    if (!['settings', 'manual'].includes(activeTab)) {
      loadRegistries(false, selectedWalletId);
    }
  }, [activeTab, loadRegistries, selectedWalletId, activeRegistryTab, loading, isConnected]);

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
    const previousTransactions = [...transactions];
    try {
        if (Array.isArray(t)) {
            // Disparar criação remota
            const created = await financeService.createManyTransactions(t);
            // Recarregar do banco para sincronizar filtros, ordenação e saldos
            await loadTransactions();
        } else {
            const isEditing = !!t.id;
            if (isEditing) {
                // Atualização Otimista imediata para edição
                setTransactions(prev => prev.map(item => item.id === t.id ? t : item));
                
                // Grava remotamente
                const saved = await financeService.saveTransaction(t);
                
                // Recarregar para garantir o filtro de status correto (por exemplo, remover de PAID ou PENDING)
                await loadTransactions();
            } else {
                // Gravação remota imediata (pois precisa de ID gerado)
                const saved = await financeService.saveTransaction(t);
                
                // Recarregar do banco
                await loadTransactions();
            }
        }
    } catch (e: any) {
        // Rollback
        setTransactions(previousTransactions);
        showAlert('Erro ao Salvar', e);
    }
  };

  const handleDeleteTransactions = async (ids: string[]) => {
    const previousTransactions = [...transactions];
    
    // Atualização Otimista imediata: remove localmente as transações
    setTransactions(prev => prev.filter(item => !ids.includes(item.id)));
    
    try {
        await financeService.deleteTransactions(ids);
        await loadTransactions();
    } catch (e: any) {
        // Rollback em caso de erro
        setTransactions(previousTransactions);
        showAlert('Erro ao Excluir', e);
    }
  };
  
  const handleUpdateTransactionsStatus = async (ids: string[], status: 'PAID' | 'PENDING') => {
    const previousTransactions = [...transactions];
    
    // Atualização Otimista imediata: altera o status localmente
    setTransactions(prev => prev.map(item => 
      ids.includes(item.id) ? { ...item, status } : item
    ));
    
    try {
        await financeService.updateTransactionsStatus(ids, status);
        await loadTransactions();
    } catch (e: any) {
        // Rollback em caso de erro
        setTransactions(previousTransactions);
        showAlert('Erro ao Atualizar Status', e);
    }
  };

  const handleUpdateTransactionsDate = async (ids: string[], date: string) => {
    const previousTransactions = [...transactions];
    
    // Atualização Otimista imediata: altera a data localmente e re-ordena por data decrescente
    setTransactions(prev => {
      const updated = prev.map(item => 
        ids.includes(item.id) ? { ...item, date } : item
      );
      return updated.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
    
    try {
        await financeService.updateTransactionsDate(ids, date);
    } catch (e: any) {
        // Rollback em caso de erro
        setTransactions(previousTransactions);
        showAlert('Erro ao Atualizar Data', e);
    }
  };

  const handleUpdateTransactionsValue = async (ids: string[], value: number) => {
    const previousTransactions = [...transactions];
    
    // Atualização Otimista imediata: altera o valor localmente
    setTransactions(prev => prev.map(item => 
      ids.includes(item.id) ? { ...item, value } : item
    ));
    
    try {
        await financeService.updateTransactionsValue(ids, value);
    } catch (e: any) {
        // Rollback em caso de erro
        setTransactions(previousTransactions);
        showAlert('Erro ao Atualizar Valor', e);
    }
  };

  const handleQuickAddParticipant = async (name: string): Promise<Participant> => {
      const newP = await financeService.saveRegistryItem('participants', { id: '', name, walletId: selectedWalletId });
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

  if (showCreatePassword) {
    return (
      <AcceptInvite
        inviteToken={inviteToken || ''}
        inviteRefreshToken={inviteRefreshToken || ''}
        onSuccess={(activeUser) => {
          setShowCreatePassword(false);
          setInviteToken('');
          setUser(activeUser);
          loadAll(false);
        }}
        onCancel={() => {
          setShowCreatePassword(false);
          setInviteToken('');
          const supabase = financeService.getSupabase();
          if (supabase) {
            supabase.auth.signOut();
          }
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white flex-col gap-6">
        <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            <Database className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-blue-600" />
        </div>
        <div className="text-center max-w-md px-6">
            <p className="text-slate-800 font-bold text-lg">Sincronizando Dados</p>
            <p className="text-slate-500 text-sm mt-1 transition-all duration-300">{loadingSubText}</p>
        </div>
      </div>
    );
  }

  const selectClass = "bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 font-medium cursor-pointer hover:bg-gray-50 transition-colors h-[38px] flex items-center min-w-[140px]";

  if (!user && isConnected && !isLocalMode) {
    return <Auth onLogin={loadAll} />;
  }

  // --- FLUXO DE ONBOARDING SAAS MULTI-TENANT ---
  const handleOnboardingCreateOrg = async () => {
    if (!newOrgName.trim() || !newOrgSlug.trim()) {
      showAlert('Preencha os dados', 'O nome e o identificador amigável da empresa são obrigatórios.');
      return;
    }
    setOnboardingLoading(true);
    try {
      const org = await financeService.createOrganization(newOrgName.trim());
      financeService.setActiveOrganizationId(org.id);
      setActiveOrg(org);
      setOrganizations([org]);
      setOnboardingStep(2);
    } catch (e: any) {
      showAlert('Erro ao criar organização', e);
    } finally {
      setOnboardingLoading(false);
    }
  };

  const handleOnboardingCreateBank = async () => {
    if (!newBankName.trim()) {
      showAlert('Preencha o nome do banco', 'O nome do banco é obrigatório.');
      return;
    }
    setOnboardingLoading(true);
    try {
      const bank = await financeService.saveRegistryItem<Bank>('banks', {
        id: '',
        name: newBankName.trim(),
        type: newBankType as any,
        currency: 'BRL',
        active: true
      });
      setCreatedBankId(bank.id);
      setRegistries(prev => ({ ...prev, banks: [bank] }));
      setOnboardingStep(3);
    } catch (e: any) {
      showAlert('Erro ao criar banco', e);
    } finally {
      setOnboardingLoading(false);
    }
  };

  const handleOnboardingCreateWallet = async () => {
    if (!newWalletName.trim()) {
      showAlert('Preencha o nome do portfólio', 'O nome do portfólio é obrigatório.');
      return;
    }
    setOnboardingLoading(true);
    try {
      const wallet = await financeService.saveRegistryItem<Wallet>('wallets', {
        id: '',
        name: newWalletName.trim(),
        active: true,
        bankId: createdBankId
      } as any);
      setCreatedWalletId(wallet.id);
      setRegistries(prev => ({ ...prev, wallets: [wallet] }));
      setOnboardingStep(4);
    } catch (e: any) {
      showAlert('Erro ao criar portfólio', e);
    } finally {
      setOnboardingLoading(false);
    }
  };

  const handleOnboardingFinish = async () => {
    setOnboardingLoading(true);
    try {
      const val = parseFloat(newTxValue);
      if (val > 0) {
        const cats = await financeService.getRegistry<Category>('categories');
        let initialCat = cats.find(c => c.name.toLowerCase() === 'saldo inicial');
        if (!initialCat) {
          initialCat = await financeService.saveRegistryItem('categories', {
            id: '',
            name: 'Saldo Inicial',
            active: true
          });
        }
        
        await financeService.saveTransaction({
          id: '',
          description: newTxDescription.trim(),
          value: val,
          type: newTxType,
          date: newTxDate,
          status: 'PAID',
          bankId: createdBankId,
          walletId: createdWalletId,
          categoryId: initialCat.id,
          createdAt: new Date().toISOString()
        } as any);
      }
      
      await loadOrganizations(undefined, user);
      await loadAll(true);
      setIsOnboarding(false);
      setActiveTab('dashboard');
    } catch (e: any) {
      showAlert('Erro ao finalizar onboarding', e);
    } finally {
      setOnboardingLoading(false);
    }
  };

  // Preenche slug automaticamente baseando-se no nome da empresa digitado
  const autoFillSlug = (name: string) => {
    setNewOrgName(name);
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z0-9\s-]/g, '') // remove especiais
      .trim()
      .replace(/\s+/g, '-'); // espacos por -
    setNewOrgSlug(slug);
  };

  if (isOnboarding && user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-250">
              <Database className="w-8 h-8 text-white animate-pulse" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-black text-slate-800 tracking-tight">
            Configurar FinControl Pro
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500">
            Seja bem-vindo! Vamos preparar o seu workspace em 4 passos rápidos.
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg">
          <div className="bg-white py-8 px-4 shadow-xl rounded-2xl sm:px-10 border border-slate-100">
            {/* Indicador de passos */}
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${onboardingStep === step ? 'bg-blue-600 text-white ring-4 ring-blue-100' : onboardingStep > step ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {onboardingStep > step ? '✓' : step}
                  </div>
                  {step < 4 && <div className={`w-12 h-1 bg-slate-150 mx-2 rounded ${onboardingStep > step ? 'bg-emerald-300' : 'bg-slate-100'}`} />}
                </div>
              ))}
            </div>

            {/* PASSO 1: EMPRESA */}
            {onboardingStep === 1 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Passo 1: Crie a sua Organização</h3>
                  <p className="text-xs text-slate-400 mt-1">SaaS Multi-tenant: seus dados são totalmente isolados e seguros por empresa.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Nome do Grupo Familiar ou Empresa</label>
                  <input
                    type="text"
                    value={newOrgName}
                    onChange={(e) => autoFillSlug(e.target.value)}
                    placeholder="Ex: Grupo Líder Financial, Família Almeida"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800"
                    disabled={onboardingLoading}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Slug Único do Sistema (Auto-gerado)</label>
                  <input
                    type="text"
                    value={newOrgSlug}
                    placeholder="grupo-lider-financial"
                    className="w-full bg-slate-100 border border-slate-205 rounded-xl px-4 py-3 text-sm outline-none font-mono text-slate-600 text-xs"
                    disabled={true}
                  />
                </div>
                <button
                  onClick={handleOnboardingCreateOrg}
                  disabled={onboardingLoading || !newOrgName.trim()}
                  className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {onboardingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar Empresa e Continuar'}
                </button>
              </div>
            )}

            {/* PASSO 2: BANCO */}
            {onboardingStep === 2 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Passo 2: Configure o primeiro Banco</h3>
                  <p className="text-xs text-slate-400 mt-1">Configure onde suas contas correntes ou investimentos estão hospedados.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Nome da Instituição</label>
                  <input
                    type="text"
                    value={newBankName}
                    onChange={(e) => setNewBankName(e.target.value)}
                    placeholder="Ex: Itaú, XP Corretora, Warren"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800"
                    disabled={onboardingLoading}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Tipo de Conta</label>
                  <select
                    value={newBankType}
                    onChange={(e) => setNewBankType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-semibold text-slate-705"
                    disabled={onboardingLoading}
                  >
                    <option value="CHECKING">Conta Corrente</option>
                    <option value="SAVINGS">Poupança</option>
                    <option value="INVESTMENT">Corretora de Investimentos</option>
                    <option value="CASH">Dinheiro / Caixa</option>
                  </select>
                </div>
                <button
                  onClick={handleOnboardingCreateBank}
                  disabled={onboardingLoading || !newBankName.trim()}
                  className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {onboardingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar Banco e Continuar'}
                </button>
              </div>
            )}

            {/* PASSO 3: CARTEIRA */}
            {onboardingStep === 3 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Passo 3: Primeiro Portfólio/Carteira</h3>
                  <p className="text-xs text-slate-400 mt-1">O portfólio serve para agrupar as compras visando metas específicas.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Nome do Portfólio</label>
                  <input
                    type="text"
                    value={newWalletName}
                    onChange={(e) => setNewWalletName(e.target.value)}
                    placeholder="Ex: Minha Carteira de Ações, Liquidez Imediata"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800"
                    disabled={onboardingLoading}
                  />
                </div>
                <button
                  onClick={handleOnboardingCreateWallet}
                  disabled={onboardingLoading || !newWalletName.trim()}
                  className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {onboardingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar Portfólio e Continuar'}
                </button>
              </div>
            )}

            {/* PASSO 4: REGISTRO DE SALDO */}
            {onboardingStep === 4 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Passo 4: Lançamento Inicial (Opcional)</h3>
                  <p className="text-xs text-slate-400 mt-1">Deseja injetar saldo inicial neste portfólio para ver os relatórios preenchidos?</p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Descrição do Lançamento</label>
                  <input
                    type="text"
                    value={newTxDescription}
                    onChange={(e) => setNewTxDescription(e.target.value)}
                    placeholder="Ex: Aporte Inicial de Caixa"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800"
                    disabled={onboardingLoading}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Valor R$</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newTxValue}
                      onChange={(e) => setNewTxValue(e.target.value)}
                      placeholder="1000.00"
                      className="w-full bg-slate-50 border border-slate-205 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-semibold text-slate-850"
                      disabled={onboardingLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Tipo de Fluxo</label>
                    <select
                      value={newTxType}
                      onChange={(e) => setNewTxType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-semibold text-slate-700"
                      disabled={onboardingLoading}
                    >
                      <option value="CREDIT">Crédito (+)</option>
                      <option value="DEBIT">Débito (-)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Data do Lançamento</label>
                  <input
                    type="date"
                    value={newTxDate}
                    onChange={(e) => setNewTxDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
                    disabled={onboardingLoading}
                  />
                </div>
                <div className="pt-2">
                  <button
                    onClick={handleOnboardingFinish}
                    disabled={onboardingLoading}
                    className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all text-sm flex items-center justify-center gap-2"
                  >
                    {onboardingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Finalizar Configuração e Entrar'}
                  </button>
                  <button
                    onClick={async () => {
                      setNewTxValue('0');
                      await handleOnboardingFinish();
                    }}
                    disabled={onboardingLoading}
                    className="w-full text-slate-400 font-bold py-2 mt-2 hover:text-slate-600 text-xs transition-colors"
                  >
                    Ignorar lançamento e salvar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const canCreateTransaction = !userModulePermissions || 
    Object.keys(userModulePermissions).length === 0 || 
    userRole === 'owner' ||
    userRole === 'admin' ||
    userModulePermissions['transactions']?.can_create === true;

  const canImportBrokerage = !userModulePermissions ||
    Object.keys(userModulePermissions).length === 0 ||
    userRole === 'owner' ||
    userRole === 'admin' ||
    userModulePermissions['brokerage']?.can_create === true;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        userModulePermissions={userModulePermissions}
        userRole={userRole}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="py-2.5 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between px-6 flex-shrink-0 z-10 gap-3 shadow-sm">
          <div className="flex items-center gap-4">
              {/* Botão Hambúrguer Mobile/Tablet */}
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 lg:hidden focus:outline-none transition-colors"
                title="Abrir menu"
              >
                <Menu className="w-5 h-5" />
              </button>

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

              {organizations.length > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 transition-colors shadow-sm">
                  <Building2 className="w-3.5 h-3.5 text-blue-500" />
                  <select
                    value={activeOrg?.id || ''}
                    onChange={(e) => {
                      const newOrgId = e.target.value;
                      const o = organizations.find(org => org.id === newOrgId);
                      if (o) {
                        loadedRegistriesRef.current = {}; // Limpar cache na troca manual de organização
                        setActiveOrg(o);
                        financeService.setActiveOrganizationId(o.id);
                        localStorage.setItem('fincontrol_active_org_id', o.id);
                        // Limpa caches de registros e saldos e recarrega tudo
                        loadRegistries(true).then(() => {
                          loadTransactions();
                        });
                      }
                    }}
                    className="bg-transparent border-none text-xs font-bold text-slate-700 outline-none cursor-pointer pr-1"
                  >
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}

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
          
          <div className="flex items-center gap-2">
            {/* Filtros em Desktop (Inalterados, ocultos em mobile) */}
            {['dashboard', 'cashflow', 'expenses-analysis', 'payables', 'bank-transactions', 'brokerage-notes', 'investments'].includes(activeTab) && activeTab !== 'reports' && (
                <div className="hidden md:flex flex-wrap items-center gap-2">
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
                      {registries.banks
                        .filter(b => b.active !== false || b.id === (activeTab === 'investments' ? performanceBankId : selectedBankId))
                        .map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>

                    <select 
                      value={activeTab === 'investments' ? performanceWalletId : selectedWalletId} 
                      onChange={(e) => activeTab === 'investments' ? setPerformanceWalletId(e.target.value) : setSelectedWalletId(e.target.value)} 
                      className="bg-white border border-gray-300 rounded-lg px-2 text-[10px] focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 font-bold h-[34px] min-w-[130px]"
                    >
                      <option value={activeTab === 'investments' ? 'ALL' : ''}>{activeTab === 'investments' ? 'Todas Carteiras' : 'Carteira'}</option>
                      {registries.wallets
                        .filter(w => w.active !== false || w.id === (activeTab === 'investments' ? performanceWalletId : selectedWalletId))
                        .map(w => (
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

            {/* Controle Compacto de Filtros em Mobile/Tablet (Visível apenas em telas menores) */}
            {['dashboard', 'cashflow', 'expenses-analysis', 'payables', 'bank-transactions', 'brokerage-notes', 'investments'].includes(activeTab) && activeTab !== 'reports' && (
                <div className="flex md:hidden items-center gap-1.5">
                    <button
                      onClick={() => setIsHeaderFiltersOpen(!isHeaderFiltersOpen)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 h-[34px] ${
                        isHeaderFiltersOpen
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Filtros</span>
                      {activeFiltersCount > 0 && (
                        <span className={`inline-flex items-center justify-center w-4 h-4 text-[9px] font-black rounded-full ${
                          isHeaderFiltersOpen ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
                        }`}>
                          {activeFiltersCount}
                        </span>
                      )}
                    </button>

                    {activeTab === 'investments' && (
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => manualAdjustFn.current?.()} 
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold h-[34px]"
                          title="Ajuste Manual"
                        >
                          <Plus className="w-3" />
                        </button>
                        <button 
                          onClick={() => accrualHistoryFn.current?.()} 
                          className="p-2 bg-slate-50 text-slate-500 rounded-lg border border-gray-200 h-[34px]"
                          title="Histórico de Ajustes"
                        >
                          <HistoryIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <button onClick={() => loadTransactions()} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-gray-200 h-[34px]" title="Sincronizar">
                      <RefreshCcw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-500' : ''}`} />
                    </button>

                    <button 
                      onClick={() => financeService.signOut()}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg border border-gray-200 h-[34px]"
                      title="Sair"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {activeTab === 'registries' && (
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-3 py-1.5 shadow-sm h-[38px] group hover:border-blue-400 transition-all">
                        <span className="hidden sm:inline text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-200 pr-3 mr-1">Selecione sua carteira</span>
                        <select 
                          value={selectedWalletId} 
                          onChange={(e) => setSelectedWalletId(e.target.value)}
                          className="bg-transparent border-none text-xs font-black text-blue-600 outline-none cursor-pointer pr-4"
                        >
                          <option value="ALL">Todas (Ver Tudo)</option>
                          {registries.wallets.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                    </div>
                    
                    <button onClick={() => loadRegistries(true, selectedWalletId)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-gray-200 h-[38px] w-[38px] flex items-center justify-center" title="Sincronizar">
                      <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-500' : ''}`} />
                    </button>
                </div>
            )}

            {!['registries', 'settings', 'manual'].includes(activeTab) && (
              <div className="flex gap-1.5 sm:gap-2">
                {(activeTab === 'investments' || activeTab === 'bank-transactions' || activeTab === 'brokerage-notes') && (activeTab !== 'brokerage-notes' || canImportBrokerage) && (
                  <button 
                    onClick={() => setIsImportOpen(true)} 
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 sm:px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors h-[38px] shadow-sm"
                  >
                    <FileUp className="w-4 h-4 text-blue-600" /> <span className="hidden sm:inline">Incluir nota</span>
                  </button>
                )}
                {canCreateTransaction && (
                  <button onClick={() => { setEditingTransaction(null); setIsFormOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm shadow-blue-100 h-[38px]">
                      <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Lançar</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Painel colapsável de filtros no Mobile (Etapa 4) */}
        {['dashboard', 'cashflow', 'expenses-analysis', 'payables', 'bank-transactions', 'brokerage-notes', 'investments'].includes(activeTab) && activeTab !== 'reports' && isHeaderFiltersOpen && (
          <div className="md:hidden bg-white border-b border-gray-200 px-6 py-4 space-y-4 animate-fade-in flex-shrink-0 shadow-inner z-10 transition-all">
            <div className="grid grid-cols-2 gap-3">
              {activeTab !== 'investments' && (
                <div className="col-span-2 space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Período de Análise</label>
                  <div className="flex items-center gap-2 bg-slate-50 border border-gray-300 rounded-lg px-3 py-2 group hover:border-blue-300 focus-within:border-blue-500 transition-colors h-11">
                    <Calendar className="w-4 h-4 text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent border-none text-xs outline-none font-bold text-slate-800 w-full" title="Início" />
                    <span className="text-gray-300 font-bold">-</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent border-none text-xs outline-none font-bold text-slate-800 w-full" title="Fim" />
                  </div>
                </div>
              )}

              {activeTab !== 'investments' && (
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Status</label>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="w-full bg-slate-50 border border-gray-300 rounded-lg px-3 text-xs font-bold text-slate-800 h-11 focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                    <option value="ALL">Status (Todos)</option>
                    <option value="PAID">Pagas</option>
                    <option value="PENDING">Pendentes</option>
                  </select>
                </div>
              )}

              <div className={activeTab === 'investments' ? "col-span-1 space-y-1" : "space-y-1"}>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Banco</label>
                <select 
                  value={activeTab === 'investments' ? performanceBankId : selectedBankId} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (activeTab === 'investments') {
                      setPerformanceBankId(val);
                    } else {
                      setSelectedBankId(val);
                    }
                  }} 
                  className="w-full bg-slate-50 border border-gray-300 rounded-lg px-3 text-xs font-bold text-slate-800 h-11 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  <option value={activeTab === 'investments' ? 'ALL' : ''}>{activeTab === 'investments' ? 'Todos Bancos' : 'Todos Bancos'}</option>
                  {registries.banks
                    .filter(b => b.active !== false || b.id === (activeTab === 'investments' ? performanceBankId : selectedBankId))
                    .map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
              </div>

              <div className={activeTab === 'investments' ? "col-span-1 space-y-1" : "col-span-2 space-y-1"}>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Carteira</label>
                <select 
                  value={activeTab === 'investments' ? performanceWalletId : selectedWalletId} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (activeTab === 'investments') {
                      setPerformanceWalletId(val);
                    } else {
                      setSelectedWalletId(val);
                    }
                  }} 
                  className="w-full bg-slate-50 border border-gray-300 rounded-lg px-3 text-xs font-bold text-slate-800 h-11 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  <option value={activeTab === 'investments' ? 'ALL' : ''}>{activeTab === 'investments' ? 'Todas Carteiras' : 'Todas Carteiras'}</option>
                  {registries.wallets
                    .filter(w => w.active !== false || w.id === (activeTab === 'investments' ? performanceWalletId : selectedWalletId))
                    .map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                </select>
              </div>
            </div>
            
            {activeTab === 'investments' && (
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button 
                  type="button"
                  onClick={() => excelExportFn.current?.()} 
                  className="flex-1 h-10 px-3 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all active:bg-emerald-100"
                >
                  <FileUp className="w-4 h-4" />
                  <span>Excel</span>
                </button>
                <button 
                  type="button"
                  onClick={() => pdfExportFn.current?.()} 
                  className="flex-1 h-10 px-3 bg-red-50 text-red-700 border border-red-200 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all active:bg-red-100"
                >
                  <FileUp className="w-4 h-4" />
                  <span>PDF</span>
                </button>
              </div>
            )}
          </div>
        )}

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
               <ReportsDashboard 
                 transactions={transactions} 
                 registries={registries} 
                 userModulePermissions={userModulePermissions}
                 userRole={userRole}
               />
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
                  userModulePermissions={userModulePermissions}
                  userRole={userRole}
                />
              </div>
            </div>
          )}

          {activeTab === 'distribution' && (
            <div className="flex-1 overflow-auto bg-slate-50">
              <ProfitDistributionReport 
                onNavigateToRegistries={() => {
                  setActiveTab('registries');
                  setActiveRegistryTab('participants');
                }} 
                userModulePermissions={userModulePermissions}
                userRole={userRole}
              />
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
                    userModulePermissions={userModulePermissions}
                    userRole={userRole}
                   />
               </div>
            </div>
          )}

          {activeTab === 'registries' && (
            <div className="flex-1 overflow-auto p-4 sm:p-8">
                <div className="h-full flex flex-col animate-fade-in max-w-7xl mx-auto">
                  <div className="flex items-center mb-6">
                    <div className="flex flex-wrap gap-2">
                      {registryTabs.map(tab => (
                          <button key={tab.id} onClick={() => setActiveRegistryTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeRegistryTab === tab.id ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                            <tab.icon className="w-4 h-4" /> {tab.label}
                          </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 min-h-0">
                    <RegistryManager 
                        title={registryTabs.find(t => t.id === activeRegistryTab)?.label || ''} 
                        items={registries[activeRegistryTab as keyof typeof registries]} 
                        userModulePermissions={userModulePermissions}
                        userRole={userRole}
                        // @ts-ignore
                        onAdd={(name, extra) => financeService.saveRegistryItem(activeRegistryTab, {id:'', name, walletId: selectedWalletId === 'ALL' ? undefined : selectedWalletId, ...extra}).then(() => loadRegistries(true, selectedWalletId))}
                        onDelete={(id) => financeService.deleteRegistryItem(activeRegistryTab, id).then(() => loadRegistries(true, selectedWalletId))}
                        // @ts-ignore
                        onEdit={(id, name, extra) => financeService.saveRegistryItem(activeRegistryTab, {id, name, walletId: selectedWalletId === 'ALL' ? undefined : selectedWalletId, ...extra}).then(() => loadRegistries(true, selectedWalletId))}
                        onToggleActive={(id, active) => financeService.toggleRegistryItemActive(activeRegistryTab, id, active).then(() => loadRegistries(true, selectedWalletId))}
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
                                    const newItem = await financeService.saveRegistryItem(activeRegistryTab, { id: idToUse, name, walletId: selectedWalletId === 'ALL' ? undefined : selectedWalletId, ...extra });
                                    newItems.push(newItem);
                                }
                                await loadRegistries(true, selectedWalletId);
                                showAlert('Importação Concluída', `${newItems.length} itens processados com sucesso.`);
                            } catch (e: any) {
                                showAlert('Erro na Importação', e);
                            }
                        }}
                        onDeduplicate={async (onProgress) => {
                            const res = await financeService.deduplicateRegistry(activeRegistryTab, onProgress);
                            await loadRegistries(true, selectedWalletId);
                            await loadTransactions();
                            return res;
                        }}
                        onFindSimilar={() => financeService.findSimilarGroups(activeRegistryTab)}
                        onIgnoreSimilar={(masterId, duplicateIds) => financeService.ignoreUnification(activeRegistryTab, masterId, duplicateIds)}
                        onGetIgnored={() => financeService.getIgnoredUnifications(activeRegistryTab)}
                        onRemoveIgnored={(pairId) => financeService.removeIgnoredUnification(activeRegistryTab, pairId)}
                        onMerge={async (masterId, duplicateIds) => {
                            await financeService.mergeItems(activeRegistryTab, masterId, duplicateIds);
                            await loadRegistries(true, selectedWalletId);
                            await loadTransactions();
                        }}
                        onAutoFillTickers={activeRegistryTab === 'participants' ? async () => {
                            const count = await financeService.autoFillTickers();
                            await loadRegistries(true, selectedWalletId);
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
