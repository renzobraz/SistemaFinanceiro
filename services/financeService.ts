
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
  UserPreferences,
  AssetAccrual,
  Organization,
  OrganizationMember
} from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Implementação segura e à prova de sandbox do window.localStorage para o ambiente de IFrames do AI Studio
export const safeStorage = (() => {
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

export const DEFAULT_SUPABASE_CONFIG = {
  // Substitui chaves fixadas pelas variáveis de ambiente do Vite
  url: import.meta.env.VITE_SUPABASE_URL || "",
  key: import.meta.env.VITE_SUPABASE_KEY || ""
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
  ASSET_ACCRUALS: 'fincontrol_asset_accruals',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Função utilitária para tentar uma operação assíncrona várias vezes em caso de falha de rede.
 */
async function withRetry<T>(fn: () => Promise<T> | any, retries = 3, interval = 1500): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const isNetworkError = err.message?.includes('fetch') || err.message?.includes('Network') || err.name === 'TypeError';
    if (retries > 0 && isNetworkError) {
      console.warn(`[Supabase] Erro de rede. Tentando novamente em ${interval}ms... (${retries} restantes)`);
      await delay(interval);
      return withRetry(fn, retries - 1, interval * 1.5);
    }
    throw err;
  }
}

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

// Obtém e gerencia a instância do Supabase de forma dinâmica e segura contra variáveis de ambiente nulas no carregamento inicial
const getSupabase = (): SupabaseClient | null => {
  // Buscamos dinamicamente as variáveis de ambiente do Vite ou o fallback
  const url = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_CONFIG.url)?.trim();
  const key = (import.meta.env.VITE_SUPABASE_KEY || DEFAULT_SUPABASE_CONFIG.key)?.trim();

  // Log de diagnóstico detalhado para verificar a disponibilidade das credenciais no frontend
  console.log('[getSupabase] Verificação de credenciais:', {
    hasUrl: !!url,
    urlValue: url || 'Vazio',
    hasKey: !!key,
    keyTruncated: key ? `${key.substring(0, 10)}...` : 'Vazio'
  });

  if (!url || !key) {
    console.warn('[getSupabase] Alerta: URL ou Anon Key do Supabase não configuradas no ambiente do cliente.');
    return null;
  }

  // Se já existir uma instância do cliente configurada com a mesma URL e chave, nós a reaproveitamos
  if (supabaseInstance && lastUrl === url && lastKey === key) {
    return supabaseInstance;
  }

  try {
    console.log(`[getSupabase] Criando e guardando um novo cliente Supabase na memória. URL: "${url}"`);
    supabaseInstance = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: safeStorage as any,
      }
    });
    lastUrl = url;
    lastKey = key;
    return supabaseInstance;
  } catch (e) {
    console.error("[getSupabase] Falha grave ao construir o cliente Supabase pelo createClient:", e);
    return null;
  }
};

const getSupabaseUserId = async (): Promise<string | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch (e) {
    console.warn("Falha ao obter sessão do Supabase:", e);
    return null;
  }
};

const formatSupabaseError = (error: any): string => {
    if (!error) return "Erro desconhecido";
    
    const message = error.message || error.details || JSON.stringify(error) || '';
    const code = error.code ? ` (Code: ${error.code})` : '';
    
    if (message.includes('fetch') || message.includes('Network Error')) {
        return "Falha na conexão com o banco de dados (Supabase). Verifique sua internet ou veja se o projeto no Supabase não está pausado por inatividade.";
    }

    if (error.code === '23503') {
        return "Não é possível excluir este registro pois ele está sendo usado em um ou mais lançamentos financeiros.";
    }

    if (error.code === '42501' || message.includes('permission denied')) {
      return "Permissão Negada (42501). Você precisa executar o código SQL no seu painel do Supabase para configurar as políticas de acesso corretamente.";
    }

    return message + code;
};

const isFallbackError = (e: any): boolean => {
  if (!e) return true;
  const msg = String(e.message || e).toLowerCase();
  const code = String(e.code || '');
  return (
    e.name === 'TypeError' ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('permission denied') ||
    msg.includes('permissão negada') ||
    msg.includes('refresh token') ||
    msg.includes('jwt') ||
    msg.includes('policy') ||
    code === '42501' ||
    code === 'PGRST301' ||
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('42501') ||
    msg.includes('42p01') ||
    msg.includes('pgrst205')
  );
};

const mapTransactionFromDb = (db: any): Transaction => ({
  id: String(db.id),
  date: db.date ? String(db.date).substring(0, 10) : new Date().toISOString().substring(0, 10), // Força YYYY-MM-DD
  description: db.description,
  docNumber: db.doc_number || '',
  value: Number(db.value),
  quantity: db.quantity ? Number(db.quantity) : undefined,
  unitPrice: db.unit_price ? Number(db.unit_price) : undefined,
  type: db.type,
  status: db.status,
  bankId: db.bank_id ? String(db.bank_id) : '',
  categoryId: db.category_id ? String(db.category_id) : '',
  participantId: db.participant_id ? String(db.participant_id) : '',
  costCenterId: db.cost_center_id ? String(db.cost_center_id) : '',
  walletId: db.wallet_id ? String(db.wallet_id) : '',
  linkedId: db.linked_id ? String(db.linked_id) : undefined,
  createdAt: db.created_at || undefined,
  exchangeRate: db.exchange_rate ? Number(db.exchange_rate) : undefined,
  spread: db.spread ? Number(db.spread) : undefined,
  iof: db.iof ? Number(db.iof) : undefined,
  vet: db.vet ? Number(db.vet) : undefined,
  originalValue: db.original_value ? Number(db.original_value) : undefined,
  originalCurrency: db.original_currency || undefined
});

