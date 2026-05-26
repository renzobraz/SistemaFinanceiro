import React, { useState, useEffect, useMemo } from 'react';
import { financeService } from '../services/financeService';
import { Transaction, Bank, Participant, Wallet } from '../types';
import { 
  Users, 
  Wallet as WalletIcon, 
  TrendingUp, 
  TrendingDown, 
  Calculator, 
  AlertCircle,
  Calendar,
  ChevronRight,
  Printer,
  Download,
  Info,
  Briefcase,
  Building2,
  SearchX,
  User
} from 'lucide-react';

interface PartnerDistribution {
  partnerId: string;
  name: string;
  share: number;
  cashShare: number;
  totalReceive: number;
  breakdown: {
    bankId: string;
    bankName: string;
    amount: number;
    isCash: boolean;
  }[];
}

interface BankBalance {
  bankId: string;
  name: string;
  income: number;
  expense: number;
  net: number;
  isCash: boolean;
}

export const ProfitDistributionReport: React.FC<{ 
  onNavigateToRegistries?: () => void;
  userModulePermissions?: Record<string, any>;
  userRole?: string;
}> = ({ 
  onNavigateToRegistries,
  userModulePermissions = {},
  userRole = ""
}) => {
  const hasExportPermission = useMemo(() => {
    return (
      !userModulePermissions ||
      Object.keys(userModulePermissions).length === 0 ||
      userRole === 'owner' ||
      userRole === 'admin' ||
      userModulePermissions['reports']?.can_export === true
    );
  }, [userModulePermissions, userRole]);
  const [activeSubTab, setActiveSubTab] = useState<'simulation' | 'history'>('simulation');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [partners, setPartners] = useState<Participant[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(lastDay);
    return d.toISOString().split('T')[0];
  });

  const [manualBankAmount, setManualBankAmount] = useState<number | null>(null);
  const [manualCashAmount, setManualCashAmount] = useState<number | null>(null);

  useEffect(() => {
    const loadInitial = async () => {
      const wa = await financeService.getRegistry<Wallet>('wallets');
      setWallets(wa);
      if (wa.length > 0) {
        // Tenta encontrar "GT Braz" ou seleciona a primeira
        const gtBraz = wa.find(w => w.name.toUpperCase().includes('GT BRAZ'));
        setSelectedWalletId(gtBraz ? gtBraz.id : wa[0].id);
      }
    };
    loadInitial();
  }, []);

  useEffect(() => {
    if (!selectedWalletId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [allBanks, allParticipants, allTransactions] = await Promise.all([
          financeService.getRegistry<Bank>('banks', false, selectedWalletId),
          financeService.getRegistry<Participant>('participants', false, selectedWalletId),
          financeService.getTransactions({ 
            startDate, 
            endDate, 
            walletId: selectedWalletId,
            status: 'PAID'
          })
        ]);

        setBanks(allBanks);
        setPartners(allParticipants.filter(p => p.isPartner));
        setTransactions(allTransactions);
      } catch (e) {
        console.error("Erro ao carregar dados de distribuição", e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedWalletId, startDate, endDate]);

  const bankBalances = useMemo(() => {
    const bals: Record<string, BankBalance> = {};
    
    banks.forEach(b => {
      bals[b.id] = {
        bankId: b.id,
        name: b.name,
        income: 0,
        expense: 0,
        net: 0,
        isCash: b.name.toUpperCase().includes('CAIXA')
      };
    });

    transactions.forEach(t => {
      if (bals[t.bankId]) {
        if (t.type === 'CREDIT') {
          bals[t.bankId].income += Number(t.value);
        } else {
          bals[t.bankId].expense += Number(t.value);
        }
      }
    });

    Object.values(bals).forEach(b => {
      b.net = b.income - b.expense;
    });

    return Object.values(bals);
  }, [banks, transactions]);

  const calculatedBankProfit = useMemo(() => {
    return bankBalances.filter(b => !b.isCash).reduce((acc, curr) => acc + curr.net, 0);
  }, [bankBalances]);

  const calculatedCashProfit = useMemo(() => {
    return bankBalances.filter(b => b.isCash).reduce((acc, curr) => acc + curr.net, 0);
  }, [bankBalances]);

  const calculatedProfit = useMemo(() => {
    return calculatedBankProfit + calculatedCashProfit;
  }, [calculatedBankProfit, calculatedCashProfit]);

  const distributions = useMemo(() => {
    const bankTarget = manualBankAmount !== null ? manualBankAmount : calculatedBankProfit;
    const cashTarget = manualCashAmount !== null ? manualCashAmount : calculatedCashProfit;

    const bankFactor = calculatedBankProfit > 0 ? (bankTarget / calculatedBankProfit) : (bankTarget > 0 ? 1 : 0);
    const cashFactor = calculatedCashProfit > 0 ? (cashTarget / calculatedCashProfit) : (cashTarget > 0 ? 1 : 0);

    return partners.map(p => {
      const dist: PartnerDistribution = {
        partnerId: p.id,
        name: p.name,
        share: p.sharePercent || 0,
        cashShare: p.cashSharePercent || 0,
        totalReceive: 0,
        breakdown: []
      };

      bankBalances.forEach(b => {
        const factor = b.isCash ? cashFactor : bankFactor;
        const bankNetWithFactor = b.net * factor;
        
        // Se o valor for menor ou igual a zero, não distribuímos a menos que o alvo manual seja positivo (no caso de bancos sem saldo mas com distribuição forçada - improvável mas possível se factor for alto)
        if (bankNetWithFactor <= 0 && factor <= 0) return;

        const share = b.isCash ? (p.cashSharePercent || 0) : (p.sharePercent || 0);
        const partnerAmount = (bankNetWithFactor * share) / 100;

        dist.totalReceive += partnerAmount;
        dist.breakdown.push({
          bankId: b.bankId,
          bankName: b.name,
          amount: partnerAmount,
          isCash: b.isCash
        });
      });

      return dist;
    });
  }, [partners, bankBalances, calculatedBankProfit, calculatedCashProfit, manualBankAmount, manualCashAmount]);

  const totalDistributed = distributions.reduce((acc, curr) => acc + curr.totalReceive, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden p-6 gap-6 animate-fade-in">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-blue-600" />
            Distribuição de Lucros
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Simulação de rateio entre sócios com base no resultado operacional</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl mr-2">
            <button 
              onClick={() => setActiveSubTab('simulation')}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${activeSubTab === 'simulation' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Simulação
            </button>
            <button 
              onClick={() => setActiveSubTab('history')}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${activeSubTab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Comparativo Mensal
            </button>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <WalletIcon className="w-4 h-4 text-slate-400" />
            <select 
              value={selectedWalletId} 
              onChange={(e) => setSelectedWalletId(e.target.value)}
              className="bg-transparent border-none text-sm font-bold text-slate-700 outline-none cursor-pointer"
            >
              {wallets.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent border-none text-sm font-bold text-slate-700 outline-none"
            />
            <span className="text-slate-300 mx-1">/</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent border-none text-sm font-bold text-slate-700 outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200" title="Imprimir Relatório">
              <Printer className="w-4 h-4" />
            </button>
            {hasExportPermission && (
              <button className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-slate-200" title="Exportar CSV">
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {activeSubTab === 'simulation' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-auto pb-6">
          {/* Left Column: Summary and Balance by Bank */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            {/* Main Profit Card */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-2xl shadow-lg border border-blue-500/20 text-white">
              <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">Receitas e Despesas GT Braz</p>
              <div className="flex items-end gap-2 mb-6">
                <span className="text-3xl font-black">
                  {calculatedProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                {calculatedProfit > 0 && <TrendingUp className="w-6 h-6 text-blue-300 mb-1" />}
              </div>

              <div className="space-y-3 pt-4 border-t border-white/10">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-blue-200">Saldo em Bancos</span>
                  <span className="font-bold">{calculatedBankProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-amber-200 font-medium">Saldo em Caixa</span>
                  <span className="font-bold text-amber-200">{calculatedCashProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="flex justify-between items-center text-sm pt-2 border-t border-white/5">
                  <span className="text-blue-100 font-black">Total Disponível</span>
                  <span className="font-black text-white">{calculatedProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
              </div>
            </div>

            {/* Manual Input for Distribution */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Valores para Distribuição
              </h3>
              
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Bancos (Sicredi, etc)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                    <input 
                      type="number" 
                      value={manualBankAmount !== null ? manualBankAmount : calculatedBankProfit.toFixed(2)}
                      onChange={(e) => setManualBankAmount(Number(e.target.value))}
                      placeholder="Distribuição Bancos..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-8 pr-4 text-sm font-black text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                    {manualBankAmount !== null && (
                      <button 
                        onClick={() => setManualBankAmount(null)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-500 hover:text-blue-700"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest ml-1">Caixa (Dinheiro)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 font-bold text-xs">R$</span>
                    <input 
                      type="number" 
                      value={manualCashAmount !== null ? manualCashAmount : calculatedCashProfit.toFixed(2)}
                      onChange={(e) => setManualCashAmount(Number(e.target.value))}
                      placeholder="Distribuição Caixa..."
                      className="w-full bg-amber-50/30 border border-amber-100 rounded-xl py-2.5 pl-8 pr-4 text-sm font-black text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                    />
                    {manualCashAmount !== null && (
                      <button 
                        onClick={() => setManualCashAmount(null)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-600 hover:text-amber-700"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100 flex gap-3">
                <Info className="w-5 h-5 text-blue-500 shrink-0" />
                <p className="text-[11px] text-blue-700 leading-normal font-medium">
                  Os valores definidos serão rateados separadamente usando os percentuais de participação de cada sócio para cada tipo de conta.
                </p>
              </div>
            </div>

            {/* Banks Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Saldo por Conta</h3>
              </div>
              
              <div className="overflow-auto max-h-[300px]">
                <table className="w-full text-left">
                  <tbody>
                    {bankBalances.map(b => (
                      <tr key={b.bankId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${b.isCash ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                              {b.isCash ? <Briefcase className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-900">{b.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                                {b.isCash ? 'Conta Caixa' : 'Conta Bancária'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <p className={`text-xs font-black ${b.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {b.net.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                          <p className="text-[10px] text-slate-400 font-semibold">{((b.net / (calculatedProfit || 1)) * 100).toFixed(1)}% do total</p>
                        </td>
                      </tr>
                    ))}
                    {bankBalances.length === 0 && (
                      <tr>
                        <td colSpan={2} className="p-8 text-center text-slate-400">
                          <SearchX className="w-8 h-8 mx-auto mb-2 opacity-20" />
                          <p className="text-[11px] font-bold">Nenhuma conta com movimentação</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Consolidado</span>
                  <span className="text-sm font-black text-slate-800">{calculatedProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Distribution Result */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black text-slate-800">Rateio entre Sócios</h3>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">Clique no sócio para ver o detalhamento por conta</p>
                </div>
                <div className="bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                    Total Distribuído: {totalDistributed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {partners.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                      <Users className="w-8 h-8 text-slate-300" />
                    </div>
                    <h4 className="text-slate-800 font-black text-sm">Nenhum sócio identificado</h4>
                    <p className="text-xs text-slate-400 max-w-[280px] mt-2">
                      Marque os participantes como sócios na aba de Cadastros e defina os percentuais de participação.
                    </p>
                    <button onClick={onNavigateToRegistries} className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all shadow-md active:scale-95">
                      Ir para Cadastros
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {distributions.map(dist => (
                      <div key={dist.partnerId} className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-400 hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              <User className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-slate-800">{dist.name}</h4>
                              <div className="flex gap-2 mt-0.5">
                                <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 uppercase tracking-tighter">
                                  {dist.share}% Padrão
                                </span>
                                <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 uppercase tracking-tighter">
                                  {dist.cashShare}% Caixa
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-black text-slate-900">
                              {dist.totalReceive.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">A Receber</p>
                          </div>
                        </div>

                        <div className="space-y-2 pt-4 border-t border-slate-50 italic">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Composição do Recebimento:</p>
                          {dist.breakdown.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1 h-1 rounded-full ${item.isCash ? 'bg-amber-400' : 'bg-blue-400'}`} />
                                <span className="text-slate-600 font-medium">{item.bankName}</span>
                              </div>
                              <span className="text-slate-800 font-bold">{item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-200 mt-auto">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[11px] text-amber-800 font-bold leading-tight">Nota Fiscal e Encargos</p>
                    <p className="text-[10px] text-amber-600 font-medium">Os valores acima são líquidos sugeridos para transferência. Lembre-se de emitir a nota fiscal de pro-labore ou distribuição de lucros conforme orientação contábil.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <ProfitHistoryTable partners={partners} banks={banks} transactions={transactions} />
      )}
    </div>
  );
};

// Componente de Tabela de Histórico no Estilo Excel
const ProfitHistoryTable: React.FC<{ 
  partners: Participant[], 
  banks: Bank[],
  transactions: Transaction[]
}> = ({ partners, banks, transactions }) => {
  const months = useMemo(() => {
    const data: Record<string, { 
      bankTotal: number, 
      cashTotal: number,
      partners: Record<string, number> 
    }> = {};
    
    // Mapeamento rápido de bancos para identificar se é caixa
    const bankTypeMap = new Map(banks.map(b => [b.id, b.name.toUpperCase().includes('CAIXA')]));

    // Agrupar transações por mês, separando Banco de Caixa
    transactions.forEach(t => {
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!data[monthKey]) {
        data[monthKey] = { bankTotal: 0, cashTotal: 0, partners: {} };
      }
      
      const isCash = bankTypeMap.get(t.bankId) || false;
      const val = Number(t.value);
      
      if (isCash) {
        data[monthKey].cashTotal += (t.type === 'CREDIT' ? val : -val);
      } else {
        data[monthKey].bankTotal += (t.type === 'CREDIT' ? val : -val);
      }
    });

    // Ordenar meses (do mais recente para o mais antigo)
    const sortedMonths = Object.keys(data).sort((a, b) => b.localeCompare(a));
    
    return sortedMonths.map((m, idx) => {
      const current = data[m];
      const prevMonthKey = sortedMonths[idx + 1];
      const prev = prevMonthKey ? data[prevMonthKey] : null;
      
      const currentTotal = current.bankTotal + current.cashTotal;
      const prevTotal = prev ? (prev.bankTotal + prev.cashTotal) : 0;
      
      const variation = prev && prevTotal !== 0 
        ? ((currentTotal - prevTotal) / Math.abs(prevTotal)) * 100 
        : 0;

      return {
        month: m,
        total: currentTotal,
        variation,
        partnerValues: partners.map(p => {
          const bankShare = p.sharePercent || 0;
          const cashShare = p.cashSharePercent || 0;
          
          // Cálculo separado conforme a origem do lucro
          const fromBank = (current.bankTotal * bankShare) / 100;
          const fromCash = (current.cashTotal * cashShare) / 100;
          const totalValue = fromBank + fromCash;

          // Percentual médio ponderado do sócio no mês (para exibição)
          const weightPercent = currentTotal !== 0 ? (totalValue / currentTotal) * 100 : 0;

          return {
            id: p.id,
            name: p.name,
            value: totalValue,
            percent: weightPercent
          };
        })
      };
    });
  }, [transactions, partners, banks]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full animate-fade-in">
      <div className="p-6 border-b border-slate-100">
        <h3 className="text-sm font-black text-slate-800 italic uppercase">Resumo Distribuição de Lucro</h3>
      </div>
      
      <div className="overflow-auto flex-1">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
            <tr>
              <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-200">Mês</th>
              {partners.map(p => (
                <React.Fragment key={p.id}>
                  <th className="p-3 text-[10px] font-black text-blue-600 uppercase tracking-widest border-r border-slate-100">{p.name}</th>
                  <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-200">% {p.name}</th>
                </React.Fragment>
              ))}
              <th className="p-3 text-[10px] font-black text-slate-900 uppercase tracking-widest border-r border-slate-200 bg-slate-100/50">Total</th>
              <th className="p-3 text-[10px] font-black text-slate-900 uppercase tracking-widest">% Var.</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, idx) => (
              <tr key={m.month} className="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
                <td className="p-3 text-xs font-bold text-slate-700 bg-slate-50/30 border-r border-slate-200">
                  {new Date(m.month + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase()}
                </td>
                {m.partnerValues.map((pv, pIdx) => (
                  <React.Fragment key={pIdx}>
                    <td className="p-3 text-xs font-semibold text-slate-600 border-r border-slate-100">
                      {pv.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-[10px] font-bold text-slate-400 border-r border-slate-200">
                      {pv.percent.toFixed(2)}%
                    </td>
                  </React.Fragment>
                ))}
                <td className="p-3 text-xs font-black text-slate-900 border-r border-slate-200 bg-slate-50/50">
                  {m.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className={`p-3 text-xs font-black ${m.variation >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {m.variation !== 0 ? `${m.variation > 0 ? '+' : ''}${m.variation.toFixed(2)}%` : '-'}
                </td>
              </tr>
            ))}
            {months.length === 0 && (
              <tr>
                <td colSpan={partners.length * 2 + 3} className="p-12 text-center text-slate-400">
                  <Calculator className="w-12 h-12 mx-auto mb-3 opacity-10" />
                  <p className="text-sm font-bold">Nenhum dado histórico para o período selecionado.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
