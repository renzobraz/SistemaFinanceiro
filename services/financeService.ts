
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
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      return "Erro de conexão: Não foi possível alcançar o Supabase. Verifique se a URL e a Chave estão corretas, se não há espaços extras e se o seu projeto não está pausado ou com restrições de CORS.";
    }
    return error.message || error.details || JSON.stringify(error);
};

const mapTransactionFromDb = (db: any): Transaction => ({
  id: db.id,
  date: db.date,
  description: db.description,
  docNumber: db.doc_number || '',
  value: Number(db.value),
  type: db.type,
  status: db.status,
  bankId: db.bank_id || '',
  categoryId: db.category_id || '',
  participantId: db.participant_id || '',
  costCenterId: db.cost_center_id || '',
  walletId: db.wallet_id || ''
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
    wallet_id: t.walletId || null
  };
  if (t.id) { 
      payload.id = t.id;
  }
  return payload;
};

export const financeService = {
  async getTransactions(): Promise<Transaction[]> {
    const supabase = getSupabase();
    if (supabase) {
      let allData: any[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasNextPage = true;

      try {
          while (hasNextPage) {
            const from = page * pageSize;
            const to = from + pageSize - 1;
            
            const { data, error } = await supabase
              .from('transactions')
              .select('*')
              .order('date', { ascending: false })
              .order('id', { ascending: false }) 
              .range(from, to);
              
            if (error) throw error;
            
            if (data && data.length > 0) {
              allData = [...allData, ...data];
              if (data.length < pageSize) hasNextPage = false;
            } else {
                hasNextPage = false;
            }
            page++;
            if (page > 100) hasNextPage = false;
          }
      } catch (err: any) {
          throw new Error(formatSupabaseError(err));
      }

      return allData.map(mapTransactionFromDb);
    }

    await delay(300);
    return getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
  },

  async saveTransaction(transaction: Transaction): Promise<Transaction> {
    const supabase = getSupabase();
    if (supabase) {
      const payload = mapTransactionToDb(transaction);
      try {
        const { data, error } = await supabase.from('transactions').upsert(payload).select().single();
        if (error) throw error;
        return mapTransactionFromDb(data);
      } catch (err: any) {
        throw new Error(formatSupabaseError(err));
      }
    }

    await delay(300);
    const list = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
    const index = list.findIndex(t => t.id === transaction.id);
    const savedItem = { 
        ...transaction, 
        id: transaction.id || uuidv4() 
    };

    if (index >= 0) {
      list[index] = savedItem;
    } else {
      list.push(savedItem);
    }
    
    saveEntityLocal(KEYS.TRANSACTIONS, list);
    return savedItem;
  },

  async createManyTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    const supabase = getSupabase();
    if (supabase) {
        const BATCH_SIZE = 100;
        const chunks = [];
        for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
            chunks.push(transactions.slice(i, i + BATCH_SIZE));
        }

        let allCreated: Transaction[] = [];
        try {
            for (const chunk of chunks) {
                const payloads = chunk.map(mapTransactionToDb);
                const { data, error } = await supabase.from('transactions').insert(payloads).select();
                if (error) throw error;
                if (data) {
                    allCreated = [...allCreated, ...data.map(mapTransactionFromDb)];
                }
            }
        } catch (err: any) {
            throw new Error(formatSupabaseError(err));
        }
        return allCreated;
    }

    await delay(500);
    const list = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
    const newItems = transactions.map(t => ({ ...t, id: t.id || uuidv4() }));
    list.push(...newItems);
    saveEntityLocal(KEYS.TRANSACTIONS, list);
    return newItems;
  },

  async deleteTransactions(ids: string[]): Promise<void> {
    const validIds = ids.filter(id => id && id.trim().length > 0);
    if (validIds.length === 0) return;
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase.from('transactions').delete().in('id', validIds);
        if (error) throw error;
      } catch (err: any) {
        throw new Error(formatSupabaseError(err));
      }
      return;
    }
    await delay(300);
    let list = getEntityLocal<Transaction>(KEYS.TRANSACTIONS, INITIAL_DATA.transactions);
    list = list.filter(t => !ids.includes(t.id));
    saveEntityLocal(KEYS.TRANSACTIONS, list);
  },

  async getRegistry<T extends BaseEntity>(type: 'banks' | 'categories' | 'costCenters' | 'participants' | 'wallets'): Promise<T[]> {
    const supabase = getSupabase();
    const tableMap = {
        banks: 'banks',
        categories: 'categories',
        costCenters: 'cost_centers',
        participants: 'participants',
        wallets: 'wallets'
    };

    if (supabase) {
        let allItems: any[] = [];
        const pageSize = 1000;
        let page = 0;
        let hasNextPage = true;

        try {
            while (hasNextPage) {
                const from = page * pageSize;
                const to = from + pageSize - 1;
                const { data, error } = await supabase
                  .from(tableMap[type])
                  .select('*')
                  .order('name', { ascending: true })
                  .order('id', { ascending: true })
                  .range(from, to);
                
                if (error) throw error;
                
                if (data && data.length > 0) {
                  allItems = [...allItems, ...data];
                  if (data.length < pageSize) hasNextPage = false;
                } else {
                  hasNextPage = false;
                }
                page++;
            }
        } catch (err: any) {
            throw new Error(formatSupabaseError(err));
        }

        if (type === 'wallets') {
            return allItems.map((d: any) => ({
                id: d.id,
                name: d.name,
                bankId: d.bank_id
            })) as unknown as T[];
        }
        return allItems as T[];
    }

    await delay(200);
    const keyMap = {
        banks: KEYS.BANKS,
        categories: KEYS.CATEGORIES,
        costCenters: KEYS.COST_CENTERS,
        participants: KEYS.PARTICIPANTS,
        wallets: KEYS.WALLETS
    };
    // @ts-ignore
    return getEntityLocal(keyMap[type], INITIAL_DATA[type]) as T[];
  },

  async saveRegistryItem<T extends BaseEntity>(type: 'banks' | 'categories' | 'costCenters' | 'participants' | 'wallets', item: T & { bankId?: string }): Promise<T> {
    const supabase = getSupabase();
    const tableMap = {
        banks: 'banks',
        categories: 'categories',
        costCenters: 'cost_centers',
        participants: 'participants',
        wallets: 'wallets'
    };
    if (supabase) {
        const payload: any = { name: item.name };
        if (item.id && item.id.length > 5) payload.id = item.id;
        if (type === 'wallets' && item.bankId !== undefined) {
            payload.bank_id = item.bankId || null;
        }
        try {
          const { data, error } = await supabase.from(tableMap[type]).upsert(payload).select().single();
          if (error) throw error;
          if (type === 'wallets') {
              return { id: data.id, name: data.name, bankId: data.bank_id } as any;
          }
          return data as T;
        } catch (err: any) {
          throw new Error(formatSupabaseError(err));
        }
    }
    await delay(200);
    const keyMap = {
      banks: KEYS.BANKS, categories: KEYS.CATEGORIES, costCenters: KEYS.COST_CENTERS, participants: KEYS.PARTICIPANTS, wallets: KEYS.WALLETS
    };
    // @ts-ignore
    const list = getEntityLocal<T>(keyMap[type], INITIAL_DATA[type]);
    const index = list.findIndex(x => x.id === item.id);
    const savedItem = { ...item, id: item.id || uuidv4() };
    if (index >= 0) list[index] = savedItem; else list.push(savedItem);
    saveEntityLocal(keyMap[type], list);
    return savedItem;
  },

  async deleteRegistryItem(type: 'banks' | 'categories' | 'costCenters' | 'participants' | 'wallets', id: string): Promise<void> {
    const supabase = getSupabase();
    const tableMap = {
        banks: 'banks', categories: 'categories', costCenters: 'cost_centers', participants: 'participants', wallets: 'wallets'
    };
    if (supabase) {
        try {
          const { error } = await supabase.from(tableMap[type]).delete().eq('id', id);
          if (error) {
              if (error.code === '23503') throw new Error("Não é possível excluir este item pois ele está sendo usado em outros lançamentos.");
              throw error;
          }
        } catch (err: any) {
          throw new Error(formatSupabaseError(err));
        }
        return;
    }
     const keyMap = {
      banks: KEYS.BANKS, categories: KEYS.CATEGORIES, costCenters: KEYS.COST_CENTERS, participants: KEYS.PARTICIPANTS, wallets: KEYS.WALLETS
    };
    // @ts-ignore
    let list = getEntityLocal<BaseEntity>(keyMap[type], INITIAL_DATA[type]);
    list = list.filter(x => x.id !== id);
    saveEntityLocal(keyMap[type], list);
  }
};