const mapTransactionToDb = (t: Transaction, userId?: string | null, orgId?: string | null) => {
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
  if (userId) payload.user_id = userId;
  
  // Injeta a organização se ativa para isolamento de dados
  if (orgId) payload.organization_id = orgId;

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

// Helper utilitário para limpar metadados de convites antes de renderizar no frontend
function cleanPermissionObject(p: any): any {
  if (!p) return p;
  const cleaned = { ...p };
  cleaned.rawRole = p.role; // Preserva o role bruto original para edição posterior
  if (cleaned.role && cleaned.role.includes(':')) {
    cleaned.role = cleaned.role.split(':')[0];
  }
  if (cleaned.invited_email && cleaned.invited_email.includes('+wperms_')) {
    const parts = cleaned.invited_email.split('+wperms_');
    const domain = cleaned.invited_email.split('@')[1];
    cleaned.invited_email = `${parts[0]}@${domain}`;
  }
  return cleaned;
}

export const financeService = {
  activeOrganizationId: null as string | null,

  setActiveOrganizationId(id: string | null): void {
    this.activeOrganizationId = id;
    // Invalida caches para forçar a recarga dos dados da nova organização ativa
    cache.registries = {};
    cache.balances = {};
  },

  async getMyOrganizations(userId?: string): Promise<Organization[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    try {
      let activeUserId = userId;
      if (!activeUserId) {
        console.log('[getMyOrganizations] Sem userId direto. Obtendo sessão do Supabase...');
        const { data: { session } } = await supabase.auth.getSession();
        activeUserId = session?.user?.id || null;
      }
      
      if (!activeUserId) return [];

      console.log('[getMyOrganizations] Recuperado ID de usuário ativo:', activeUserId);

      let data: any = null;
      let error: any = null;

      try {
        console.log('[getMyOrganizations] Executando RPC com timeout otimizado de 20s...');
        const rpcPromise = supabase.rpc('get_user_organizations', { p_user_id: activeUserId });
        const rpcTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('RPC Timeout após 20 segundos — redirecionando para fallback')), 20000)
        );
        const result = await Promise.race([rpcPromise, rpcTimeout]) as any;
        data = result.data;
        error = result.error;
        console.log('[getMyOrganizations] RPC concluído. Data:', JSON.stringify(data));
      } catch (rpcErr: any) {
        console.warn('[getMyOrganizations] RPC falhou ou timeout, iniciando fallback:', rpcErr.message);
        error = rpcErr;
      }

      if (error || !data || data.length === 0) {
        console.log('[getMyOrganizations] Utilizando Fallback do banco via queries nativas em paralelo...');
        const fallbackData = await this.getMyOrganizationsFallback(activeUserId);
        console.log('[getMyOrganizations] Fallback concluído com sucesso. Total retornado:', fallbackData.length);
        return fallbackData;
      }

      return data as Organization[] || [];
    } catch (e: any) {
      console.error('[getMyOrganizations] Exception no fluxo principal:', e.message);
      try {
        const activeUserId = userId || (await supabase.auth.getSession()).data.session?.user?.id;
        if (activeUserId) {
          return await this.getMyOrganizationsFallback(activeUserId);
        }
      } catch (f: any) {
        console.error('[getMyOrganizations] Fallback final também falhou:', f.message);
      }
      return [];
    }
  },

  async getMyOrganizationsFallback(activeUserId: string): Promise<Organization[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    
    console.log('[getMyOrganizations-Fallback] 🚀 Iniciando queries nativas diretos em PARALELO para mitigar possible Cold Start do Supabase para o usuário:', activeUserId);
    
    try {
      // 1 e 2. Obter organizações que é dono (Q1) e membros associados (Q2) em PARALELO!
      console.log('[getMyOrganizations-Fallback] ⏳ [Passo 1-2/3] Executando Q1 e Q2 em paralelo com timeout unificado de 25s...');
      const q1Promise = supabase
        .from('organizations')
        .select('*')
        .eq('owner_id', activeUserId);

      const q2Promise = supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', activeUserId);

      const fallbackTimeout = new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout de 25 segundos no Q1-Q2 paralelo')), 25000)
      );

      const [q1Result, q2Result] = await Promise.race([
        Promise.all([q1Promise, q2Promise]),
        fallbackTimeout
      ]);

      const ownedData = q1Result.data;
      const ownedError = q1Result.error;
      const membersData = q2Result.data;
      const membersError = q2Result.error;

      if (ownedError) {
        console.warn('[getMyOrganizations-Fallback] ⚠️ Erro ao buscar organizações próprias:', ownedError);
      } else {
        console.log('[getMyOrganizations-Fallback] ✅ Q1 próprio concluído. Total próprio:', ownedData?.length);
      }

      if (membersError) {
        console.warn('[getMyOrganizations-Fallback] ⚠️ Erro ao buscar associações de membros:', membersError);
      } else {
        console.log('[getMyOrganizations-Fallback] ✅ Q2 membros concluído. Total membro:', membersData?.length);
      }

      const orgIds = new Set<string>();
      if (ownedData) {
        ownedData.forEach((org: any) => orgIds.add(org.id));
      }

      const memberOrgIds = (membersData || []).map((m: any) => m.organization_id).filter(Boolean);
      
      let mergedOrgs: Organization[] = ownedData ? [...ownedData] : [];

      if (memberOrgIds.length > 0) {
        const remainingIds = memberOrgIds.filter((id: string) => !orgIds.has(id));
        if (remainingIds.length > 0) {
          console.log('[getMyOrganizations-Fallback] ⏳ [Passo 3/3] Buscando detalhes de organizações de membros externos (Q3) para IDs: ' + remainingIds);
          const q3Promise = supabase
            .from('organizations')
            .select('*')
            .in('id', remainingIds);

          const q3Timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Q3 Timeout (organizations detail) após 20 segundos')), 20000)
          );

          const q3Result = await Promise.race([q3Promise, q3Timeout]) as any;
          const memberOrgs = q3Result.data;
          const memberOrgsError = q3Result.error;

          if (memberOrgsError) {
            console.warn('[getMyOrganizations-Fallback] ⚠️ Erro ao buscar detalhes das organizações de membro:', memberOrgsError);
          } else if (memberOrgs) {
            console.log('[getMyOrganizations-Fallback] ✅ [Passo 3/3] Q3 concluído com sucesso. Total membro detalhe unificado:', memberOrgs.length);
            mergedOrgs = [...mergedOrgs, ...memberOrgs];
          }
        }
      }

      console.log('[getMyOrganizations-Fallback] 🎉 Processo concluído com êxito! Total de organizações consolidadas retornadas:', mergedOrgs.length);
      return mergedOrgs;
    } catch (err: any) {
      console.error('[getMyOrganizations-Fallback] Falha geral no fallback:', err.message);
      return [];
    }
  },

  async createOrganization(name: string): Promise<Organization> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase não configurado");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) throw new Error("Usuário não autenticado");

    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    const orgId = uuidv4();

    // 1. Cria o registro da organização
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        id: orgId,
        name,
        slug,
        owner_id: user.id,
        plan: 'free',
        active: true
      })
      .select()
      .single();

    if (orgError) throw orgError;

    // 2. Associa o usuário atual como criador/membro 'owner' na organização
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        id: uuidv4(),
        organization_id: orgId,
        user_id: user.id,
        role: 'owner'
      });

    if (memberError) {
      console.error("Erro ao criar membro da organização:", memberError);
    }

    return org;
  },

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
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (session?.user) {
          let query = supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', session.user.id);

          if (this.activeOrganizationId) {
            query = query.eq('organization_id', this.activeOrganizationId);
          }

          const { data: settingsData, error } = await query.maybeSingle();

          if (error) throw error;
          if (settingsData) {
            return {
              defaultDateRange: (settingsData.default_period as any) || defaultPrefs.defaultDateRange,
              defaultStatus: (settingsData.default_status as any) || defaultPrefs.defaultStatus,
              defaultBankId: settingsData.default_bank_id || '',
              defaultWalletId: settingsData.default_wallet_id || '',
              defaultPerformanceBankId: settingsData.default_performance_bank_id || 'ALL',
              defaultPerformanceWalletId: settingsData.default_performance_wallet_id || 'ALL',
              defaultTab: settingsData.default_tab || 'dashboard'
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
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (session?.user) {
          const payload: any = {
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

          if (this.activeOrganizationId) {
            payload.organization_id = this.activeOrganizationId;
          }

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
      let query = supabase.from('transactions').select('*').eq('linked_id', linkedId);
      if (this.activeOrganizationId) {
        query = query.eq('organization_id', this.activeOrganizationId);
      }
      const { data, error } = await query;
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

  async resetPassword(email: string): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase não configurado");
    
    // Obter URL de redirecionamento correspondente ao applet (seja dev ou produção)
    const redirectTo = window.location.origin;
    
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) throw error;
    return data;
  },

  async signOut(): Promise<void> {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
      // Limpa caches
      cache.registries = {};
      cache.balances = {};
    }
  },

  async inviteUser(email: string, role: 'viewer' | 'editor' | 'admin' = 'viewer', walletProfiles?: Record<string, string>): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase não configurado");
    
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.user) throw new Error("Usuário não autenticado");

    const mappingString = walletProfiles && Object.keys(walletProfiles).length > 0 ? JSON.stringify(walletProfiles) : null;
    
    let inviteRole: string = role;
    let inviteEmail: string = email.toLowerCase().trim();
    
    if (mappingString) {
      inviteRole = `${role}:${mappingString}`;
    }

    let { error } = await supabase.from('user_permissions').insert({
      owner_id: session.user.id,
      invited_email: inviteEmail,
      role: inviteRole,
      status: 'pending'
    });

    // Se falhar por erro de check constraint de permissão (ex: restrição no campo role), fallback para plus-addressing
    if (error && (error.code === '23514' || error.message?.includes('check constraint') || error.message?.toLowerCase().includes('viola'))) {
      console.warn("Retrying invitation using email plus-address fallback due to role CHECK constraint.");
      
      inviteRole = role; // Volta para o role padrão
      
      if (mappingString) {
        // Codifica o mapeamento em base64 (sem caracteres especiais)
        const base64Mapping = btoa(unescape(encodeURIComponent(mappingString))).replace(/=/g, '');
        const [localPart, domainPart] = email.split('@');
        inviteEmail = `${localPart.toLowerCase().trim()}+wperms_${base64Mapping}@${domainPart.trim()}`;
      }

      const retryRes = await supabase.from('user_permissions').insert({
        owner_id: session.user.id,
        invited_email: inviteEmail,
        role: inviteRole,
        status: 'pending'
      });
      error = retryRes.error;
    }

    if (error) throw error;

    // Enviar e-mail via servidor backend
    try {
      await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Envia o token de autenticação JWT do Supabase no cabeçalho
          'Authorization': `Bearer ${session.access_token}`
        },
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
    
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.user) return [];

    const activeOrganizationId = this.activeOrganizationId;
    if (!activeOrganizationId) return [];

    const { data: permissionsData, error } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('organization_id', activeOrganizationId);

    if (error) throw error;
    return (permissionsData || []).map(p => cleanPermissionObject(p));
  },

  async getInvitationsSentToMe(): Promise<UserPermission[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.user?.email) return [];

    const emailToSearch = session.user.email.toLowerCase().trim();
    const [local, domain] = emailToSearch.split('@');

    // Busca convites diretos para o email, ou convites plus-addressed com metadados codificados
    const { data: permissionsDataSent, error } = await supabase
      .from('user_permissions')
      .select('*')
      .or(`invited_email.eq.${emailToSearch},invited_email.ilike.${local}+wperms_%@${domain}`);

    if (error) throw error;
    return (permissionsDataSent || []).map(p => cleanPermissionObject(p));
  },

  async acceptInvitation(invitationId: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase não configurado");

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session?.user) throw new Error("Usuário não autenticado");

    // 1. Busca as informações originais do convite antes de aceitar
    const { data: invitation, error: getErr } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('id', invitationId)
      .single();

    if (getErr || !invitation) {
      throw new Error("Convite não encontrado ou sem permissão de acesso");
    }

    // 2. Tenta fazer o parse do mapeamento {wallet_id: profile_id}
    let walletProfiles: Record<string, string> = {};
    
    if (invitation.role && invitation.role.includes(':')) {
      try {
        const jsonPart = invitation.role.substring(invitation.role.indexOf(':') + 1);
        walletProfiles = JSON.parse(jsonPart);
      } catch (err) {
        console.warn("Falha no parse do mapeamento de carteiras no role:", err);
      }
    } else if (invitation.invited_email && invitation.invited_email.includes('+wperms_')) {
      try {
        const start = invitation.invited_email.indexOf('+wperms_') + 8;
        const end = invitation.invited_email.indexOf('@');
        const encoded = invitation.invited_email.substring(start, end);
        const jsonStr = decodeURIComponent(escape(atob(encoded)));
        walletProfiles = JSON.parse(jsonStr);
      } catch (err) {
        console.warn("Falha no parse do mapeamento de carteiras no email:", err);
      }
    }

    // 3. Atualiza status no user_permissions para ativo e anexa o IDs de usuário no mapeamento do role
    const mappingWithUserId = { ...walletProfiles, _user_id: session.user.id };
    const updatedRole = invitation.role && invitation.role.includes(':') 
      ? `${invitation.role.split(':')[0]}:${JSON.stringify(mappingWithUserId)}`
      : `${invitation.role || 'viewer'}:${JSON.stringify(mappingWithUserId)}`;

    const { error } = await supabase
      .from('user_permissions')
      .update({ 
        status: 'active',
        role: updatedRole
      })
      .eq('id', invitationId);

    if (error) throw error;

    // 4. Se houver mapeamentos de carteiras com perfis, insere em user_wallet_permissions
    if (walletProfiles && Object.keys(walletProfiles).length > 0) {
      const firstProfileId = Object.values(walletProfiles)[0];
      let orgId = this.activeOrganizationId || '';

      // Tenta recuperar orgId consultando a tabela organization_profiles para o primeiro profile_id mapeado
      if (firstProfileId && !orgId) {
        const { data: profileObj } = await supabase
          .from('organization_profiles')
          .select('organization_id')
          .eq('id', firstProfileId)
          .maybeSingle();
        if (profileObj?.organization_id) {
          orgId = profileObj.organization_id;
        }
      }

      if (orgId) {
        const inserts = Object.entries(walletProfiles)
          .filter(([key]) => !key.startsWith('_'))
          .map(([walletId, profileId]) => ({
            organization_id: orgId,
            user_id: session.user.id,
            wallet_id: walletId,
            profile_id: profileId
          }));

        if (inserts.length > 0) {
          const { error: insertErr } = await supabase
            .from('user_wallet_permissions')
            .insert(inserts);

          if (insertErr) {
            console.error("Erro ao salvar vínculos em user_wallet_permissions:", insertErr);
          }
        }
      }
    }
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

  async getAssetAccruals(assetId?: string): Promise<AssetAccrual[]> {
    const supabase = getSupabase();
    let supabaseData: AssetAccrual[] = [];

    if (supabase) {
      console.log(`[Rastreamento] [financeService.getAssetAccruals] Buscando acréscimos de ativos no Supabase. activeOrganizationId atual: ${this.activeOrganizationId}`);
      if (!this.activeOrganizationId) {
        console.warn("[Rastreamento] [financeService.getAssetAccruals] Bloqueando busca de acréscimos: activeOrganizationId nulo no Supabase. Retornando vazio.");
        return [];
      }
      try {
        let query = supabase.from('asset_accruals').select('*');
        if (assetId) query = query.eq('asset_id', assetId);
        if (this.activeOrganizationId) {
          query = query.eq('organization_id', this.activeOrganizationId);
        }
        const { data, error } = await query.order('date', { ascending: false });
        if (error) {
          if (error.code === 'PGRST204' || error.code === '42P01') {
             console.warn("Tabela asset_accruals não encontrada no Supabase.");
          } else {
             console.error("Erro ao buscar acréscimos no Supabase:", error);
             throw error;
          }
        } else {
          supabaseData = (data || []).map(d => ({
            id: String(d.id),
            assetId: String(d.asset_id),
            bankId: d.bank_id ? String(d.bank_id) : '',
            date: d.date,
            value: Number(d.value),
            description: d.description || '',
            createdAt: d.created_at
          }));
          console.log(`[DEBUG] Acréscimos carregados do Supabase:`, supabaseData.length);
        }
      } catch (e) {
        console.warn("Falha ao buscar acréscimos no Supabase, usando local", e);
      }
    }

    const localData = getEntityLocal<AssetAccrual>(KEYS.ASSET_ACCRUALS, []);
    
    // Mesclar dados locais e remotos para garantir que o usuário não perca dados
    const mergedMap = new Map<string, AssetAccrual>();
    
    // 1. Adicionar locais
    localData.forEach(item => {
      if (item && item.id) mergedMap.set(String(item.id), item);
    });
    
    // 2. Sobreescrever com Supabase
    supabaseData.forEach(item => {
      if (item && item.id) mergedMap.set(String(item.id), item);
    });

    const finalResult = Array.from(mergedMap.values()).sort((a,b) => b.date.localeCompare(a.date));
    console.log(`[DEBUG] Total de acréscimos (Supabase + Local):`, finalResult.length);
    
    return finalResult;
  },

  async saveAssetAccrual(accrual: AssetAccrual): Promise<AssetAccrual> {
    const itemToSave = {
      ...accrual,
      id: (accrual.id && accrual.id.trim() !== '' && accrual.id !== 'undefined') ? accrual.id : uuidv4(),
      createdAt: accrual.createdAt || new Date().toISOString()
    };

    console.log('[DEBUG] Preparando para salvar acréscimo manual:', {
      id: itemToSave.id,
      assetId: itemToSave.assetId,
      bankId: itemToSave.bankId || 'NULL',
      value: itemToSave.value,
      date: itemToSave.date
    });

    const supabase = getSupabase();
    if (supabase) {
      try {
        const payload = {
          id: itemToSave.id,
          asset_id: itemToSave.assetId,
          bank_id: (itemToSave.bankId && String(itemToSave.bankId).trim() !== '' && String(itemToSave.bankId) !== 'undefined') ? String(itemToSave.bankId) : null,
          date: itemToSave.date,
          value: itemToSave.value,
          description: itemToSave.description,
          created_at: itemToSave.createdAt,
          organization_id: this.activeOrganizationId || undefined
        };
        const userId = await getSupabaseUserId();
        if (userId) (payload as any).user_id = userId;

        const { error } = await supabase.from('asset_accruals').upsert(payload);
        if (error) {
           console.error("Erro ao salvar acréscimo no Supabase:", error);
           // Se não for erro de tabela inexistente, lançamos para o usuário saber
           if (error.code !== 'PGRST204' && error.code !== '42P01') {
             throw error;
           }
        }
      } catch (e) {
        console.warn("Falha ao salvar acréscimo no Supabase, mantendo local", e);
      }
    }

    const list = getEntityLocal<AssetAccrual>(KEYS.ASSET_ACCRUALS, []);
    const index = list.findIndex(a => String(a.id) === String(itemToSave.id));
    if (index >= 0) {
      list[index] = itemToSave;
    } else {
      list.push(itemToSave);
    }
    saveEntityLocal(KEYS.ASSET_ACCRUALS, list);
    return itemToSave;
  },

  async deleteAssetAccrual(id: string): Promise<void> {
    const supabase = getSupabase();
    if (supabase) {
      let query = supabase.from('asset_accruals').delete().eq('id', id);
      if (this.activeOrganizationId) {
        query = query.eq('organization_id', this.activeOrganizationId);
      }
      const { error } = await query;
      if (error) {
        console.error("Erro ao excluir acréscimo no Supabase:", error);
        throw new Error(formatSupabaseError(error));
      }
    }

    let list = getEntityLocal<AssetAccrual>(KEYS.ASSET_ACCRUALS, []);
    list = list.filter(a => String(a.id) !== String(id));
    saveEntityLocal(KEYS.ASSET_ACCRUALS, list);
  },

  async getSmtpSettings(): Promise<SmtpSettings | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.user) return null;

    const response = await fetch('/api/smtp-settings', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const detailedMessage = errData.details 
        ? `${errData.error || 'Erro'}: ${errData.details}` 
        : (errData.error || `Erro do servidor (${response.status}) ao buscar SMTP_SETTINGS.`);
      throw new Error(detailedMessage);
    }

    return response.json();
  },

  async saveSmtpSettings(settings: Omit<SmtpSettings, 'id' | 'user_id'>): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase não configurado");

    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.user) throw new Error("Usuário não autenticado");

    const response = await fetch('/api/smtp-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(settings)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const detailedMessage = errData.details 
        ? `${errData.error || 'Erro'}: ${errData.details}` 
        : (errData.error || `Erro do servidor (${response.status}) ao salvar SMTP_SETTINGS.`);
      throw new Error(detailedMessage);
    }
  },

  async getTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
    const supabase = getSupabase();

    if (supabase) {
      console.log(`[Rastreamento] [financeService.getTransactions] Iniciando consulta de transações no Supabase. activeOrganizationId atual: ${this.activeOrganizationId}`);
      if (!this.activeOrganizationId) {
        console.warn("[Rastreamento] [financeService.getTransactions] Bloqueando consulta: activeOrganizationId nulo no Supabase. Retornando array vazio.");
        return [];
      }
      try {
        const { data } = await withRetry<any>(() => supabase.auth.getSession());
        const session = data?.session;
        const userId = session?.user?.id;
        let query = supabase.from('transactions').select('*');
        
        // Comentado para permitir que o RLS do Supabase decida o que o usuário pode ver 
        // (Isso habilita o acesso a dados compartilhados por outros usuários)
        // if (userId) query = query.eq('user_id', userId);

        // Aplicar filtros no servidor
        // (Serão aplicados individualmente no loop de paginação abaixo)

        let allData: any[] = [];
        let from = 0;
        let to = 999;
        let finished = false;

        let serverSideFilteringActive = true;
        while (!finished) {
          // Range é aplicado sobre a query já filtrada
          let query = supabase.from('transactions').select('*');
          
          if (this.activeOrganizationId) {
            query = query.eq('organization_id', this.activeOrganizationId);
          }
          
          if (filters?.startDate && filters.startDate.trim() !== '') query = query.gte('date', filters.startDate);
          if (filters?.endDate && filters.endDate.trim() !== '') query = query.lte('date', filters.endDate);
          if (filters?.bankId && filters.bankId.trim() !== '') query = query.eq('bank_id', filters.bankId);
          
          if (filters?.walletId && filters.walletId !== 'ALL' && serverSideFilteringActive) {
            if (filters.walletId === 'GLOBAL') {
              query = query.is('wallet_id', null);
            } else {
              query = query.eq('wallet_id', filters.walletId);
            }
          }

          if (filters?.status && filters.status !== 'ALL') query = query.eq('status', filters.status);
          if (filters?.docNumber && filters.docNumber.trim() !== '') query = query.eq('doc_number', filters.docNumber);

          const { data, error } = await withRetry<any>(() => (query
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .range(from, to) as any));

          if (error) {
            if (error.code === '42703' && serverSideFilteringActive) {
                console.warn("Coluna wallet_id não encontrada na tabela transactions. Alternando para filtro em memória.");
                serverSideFilteringActive = false;
                allData = [];
                from = 0;
                to = 999;
                continue;
            }
            throw new Error(formatSupabaseError(error));
          }
          
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
        let mappedData = allData.map(mapTransactionFromDb);
        if (!serverSideFilteringActive && filters?.walletId && filters.walletId !== 'ALL') {
            if (filters.walletId === 'GLOBAL') {
              mappedData = mappedData.filter(t => !t.walletId);
            } else {
              mappedData = mappedData.filter(t => t.walletId === filters.walletId);
            }
        }
        return mappedData;
      } catch (e: any) {
        // Silencia o erro para aviso, pois o fallback local é o comportamento padrão sem configuração
        console.warn("Dica: Supabase não conectado (usando dados locais). Isso é normal se você ainda não configurou as chaves do banco de dados.");
        
        const isFallback = 
          !e || 
          e.name === 'TypeError' || 
          e.message?.includes('fetch') || 
          e.message?.includes('network') ||
          e.code === '42501' ||
          e.code === 'PGRST301' ||
          e.message?.toLowerCase().includes('permission denied') ||
          e.message?.toLowerCase().includes('permissão negada') ||
          e.message?.toLowerCase().includes('refresh token') ||
          e.message?.toLowerCase().includes('jwt');

        if (isFallback) {
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
            if (filters.walletId && filters.walletId !== 'ALL') {
              if (filters.walletId === 'GLOBAL') {
                localData = localData.filter(t => !t.walletId || t.walletId === '');
              } else {
                localData = localData.filter(t => t.walletId === filters.walletId);
              }
            }
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
      console.log(`[Rastreamento] [financeService.getBalancesBefore] Iniciando cálculo de saldo no Supabase. activeOrganizationId atual: ${this.activeOrganizationId}`);
      if (!this.activeOrganizationId) {
        console.warn("[Rastreamento] [financeService.getBalancesBefore] Bloqueando consulta de saldo anterior: activeOrganizationId nulo no Supabase. Retornando saldos zerados.");
        return { total: 0, byBank: {} };
      }
      try {
        // Verifica cache
        const cached = cache.balances[cacheKey];
        if (cached && (Date.now() - cached.timestamp < cache.TTL)) {
            return cached.data;
        }

        let from = 0;
        let to = 999;
        let finished = false;

        let serverSideFilteringActive = true;
        while (!finished) {
            let query = supabase
                .from('transactions')
                .select('value, type, bank_id, wallet_id')
                .eq('status', 'PAID')
                .lt('date', dateLimit);

            if (this.activeOrganizationId) {
                query = query.eq('organization_id', this.activeOrganizationId);
            }

            if (bankId) query = query.eq('bank_id', bankId);
            if (walletId && walletId !== 'ALL' && serverSideFilteringActive) {
              if (walletId === 'GLOBAL') {
                query = query.is('wallet_id', null);
              } else {
                query = query.eq('wallet_id', walletId);
              }
            }

            const { data, error } = await query.range(from, to);
            if (error) { 
                if (error.code === '42703' && serverSideFilteringActive) {
                    serverSideFilteringActive = false;
                    rows = [];
                    from = 0;
                    to = 999;
                    continue;
                }
                console.error(error); 
                break; 
            }
            if (!data || data.length === 0) {
                finished = true;
            } else {
                rows = [...rows, ...data];
                if (data.length < 1000) finished = true;
                else { from += 1000; to += 1000; }
            }
        }
        
        // Filtro em memória se necessário
        if (!serverSideFilteringActive && walletId && walletId !== 'ALL') {
            if (walletId === 'GLOBAL') {
                rows = rows.filter(r => !r.wallet_id);
            } else {
                rows = rows.filter(r => r.wallet_id === walletId);
            }
        }
      } catch (e: any) {
        console.error("Supabase balance fetch failed", e);
        
        const isFallback = 
          !e || 
          e.name === 'TypeError' || 
          e.message?.includes('fetch') || 
          e.message?.includes('network') ||
          e.code === '42501' ||
          e.code === 'PGRST301' ||
          e.message?.toLowerCase().includes('permission denied') ||
          e.message?.toLowerCase().includes('permissão negada') ||
          e.message?.toLowerCase().includes('refresh token') ||
          e.message?.toLowerCase().includes('jwt');

        if (isFallback) {
          // Fallback logic below
          const local = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
          rows = local.filter(t => 
              t.status === 'PAID' && 
              t.date < dateLimit &&
              (!bankId || t.bankId === bankId) &&
              (!walletId || walletId === 'ALL' || (walletId === 'GLOBAL' ? (!t.walletId || t.walletId === '') : t.walletId === walletId))
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
            (!walletId || walletId === 'ALL' || (walletId === 'GLOBAL' ? (!t.walletId || t.walletId === '') : t.walletId === walletId))
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
        const userId = await getSupabaseUserId();
        const payload = mapTransactionToDb(transactionToSave, userId, this.activeOrganizationId);
        const { data, error } = await supabase.from('transactions').upsert(payload).select().single();
        if (error) throw new Error(formatSupabaseError(error));
        return mapTransactionFromDb(data);
      } catch (e: any) {
        console.error("Supabase save failed, falling back to local data", e);
        
        const isFallback = 
          !e || 
          e.name === 'TypeError' || 
          e.message?.includes('fetch') || 
          e.message?.includes('network') ||
          e.code === '42501' ||
          e.code === 'PGRST301' ||
          e.message?.toLowerCase().includes('permission denied') ||
          e.message?.toLowerCase().includes('permissão negada') ||
          e.message?.toLowerCase().includes('refresh token') ||
          e.message?.toLowerCase().includes('jwt');

        if (isFallback) {
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
        const userId = await getSupabaseUserId();
        const payloads = transactionsWithIds.map(t => mapTransactionToDb(t, userId, this.activeOrganizationId));
        const { data, error } = await supabase.from('transactions').upsert(payloads).select();
        if (error) throw new Error(formatSupabaseError(error));
        return (data || []).map(mapTransactionFromDb);
      } catch (e: any) {
        console.error("Supabase bulk save failed, falling back to local data", e);
        
        const isFallback = 
          !e || 
          e.name === 'TypeError' || 
          e.message?.includes('fetch') || 
          e.message?.includes('network') ||
          e.code === '42501' ||
          e.code === 'PGRST301' ||
          e.message?.toLowerCase().includes('permission denied') ||
          e.message?.toLowerCase().includes('permissão negada') ||
          e.message?.toLowerCase().includes('refresh token') ||
          e.message?.toLowerCase().includes('jwt');

        if (isFallback) {
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
        let query = supabase.from('transactions').delete().in('id', ids);
        if (this.activeOrganizationId) {
          query = query.eq('organization_id', this.activeOrganizationId);
        }
        const { error } = await query;
        if (error) throw new Error(formatSupabaseError(error));
        return;
      } catch (e: any) {
        console.error("Supabase delete failed, falling back to local data", e);
        
        const isFallback = 
          !e || 
          e.name === 'TypeError' || 
          e.message?.includes('fetch') || 
          e.message?.includes('network') ||
          e.code === '42501' ||
          e.code === 'PGRST301' ||
          e.message?.toLowerCase().includes('permission denied') ||
          e.message?.toLowerCase().includes('permissão negada') ||
          e.message?.toLowerCase().includes('refresh token') ||
          e.message?.toLowerCase().includes('jwt');

        if (isFallback) {
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
        
        const isFallback = 
          !e || 
          e.name === 'TypeError' || 
          e.message?.includes('fetch') || 
          e.message?.includes('network') ||
          e.code === '42501' ||
          e.code === 'PGRST301' ||
          e.message?.toLowerCase().includes('permission denied') ||
          e.message?.toLowerCase().includes('permissão negada') ||
          e.message?.toLowerCase().includes('refresh token') ||
          e.message?.toLowerCase().includes('jwt');

        if (isFallback) {
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

  async updateTransactionsDate(ids: string[], date: string): Promise<void> {
    const supabase = getSupabase();
    
    // Invalida cache de saldos (a data influencia o saldo acumulado por período)
    cache.balances = {};

    if (supabase) {
      try {
        const { error } = await supabase
          .from('transactions')
          .update({ date })
          .in('id', ids);
        
        if (error) throw new Error(formatSupabaseError(error));
        return;
      } catch (e: any) {
        console.error("Supabase update date failed, falling back to local data", e);
        
        const isFallback = 
          !e || 
          e.name === 'TypeError' || 
          e.message?.includes('fetch') || 
          e.message?.includes('network') ||
          e.code === '42501' ||
          e.code === 'PGRST301' ||
          e.message?.toLowerCase().includes('permission denied') ||
          e.message?.toLowerCase().includes('permissão negada') ||
          e.message?.toLowerCase().includes('refresh token') ||
          e.message?.toLowerCase().includes('jwt');

        if (isFallback) {
          // Fall through to local fallback
        } else {
          throw e;
        }
      }
    }

    await delay(300);
    const list = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
    const updatedList = list.map(t => ids.includes(t.id) ? { ...t, date } : t);
    saveEntityLocal(KEYS.TRANSACTIONS, updatedList);
  },

  async updateTransactionsValue(ids: string[], value: number): Promise<void> {
    const supabase = getSupabase();
    
    // Invalida cache de saldos
    cache.balances = {};

    if (supabase) {
      try {
        const { error } = await supabase
          .from('transactions')
          .update({ value })
          .in('id', ids);
        
        if (error) throw new Error(formatSupabaseError(error));
        return;
      } catch (e: any) {
        console.error("Supabase update value failed, falling back to local data", e);
        
        const isFallback = 
          !e || 
          e.name === 'TypeError' || 
          e.message?.includes('fetch') || 
          e.message?.includes('network') ||
          e.code === '42501' ||
          e.code === 'PGRST301' ||
          e.message?.toLowerCase().includes('permission denied') ||
          e.message?.toLowerCase().includes('permissão negada') ||
          e.message?.toLowerCase().includes('refresh token') ||
          e.message?.toLowerCase().includes('jwt');

        if (isFallback) {
          // Fall through to local fallback
        } else {
          throw e;
        }
      }
    }

    await delay(300);
    const list = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
    const updatedList = list.map(t => ids.includes(t.id) ? { ...t, value: Number(value) } : t);
    saveEntityLocal(KEYS.TRANSACTIONS, updatedList);
  },

  async getRegistry<T extends BaseEntity>(type: string, forceRefresh = false, walletId?: string): Promise<T[]> {
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
      console.log(`[Rastreamento] [financeService.getRegistry] Buscando cadastros do tipo '${type}' no Supabase. activeOrganizationId atual: ${this.activeOrganizationId}`);
      if (!this.activeOrganizationId) {
        console.warn(`[Rastreamento] [financeService.getRegistry] Bloqueando busca de cadastros para '${type}': activeOrganizationId nulo no Supabase. Retornando array vazio.`);
        return [];
      }
      try {
        // Invalida cache se mudar a carteira ou se for refresh forçado
        const currentCache = cache.registries[type];
        const cacheToken = `${type}_${walletId || 'global'}`;
        
        if (!forceRefresh && currentCache && (Date.now() - currentCache.timestamp < cache.TTL)) {
          // Nota: cache.registries precisa ser mais inteligente para lidar com walletId
          // Por simplicidade, vou usar o cacheKey no cache.registries
        }

        // Refatorar cache para suportar walletId
        const cacheKey = `${type}_${walletId || 'global'}`;
        const cached = (cache.registries as any)[cacheKey];
        if (!forceRefresh && cached && (Date.now() - cached.timestamp < cache.TTL)) {
          return cached.data as T[];
        }

        const { data } = await withRetry<any>(() => supabase.auth.getSession());
        const session = data?.session;
        const userId = session?.user?.id;

        let allData: any[] = [];
        let from = 0;
        let to = 999;
        let finished = false;
        let serverSideFilteringActive = true;

        while (!finished) {
          let query = supabase
            .from(tableMap[type])
            .select('*');
          
          if (this.activeOrganizationId) {
            query = query.eq('organization_id', this.activeOrganizationId);
          }
          
          if (walletId && walletId !== 'ALL' && type !== 'wallets' && serverSideFilteringActive) {
            if (walletId === 'GLOBAL') {
              query = query.is('wallet_id', null);
            } else {
              query = query.eq('wallet_id', walletId);
            }
          }

          const { data, error } = await withRetry<any>(() => (query
            .order('name')
            .order('id')
            .range(from, to) as any));

          if (error) {
            // Detecta erro 42703 (coluna indefinida - especificamente wallet_id)
            if (error.code === '42703' && serverSideFilteringActive) {
              console.warn(`Coluna wallet_id não encontrada na tabela ${tableMap[type]}. Alternando para filtro em memória.`);
              serverSideFilteringActive = false;
              allData = [];
              from = 0;
              to = 999;
              continue; // Tenta novamente sem o filtro de wallet_id na query
            }
            throw new Error(formatSupabaseError(error));
          }
          
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
            id: String(d.id), 
            name: d.name, 
            type: d.type || 'CHECKING', 
            currency: d.currency || 'BRL',
            active: d.active !== false,
            walletId: d.wallet_id
          })) as any;
        } else if (type === 'wallets') {
          result = allData.map((d: any) => ({ 
            id: String(d.id), 
            name: d.name,
            active: d.active !== false
          })) as any;
        } else if (type === 'participants') {
          const virtualTargetPrices = JSON.parse(localStorage.getItem('fincontrol_virtual_target_prices') || '{}');
          const virtualPartnerData = JSON.parse(localStorage.getItem('fincontrol_virtual_partner_data') || '{}');
          result = allData.map((d: any) => ({ 
            id: String(d.id), 
            name: d.name, 
            category: d.category,
            sector: d.sector,
            ticker: d.ticker,
            currency: d.currency || 'BRL',
            currentPrice: d.current_price,
            targetPrice: d.target_price !== undefined ? d.target_price : virtualTargetPrices[d.id],
            lastUpdate: d.last_update,
            active: d.active !== false,
            walletId: d.wallet_id,
            isPartner: virtualPartnerData[d.id]?.isPartner || false,
            sharePercent: virtualPartnerData[d.id]?.sharePercent || 0,
            cashSharePercent: virtualPartnerData[d.id]?.cashSharePercent || 0
          })) as any;
        } else if (type === 'assetTickers') {
          result = allData.map((d: any) => ({
            id: String(d.id),
            name: d.name,
            ticker: d.ticker,
            active: d.active !== false,
            walletId: d.wallet_id
          })) as any;
        } else {
          result = Array.from(new Map(allData.map(item => [String(item.id), { 
            ...item, 
            id: String(item.id), 
            active: item.active !== false, 
            walletId: item.wallet_id 
          }])).values()) as T[];
        }

        // Se a filtragem no servidor falhou/não foi possível para wallet_id, filtra aqui na memória
        if (!serverSideFilteringActive && walletId && walletId !== 'ALL' && type !== 'wallets') {
          if (walletId === 'GLOBAL') {
            result = result.filter(item => !(item as any).walletId);
          } else {
            result = result.filter(item => (item as any).walletId === walletId);
          }
        }

        // Atualiza cache em memória
        (cache.registries as any)[cacheKey] = { data: result, timestamp: Date.now() };

        // Salva no localStorage para persistência entre sessões
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
        // Se estiver filtrado por carteira, não sobrescrevemos o cache local global
        // para não "limpar" os dados de outras carteiras offline.
        // Mas por simplicidade do app atual, vamos manter o comportamento padrão.
        saveEntityLocal(keyMap[type], result);

        return result;
      } catch (e: any) {
        if (isFallbackError(e)) {
          console.warn(`Supabase registry fetch failed for ${type} (falling back to local data):`, e.message || e);
        } else {
          console.error(`Supabase registry fetch failed for ${type}`, e);
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
    let localData = getEntityLocal(keyMap[type], (INITIAL_DATA as any)[type]) as T[];
    
    if (walletId && walletId !== 'ALL' && type !== 'wallets') {
      localData = localData.filter(i => (i as any).walletId === walletId);
    }
    
    return localData;
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

    // Invalida caches de registros (limpa tudo para garantir)
    cache.registries = {};

    if (supabase) {
      if (!this.activeOrganizationId) {
        console.warn(`[Rastreamento] [financeService.saveRegistryItem] Bloqueando inserção remota de '${type}' no Supabase: activeOrganizationId nulo.`);
        throw new Error("Não foi possível salvar os registros no Supabase porque nenhuma organização ativa foi definida para esta conta.");
      }
      try {
        const payload: any = { 
          name: itemToSave.name, 
          id: itemToSave.id, 
          active: itemToSave.active !== false,
          wallet_id: ((item as any).walletId && (item as any).walletId !== 'ALL') ? (item as any).walletId : null
        };
        if (this.activeOrganizationId) {
          payload.organization_id = this.activeOrganizationId;
        }
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
        
        const userId = await getSupabaseUserId();
        if (userId) payload.user_id = userId;

        let { data, error } = await supabase.from(tableMap[type]).upsert(payload).select().single();
        
        // Fallback para quando colunas opcionais não existem no Supabase (Erro PGRST204 ou 42703)
        if (error && (error.code === 'PGRST204' || error.code === '42703')) {
            const errorMsg = (error.message || "").toLowerCase();
            const isMissingActive = errorMsg.includes("active");
            const isMissingTargetPrice = errorMsg.includes("target_price");
            const isMissingWalletId = errorMsg.includes("wallet_id") || error.code === '42703';

            if (isMissingActive || isMissingTargetPrice || isMissingWalletId) {
                console.warn(`Colunas não encontradas no Supabase (${tableMap[type]}). Aplicando fallback seguro.`);
                const cleanPayload = { ...payload };
                if (isMissingActive) delete cleanPayload.active;
                if (isMissingWalletId) delete cleanPayload.wallet_id;
                
                if (type === 'participants') {
                    const virtualTargetPrices = JSON.parse(localStorage.getItem('fincontrol_virtual_target_prices') || '{}');
                    if ((item as any).targetPrice !== undefined) {
                        virtualTargetPrices[itemToSave.id] = (item as any).targetPrice;
                        localStorage.setItem('fincontrol_virtual_target_prices', JSON.stringify(virtualTargetPrices));
                    }
                    delete cleanPayload.target_price;
                }
                
                const retry = await supabase.from(tableMap[type]).upsert(cleanPayload).select().single();
                data = retry.data;
                error = retry.error;
            }
        }
        if (error) throw new Error(formatSupabaseError(error));
        
        // Salvar dados virtuais de participantes
        if (type === 'participants') {
            const virtualTargetPrices = JSON.parse(localStorage.getItem('fincontrol_virtual_target_prices') || '{}');
            if ((item as any).targetPrice !== undefined) {
                virtualTargetPrices[itemToSave.id] = (item as any).targetPrice;
                localStorage.setItem('fincontrol_virtual_target_prices', JSON.stringify(virtualTargetPrices));
            }

            const virtualPartnerData = JSON.parse(localStorage.getItem('fincontrol_virtual_partner_data') || '{}');
            if ((item as any).isPartner !== undefined) {
                virtualPartnerData[itemToSave.id] = {
                    isPartner: (item as any).isPartner,
                    sharePercent: (item as any).sharePercent,
                    cashSharePercent: (item as any).cashSharePercent
                };
                localStorage.setItem('fincontrol_virtual_partner_data', JSON.stringify(virtualPartnerData));
            }
        }
        
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

        let result: T;
        if (type === 'wallets') {
          result = { id: data.id, name: data.name, bankId: data.bank_id, currency: data.currency, type: data.type } as any;
        } else if (type === 'participants') {
            const virtualTargetPrices = JSON.parse(localStorage.getItem('fincontrol_virtual_target_prices') || '{}');
            const virtualPartnerData = JSON.parse(localStorage.getItem('fincontrol_virtual_partner_data') || '{}');
            result = { 
                id: data.id, 
                name: data.name, 
                category: data.category,
                sector: data.sector,
                ticker: data.ticker,
                currency: data.currency,
                currentPrice: data.current_price,
                targetPrice: data.target_price !== undefined ? data.target_price : virtualTargetPrices[data.id],
                lastUpdate: data.last_update,
                walletId: data.wallet_id,
                isPartner: virtualPartnerData[data.id]?.isPartner || false,
                sharePercent: virtualPartnerData[data.id]?.sharePercent || 0,
                cashSharePercent: virtualPartnerData[data.id]?.cashSharePercent || 0
            } as any;
        } else if (type === 'assetTickers') {
            result = {
                id: data.id,
                name: data.name,
                ticker: data.ticker,
                walletId: data.wallet_id
            } as any;
        } else {
          result = { ...data, id: String(data.id), walletId: data.wallet_id } as T;
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
        if (isFallbackError(e)) {
          console.warn(`Supabase registry save failed for ${type} (falling back to local data):`, e.message || e);
        } else {
          console.error(`Supabase registry save failed for ${type}`, e);
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
          let checkQuery = supabase.from('transactions').select('*', { count: 'exact', head: true }).eq(fkName, id);
          if (this.activeOrganizationId) {
            checkQuery = checkQuery.eq('organization_id', this.activeOrganizationId);
          }
          const { count, error: checkError } = await checkQuery;
          if (checkError) throw checkError;
          if (count && count > 0) {
            throw new Error(`Não é possível excluir este registro pois ele possui ${count} lançamentos vinculados.`);
          }
        }

        if (type === 'banks') {
          let checkQuery = supabase.from('wallets').select('*', { count: 'exact', head: true }).eq('bank_id', id);
          if (this.activeOrganizationId) {
            checkQuery = checkQuery.eq('organization_id', this.activeOrganizationId);
          }
          const { count, error: checkError } = await checkQuery;
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
            let checkQuery = supabase.from('participants').select('*', { count: 'exact', head: true }).eq(column, item.name);
            if (this.activeOrganizationId) {
              checkQuery = checkQuery.eq('organization_id', this.activeOrganizationId);
            }
            const { count, error: checkError } = await checkQuery;
            if (checkError) throw checkError;
            if (count && count > 0) {
              throw new Error(`Não é possível excluir este ${type === 'assetTypes' ? 'tipo' : 'setor'} pois ele está sendo usado em ${count} participantes.`);
            }
          }
        }

        let deleteQuery = supabase.from(tableMap[type]).delete().eq('id', id);
        if (this.activeOrganizationId) {
          deleteQuery = deleteQuery.eq('organization_id', this.activeOrganizationId);
        }
        const { error } = await deleteQuery;
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
        if (isFallbackError(e)) {
          console.warn(`Supabase registry delete failed for ${type} (falling back to local data):`, e.message || e);
        } else {
          console.error(`Supabase registry delete failed for ${type}`, e);
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
    
    // Mapeamento de quais tabelas e colunas precisam ser atualizadas quando um registro deste tipo é unificado
    const updateTargets: Record<string, Array<{ table: string, column: string, localKey: string }>> = {
      banks: [
        { table: 'transactions', column: 'bank_id', localKey: KEYS.TRANSACTIONS },
        { table: 'wallets', column: 'bank_id', localKey: KEYS.WALLETS }
      ],
      categories: [{ table: 'transactions', column: 'category_id', localKey: KEYS.TRANSACTIONS }],
      costCenters: [{ table: 'transactions', column: 'cost_center_id', localKey: KEYS.TRANSACTIONS }],
      participants: [{ table: 'transactions', column: 'participant_id', localKey: KEYS.TRANSACTIONS }],
      wallets: [{ table: 'transactions', column: 'wallet_id', localKey: KEYS.TRANSACTIONS }],
      assetTypes: [{ table: 'participants', column: 'category', localKey: KEYS.PARTICIPANTS }],
      assetSectors: [{ table: 'participants', column: 'sector', localKey: KEYS.PARTICIPANTS }],
      assetTickers: [{ table: 'participants', column: 'ticker', localKey: KEYS.PARTICIPANTS }]
    };

    const tableName = tableMap[type];
    const targets = updateTargets[type] || [];

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
        const duplicateNames = duplicates.map(d => d.name);

        // Atualizar todos os alvos (Ex: Transactions, Wallets, Participants)
        for (const target of targets) {
          // Se o alvo for uma coluna de Nome (Ex: assetTypes vincula ao Nome da Categoria no Participante)
          // usamos o nome. Se for ID, usamos o ID.
          const isNameReference = target.column === 'category' || target.column === 'sector' || target.column === 'ticker';
          
          if (isNameReference) {
            await supabase
              .from(target.table)
              .update({ [target.column]: master.name })
              .in(target.column, duplicateNames);
          } else {
            await supabase
              .from(target.table)
              .update({ [target.column]: master.id })
              .in(target.column, duplicateIds);
          }
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
      
      // Limpa caches após operação em larga escala
      cache.registries = {};
      cache.balances = {};
      
      return { merged: mergedCount, deleted: deletedCount };
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
    let items = getEntityLocal<any>(keyMap[type], []);

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
      const duplicateNames = duplicates.map(d => d.name);

      duplicateIds.forEach(id => duplicateIdsToRemove.add(id));

      // Atualizar localmente todos os alvos
      for (const target of targets) {
        const isNameReference = target.column === 'category' || target.column === 'sector' || target.column === 'ticker';
        const localList = getEntityLocal<any>(target.localKey, []);
        
        const updatedList = localList.map((item: any) => {
          if (isNameReference) {
            if (duplicateNames.includes(item[target.column])) {
              return { ...item, [target.column]: master.name };
            }
          } else {
            if (duplicateIds.includes(item[target.column])) {
              return { ...item, [target.column]: master.id };
            }
          }
          return item;
        });
        
        saveEntityLocal(target.localKey, updatedList);
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
      
      // TIPO PARTICIPANTE: Se tiver Ticker, pode agrupar por ele mesmo que o nome seja diferente
      const currentTicker = type === 'participants' && (current as any).ticker ? String((current as any).ticker).trim().toUpperCase() : null;

      if (currentNorm.length < 3 && (!currentTicker || currentTicker === "")) continue; 

      const group = { master: current, duplicates: [] as any[] };

      for (let j = i + 1; j < sortedItems.length; j++) {
        if (processed.has(sortedItems[j].id)) continue;
        
        const other = sortedItems[j];
        const otherNorm = normalize(other.name);
        const otherTicker = type === 'participants' && (other as any).ticker ? String((other as any).ticker).trim().toUpperCase() : null;

        // Verifica se este par já foi ignorado
        const pairId = [current.id, other.id].sort().join(':');
        if (ignoredPairs.includes(pairId)) continue;

        let shouldMerge = false;

        // 1. Critério de Ticker (Específico para participantes)
        if (currentTicker && otherTicker && currentTicker !== "" && currentTicker === otherTicker) {
            shouldMerge = true;
        } 
        // 2. Critério de Nome: Um contém o outro (ex: "Petrobras" e "Petrobras S.A.")
        else if (currentNorm.length >= 3 && (otherNorm.includes(currentNorm) || currentNorm.includes(otherNorm))) {
            shouldMerge = true;
        }

        if (shouldMerge) {
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
    
    const updateTargets: Record<string, Array<{ table: string, column: string, localKey: string }>> = {
      banks: [
        { table: 'transactions', column: 'bank_id', localKey: KEYS.TRANSACTIONS },
        { table: 'wallets', column: 'bank_id', localKey: KEYS.WALLETS }
      ],
      categories: [{ table: 'transactions', column: 'category_id', localKey: KEYS.TRANSACTIONS }],
      costCenters: [{ table: 'transactions', column: 'cost_center_id', localKey: KEYS.TRANSACTIONS }],
      participants: [{ table: 'transactions', column: 'participant_id', localKey: KEYS.TRANSACTIONS }],
      wallets: [{ table: 'transactions', column: 'wallet_id', localKey: KEYS.TRANSACTIONS }],
      assetTypes: [{ table: 'participants', column: 'category', localKey: KEYS.PARTICIPANTS }],
      assetSectors: [{ table: 'participants', column: 'sector', localKey: KEYS.PARTICIPANTS }],
      assetTickers: [{ table: 'participants', column: 'ticker', localKey: KEYS.PARTICIPANTS }]
    };

    const tableName = tableMap[type];
    const targets = updateTargets[type] || [];

    if (supabase) {
      // Obter os nomes do mestre e dos duplicados para o caso de referência por nome (category, sector, ticker)
      const { data: allItems } = await supabase.from(tableName).select('id, name').in('id', [masterId, ...duplicateIds]);
      const masterItem = allItems?.find(i => i.id === masterId);
      const duplicateNames = (allItems || []).filter(i => i.id !== masterId).map(i => i.name);

      for (const target of targets) {
        const isNameReference = target.column === 'category' || target.column === 'sector' || target.column === 'ticker';
        
        if (isNameReference && masterItem) {
          await supabase
            .from(target.table)
            .update({ [target.column]: masterItem.name })
            .in(target.column, duplicateNames);
        } else {
          await supabase
            .from(target.table)
            .update({ [target.column]: masterId })
            .in(target.column, duplicateIds);
        }
      }

      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .in('id', duplicateIds);
      
      if (deleteError) throw new Error(formatSupabaseError(deleteError));
    } else {
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
      
      let items = getEntityLocal<any>(keyMap[type], []);
      const masterItem = items.find(i => i.id === masterId);
      const duplicateNames = items.filter(i => duplicateIds.includes(i.id)).map(i => i.name);

      for (const target of targets) {
        const isNameReference = target.column === 'category' || target.column === 'sector' || target.column === 'ticker';
        const localList = getEntityLocal<any>(target.localKey, []);
        
        const updatedList = localList.map((item: any) => {
          if (isNameReference && masterItem) {
            if (duplicateNames.includes(item[target.column])) {
              return { ...item, [target.column]: masterItem.name };
            }
          } else {
            if (duplicateIds.includes(item[target.column])) {
              return { ...item, [target.column]: masterId };
            }
          }
          return item;
        });
        
        saveEntityLocal(target.localKey, updatedList);
      }

      items = items.filter(i => !duplicateIds.includes(i.id));
      saveEntityLocal(keyMap[type], items);
    }

    // Invalida cache
    cache.registries = {}; // Limpa tudo para garantir consistência
    cache.balances = {};
  },

  async syncAuxiliaryRegistries(): Promise<{ types: number, sectors: number, tickers: number }> {
    const supabase = getSupabase();
    if (supabase && !this.activeOrganizationId) {
      console.warn("[Rastreamento] [financeService.syncAuxiliaryRegistries] Sincronização automática de tabelas auxiliares abortada pois activeOrganizationId é nulo.");
      return { types: 0, sectors: 0, tickers: 0 };
    }
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
  },

  async toggleRegistryItemActive(type: string, id: string, active: boolean): Promise<void> {
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

    // Invalida cache
    delete cache.registries[type];

    if (supabase) {
      try {
        const { error } = await supabase
          .from(tableMap[type])
          .update({ active })
          .eq('id', id);
        
        if (error) {
          if (error.code === 'PGRST204') {
            console.warn(`Coluna 'active' não encontrada em ${tableMap[type]}. O status ativo/inativo será mantido apenas localmente.`);
          } else {
            throw new Error(formatSupabaseError(error));
          }
        }
      } catch (e: any) {
        console.error(`Supabase toggle active failed for ${type}`, e);
        if (!(e.message?.includes('fetch') || e.name === 'TypeError' || e.code === 'PGRST204')) {
          throw e;
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
    const list = getEntityLocal<BaseEntity>(keyMap[type], []);
    const updatedList = list.map(item => item.id === id ? { ...item, active } : item);
    saveEntityLocal(keyMap[type], updatedList);
  },

  async getUserModulePermissions(): Promise<Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean; can_export: boolean }>> {
    const defaultPermissions: Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean; can_export: boolean }> = {};
    const ALL_MODULES = [
      'dashboard', 'reports', 'cashflow', 'expenses', 'investments', 
      'distribution', 'payables', 'transactions', 'brokerage', 'registries'
    ];
    
    ALL_MODULES.forEach(mod => {
      defaultPermissions[mod] = { can_view: false, can_create: false, can_edit: false, can_delete: false, can_export: false };
    });

    const supabase = getSupabase();
    if (!supabase) return defaultPermissions;

    const orgId = this.activeOrganizationId;
    if (!orgId) return defaultPermissions;

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return defaultPermissions;

    const mainPromise = (async () => {
      // 1. Verifica papel em organization_members
      const { data: memberData } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId)
        .eq('user_id', user.id)
        .maybeSingle();

      const userRole = memberData?.role || '';
      if (userRole === 'owner' || userRole === 'admin') {
        const adminPerms: Record<string, any> = {};
        ALL_MODULES.forEach(mod => {
          adminPerms[mod] = { can_view: true, can_create: true, can_edit: true, can_delete: true, can_export: true };
        });
        return adminPerms;
      }

      // 2. Busca os profile_id em user_wallet_permissions
      const { data: walletPerms, error: walletError } = await supabase
        .from('user_wallet_permissions')
        .select('profile_id')
        .eq('organization_id', orgId)
        .eq('user_id', user.id);

      if (walletError) {
        console.error("Erro ao buscar user_wallet_permissions:", walletError);
        return defaultPermissions;
      }

      const profileIds = Array.from(new Set((walletPerms || []).map(p => p.profile_id).filter(Boolean)));
      if (profileIds.length === 0) {
        return defaultPermissions;
      }

      // 3. Busca profile_module_permissions para esses perfis
      const { data: modPerms, error: modError } = await supabase
        .from('profile_module_permissions')
        .select('module, can_view, can_create, can_edit, can_delete, can_export')
        .in('profile_id', profileIds);

      if (modError) {
        console.error("Erro ao buscar profile_module_permissions:", modError);
        return defaultPermissions;
      }

      const merged: Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean; can_export: boolean }> = { ...defaultPermissions };
      
      if (modPerms) {
        modPerms.forEach((p: any) => {
          const mod = p.module;
          if (!merged[mod]) {
            merged[mod] = { can_view: false, can_create: false, can_edit: false, can_delete: false, can_export: false };
          }
          merged[mod].can_view = merged[mod].can_view || !!p.can_view;
          merged[mod].can_create = merged[mod].can_create || !!p.can_create;
          merged[mod].can_edit = merged[mod].can_edit || !!p.can_edit;
          merged[mod].can_delete = merged[mod].can_delete || !!p.can_delete;
          merged[mod].can_export = merged[mod].can_export || !!p.can_export;
        });
      }

      return merged;
    })();

    const timeoutPromise = new Promise<Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean; can_export: boolean }>>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout de 15 segundos ao buscar permissões organizacionais')), 15000)
    );

    try {
      return await Promise.race([mainPromise, timeoutPromise]);
    } catch (err) {
      console.error("[getUserModulePermissions] Falhou ao resolver permissões do usuário:", err);
      return defaultPermissions;
    }
  }
};
