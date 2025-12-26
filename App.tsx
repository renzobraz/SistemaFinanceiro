
import React, { useEffect, useState, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { TransactionList } from './components/TransactionList';
import { TransactionForm } from './components/TransactionForm';
import { RegistryManager } from './components/RegistryManager';
import { Summary } from './components/Summary';
import { SettingsView } from './components/SettingsView';
import { CashFlowReport } from './components/CashFlowReport';
import { financeService } from './services/financeService';
import { Transaction, Bank, Category, CostCenter, Participant, Wallet, TransactionStatus } from './types';
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
  Filter,
  X,
  ArrowRightLeft,
  Landmark
} from 'lucide-react';
import { ConfirmModal } from './components/ConfirmModal';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeRegistryTab, setActiveRegistryTab] = useState('wallets'); 
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false); 
  const [isConnected, setIsConnected] = useState(false);
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [registries, setRegistries] = useState<{
    banks: Bank[];
    categories: Category[];
    costCenters: CostCenter[];
    participants: Participant[];
    wallets: Wallet[];
  }>({
    banks: [],
    categories: [],
    costCenters: [],
    participants: [],
    wallets: []
  });

  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL'); 
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: '', message: '' });

  const showAlert = (title: string, message: any) => {
    const msg = typeof message === 'string' ? message : (message?.message || message?.details || JSON.stringify(message));
    setAlertState({ isOpen: true, title, message: msg });
  };

  useEffect(() => {
    if (activeTab === 'payables') {
      setStatusFilter('PENDING');
    } else if (activeTab === 'bank-transactions') {
      setStatusFilter('PAID');
    } else if (activeTab === 'dashboard' || activeTab === 'cashflow') {
      setStatusFilter('ALL');
    }
  }, [activeTab]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const hasUrl = !!localStorage.getItem('supabase_url');
      const hasKey = !!localStorage.getItem('supabase_key');
      const currentlyConnected = hasUrl && hasKey;
      
      if (currentlyConnected !== isConnected) setIsConnected(currentlyConnected);

      try {
        const [tr, bk, cat, cc, pt, wa] = await Promise.all([
          financeService.getTransactions(),
          financeService.getRegistry<Bank>('banks'),
          financeService.getRegistry<Category>('categories'),
          financeService.getRegistry<CostCenter>('costCenters'),
          financeService.getRegistry<Participant>('participants'),
          financeService.getRegistry<Wallet>('wallets'),
        ]);

        setTransactions(tr);
        setRegistries({ banks: bk, categories: cat, costCenters: cc, participants: pt, wallets: wa });
      } catch (error: any) {
        console.error("Failed to load data", error);
        showAlert('Erro ao Carregar Dados', error);
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [isConnected]);

  const globalBalanceMap = useMemo(() => {
    let relevant = transactions.filter(t => t.status === 'PAID');
    if (selectedWalletId) relevant = relevant.filter(t => t.walletId === selectedWalletId);
    if (selectedBankId) relevant = relevant.filter(t => t.bankId === selectedBankId);

    relevant.sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return da - db;
      return a.id.localeCompare(b.id);
    });

    const map: Record<string, number> = {};
    let running = 0;
    relevant.forEach(t => {
      running += (t.type === 'CREDIT' ? t.value : -t.value);
      map[t.id] = running;
    });
    return map;
  }, [transactions, selectedWalletId, selectedBankId]);

  const displayedTransactions = useMemo(() => {
    let filtered = transactions;
    if (selectedWalletId) filtered = filtered.filter(t => t.walletId === selectedWalletId);
    if (selectedBankId) filtered = filtered.filter(t => t.bankId === selectedBankId);
    if (startDate) filtered = filtered.filter(t => t.date >= startDate);
    if (endDate) filtered = filtered.filter(t => t.date <= endDate);
    if (statusFilter !== 'ALL') filtered = filtered.filter(t => t.status === statusFilter);
    return filtered;
  }, [transactions, selectedWalletId, selectedBankId, startDate, endDate, statusFilter]);

  const dashboardTransactions = useMemo(() => {
    let filtered = transactions;
    if (selectedWalletId) filtered = filtered.filter(t => t.walletId === selectedWalletId);
    if (selectedBankId) filtered = filtered.filter(t => t.bankId === selectedBankId);
    return filtered;
  }, [transactions, selectedWalletId, selectedBankId]);

  const getDefaultStatus = (): TransactionStatus => {
    if (activeTab === 'payables') return 'PENDING';
    if (activeTab === 'bank-transactions') return 'PAID';
    return 'PENDING';
  };

  const handleSaveTransaction = async (t: Transaction | Transaction[]) => {
    try {
        if (Array.isArray(t)) {
            const savedItems = await financeService.createManyTransactions(t);
            setTransactions(prev => [...savedItems, ...prev]);
        } else {
            const saved = await financeService.saveTransaction(t);
            setTransactions(prev => {
                const idx = prev.findIndex(item => item.id === saved.id);
                if (idx >= 0) {
                    const copy = [...prev];
                    copy[idx] = saved;
                    return copy;
                }
                return [saved, ...prev];
            });
        }
    } catch (e: any) {
       console.error("Erro ao salvar:", e);
       showAlert('Erro ao Salvar', e);
    }
  };

  const handleDeleteTransactions = async (ids: string[]) => {
    try {
        await financeService.deleteTransactions(ids);
        setTransactions(prev => prev.filter(t => !ids.includes(t.id)));
    } catch (e: any) {
        console.error("Erro ao excluir transação:", e);
        showAlert('Erro ao Excluir', e);
    }
  };

  const handleQuickAddParticipant = async (name: string): Promise<Participant> => {
      try {
          const newP = await financeService.saveRegistryItem('participants', { id: '', name });
          setRegistries(prev => ({ ...prev, participants: [...prev.participants, newP] }));
          return newP;
      } catch (error: any) {
          showAlert('Erro ao cadastrar participante', error);
          throw error;
      }
  };

  const handleImportTransactions = async (rawItems: any[]) => {
      setImporting(true);
      try {
          const cache = {
              banks: new Map<string, string>(registries.banks.map(i => [i.name.toLowerCase(), i.id])),
              categories: new Map<string, string>(registries.categories.map(i => [i.name.toLowerCase(), i.id])),
              costCenters: new Map<string, string>(registries.costCenters.map(i => [i.name.toLowerCase(), i.id])),
              participants: new Map<string, string>(registries.participants.map(i => [i.name.toLowerCase(), i.id])),
              wallets: new Map<string, string>(registries.wallets.map(i => [i.name.toLowerCase(), i.id])),
          };

          const resolveEntityId = async (
              type: 'banks' | 'categories' | 'costCenters' | 'participants' | 'wallets', 
              rawName: string, 
              defaultName: string
          ): Promise<string> => {
              const name = (rawName || defaultName).trim();
              const key = name.toLowerCase();
              if (cache[type].has(key)) return cache[type].get(key)!;

              // @ts-ignore
              const newItem = await financeService.saveRegistryItem(type, { id: '', name: name });
              cache[type].set(key, newItem.id);
              setRegistries(prev => ({ ...prev, [type]: [...prev[type], newItem] }));
              return newItem.id;
          };

          const transactionsToSave: Transaction[] = [];
          for (const item of rawItems) {
              const bankId = await resolveEntityId('banks', item.bankName, 'Banco Geral');
              const categoryId = await resolveEntityId('categories', item.categoryName, 'Geral');
              const costCenterId = await resolveEntityId('costCenters', item.costCenterName, 'Geral');
              const participantId = await resolveEntityId('participants', item.participantName, 'Diverso');
              const walletId = await resolveEntityId('wallets', item.walletName || (registries.wallets.find(w => w.id === selectedWalletId)?.name), 'Carteira Principal');

              transactionsToSave.push({
                  id: '',
                  date: item.date || new Date().toISOString().split('T')[0],
                  description: item.description || 'Importado',
                  docNumber: item.docNumber || '',
                  value: item.value,
                  type: item.type,
                  status: item.status,
                  bankId, categoryId, costCenterId, participantId, walletId
              });
          }

          const savedItems = await financeService.createManyTransactions(transactionsToSave);
          setTransactions(prev => [...savedItems, ...prev]);
          showAlert('Importação Concluída', `${savedItems.length} transações importadas.`);
      } catch (e: any) {
          console.error("Erro na importação:", e);
          showAlert('Erro na Importação', e);
      } finally {
          setImporting(false);
      }
  };

  const handleRegistryAction = (type: keyof typeof registries) => ({
    onAdd: async (name: string, extraData?: any) => {
        try {
            // @ts-ignore
            const newItem = await financeService.saveRegistryItem(type, { id: '', name, ...extraData });
            setRegistries(prev => ({ ...prev, [type]: [...prev[type], newItem] }));
        } catch (e: any) {
            showAlert('Erro ao Adicionar', e);
            throw e; 
        }
    },
    onEdit: async (id: string, name: string, extraData?: any) => {
        try {
            // @ts-ignore
            const updated = await financeService.saveRegistryItem(type, { id, name, ...extraData });
            setRegistries(prev => ({ ...prev, [type]: prev[type].map(item => item.id === id ? updated : item) }));
        } catch (e: any) {
            showAlert('Erro ao Editar', e);
            throw e;
        }
    },
    onDelete: async (id: string) => {
        try {
            // @ts-ignore
            await financeService.deleteRegistryItem(type, id);
            setRegistries(prev => ({ ...prev, [type]: prev[type].filter(item => item.id !== id) }));
        } catch (e: any) {
            showAlert('Erro ao Excluir', e);
            throw e;
        }
    },
    onImport: async (names: string[]) => {
        try {
            const newItems = [];
            for (const name of names) {
                // @ts-ignore
                const newItem = await financeService.saveRegistryItem(type, { id: '', name });
                newItems.push(newItem);
            }
            setRegistries(prev => ({ ...prev, [type]: [...prev[type], ...newItems] }));
        } catch (e: any) {
            showAlert('Erro na Importação', e);
            throw e;
        }
    }
  });

  const handleSaveConfig = (url: string, key: string) => setIsConnected(!!url && !!key);
  const openNewTransaction = () => { setEditingTransaction(null); setIsFormOpen(true); };
  const openEditTransaction = (t: Transaction) => { setEditingTransaction(t); setIsFormOpen(true); };

  const registryTabs = [
    { id: 'wallets', label: 'Carteiras', icon: WalletIcon },
    { id: 'banks', label: 'Bancos', icon: Building2 },
    { id: 'categories', label: 'Categorias', icon: Tags },
    { id: 'costCenters', label: 'Centros de Custo', icon: Briefcase },
    { id: 'participants', label: 'Participantes', icon: Users },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {importing && (
          <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center backdrop-blur-sm">
              <div className="bg-white p-8 rounded-xl shadow-xl flex flex-col items-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <h3 className="text-lg font-bold text-slate-800">Processando Importação...</h3>
                  <p className="text-sm text-slate-500 mt-2">Sincronizando registros.</p>
              </div>
          </div>
      )}

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 flex-shrink-0 z-10">
          <h1 className="text-xl font-bold text-slate-800 capitalize">
              {activeTab === 'dashboard' && 'Dashboard'}
              {activeTab === 'cashflow' && 'Fluxo de Caixa'}
              {activeTab === 'payables' && 'Contas a Pagar & Receber'}
              {activeTab === 'bank-transactions' && 'Movimentação Bancária'}
              {activeTab === 'registries' && 'Cadastros'}
              {activeTab === 'settings' && 'Configurações'}
          </h1>
          
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isConnected ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
              {isConnected ? <CheckCircle2 className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="hidden sm:inline">{isConnected ? 'Conectado' : 'Local'}</span>
            </div>

            {(activeTab === 'dashboard' || activeTab === 'cashflow' || activeTab === 'payables' || activeTab === 'bank-transactions') && (
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-300 rounded-lg px-2 py-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent border-none text-xs w-[110px] outline-none" />
                        <span className="text-gray-400">-</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent border-none text-xs w-[110px] outline-none" />
                    </div>

                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 cursor-pointer outline-none hover:bg-white transition-colors">
                        <option value="ALL">Status: Todos</option>
                        <option value="PAID">Pagas</option>
                        <option value="PENDING">Pendentes</option>
                    </select>

                    <select value={selectedBankId} onChange={(e) => setSelectedBankId(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 cursor-pointer outline-none hover:bg-white transition-colors hidden lg:block">
                        <option value="">Bancos: Todos</option>
                        {registries.banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>

                    <select value={selectedWalletId} onChange={(e) => setSelectedWalletId(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 cursor-pointer hidden sm:block outline-none hover:bg-white transition-colors">
                        <option value="">Carteiras: Todas</option>
                        {registries.wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                </div>
            )}

            {activeTab !== 'registries' && activeTab !== 'dashboard' && activeTab !== 'cashflow' && activeTab !== 'settings' && (
                <button onClick={openNewTransaction} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm shadow-blue-100">
                    <Plus className="w-4 h-4" /> <span>Novo</span>
                </button>
            )}
          </div>
        </header>

        <div className="flex-1 flex flex-col overflow-hidden relative">
          {activeTab === 'dashboard' && (
            <div className="flex-1 overflow-auto p-8">
              <div className="max-w-7xl mx-auto animate-fade-in">
                <Summary transactions={dashboardTransactions} banks={registries.banks} />
              </div>
            </div>
          )}

          {activeTab === 'cashflow' && (
            <div className="flex-1 overflow-auto p-8">
              <div className="max-w-7xl mx-auto">
                <CashFlowReport transactions={displayedTransactions} />
              </div>
            </div>
          )}

          {(activeTab === 'payables' || activeTab === 'bank-transactions') && (
            <div className="flex-1 flex flex-col animate-fade-in bg-white h-full">
               <div className="flex-1 overflow-hidden">
                   <TransactionList 
                    transactions={displayedTransactions} 
                    registries={registries} 
                    onEdit={openEditTransaction} 
                    onDelete={handleDeleteTransactions} 
                    onImport={handleImportTransactions} 
                    variant="full" 
                    externalBalanceMap={globalBalanceMap} 
                    initialSortByStatus={statusFilter}
                   />
               </div>
            </div>
          )}

          {activeTab === 'registries' && (
            <div className="flex-1 overflow-auto p-8">
                <div className="h-full flex flex-col animate-fade-in">
                  <div className="flex flex-wrap gap-2 mb-6">
                    {registryTabs.map(tab => {
                      const isActive = activeRegistryTab === tab.id;
                      return (
                        <button key={tab.id} onClick={() => setActiveRegistryTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${isActive ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}`}>
                          <tab.icon className="w-4 h-4" /> {tab.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {activeRegistryTab === 'wallets' && <RegistryManager title="Carteiras" items={registries.wallets} foreignItems={registries.banks} foreignLabel="Banco" foreignKey="bankId" {...handleRegistryAction('wallets')} />}
                    {activeRegistryTab === 'banks' && <RegistryManager title="Bancos" items={registries.banks} {...handleRegistryAction('banks')} />}
                    {activeRegistryTab === 'categories' && <RegistryManager title="Categorias" items={registries.categories} {...handleRegistryAction('categories')} />}
                    {activeRegistryTab === 'costCenters' && <RegistryManager title="Centros de Custo" items={registries.costCenters} {...handleRegistryAction('costCenters')} />}
                    {activeRegistryTab === 'participants' && <RegistryManager title="Participantes" items={registries.participants} {...handleRegistryAction('participants')} />}
                  </div>
                </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="flex-1 overflow-auto p-8">
               <SettingsView onSaveConfig={handleSaveConfig} />
            </div>
          )}
        </div>
      </main>

      <TransactionForm 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        onSave={handleSaveTransaction} 
        onAddParticipant={handleQuickAddParticipant}
        initialData={editingTransaction} 
        defaultStatus={getDefaultStatus()} 
        registries={registries} 
      />

      <ConfirmModal isOpen={alertState.isOpen} onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))} onConfirm={() => setAlertState(prev => ({ ...prev, isOpen: false }))} title={alertState.title} message={alertState.message} confirmText="OK" showCancel={false} isDestructive={alertState.title.toLowerCase().includes('erro')} />
    </div>
  );
};

export default App;
