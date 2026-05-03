
import { 
  Transaction, 
  Bank, 
  Category, 
  CostCenter, 
  Participant, 
  Wallet,
  BaseEntity,
  AssetType,
  AssetSector,
  AssetTicker,
  UserPermission,
  SmtpSettings,
  UserPreferences
} from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_CONFIG = {
  url: "https://uiekbavvgvrcsmbvoqtt.supabase.co",
  key: "sb_publishable_L3w_v81e9H5oz9fWt-DW2Q_bMtQjQsx"
};

const uuidv4 = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const INITIAL_DATA: {
  transactions: Transaction[];
  banks: Bank[];
  categories: Category[];
  costCenters: CostCenter[];
  participants: Participant[];
  wallets: Wallet[];
  assetTypes: AssetType[];
  assetSectors: AssetSector[];
  assetTickers: AssetTicker[];
} = {
  transactions: [
    {
      id: '1',
      date: new Date().toISOString().split('T')[0],
      description: 'Saldo Inicial Mercado Pago',
      docNumber: '001',
      value: 5000,
      type: 'CREDIT',
      status: 'PAID',
      bankId: 'bank-1',
      categoryId: 'cat-1',
      participantId: 'part-1',
      costCenterId: 'cc-1',
      walletId: 'wall-1'
    },
    {
      id: '2',
      date: new Date().toISOString().split('T')[0],
      description: 'Compra NVIDIA Corp.',
      docNumber: '002',
      value: 1414.68,
      quantity: 10,
      unitPrice: 141.468,
      type: 'DEBIT',
      status: 'PAID',
      bankId: 'bank-2',
      categoryId: 'cat-2',
      participantId: 'part-2',
      costCenterId: 'cc-2',
      walletId: 'wall-1'
    },
    {
      id: '3',
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      description: 'Supermercado Mensal',
      docNumber: '003',
      value: 450.50,
      type: 'DEBIT',
      status: 'PAID',
      bankId: 'bank-1',
      categoryId: 'cat-3',
      participantId: 'part-3',
      costCenterId: 'cc-1',
      walletId: 'wall-1'
    },
    {
      id: '4',
      date: new Date(Date.now() - 172800000).toISOString().split('T')[0],
      description: 'Recebimento Projeto Freelance',
      docNumber: '004',
      value: 2500.00,
      type: 'CREDIT',
      status: 'PAID',
      bankId: 'bank-1',
      categoryId: 'cat-4',
      participantId: 'part-4',
      costCenterId: 'cc-1',
      walletId: 'wall-1'
    },
    {
      id: '5',
      date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      description: 'Conta de Luz',
      docNumber: '005',
      value: 180.00,
      type: 'DEBIT',
      status: 'PENDING',
      bankId: 'bank-1',
      categoryId: 'cat-5',
      participantId: 'part-5',
      costCenterId: 'cc-1',
      walletId: 'wall-1'
    }
  ],
  banks: [
    { id: 'bank-1', name: 'Mercado Pago', currency: 'BRL', type: 'CHECKING' },
    { id: 'bank-2', name: 'Banco Inter Global Acount Investimentos', currency: 'USD', type: 'INVESTMENT' },
    { id: 'bank-3', name: 'Nubank', currency: 'BRL', type: 'CHECKING' }
  ],
  categories: [
    { id: 'cat-1', name: 'Saldo Inicial' },
    { id: 'cat-2', name: 'Investimentos' },
    { id: 'cat-3', name: 'Alimentação' },
    { id: 'cat-4', name: 'Receitas' },
    { id: 'cat-5', name: 'Contas Fixas' },
    { id: 'cat-6', name: 'Proventos' },
    { id: 'cat-7', name: 'Impostos s/ Proventos' }
  ],
  costCenters: [
    { id: 'cc-1', name: 'Geral' },
    { id: 'cc-2', name: 'Investimentos' }
  ],
  participants: [
    { id: 'part-1', name: 'Mercado Pago' },
    { id: 'part-2', name: 'NVIDIA Corp.', ticker: 'NVDA', category: 'Ação', currency: 'USD' },
    { id: 'part-3', name: 'Pão de Açúcar' },
    { id: 'part-4', name: 'Cliente X' },
    { id: 'part-5', name: 'Enel' }
  ],
  wallets: [
    { id: 'wall-1', name: 'Renzo Braz' }
  ],
  assetTypes: [
    { id: 'at-1', name: 'Ação' },
    { id: 'at-2', name: 'FII' },
    { id: 'at-3', name: 'ETF' },
    { id: 'at-4', name: 'Cripto' },
    { id: 'at-5', name: 'BDR' }
  ],
  assetSectors: [
    { id: 'as-1', name: 'Financeiro' },
    { id: 'as-2', name: 'Tecnologia' },
    { id: 'as-3', name: 'Energia' },
    { id: 'as-4', name: 'Saúde' },
    { id: 'as-5', name: 'Consumo' }
  ],
  assetTickers: []
};

