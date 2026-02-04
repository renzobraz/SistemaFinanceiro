
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { TransactionList } from './components/TransactionList';
import { TransactionForm } from './components/TransactionForm';
import { RegistryManager } from './components/RegistryManager';
import { Summary } from './components/Summary';
import { SettingsView } from './components/SettingsView';
import { CashFlowReport } from './components/CashFlowReport';
import { ExpenseAnalysisReport } from './components/ExpenseAnalysisReport';
import { HelpManual } from './components/HelpManual';
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
  AlertCircle,
  RefreshCcw,
  SearchX,
  Database,
  Layers,
  Loader2,
  XCircle
} from 'lucide-react';
import { ConfirmModal } from './components/ConfirmModal';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeRegistryTab, setActiveRegistryTab] = useState('wallets'); 
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  // Armazena o saldo acumulado ANTES da data de início do filtro
  const [previousBalances, setPreviousBalances] = useState<{ total: number, byBank: Record<string, number> }>({ total: 0, byBank: {} });

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

  // Controle de concorrência para evitar Race Conditions nos filtros
  const lastRequestIdRef = useRef(0);

  const showAlert = (title: string, message: any) => {
    const msg = typeof message === 'string' ? message : (message?.message || message?.details || JSON.stringify(message));
    setAlertState({ isOpen: true, title, message: msg });
  };

  // Carrega apenas os cadastros (uma única vez ou quando conectar)
  const loadRegistries = useCallback(async () => {
    try {
      const [bk, cat, cc, pt, wa] = await Promise.all([
        financeService.getRegistry<Bank>('banks'),
        financeService.getRegistry<Category>('categories'),
        financeService.getRegistry<CostCenter>('costCenters'),
        financeService.getRegistry<Participant>('participants'),
        financeService.getRegistry<Wallet>('wallets'),
      ]);
      setRegistries({ banks: bk, categories: cat, costCenters: cc, participants: pt, wallets: wa });
    } catch (error: any) {
      console.error("Failed to load registries", error);
    }
  }, []);

  // Carrega transações baseado nos filtros atuais (Database-side)
  const loadTransactions = useCallback(async () => {
    const requestId = ++lastRequestIdRef.current;
    setRefreshing(true);
    
    try {
      // 1. Busca transações filtradas
      const trPromise = financeService.getTransactions({
        startDate,
        endDate,
        bankId: selectedBankId,
        walletId: selectedWalletId,
        status: statusFilter
      });

      // 2. Busca saldo anterior (se houver data de início)
      // Se não houver data de início, o saldo anterior é 0 (assumimos que carregamos tudo desde o início)
      let balPromise = Promise.resolve({ total: 0, byBank: {} });
      if (startDate) {
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
        showAlert('Erro de Sincronização', error.message);
      }
    } finally {
      if (requestId === lastRequestIdRef.current) {
        setRefreshing(false);
      }
    }
  }, [startDate, endDate, selectedBankId, selectedWalletId, statusFilter]);

  const loadAll = async () => {
    setLoading(true);
    const currentlyConnected = !!localStorage.getItem('supabase_url') && !!localStorage.getItem('supabase_key');
    setIsConnected(currentlyConnected);
    await Promise.all([loadRegistries(), loadTransactions()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [isConnected]);

  // Recarrega transações quando os filtros mudam
  useEffect(() => {
    if (!loading) {
        loadTransactions();
    }
  }, [startDate, endDate, selectedBankId, selectedWalletId, statusFilter, loadTransactions]);

  useEffect(() => {
    if (activeTab === 'payables') {
      setStatusFilter('PENDING');
    } else if (activeTab === 'bank-transactions') {
      setStatusFilter('PAID');
    } else if (['dashboard', 'cashflow', 'expenses-analysis'].includes(activeTab)) {
      setStatusFilter('ALL');
    }
  }, [activeTab]);

  const globalBalanceMap = useMemo(() => {
    let relevant = transactions.filter(t => t.status === 'PAID');
    
    // Ordena cronologicamente para calcular o saldo corrente
    relevant.sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return da !== db ? da - db : a.id.localeCompare(b.id);
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

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-auto py-3 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between px-8 flex-shrink-0 z-10 gap-4 shadow-sm">
          <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold text-slate-800 whitespace-nowrap">
                  {activeTab === 'dashboard' && 'Dashboard'}
                  {activeTab === 'cashflow' && 'Fluxo de Caixa'}
                  {activeTab === 'expenses-analysis' && 'Análise de Gastos'}
                  {activeTab === 'payables' && 'Contas a Pagar & Receber'}
                  {activeTab === 'bank-transactions' && 'Movimentação Bancária'}
                  {activeTab === 'registries' && 'Cadastros'}
                  {activeTab === 'settings' && 'Configurações'}
                  {activeTab === 'manual' && 'Manual / Ajuda'}
              </h1>

              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-colors ${isConnected ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {isConnected ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <WifiOff className="w-3 h-3" />}
                    <span className="inline">{isConnected ? 'Supabase' : 'Offline'}</span>
                </div>
                
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-wider border border-slate-200 shadow-inner">
                    {refreshing ? <Loader2 className="w-3 h-3 animate-spin text-blue-500" /> : <Layers className="w-3 h-3" />}
                    <span>{refreshing ? 'Sincronizando...' : `${transactions.length} Registros`}</span>
                </div>
              </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {['dashboard', 'cashflow', 'expenses-analysis', 'payables', 'bank-transactions'].includes(activeTab) && (
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-lg px-2 py-1.5 shadow-sm h-[38px] group hover:border-blue-300 transition-colors">
                        <Calendar className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500" />
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent border-none text-xs w-[110px] outline-none font-medium text-slate-700" title="Data Inicial" />
                        <span className="text-gray-300 mx-1">-</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent border-none text-xs w-[110px] outline-none font-medium text-slate-700" title="Data Final" />
                        {(startDate || endDate) && (
                           <button onClick={() => { setStartDate(''); setEndDate(''); }} className="ml-1 p-1 hover:bg-red-50 hover:text-red-500 rounded-full text-gray-300 transition-colors" title="Limpar Datas">
                             <XCircle className="w-3 h-3" />
                           </button>
                        )}
                    </div>

                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={selectClass}>
                      <option value="ALL">Todos os Status</option>
                      <option value="PAID">Apenas Pagas</option>
                      <option value="PENDING">Apenas Pendentes</option>
                    </select>

                    <select value={selectedBankId} onChange={(e) => setSelectedBankId(e.target.value)} className={selectClass}>
                      <option value="">Todos os Bancos</option>
                      {registries.banks.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>

                    <select value={selectedWalletId} onChange={(e) => setSelectedWalletId(e.target.value)} className={selectClass}>
                      <option value="">Todas Carteiras</option>
                      {registries.wallets.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>

                    <button onClick={() => loadTransactions()} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-gray-300 h-[38px]" title="Sincronizar">
                      <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-500' : ''}`} />
                    </button>
                </div>
            )}

            {!['registries', 'settings', 'manual'].includes(activeTab) && (
                <button onClick={() => { setEditingTransaction(null); setIsFormOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm shadow-blue-100 h-[38px]">
                    <Plus className="w-4 h-4" /> <span>Lançar</span>
                </button>
            )}
          </div>
        </header>

        <div className="flex-1 flex flex-col overflow-hidden relative">
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

          {activeTab === 'cashflow' && (
            <div className="flex-1 overflow-auto p-8">
              <div className="max-w-7xl mx-auto">
                <CashFlowReport allTransactions={transactions} startDate={startDate} endDate={endDate} registries={registries} />
              </div>
            </div>
          )}

          {activeTab === 'expenses-analysis' && (
            <div className="flex-1 overflow-auto p-8">
              <div className="max-w-7xl mx-auto">
                <ExpenseAnalysisReport transactions={transactions} registries={registries} />
              </div>
            </div>
          )}

          {(activeTab === 'payables' || activeTab === 'bank-transactions') && (
            <div className="flex-1 flex flex-col animate-fade-in bg-white h-full relative">
               <div className="absolute inset-0 overflow-hidden flex flex-col">
                   <TransactionList 
                    transactions={transactions} 
                    registries={registries} 
                    onEdit={(t) => { setEditingTransaction(t); setIsFormOpen(true); }} 
                    onDelete={handleDeleteTransactions} 
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
                        onImport={async () => {}}
                        foreignItems={activeRegistryTab === 'wallets' ? registries.banks : undefined}
                        foreignLabel={activeRegistryTab === 'wallets' ? 'Selecionar Banco' : undefined}
                        foreignKey={activeRegistryTab === 'wallets' ? 'bankId' : undefined}
                    />
                  </div>
                </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="flex-1 overflow-auto p-8">
               <SettingsView onSaveConfig={() => setIsConnected(true)} />
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="flex-1 overflow-auto p-8">
               <HelpManual />
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
        partnerData={editingTransaction?.linkedId ? transactions.find(t => t.linkedId === editingTransaction.linkedId && t.id !== editingTransaction.id) : null}
        defaultStatus={statusFilter === 'ALL' ? 'PENDING' : statusFilter} 
        preSelectedBankId={selectedBankId}
        preSelectedWalletId={selectedWalletId}
        registries={registries} 
      />

      <ConfirmModal isOpen={alertState.isOpen} onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))} onConfirm={() => setAlertState(prev => ({ ...prev, isOpen: false }))} title={alertState.title} message={alertState.message} confirmText="OK" showCancel={false} isDestructive={alertState.title.toLowerCase().includes('erro')} />
    </div>
  );
};

export default App;
