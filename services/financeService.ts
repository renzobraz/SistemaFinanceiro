
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
  let url = localStorage.getItem('supabase_url')?.trim();
  let key = localStorage.getItem('supabase_key')?.trim();

  // Use defaults if localStorage is empty
  if (!url || !key) {
    url = DEFAULT_SUPABASE_CONFIG.url;
    key = DEFAULT_SUPABASE_CONFIG.key;
  }

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
      const uniqueData = Array.from(new Map(allData.map(item => [item.id, item])).values());
      return uniqueData.map(mapTransactionFromDb);
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
      
      if (type === 'wallets') {
        const mapped = allData.map((d: any) => ({ id: d.id, name: d.name, bankId: d.bank_id })) as any;
        return Array.from(new Map(mapped.map((item: any) => [item.id, item])).values()) as T[];
      }
      return Array.from(new Map(allData.map(item => [item.id, item])).values()) as T[];
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
    
    const localFkMap: any = { banks: 'bankId', categories: 'categoryId', costCenters: 'costCenterId', participants: 'participantId', wallets: 'walletId' };
    const localFkName = localFkMap[type];
    
    if (localFkName) {
        const transactions = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, []);
        const isUsedInTransactions = transactions.some(t => (t as any)[localFkName] === id);
        if (isUsedInTransactions) {
            throw new Error("Não é possível excluir este registro pois ele está sendo usado em um ou mais lançamentos financeiros.");
        }
    }

    if (type === 'banks') {
        const wallets = getEntityLocal<Wallet>(KEYS.WALLETS, []);
        const isUsedInWallets = wallets.some(w => w.bankId === id);
        if (isUsedInWallets) {
            throw new Error("Não é possível excluir este registro pois ele está sendo usado em um ou mais lançamentos financeiros.");
        }
    }

    const keyMap: any = { banks: KEYS.BANKS, categories: KEYS.CATEGORIES, costCenters: KEYS.COST_CENTERS, participants: KEYS.PARTICIPANTS, wallets: KEYS.WALLETS };
    let list = getEntityLocal<BaseEntity>(keyMap[type], (INITIAL_DATA as any)[type]);
    list = list.filter(x => x.id !== id);
    saveEntityLocal(keyMap[type], list);
  },

  async deduplicateRegistry(type: string, onProgress?: (current: number, total: number) => void): Promise<{ merged: number, deleted: number }> {
    const supabase = getSupabase();
    const tableMap: any = { banks: 'banks', categories: 'categories', costCenters: 'cost_centers', participants: 'participants', wallets: 'wallets' };
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
          await supabase.from('wallets').update({ bank_id: master.id }).in('bank_id', duplicateIds);
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
        wallets = wallets.map(w => {
          if (duplicateIds.includes(w.bankId)) {
            return { ...w, bankId: master.id };
          }
          return w;
        });
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
  }
};
