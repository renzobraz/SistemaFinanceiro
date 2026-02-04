
import { 
  Transaction, 
  Bank, 
  Category, 
  CostCenter, 
  Participant, 
  Wallet,
  BaseEntity
} from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const uuidv4 = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const INITIAL_DATA = {
  transactions: [],
  banks: [],
  categories: [],
  costCenters: [],
  participants: [],
  wallets: [],
};

const KEYS = {
  TRANSACTIONS: 'fincontrol_transactions',
  BANKS: 'fincontrol_banks',
  CATEGORIES: 'fincontrol_categories',
  COST_CENTERS: 'fincontrol_cost_centers',
  PARTICIPANTS: 'fincontrol_participants',
  WALLETS: 'fincontrol_wallets',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

const getSupabase = (): SupabaseClient | null => {
  const url = localStorage.getItem('supabase_url')?.trim();
  const key = localStorage.getItem('supabase_key')?.trim();
  if (url && key) {
    try {
      return createClient(url, key);
    } catch (e) {
      console.error("Erro ao instanciar Supabase:", e);
      return null;
    }
  }
  return null;
};

const formatSupabaseError = (error: any): string => {
    if (!error) return "Erro desconhecido";
    return error.message || error.details || JSON.stringify(error);
};

const mapTransactionFromDb = (db: any): Transaction => ({
  id: db.id,
  date: db.date ? String(db.date).substring(0, 10) : new Date().toISOString().substring(0, 10), // Força YYYY-MM-DD
  description: db.description,
  docNumber: db.doc_number || '',
  value: Number(db.value),
  type: db.type,
  status: db.status,
  bankId: db.bank_id || '',
  categoryId: db.category_id || '',
  participantId: db.participant_id || '',
  costCenterId: db.cost_center_id || '',
  walletId: db.wallet_id || '',
  linkedId: db.linked_id || undefined
});

const mapTransactionToDb = (t: Transaction) => {
  const payload: any = {
    date: t.date,
    description: t.description,
    doc_number: t.docNumber,
    value: t.value,
    type: t.type,
    status: t.status,
    bank_id: t.bankId || null,
    category_id: t.categoryId || null,
    participant_id: t.participantId || null,
    cost_center_id: t.costCenterId || null,
    wallet_id: t.walletId || null,
    linked_id: t.linkedId || null 
  };
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
}

export const financeService = {
  async getTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
    const supabase = getSupabase();
    if (supabase) {
      let query = supabase.from('transactions').select('*');

      // Aplicar filtros no servidor
      if (filters?.startDate && filters.startDate.trim() !== '') query = query.gte('date', filters.startDate);
      if (filters?.endDate && filters.endDate.trim() !== '') query = query.lte('date', filters.endDate);
      if (filters?.bankId && filters.bankId.trim() !== '') query = query.eq('bank_id', filters.bankId);
      if (filters?.walletId && filters.walletId.trim() !== '') query = query.eq('wallet_id', filters.walletId);
      if (filters?.status && filters.status !== 'ALL') query = query.eq('status', filters.status);

      let allData: any[] = [];
      let from = 0;
      let to = 999;
      let finished = false;

      while (!finished) {
        // Range é aplicado sobre a query já filtrada
        const { data, error } = await query
          .order('date', { ascending: false })
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
      return allData.map(mapTransactionFromDb);
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

    localData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return localData;
  },

  /**
   * Calcula o saldo acumulado de transações PAGAS anteriores à data de início.
   * Isso garante que o "Saldo Atual" obedeça ao saldo histórico e não apenas ao filtro visual.
   */
  async getBalancesBefore(dateLimit: string, bankId?: string, walletId?: string): Promise<{ total: number, byBank: Record<string, number> }> {
    if (!dateLimit) return { total: 0, byBank: {} };

    const supabase = getSupabase();
    let rows: any[] = [];

    if (supabase) {
        let query = supabase
            .from('transactions')
            .select('value, type, bank_id')
            .eq('status', 'PAID')
            .lt('date', dateLimit);

        if (bankId) query = query.eq('bank_id', bankId);
        if (walletId) query = query.eq('wallet_id', walletId);

        // Fetch all previous history (could be optimized with database functions, but this is safer for now)
        let from = 0;
        let to = 999;
        let finished = false;

        while (!finished) {
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

    return { total, byBank };
  },

  async saveTransaction(transaction: Transaction): Promise<Transaction> {
    const supabase = getSupabase();
    const transactionToSave = {
        ...transaction,
        id: (transaction.id && transaction.id.trim() !== '') ? transaction.id : uuidv4()
    };

    if (supabase) {
      const payload = mapTransactionToDb(transactionToSave);
      const { data, error } = await supabase.from('transactions').upsert(payload).select().single();
      if (error) throw new Error(formatSupabaseError(error));
      return mapTransactionFromDb(data);
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

    if (supabase) {
        const payloads = transactionsWithIds.map(mapTransactionToDb);
        const { data, error } = await supabase.from('transactions').upsert(payloads).select();
        if (error) throw new Error(formatSupabaseError(error));
        return (data || []).map(mapTransactionFromDb);
    }
    await delay(500);
    const list = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
    list.push(...transactionsWithIds);
    saveEntityLocal(KEYS.TRANSACTIONS, list);
    return transactionsWithIds;
  },

  async deleteTransactions(ids: string[]): Promise<void> {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('transactions').delete().in('id', ids);
      if (error) throw new Error(formatSupabaseError(error));
      return;
    }
    await delay(300);
    let list = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
    list = list.filter(t => !ids.includes(t.id));
    saveEntityLocal(KEYS.TRANSACTIONS, list);
  },

  async getRegistry<T extends BaseEntity>(type: string): Promise<T[]> {
    const supabase = getSupabase();
    const tableMap: any = { banks: 'banks', categories: 'categories', costCenters: 'cost_centers', participants: 'participants', wallets: 'wallets' };
    
    if (supabase) {
      let allData: any[] = [];
      let from = 0;
      let to = 999;
      let finished = false;

      while (!finished) {
        const { data, error } = await supabase
          .from(tableMap[type])
          .select('*')
          .order('name')
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
      
      if (type === 'wallets') return allData.map((d: any) => ({ id: d.id, name: d.name, bankId: d.bank_id })) as any;
      return allData as T[];
    }

    await delay(200);
    const keyMap: any = { banks: KEYS.BANKS, categories: KEYS.CATEGORIES, costCenters: KEYS.COST_CENTERS, participants: KEYS.PARTICIPANTS, wallets: KEYS.WALLETS };
    return getEntityLocal(keyMap[type], (INITIAL_DATA as any)[type]) as T[];
  },

  async saveRegistryItem<T extends BaseEntity>(type: string, item: T & { bankId?: string }): Promise<T> {
    const supabase = getSupabase();
    const tableMap: any = { banks: 'banks', categories: 'categories', costCenters: 'cost_centers', participants: 'participants', wallets: 'wallets' };
    const itemToSave = {
        ...item,
        id: (item.id && item.id.trim() !== '') ? item.id : uuidv4()
    };

    if (supabase) {
        const payload: any = { name: itemToSave.name, id: itemToSave.id };
        if (type === 'wallets') payload.bank_id = (item as any).bankId || null;
        const { data, error } = await supabase.from(tableMap[type]).upsert(payload).select().single();
        if (error) throw new Error(formatSupabaseError(error));
        if (type === 'wallets') return { id: data.id, name: data.name, bankId: data.bank_id } as any;
        return data as T;
    }
    const keyMap: any = { banks: KEYS.BANKS, categories: KEYS.CATEGORIES, costCenters: KEYS.COST_CENTERS, participants: KEYS.PARTICIPANTS, wallets: KEYS.WALLETS };
    const list = getEntityLocal<T>(keyMap[type], (INITIAL_DATA as any)[type]);
    const index = list.findIndex(x => x.id === itemToSave.id);
    if (index >= 0) list[index] = itemToSave as T; else list.push(itemToSave as T);
    saveEntityLocal(keyMap[type], list);
    return itemToSave as T;
  },

  async deleteRegistryItem(type: string, id: string): Promise<void> {
    const supabase = getSupabase();
    const tableMap: any = { banks: 'banks', categories: 'categories', costCenters: 'cost_centers', participants: 'participants', wallets: 'wallets' };
    if (supabase) {
        const { error } = await supabase.from(tableMap[type]).delete().eq('id', id);
        if (error) throw new Error(formatSupabaseError(error));
        return;
    }
    const keyMap: any = { banks: KEYS.BANKS, categories: KEYS.CATEGORIES, costCenters: KEYS.COST_CENTERS, participants: KEYS.PARTICIPANTS, wallets: KEYS.WALLETS };
    let list = getEntityLocal<BaseEntity>(keyMap[type], (INITIAL_DATA as any)[type]);
    list = list.filter(x => x.id !== id);
    saveEntityLocal(keyMap[type], list);
  }
};