const KEYS = {
  TRANSACTIONS: 'fincontrol_transactions',
  BANKS: 'fincontrol_banks',
  CATEGORIES: 'fincontrol_categories',
  COST_CENTERS: 'fincontrol_cost_centers',
  PARTICIPANTS: 'fincontrol_participants',
  WALLETS: 'fincontrol_wallets',
  ASSET_TYPES: 'fincontrol_asset_types',
  ASSET_SECTORS: 'fincontrol_asset_sectors',
  ASSET_TICKERS: 'fincontrol_asset_tickers',
  PREFERENCES: 'fincontrol_preferences',
  USER_SETTINGS: 'fincontrol_user_settings',
  IGNORED_UNIFICATIONS: 'fincontrol_ignored_unifications',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Cache em memória para evitar requisições repetidas ao Supabase
const cache = {
  registries: {} as Record<string, { data: any[], timestamp: number }>,
  balances: {} as Record<string, { data: any, timestamp: number }>,
  TTL: 1000 * 60 * 5 // 5 minutos de cache para cadastros
};

function getEntityLocal<T>(key: string, initial: T[]): T[] {
  const stored = localStorage.getItem(key);
  if (!stored) return initial;
  try {
    return JSON.parse(stored);
  } catch {
    return initial;
  }
}

function saveEntityLocal<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

let supabaseInstance: SupabaseClient | null = null;
let lastUrl = '';
let lastKey = '';

const getSupabase = (): SupabaseClient | null => {
  const url = localStorage.getItem('supabase_url')?.trim() || DEFAULT_SUPABASE_CONFIG.url;
  const key = localStorage.getItem('supabase_key')?.trim() || DEFAULT_SUPABASE_CONFIG.key;

  if (!url || !key) return null;

  if (supabaseInstance && url === lastUrl && key === lastKey) {
    return supabaseInstance;
  }

  try {
    supabaseInstance = createClient(url, key);
    lastUrl = url;
    lastKey = key;
    return supabaseInstance;
  } catch (e) {
    console.error("Error creating Supabase client", e);
    return null;
  }
};

const formatSupabaseError = (error: any): string => {
    if (!error) return "Erro desconhecido";
    
    if (error.code === '23503') {
        return "Não é possível excluir este registro pois ele está sendo usado em um ou mais lançamentos financeiros.";
    }

    const code = error.code ? ` (Code: ${error.code})` : '';
    return (error.message || error.details || JSON.stringify(error)) + code;
};

const mapTransactionFromDb = (db: any): Transaction => ({
  id: db.id,
  date: db.date ? String(db.date).substring(0, 10) : new Date().toISOString().substring(0, 10), // Força YYYY-MM-DD
  description: db.description,
  docNumber: db.doc_number || '',
  value: Number(db.value),
  quantity: db.quantity ? Number(db.quantity) : undefined,
  unitPrice: db.unit_price ? Number(db.unit_price) : undefined,
  type: db.type,
  status: db.status,
  bankId: db.bank_id || '',
  categoryId: db.category_id || '',
  participantId: db.participant_id || '',
  costCenterId: db.cost_center_id || '',
  walletId: db.wallet_id || '',
  linkedId: db.linked_id || undefined,
  createdAt: db.created_at || undefined,
  exchangeRate: db.exchange_rate ? Number(db.exchange_rate) : undefined,
  spread: db.spread ? Number(db.spread) : undefined,
  iof: db.iof ? Number(db.iof) : undefined,
  vet: db.vet ? Number(db.vet) : undefined,
  originalValue: db.original_value ? Number(db.original_value) : undefined,
  originalCurrency: db.original_currency || undefined
});

const mapTransactionToDb = (t: Transaction) => {
  const payload: any = {
    date: t.date,
    description: t.description,
    doc_number: t.docNumber,
    value: t.value,
    quantity: t.quantity || null,
    unit_price: t.unitPrice || null,
    type: t.type,
    status: t.status,
    bank_id: t.bankId || null,
    category_id: t.categoryId || null,
    participant_id: t.participantId || null,
    cost_center_id: t.costCenterId || null,
    wallet_id: t.walletId || null,
    linked_id: t.linkedId || null,
  };

  // Only include exchange fields if they have actual values to prevent PGRST204 errors on older schemas
  if (t.exchangeRate && t.exchangeRate > 0) payload.exchange_rate = t.exchangeRate;
  if (t.spread && t.spread > 0) payload.spread = t.spread;
  if (t.iof && t.iof > 0) payload.iof = t.iof;
  if (t.vet && t.vet > 0) payload.vet = t.vet;
  if (t.originalValue && t.originalValue > 0) payload.original_value = t.originalValue;
  if (t.originalCurrency) payload.original_currency = t.originalCurrency;

  // Garantir que o user_id seja enviado se disponível
  const storedUserId = localStorage.getItem('supabase_user_id');
  if (storedUserId) payload.user_id = storedUserId;

  if (t.id && t.id.trim() !== '') {
    payload.id = t.id;
  }
  return payload;
};

export interface TransactionFilters {
    startDate?: string;
    endDate?: string;
    bankId?: string;
    walletId?: string;
    status?: 'PAID' | 'PENDING' | 'ALL';
    docNumber?: string;
}

export const financeService = {
  getUserPreferences(): any {
    const saved = localStorage.getItem(KEYS.PREFERENCES);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse preferences", e);
      }
    }
    return {
      defaultDateRange: 'CURRENT_MONTH',
      defaultStatus: 'ALL',
      defaultBankId: '',
      defaultWalletId: '',
      defaultPerformanceBankId: 'ALL',
      defaultPerformanceWalletId: 'ALL'
    };
  },

  saveUserPreferences(prefs: any): void {
    localStorage.setItem(KEYS.PREFERENCES, JSON.stringify(prefs));
  },

  async getUserSettings(): Promise<UserPreferences> {
    const defaultPrefs: UserPreferences = {
      defaultDateRange: 'CURRENT_MONTH',
      defaultStatus: 'ALL',
      defaultBankId: '',
      defaultWalletId: '',
      defaultPerformanceBankId: 'ALL',
      defaultPerformanceWalletId: 'ALL',
      defaultTab: 'dashboard'
    };

    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data, error } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (error) throw error;
          if (data) {
            return {
              defaultDateRange: (data.default_period as any) || defaultPrefs.defaultDateRange,
              defaultStatus: (data.default_status as any) || defaultPrefs.defaultStatus,
              defaultBankId: data.default_bank_id || '',
              defaultWalletId: data.default_wallet_id || '',
              defaultPerformanceBankId: data.default_performance_bank_id || 'ALL',
              defaultPerformanceWalletId: data.default_performance_wallet_id || 'ALL',
              defaultTab: data.default_tab || 'dashboard'
            };
          }
        }
      } catch (e) {
        console.warn("Falha ao buscar configurações no banco, usando local", e);
      }
    }

    const saved = localStorage.getItem(KEYS.PREFERENCES);
    if (saved) {
      try {
        return { ...defaultPrefs, ...JSON.parse(saved) };
      } catch {
        return defaultPrefs;
      }
    }
    return defaultPrefs;
  },

  async saveUserSettings(prefs: UserPreferences): Promise<void> {
    // Salva no localStorage (fallback)
    localStorage.setItem(KEYS.PREFERENCES, JSON.stringify(prefs));

    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const payload = {
            user_id: session.user.id,
            default_period: prefs.defaultDateRange,
            default_status: prefs.defaultStatus,
            default_bank_id: prefs.defaultBankId || null,
            default_wallet_id: prefs.defaultWalletId || null,
            default_performance_bank_id: prefs.defaultPerformanceBankId,
            default_performance_wallet_id: prefs.defaultPerformanceWalletId,
            default_tab: prefs.defaultTab || 'dashboard',
            updated_at: new Date().toISOString()
          };

          const { error } = await supabase
            .from('user_settings')
            .upsert(payload, { onConflict: 'user_id' });

          if (error) throw error;
        }
      } catch (e) {
        console.error("Falha ao salvar configurações no banco", e);
        throw e;
      }
    }
  },

  getSupabase(): any {
    return getSupabase();
  },

  getDateRangeFromPreference(option: string): { start: string, end: string } {
    const today = new Date();
    const yy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yy}-${mm}-${dd}`;

    if (option === 'TODAY') {
      return { start: todayStr, end: todayStr };
    }
    if (option === 'LAST_3_DAYS') {
      const d = new Date(today);
      d.setDate(d.getDate() - 2);
      const startStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { start: startStr, end: todayStr };
    }
    if (option === 'CURRENT_WEEK') {
      const d = new Date(today);
      const day = d.getDay(); // 0 (Sun) to 6 (Sat)
      const diffStart = d.getDate() - day;
      const start = new Date(d.setDate(diffStart));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      
      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
      return { start: startStr, end: endStr };
    }
    if (option === 'CURRENT_MONTH') {
      const startStr = `${yy}-${mm}-01`;
      const lastDay = new Date(yy, today.getMonth() + 1, 0).getDate();
      const endStr = `${yy}-${mm}-${String(lastDay).padStart(2, '0')}`;
      return { start: startStr, end: endStr };
    }
    if (option === 'PREVIOUS_MONTH') {
      const d = new Date(yy, today.getMonth() - 1, 1);
      const prevYy = d.getFullYear();
      const prevMm = String(d.getMonth() + 1).padStart(2, '0');
      const startStr = `${prevYy}-${prevMm}-01`;
      const lastDay = new Date(prevYy, d.getMonth() + 1, 0).getDate();
      const endStr = `${prevYy}-${prevMm}-${String(lastDay).padStart(2, '0')}`;
      return { start: startStr, end: endStr };
    }
    if (option === 'LAST_30_DAYS') {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      const startStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { start: startStr, end: todayStr };
    }
    return { start: '', end: '' }; // 'ALL' or unknown
  },

  async getTransactionsByLinkedId(linkedId: string): Promise<Transaction[]> {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase.from('transactions').select('*').eq('linked_id', linkedId);
      if (error) throw error;
      return (data || []).map(mapTransactionFromDb);
    } else {
      const all = await this.getTransactions();
      return all.filter(t => t.linkedId === linkedId);
    }
  },

  async login(email: string, password?: string): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase não configurado");
    
    if (password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      localStorage.setItem('supabase_user_id', data.user?.id || '');
      return data;
    } else {
      // Login via link mágico ou similar se preferir, mas aqui usaremos senha por padrão
      throw new Error("Senha é obrigatória");
    }
  },

  async signUp(email: string, password?: string): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase não configurado");
    
    if (password) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    } else {
      throw new Error("Senha é obrigatória");
    }
  },

  async signOut(): Promise<void> {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
      localStorage.removeItem('supabase_user_id');
      // Limpa caches
      cache.registries = {};
      cache.balances = {};
    }
  },

  async inviteUser(email: string, role: 'viewer' | 'editor' | 'admin' = 'viewer'): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase não configurado");
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error("Usuário não autenticado");

    const { error } = await supabase.from('user_permissions').insert({
      owner_id: session.user.id,
      invited_email: email.toLowerCase().trim(),
      role: role,
      status: 'pending'
    });

    if (error) throw error;

    // Enviar e-mail via servidor backend
    try {
      await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          invitedBy: session.user.email,
          ownerId: session.user.id,
          role: role
        })
      });
    } catch (e) {
      console.warn("Convite registrado no banco, mas houve falha ao disparar o e-mail automático:", e);
    }
  },

  async getMyInvitations(): Promise<UserPermission[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return [];

    const { data, error } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('owner_id', session.user.id);

    if (error) throw error;
    return data || [];
  },

  async getInvitationsSentToMe(): Promise<UserPermission[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) return [];

    const { data, error } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('invited_email', session.user.email.toLowerCase());

    if (error) throw error;
    return data || [];
  },

  async acceptInvitation(invitationId: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase não configurado");

    const { error } = await supabase
      .from('user_permissions')
      .update({ status: 'active' })
      .eq('id', invitationId);

    if (error) throw error;
  },

  async deletePermission(id: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase não configurado");

    const { error } = await supabase
      .from('user_permissions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getSmtpSettings(): Promise<SmtpSettings | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data, error } = await supabase
      .from('smtp_settings')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async saveSmtpSettings(settings: Omit<SmtpSettings, 'id' | 'user_id'>): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase não configurado");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error("Usuário não autenticado");

    const payload = {
      ...settings,
      user_id: session.user.id,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('smtp_settings')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) throw error;
  },

  async getTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
    const supabase = getSupabase();

    if (supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        let query = supabase.from('transactions').select('*');
        
        // Comentado para permitir que o RLS do Supabase decida o que o usuário pode ver 
        // (Isso habilita o acesso a dados compartilhados por outros usuários)
        // if (userId) query = query.eq('user_id', userId);

        // Aplicar filtros no servidor
        if (filters?.startDate && filters.startDate.trim() !== '') query = query.gte('date', filters.startDate);
        if (filters?.endDate && filters.endDate.trim() !== '') query = query.lte('date', filters.endDate);
        if (filters?.bankId && filters.bankId.trim() !== '') query = query.eq('bank_id', filters.bankId);
        if (filters?.walletId && filters.walletId.trim() !== '') query = query.eq('wallet_id', filters.walletId);
        if (filters?.status && filters.status !== 'ALL') query = query.eq('status', filters.status);
        if (filters?.docNumber && filters.docNumber.trim() !== '') query = query.eq('doc_number', filters.docNumber);

        let allData: any[] = [];
        let from = 0;
        let to = 999;
        let finished = false;

        while (!finished) {
          // Range é aplicado sobre a query já filtrada
          const { data, error } = await query
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .range(from, to);

          if (error) throw new Error(formatSupabaseError(error));
          
          if (!data || data.length === 0) {
            finished = true;
          } else {
            allData = [...allData, ...data];
            if (data.length < 1000) {
              finished = true;
            } else {
              from += 1000;
              to += 1000;
            }
          }
        }
        const uniqueData = Array.from(new Map(allData.map(item => [item.id, item])).values());
        return uniqueData.map(mapTransactionFromDb);
      } catch (e: any) {
        // Silencia o erro para aviso, pois o fallback local é o comportamento padrão sem configuração
        console.warn("Dica: Supabase não conectado (usando dados locais). Isso é normal se você ainda não configurou as chaves do banco de dados.");
        
        if (e.message?.includes('fetch') || e.name === 'TypeError') {
          // Fall through to local fallback
        } else {
          throw e;
        }
      }
    }
    
    // FALLBACK LOCAL
    await delay(300);
    let localData = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions).map(t => ({...t, value: Number(t.value)}));

    if (filters) {
        if (filters.startDate && filters.startDate.trim()) localData = localData.filter(t => t.date >= filters.startDate!);
        if (filters.endDate && filters.endDate.trim()) localData = localData.filter(t => t.date <= filters.endDate!);
        if (filters.bankId && filters.bankId.trim()) localData = localData.filter(t => t.bankId === filters.bankId);
        if (filters.walletId && filters.walletId.trim()) localData = localData.filter(t => t.walletId === filters.walletId);
        if (filters.status && filters.status !== 'ALL') localData = localData.filter(t => t.status === filters.status);
    }

    localData.sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        
        // Secondary sort: Newest creation first
        if (a.createdAt && b.createdAt) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return (b.id || '').localeCompare(a.id || '');
    });

    return localData;
  },

  /**
   * Calcula o saldo acumulado de transações PAGAS anteriores à data de início.
   * Isso garante que o "Saldo Atual" obedeça ao saldo histórico e não apenas ao filtro visual.
   */
  async getBalancesBefore(dateLimit: string, bankId?: string, walletId?: string): Promise<{ total: number, byBank: Record<string, number> }> {
    if (!dateLimit) return { total: 0, byBank: {} };

    const supabase = getSupabase();
    const cacheKey = `balance_${dateLimit}_${bankId || 'all'}_${walletId || 'all'}`;
    
    let rows: any[] = [];

    if (supabase) {
      try {
        // Verifica cache
        const cached = cache.balances[cacheKey];
        if (cached && (Date.now() - cached.timestamp < cache.TTL)) {
            return cached.data;
        }

        let from = 0;
        let to = 999;
        let finished = false;

        while (!finished) {
            let query = supabase
                .from('transactions')
                .select('value, type, bank_id')
                .eq('status', 'PAID')
                .lt('date', dateLimit);

            if (bankId) query = query.eq('bank_id', bankId);
            if (walletId) query = query.eq('wallet_id', walletId);

            const { data, error } = await query.range(from, to);
            if (error) { console.error(error); break; }
            if (!data || data.length === 0) {
                finished = true;
            } else {
                rows = [...rows, ...data];
                if (data.length < 1000) finished = true;
                else { from += 1000; to += 1000; }
            }
        }
      } catch (e: any) {
        console.error("Supabase balance fetch failed", e);
        
        const isFetchError = e.message?.includes('fetch') || e.name === 'TypeError';
        if (isFetchError) {
          // Fallback logic below
          const local = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
          rows = local.filter(t => 
              t.status === 'PAID' && 
              t.date < dateLimit &&
              (!bankId || t.bankId === bankId) &&
              (!walletId || t.walletId === walletId)
          ).map(t => ({ value: Number(t.value), type: t.type, bank_id: t.bankId }));
        } else {
          throw e;
        }
      }
    } else {
        // Local Fallback
        const local = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
        rows = local.filter(t => 
            t.status === 'PAID' && 
            t.date < dateLimit &&
            (!bankId || t.bankId === bankId) &&
            (!walletId || t.walletId === walletId)
        ).map(t => ({ value: Number(t.value), type: t.type, bank_id: t.bankId }));
    }

    const byBank: Record<string, number> = {};
    let total = 0;

    rows.forEach(r => {
        const val = r.type === 'CREDIT' ? Number(r.value) : -Number(r.value);
        total += val;
        if (r.bank_id) {
            byBank[r.bank_id] = (byBank[r.bank_id] || 0) + val;
        }
    });

    const result = { total, byBank };
    // Atualiza cache se estiver usando Supabase
    if (supabase) {
        cache.balances[cacheKey] = { data: result, timestamp: Date.now() };
    }
    return result;
  },

  async saveTransaction(transaction: Transaction): Promise<Transaction> {
    const supabase = getSupabase();
    const transactionToSave = {
        ...transaction,
        id: (transaction.id && transaction.id.trim() !== '') ? transaction.id : uuidv4()
    };

    // Invalida cache de saldos quando houver alteração
    cache.balances = {};

    if (supabase) {
      try {
        const payload = mapTransactionToDb(transactionToSave);
        const { data, error } = await supabase.from('transactions').upsert(payload).select().single();
        if (error) throw new Error(formatSupabaseError(error));
        return mapTransactionFromDb(data);
      } catch (e: any) {
        console.error("Supabase save failed, falling back to local data", e);
        
        if (e.message?.includes('fetch') || e.name === 'TypeError') {
          // Fall through to local fallback
        } else {
          throw e;
        }
      }
    }
    await delay(300);
    const list = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
    const index = list.findIndex(t => t.id === transactionToSave.id);
    if (index >= 0) list[index] = transactionToSave; else list.push(transactionToSave);
    saveEntityLocal(KEYS.TRANSACTIONS, list);
    return transactionToSave;
  },

  async createManyTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    const supabase = getSupabase();
    const transactionsWithIds = transactions.map(t => ({
        ...t,
        id: (t.id && t.id.trim() !== '') ? t.id : uuidv4()
    }));

    // Invalida cache de saldos
    cache.balances = {};

    if (supabase) {
      try {
        const payloads = transactionsWithIds.map(mapTransactionToDb);
        const { data, error } = await supabase.from('transactions').upsert(payloads).select();
        if (error) throw new Error(formatSupabaseError(error));
        return (data || []).map(mapTransactionFromDb);
      } catch (e: any) {
        console.error("Supabase bulk save failed, falling back to local data", e);
        
        if (e.message?.includes('fetch') || e.name === 'TypeError') {
          // Fall through to local fallback
        } else {
          throw e;
        }
      }
    }
    await delay(500);
    const list = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
    list.push(...transactionsWithIds);
    saveEntityLocal(KEYS.TRANSACTIONS, list);
    return transactionsWithIds;
  },

  async deleteTransactions(ids: string[]): Promise<void> {
    const supabase = getSupabase();
    
    // Invalida cache de saldos
    cache.balances = {};

    if (supabase) {
      try {
        const { error } = await supabase.from('transactions').delete().in('id', ids);
        if (error) throw new Error(formatSupabaseError(error));
        return;
      } catch (e: any) {
        console.error("Supabase delete failed, falling back to local data", e);
        
        if (e.message?.includes('fetch') || e.name === 'TypeError') {
          // Fall through to local fallback
        } else {
          throw e;
        }
      }
    }
    await delay(300);
    let list = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
    list = list.filter(t => !ids.includes(t.id));
    saveEntityLocal(KEYS.TRANSACTIONS, list);
  },

  async updateTransactionsStatus(ids: string[], status: 'PAID' | 'PENDING'): Promise<void> {
    const supabase = getSupabase();
    
    // Invalida cache de saldos
    cache.balances = {};

    if (supabase) {
      try {
        const { error } = await supabase
          .from('transactions')
          .update({ status })
          .in('id', ids);
        
        if (error) throw new Error(formatSupabaseError(error));
        return;
      } catch (e: any) {
        console.error("Supabase update status failed, falling back to local data", e);
        
        if (e.message?.includes('fetch') || e.name === 'TypeError') {
          // Fall through to local fallback
        } else {
          throw e;
        }
      }
    }

    await delay(300);
    const list = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
    const updatedList = list.map(t => ids.includes(t.id) ? { ...t, status } : t);
    saveEntityLocal(KEYS.TRANSACTIONS, updatedList);
  },

  async getRegistry<T extends BaseEntity>(type: string, forceRefresh = false): Promise<T[]> {
    const supabase = getSupabase();
    const tableMap: any = { 
      banks: 'banks', 
      categories: 'categories', 
      costCenters: 'cost_centers', 
      participants: 'participants', 
      wallets: 'wallets',
      assetTypes: 'asset_types',
      assetSectors: 'asset_sectors',
      assetTickers: 'asset_tickers'
    };
    
    if (supabase) {
      try {
        // Verifica cache
        const cached = cache.registries[type];
        if (!forceRefresh && cached && (Date.now() - cached.timestamp < cache.TTL)) {
          return cached.data as T[];
        }

        let allData: any[] = [];
        let from = 0;
        let to = 999;
        let finished = false;

        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;

        while (!finished) {
          let query = supabase
            .from(tableMap[type])
            .select('*');
          
          // if (userId) {
          //   query = query.eq('user_id', userId);
          // }

          const { data, error } = await query
            .order('name')
            .order('id')
            .range(from, to);

          if (error) throw new Error(formatSupabaseError(error));
          
          if (!data || data.length === 0) {
            finished = true;
          } else {
            allData = [...allData, ...data];
            if (data.length < 1000) {
              finished = true;
            } else {
              from += 1000;
              to += 1000;
            }
          }
        }
        
        let result: T[] = [];
        if (type === 'banks') {
          result = allData.map((d: any) => ({ 
            id: d.id, 
            name: d.name, 
            type: d.type || 'CHECKING', 
            currency: d.currency || 'BRL' 
          })) as any;
        } else if (type === 'wallets') {
          result = allData.map((d: any) => ({ 
            id: d.id, 
            name: d.name 
          })) as any;
        } else if (type === 'participants') {
          const virtualTargetPrices = JSON.parse(localStorage.getItem('fincontrol_virtual_target_prices') || '{}');
          result = allData.map((d: any) => ({ 
            id: d.id, 
            name: d.name, 
            category: d.category,
            sector: d.sector,
            ticker: d.ticker,
            currency: d.currency || 'BRL',
            currentPrice: d.current_price,
            targetPrice: d.target_price !== undefined ? d.target_price : virtualTargetPrices[d.id],
            lastUpdate: d.last_update
          })) as any;
        } else if (type === 'assetTickers') {
          result = allData.map((d: any) => ({
            id: d.id,
            name: d.name,
            ticker: d.ticker
          })) as any;
        } else {
          result = Array.from(new Map(allData.map(item => [item.id, item])).values()) as T[];
        }

        // Atualiza cache em memória
        cache.registries[type] = { data: result, timestamp: Date.now() };

        // Salva no localStorage para persistência entre sessões
        // NOTA: Só salvamos se o resultado não for vazio OU se o banco estiver realmente vazio.
        // Se o Supabase retornar vazio, mas temos dados locais, talvez devêssemos manter os locais?
        // Por enquanto, confiamos no Supabase como fonte da verdade se conectado.
        const keyMap: any = { 
          banks: KEYS.BANKS, 
          categories: KEYS.CATEGORIES, 
          costCenters: KEYS.COST_CENTERS, 
          participants: KEYS.PARTICIPANTS, 
          wallets: KEYS.WALLETS,
          assetTypes: KEYS.ASSET_TYPES,
          assetSectors: KEYS.ASSET_SECTORS,
          assetTickers: KEYS.ASSET_TICKERS
        };
        saveEntityLocal(keyMap[type], result);

        return result;
      } catch (e: any) {
        const isMissingTable = e.code === 'PGRST205' || e.code === '42P01' || e.message?.includes('PGRST205') || e.message?.includes('42P01');
        
        if (isMissingTable) {
          console.warn(`Tabela ${type} não encontrada no Supabase. Usando dados locais.`);
        } else {
          console.error(`Supabase registry fetch failed for ${type}, falling back to local data`, e);
        }

        if (e.message?.includes('fetch') || e.name === 'TypeError' || isMissingTable) {
          // Fall through to local fallback
        } else {
          throw e;
        }
      }
    }

    await delay(200);
    const keyMap: any = { 
      banks: KEYS.BANKS, 
      categories: KEYS.CATEGORIES, 
      costCenters: KEYS.COST_CENTERS, 
      participants: KEYS.PARTICIPANTS, 
      wallets: KEYS.WALLETS,
      assetTypes: KEYS.ASSET_TYPES,
      assetSectors: KEYS.ASSET_SECTORS,
      assetTickers: KEYS.ASSET_TICKERS
    };
    return getEntityLocal(keyMap[type], (INITIAL_DATA as any)[type]) as T[];
  },

  async saveRegistryItem<T extends BaseEntity>(type: string, item: T & { bankId?: string }): Promise<T> {
    const supabase = getSupabase();
    const tableMap: any = { 
      banks: 'banks', 
      categories: 'categories', 
      costCenters: 'cost_centers', 
      participants: 'participants', 
      wallets: 'wallets',
      assetTypes: 'asset_types',
      assetSectors: 'asset_sectors',
      assetTickers: 'asset_tickers'
    };
    
    // Obter antigo nome para sincronização em cascata se for edição de tipo ou setor
    let oldName = '';
    if (item.id && (type === 'assetTypes' || type === 'assetSectors')) {
      const currentList = await this.getRegistry(type);
      const existingItem = currentList.find(i => i.id === item.id);
      if (existingItem) oldName = existingItem.name;
    }

    const itemToSave = {
        ...item,
        id: (item.id && item.id.trim() !== '') ? item.id : uuidv4()
    };

    // Invalida cache do registro específico
    delete cache.registries[type];

    if (supabase) {
      try {
        const payload: any = { name: itemToSave.name, id: itemToSave.id };
        if (type === 'banks') {
            payload.type = (item as any).type || 'CHECKING';
            payload.currency = (item as any).currency || 'BRL';
        }
        if (type === 'wallets') {
            // Wallet is now just a portfolio/company name
        }
        if (type === 'participants') {
            payload.category = (item as any).category || null;
            payload.sector = (item as any).sector || null;
            payload.ticker = (item as any).ticker || null;
            payload.currency = (item as any).currency || 'BRL';
            payload.current_price = (item as any).currentPrice || null;
            payload.target_price = (item as any).targetPrice || null;
            payload.last_update = (item as any).lastUpdate || null;
        }
        if (type === 'assetTickers') {
            payload.ticker = (item as any).ticker || '';
        }
        
        const storedUserId = localStorage.getItem('supabase_user_id');
        if (storedUserId) payload.user_id = storedUserId;

        let { data, error } = await supabase.from(tableMap[type]).upsert(payload).select().single();
        
        // Sincronização em cascata (Supabase)
        if (!error && oldName && oldName !== itemToSave.name) {
          if (type === 'assetTypes') {
            await supabase.from('participants').update({ category: itemToSave.name }).eq('category', oldName);
          } else if (type === 'assetSectors') {
            await supabase.from('participants').update({ sector: itemToSave.name }).eq('sector', oldName);
          }
          // Invalida cache de participantes para refletir as mudanças
          delete cache.registries['participants'];
        }

        // Fallback para quando a coluna target_price não existe no Supabase (Erro PGRST204)
        if (error && error.code === 'PGRST204' && type === 'participants') {
            console.warn("Coluna 'target_price' não encontrada no Supabase. Salvando localmente como fallback.");
            const virtualTargetPrices = JSON.parse(localStorage.getItem('fincontrol_virtual_target_prices') || '{}');
            if ((item as any).targetPrice !== undefined) {
                virtualTargetPrices[itemToSave.id] = (item as any).targetPrice;
                localStorage.setItem('fincontrol_virtual_target_prices', JSON.stringify(virtualTargetPrices));
            }
            
            // Tenta salvar novamente sem a coluna problemática
            const cleanPayload = { ...payload };
            delete cleanPayload.target_price;
            const retry = await supabase.from(tableMap[type]).upsert(cleanPayload).select().single();
            data = retry.data;
            error = retry.error;
        }

        if (error) throw new Error(formatSupabaseError(error));
        
        let result: T;
        if (type === 'wallets') {
          result = { id: data.id, name: data.name, bankId: data.bank_id, currency: data.currency, type: data.type } as any;
        } else if (type === 'participants') {
            const virtualTargetPrices = JSON.parse(localStorage.getItem('fincontrol_virtual_target_prices') || '{}');
            result = { 
                id: data.id, 
                name: data.name, 
                category: data.category,
                sector: data.sector,
                ticker: data.ticker,
                currency: data.currency,
                currentPrice: data.current_price,
                targetPrice: data.target_price !== undefined ? data.target_price : virtualTargetPrices[data.id],
                lastUpdate: data.last_update
            } as any;
        } else if (type === 'assetTickers') {
            result = {
                id: data.id,
                name: data.name,
                ticker: data.ticker
            } as any;
        } else {
          result = data as T;
        }

        // Sincroniza com localStorage para evitar que loadRegistries leia dados obsoletos
        const keyMap: any = { 
          banks: KEYS.BANKS, 
          categories: KEYS.CATEGORIES, 
          costCenters: KEYS.COST_CENTERS, 
          participants: KEYS.PARTICIPANTS, 
          wallets: KEYS.WALLETS,
          assetTypes: KEYS.ASSET_TYPES,
          assetSectors: KEYS.ASSET_SECTORS,
          assetTickers: KEYS.ASSET_TICKERS
        };
        const list = getEntityLocal<T>(keyMap[type], (INITIAL_DATA as any)[type]);
        const index = list.findIndex(i => i.id === result.id);
        if (index >= 0) list[index] = result; else list.push(result);
        saveEntityLocal(keyMap[type], list);

        return result;
      } catch (e: any) {
        console.error(`Supabase registry save failed for ${type}, falling back to local data`, e);

        if (e.message?.includes('fetch') || e.name === 'TypeError') {
          // Fall through to local fallback
        } else {
          throw e;
        }
      }
    }

    // FALLBACK LOCAL
    const keyMap: any = { 
      banks: KEYS.BANKS, 
      categories: KEYS.CATEGORIES, 
      costCenters: KEYS.COST_CENTERS, 
      participants: KEYS.PARTICIPANTS, 
      wallets: KEYS.WALLETS,
      assetTypes: KEYS.ASSET_TYPES,
      assetSectors: KEYS.ASSET_SECTORS,
      assetTickers: KEYS.ASSET_TICKERS
    };
    const list = getEntityLocal<T>(keyMap[type], (INITIAL_DATA as any)[type]);
    const index = list.findIndex(x => x.id === itemToSave.id);
    
    // Sincronização em cascata (Local)
    if (oldName && oldName !== itemToSave.name) {
      let partList = getEntityLocal<Participant>(KEYS.PARTICIPANTS, INITIAL_DATA.participants);
      let changed = false;
      partList = partList.map(p => {
        if (type === 'assetTypes' && p.category === oldName) {
          changed = true;
          return { ...p, category: itemToSave.name };
        }
        if (type === 'assetSectors' && p.sector === oldName) {
          changed = true;
          return { ...p, sector: itemToSave.name };
        }
        return p;
      });
      if (changed) saveEntityLocal(KEYS.PARTICIPANTS, partList);
    }

    const finalItem = { ...itemToSave };
    if (type === 'banks' && !(finalItem as any).currency) {
        (finalItem as any).currency = 'BRL';
    }
    if (type === 'banks' && !(finalItem as any).type) {
        (finalItem as any).type = 'CHECKING';
    }

    if (index >= 0) list[index] = finalItem as T; else list.push(finalItem as T);
    saveEntityLocal(keyMap[type], list);
    return finalItem as T;
  },

  async deleteRegistryItem(type: string, id: string): Promise<void> {
    const supabase = getSupabase();
    const tableMap: any = { 
      banks: 'banks', 
      categories: 'categories', 
      costCenters: 'cost_centers', 
      participants: 'participants', 
      wallets: 'wallets',
      assetTypes: 'asset_types',
      assetSectors: 'asset_sectors',
      assetTickers: 'asset_tickers'
    };
    
    const fkMap: any = { 
      banks: 'bank_id', 
      categories: 'category_id', 
      costCenters: 'cost_center_id', 
      participants: 'participant_id', 
      wallets: 'wallet_id' 
    };

    const localFkMap: any = { 
      banks: 'bankId', 
      categories: 'categoryId', 
      costCenters: 'costCenterId', 
      participants: 'participantId', 
      wallets: 'walletId' 
    };

    // Invalida cache do registro específico
    delete cache.registries[type];

    if (supabase) {
      try {
        // Bloqueio de exclusão com vínculo (Supabase)
        const fkName = fkMap[type];
        if (fkName) {
          const { count, error: checkError } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq(fkName, id);
          if (checkError) throw checkError;
          if (count && count > 0) {
            throw new Error(`Não é possível excluir este registro pois ele possui ${count} lançamentos vinculados.`);
          }
        }

        if (type === 'banks') {
          const { count, error: checkError } = await supabase.from('wallets').select('*', { count: 'exact', head: true }).eq('bank_id', id);
          if (checkError) throw checkError;
          if (count && count > 0) {
            throw new Error(`Não é possível excluir este banco pois ele possui ${count} carteiras/portfólios vinculados.`);
          }
        }

        // Verificação para Tipos de Ativo e Setores (Vinculados aos Participantes)
        if (type === 'assetTypes' || type === 'assetSectors') {
          const currentList = await this.getRegistry(type);
          const item = currentList.find(i => i.id === id);
          if (item) {
            const column = type === 'assetTypes' ? 'category' : 'sector';
            const { count, error: checkError } = await supabase.from('participants').select('*', { count: 'exact', head: true }).eq(column, item.name);
            if (checkError) throw checkError;
            if (count && count > 0) {
              throw new Error(`Não é possível excluir este ${type === 'assetTypes' ? 'tipo' : 'setor'} pois ele está sendo usado em ${count} participantes.`);
            }
          }
        }

        const { error } = await supabase.from(tableMap[type]).delete().eq('id', id);
        if (error) throw new Error(formatSupabaseError(error));
        
        // Sincroniza com localStorage para evitar que loadRegistries leia dados obsoletos
        const keyMap: any = { 
          banks: KEYS.BANKS, 
          categories: KEYS.CATEGORIES, 
          costCenters: KEYS.COST_CENTERS, 
          participants: KEYS.PARTICIPANTS, 
          wallets: KEYS.WALLETS,
          assetTypes: KEYS.ASSET_TYPES,
          assetSectors: KEYS.ASSET_SECTORS,
          assetTickers: KEYS.ASSET_TICKERS
        };
        let list = getEntityLocal<any>(keyMap[type], []);
        list = list.filter((item: any) => item.id !== id);
        saveEntityLocal(keyMap[type], list);

        return;
      } catch (e: any) {
        console.error(`Supabase registry delete failed for ${type}, falling back to local data`, e);
        
        if (e.message?.includes('fetch') || e.name === 'TypeError') {
          // Fall through to local fallback
        } else {
          throw e; // Lança o erro de bloqueio para que o usuário veja
        }
      }
    }
    
    // FALLBACK LOCAL (com bloqueio)
    const localFkName = localFkMap[type];
    if (localFkName) {
        let transactions = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, []);
        const count = transactions.filter(t => (t as any)[localFkName] === id).length;
        if (count > 0) {
            throw new Error(`Não é possível excluir este registro pois ele possui ${count} lançamentos vinculados.`);
        }

        if (type === 'banks') {
            let wallets = getEntityLocal<any>(KEYS.WALLETS, []);
            const wCount = wallets.filter((w: any) => w.bankId === id).length;
            if (wCount > 0) {
              throw new Error(`Não é possível excluir este banco pois ele possui ${wCount} carteiras vinculadas.`);
            }
        }
    }

    if (type === 'assetTypes' || type === 'assetSectors') {
        const currentList = getEntityLocal<BaseEntity>(type === 'assetTypes' ? KEYS.ASSET_TYPES : KEYS.ASSET_SECTORS, []);
        const item = currentList.find(i => i.id === id);
        if (item) {
            const partList = getEntityLocal<Participant>(KEYS.PARTICIPANTS, []);
            const count = partList.filter(p => (type === 'assetTypes' ? p.category : p.sector) === item.name).length;
            if (count > 0) {
                throw new Error(`Não é possível excluir este ${type === 'assetTypes' ? 'tipo' : 'setor'} pois ele está sendo usado em ${count} participantes.`);
            }
        }
    }

    const keyMap: any = { 
      banks: KEYS.BANKS, 
      categories: KEYS.CATEGORIES, 
      costCenters: KEYS.COST_CENTERS, 
      participants: KEYS.PARTICIPANTS, 
      wallets: KEYS.WALLETS,
      assetTypes: KEYS.ASSET_TYPES,
      assetSectors: KEYS.ASSET_SECTORS,
      assetTickers: KEYS.ASSET_TICKERS
    };
    let list = getEntityLocal<BaseEntity>(keyMap[type], (INITIAL_DATA as any)[type]);
    list = list.filter(x => x.id !== id);
    saveEntityLocal(keyMap[type], list);
  },

  async deduplicateRegistry(type: string, onProgress?: (current: number, total: number) => void): Promise<{ merged: number, deleted: number }> {
    const supabase = getSupabase();
    const tableMap: any = { 
      banks: 'banks', 
      categories: 'categories', 
      costCenters: 'cost_centers', 
      participants: 'participants', 
      wallets: 'wallets',
      assetTypes: 'asset_types',
      assetSectors: 'asset_sectors',
      assetTickers: 'asset_tickers'
    };
    const fkMap: any = { banks: 'bank_id', categories: 'category_id', costCenters: 'cost_center_id', participants: 'participant_id', wallets: 'wallet_id' };
    const localFkMap: any = { banks: 'bankId', categories: 'categoryId', costCenters: 'costCenterId', participants: 'participantId', wallets: 'walletId' };
    
    const tableName = tableMap[type];
    const fkName = fkMap[type];
    const localFkName = localFkMap[type];

    let mergedCount = 0;
    let deletedCount = 0;

    const normalizeName = (name: string) => {
      return name
        .normalize('NFD') // Decompose accents
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .toLowerCase() // Convert to lowercase
        .replace(/[^a-z0-9]/g, ''); // Remove all non-alphanumeric characters (spaces, hyphens, dots, etc.)
    };

    if (supabase) {
      let items: any[] = [];
      let from = 0;
      let finished = false;
      while (!finished) {
        const { data, error: fetchError } = await supabase.from(tableName).select('*').range(from, from + 999);
        if (fetchError) throw new Error(formatSupabaseError(fetchError));
        if (!data || data.length === 0) {
          finished = true;
        } else {
          items = [...items, ...data];
          from += 1000;
        }
      }

      const groups = new Map<string, any[]>();
      for (const item of items) {
        const norm = normalizeName(item.name);
        if (!groups.has(norm)) groups.set(norm, []);
        groups.get(norm)!.push(item);
      }

      const groupsToProcess = Array.from(groups.values()).filter(g => g.length > 1);
      const totalGroups = groupsToProcess.length;
      let processedGroups = 0;

      if (totalGroups > 0 && onProgress) onProgress(0, totalGroups);

      for (const group of groupsToProcess) {
        group.sort((a, b) => a.id.localeCompare(b.id));
        const master = group[0];
        const duplicates = group.slice(1);
        const duplicateIds = duplicates.map(d => d.id);

        const { error: updateError } = await supabase
          .from('transactions')
          .update({ [fkName]: master.id })
          .in(fkName, duplicateIds);
        
        if (updateError) throw new Error(formatSupabaseError(updateError));

        if (type === 'banks') {
          // Bank is now the account, no need to update wallets
        }

        const { error: deleteError } = await supabase
          .from(tableName)
          .delete()
          .in('id', duplicateIds);
        
        if (deleteError) throw new Error(formatSupabaseError(deleteError));

        mergedCount += duplicateIds.length;
        deletedCount += duplicateIds.length;

        processedGroups++;
        if (onProgress) onProgress(processedGroups, totalGroups);
      }
      return { merged: mergedCount, deleted: deletedCount };
    }

    const keyMap: any = { banks: KEYS.BANKS, categories: KEYS.CATEGORIES, costCenters: KEYS.COST_CENTERS, participants: KEYS.PARTICIPANTS, wallets: KEYS.WALLETS };
    let items = getEntityLocal<any>(keyMap[type], []);
    let transactions = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, []);
    let wallets = getEntityLocal<Wallet>(KEYS.WALLETS, []);

    const groups = new Map<string, any[]>();
    for (const item of items) {
      const norm = normalizeName(item.name);
      if (!groups.has(norm)) groups.set(norm, []);
      groups.get(norm)!.push(item);
    }

    const duplicateIdsToRemove = new Set<string>();

    const groupsToProcess = Array.from(groups.values()).filter(g => g.length > 1);
    const totalGroups = groupsToProcess.length;
    let processedGroups = 0;

    if (totalGroups > 0 && onProgress) onProgress(0, totalGroups);

    for (const group of groupsToProcess) {
      group.sort((a, b) => a.id.localeCompare(b.id));
      const master = group[0];
      const duplicates = group.slice(1);
      const duplicateIds = duplicates.map(d => d.id);

      duplicateIds.forEach(id => duplicateIdsToRemove.add(id));

      transactions = transactions.map(t => {
        if (duplicateIds.includes((t as any)[localFkName])) {
          return { ...t, [localFkName]: master.id };
        }
        return t;
      });

      if (type === 'banks') {
        // Bank is now the account, no need to update wallets
      }

      mergedCount += duplicateIds.length;
      deletedCount += duplicateIds.length;

      processedGroups++;
      if (onProgress) onProgress(processedGroups, totalGroups);
      await new Promise(r => setTimeout(r, 10)); // small delay to allow UI to update
    }

    if (deletedCount > 0) {
      items = items.filter(i => !duplicateIdsToRemove.has(i.id));
      saveEntityLocal(keyMap[type], items);
      saveEntityLocal(KEYS.TRANSACTIONS, transactions);
      if (type === 'banks') saveEntityLocal(KEYS.WALLETS, wallets);
    }

    return { merged: mergedCount, deleted: deletedCount };
  },

  async findSimilarGroups(type: string): Promise<Array<{ master: any, duplicates: any[] }>> {
    const items = await this.getRegistry(type);
    const groups: Array<{ master: any, duplicates: any[] }> = [];
    const processed = new Set<string>();
    
    const ignoredKey = `${KEYS.IGNORED_UNIFICATIONS}_${type}`;
    const ignoredPairs: string[] = JSON.parse(localStorage.getItem(ignoredKey) || '[]');

    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    // Ordena por tamanho do nome (menor primeiro) para que o "master" tenda a ser o nome mais curto/limpo
    const sortedItems = [...items].sort((a, b) => a.name.length - b.name.length);

    for (let i = 0; i < sortedItems.length; i++) {
      if (processed.has(sortedItems[i].id)) continue;
      
      const current = sortedItems[i];
      const currentNorm = normalize(current.name);
      if (currentNorm.length < 3) continue; // Evita nomes muito curtos que gerariam muitos falsos positivos

      const group = { master: current, duplicates: [] as any[] };

      for (let j = i + 1; j < sortedItems.length; j++) {
        if (processed.has(sortedItems[j].id)) continue;
        
        const other = sortedItems[j];
        const otherNorm = normalize(other.name);

        // Verifica se este par já foi ignorado
        const pairId = [current.id, other.id].sort().join(':');
        if (ignoredPairs.includes(pairId)) continue;

        // Critério: Um contém o outro (ex: "Petrobras" e "Petrobras S.A.")
        if (otherNorm.includes(currentNorm) || currentNorm.includes(otherNorm)) {
           group.duplicates.push(other);
        }
      }

      if (group.duplicates.length > 0) {
        groups.push(group);
        processed.add(current.id);
        group.duplicates.forEach(d => processed.add(d.id));
      }
    }

    return groups;
  },

  async ignoreUnification(type: string, masterId: string, duplicateIds: string[]): Promise<void> {
    const ignoredKey = `${KEYS.IGNORED_UNIFICATIONS}_${type}`;
    const ignoredPairs: string[] = JSON.parse(localStorage.getItem(ignoredKey) || '[]');
    
    duplicateIds.forEach(dupId => {
      const pairId = [masterId, dupId].sort().join(':');
      if (!ignoredPairs.includes(pairId)) {
        ignoredPairs.push(pairId);
      }
    });

    localStorage.setItem(ignoredKey, JSON.stringify(ignoredPairs));
  },

  async getIgnoredUnifications(type: string): Promise<Array<{ id: string, name1: string, name2: string, pairId: string }>> {
    const items = await this.getRegistry(type);
    const ignoredKey = `${KEYS.IGNORED_UNIFICATIONS}_${type}`;
    const ignoredPairs: string[] = JSON.parse(localStorage.getItem(ignoredKey) || '[]');
    
    const result: any[] = [];
    ignoredPairs.forEach(pairId => {
      const [id1, id2] = pairId.split(':');
      const item1 = items.find(i => i.id === id1);
      const item2 = items.find(i => i.id === id2);
      
      if (item1 && item2) {
        result.push({
          id: pairId,
          name1: item1.name,
          name2: item2.name,
          pairId
        });
      }
    });
    
    return result;
  },

  async removeIgnoredUnification(type: string, pairId: string): Promise<void> {
    const ignoredKey = `${KEYS.IGNORED_UNIFICATIONS}_${type}`;
    let ignoredPairs: string[] = JSON.parse(localStorage.getItem(ignoredKey) || '[]');
    ignoredPairs = ignoredPairs.filter(id => id !== pairId);
    localStorage.setItem(ignoredKey, JSON.stringify(ignoredPairs));
  },

  async mergeItems(type: string, masterId: string, duplicateIds: string[]): Promise<void> {
    const supabase = getSupabase();
    const tableMap: any = { banks: 'banks', categories: 'categories', costCenters: 'cost_centers', participants: 'participants', wallets: 'wallets' };
    const fkMap: any = { banks: 'bank_id', categories: 'category_id', costCenters: 'cost_center_id', participants: 'participant_id', wallets: 'wallet_id' };
    const localFkMap: any = { banks: 'bankId', categories: 'categoryId', costCenters: 'costCenterId', participants: 'participantId', wallets: 'walletId' };
    
    const tableName = tableMap[type];
    const fkName = fkMap[type];
    const localFkName = localFkMap[type];

    if (supabase) {
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ [fkName]: masterId })
        .in(fkName, duplicateIds);
      
      if (updateError) throw new Error(formatSupabaseError(updateError));

      if (type === 'banks') {
        // Bank is now the account, no need to update wallets
      }

      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .in('id', duplicateIds);
      
      if (deleteError) throw new Error(formatSupabaseError(deleteError));
    } else {
      const keyMap: any = { banks: KEYS.BANKS, categories: KEYS.CATEGORIES, costCenters: KEYS.COST_CENTERS, participants: KEYS.PARTICIPANTS, wallets: KEYS.WALLETS };
      let items = getEntityLocal<any>(keyMap[type], []);
      let transactions = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, []);
      let wallets = getEntityLocal<Wallet>(KEYS.WALLETS, []);

      transactions = transactions.map(t => {
        if (duplicateIds.includes((t as any)[localFkName])) {
          return { ...t, [localFkName]: masterId };
        }
        return t;
      });

      if (type === 'banks') {
        // Bank is now the account, no need to update wallets
      }

      items = items.filter(i => !duplicateIds.includes(i.id));
      
      saveEntityLocal(keyMap[type], items);
      saveEntityLocal(KEYS.TRANSACTIONS, transactions);
      if (type === 'banks') saveEntityLocal(KEYS.WALLETS, wallets);
    }

    // Invalida cache
    delete cache.registries[type];
    cache.balances = {};
  },

  async syncAuxiliaryRegistries(): Promise<{ types: number, sectors: number, tickers: number }> {
    const participants = (await this.getRegistry('participants')) as Participant[];
    const stats = { types: 0, sectors: 0, tickers: 0 };
    
    // 1. Sync Asset Types (Participants + Defaults)
    const typesToSync = new Set([
        ...participants.map(p => p.category).filter(Boolean),
        ...INITIAL_DATA.assetTypes.map(t => t.name)
    ]);
    const existingTypes = (await this.getRegistry('assetTypes')) as AssetType[];
    for (const typeName of Array.from(typesToSync)) {
      if (!existingTypes.find(t => t.name.toLowerCase() === typeName.toLowerCase())) {
        await this.saveRegistryItem('assetTypes', { id: '', name: typeName });
        stats.types++;
      }
    }

    // 2. Sync Asset Sectors (Participants + Defaults)
    const sectorsToSync = new Set([
        ...participants.map(p => p.sector).filter(Boolean),
        ...INITIAL_DATA.assetSectors.map(s => s.name)
    ]);
    const existingSectors = (await this.getRegistry('assetSectors')) as AssetSector[];
    for (const sectorName of Array.from(sectorsToSync)) {
      if (!existingSectors.find(s => s.name.toLowerCase() === sectorName.toLowerCase())) {
        await this.saveRegistryItem('assetSectors', { id: '', name: sectorName });
        stats.sectors++;
      }
    }

    // 3. Sync Asset Tickers
    const uniqueTickers = Array.from(new Set(participants.map(p => p.ticker).filter(Boolean))) as string[];
    const existingTickers = (await this.getRegistry('assetTickers')) as AssetTicker[];
    for (const tickerName of uniqueTickers) {
      if (!existingTickers.find(t => t.ticker.toLowerCase() === tickerName.toLowerCase())) {
        await this.saveRegistryItem('assetTickers', { id: '', name: tickerName, ticker: tickerName });
        stats.tickers++;
      }
    }

    return stats;
  },

  async autoFillTickers(): Promise<number> {
    const B3_MAPPING: Record<string, string> = {
      'petrobras': 'PETR4',
      'vale': 'VALE3',
      'itau': 'ITUB4',
      'bradesco': 'BBDC4',
      'ambev': 'ABEV3',
      'banco do brasil': 'BBAS3',
      'magazine luiza': 'MGLU3',
      'magalu': 'MGLU3',
      'weg': 'WEGE3',
      'b3': 'B3SA3',
      'suzano': 'SUZB3',
      'gerdau': 'GGBR4',
      'jbs': 'JBSS3',
      'localiza': 'RENT3',
      'cosan': 'CSAN3',
      'raia drogasil': 'RADL3',
      'natura': 'NTCO3',
      'lojas renner': 'LREN3',
      'btg pactual': 'BPAC11',
      'santander': 'SANB11',
      'eletrobras': 'ELET3',
      'itausa': 'ITSA4',
      'bb seguridade': 'BBSE3',
      'vibra': 'VBBR3',
      'equatorial': 'EQTL3',
      'rumo': 'RAIL3',
      'klabin': 'KLBN11',
      'engie': 'EGIE3',
      'hypera': 'HYPE3',
      'totvs': 'TOTS3',
      'cpfl': 'CPFE3',
      'energisa': 'ENGI11',
      'bradespar': 'BRAP4',
      'azul': 'AZUL4',
      'gol': 'GOLL4',
      'embraer': 'EMBR3',
      'mrv': 'MRVE3',
      'cyrela': 'CYRE3',
      'via': 'VIIA3',
      'casas bahia': 'BHIA3',
      'petrorio': 'PRIO3',
      'prio': 'PRIO3',
      '3r petroleum': 'RRRP3',
      'brava': 'BRAV3',
      'multiplan': 'MULT3',
      'iguatemi': 'IGTI11',
      'brf': 'BRFS3',
      'marfrig': 'MRFG3',
      'slc agricola': 'SLCE3',
      'sao martinho': 'SMTO3',
      'uol': 'UOL',
      'petroleo brasileiro': 'PETR4',
      'itau unibanco': 'ITUB4',
    };

    const participants = (await this.getRegistry('participants')) as Participant[];
    let updatedCount = 0;
    
    for (const p of participants) {
      if (p.ticker) continue;
      
      const normName = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let foundTicker = '';
      
      for (const [key, ticker] of Object.entries(B3_MAPPING)) {
        if (normName.includes(key)) {
          foundTicker = ticker;
          break;
        }
      }
      
      if (foundTicker) {
        await this.saveRegistryItem('participants', { ...p, ticker: foundTicker, currency: p.currency || 'BRL' });
        updatedCount++;
      }
    }
    return updatedCount;
  }
};
