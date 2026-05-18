import React, { useMemo, useState } from 'react';
import { Transaction, Bank, Wallet } from '../../../types';
import { parseISO, format, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Users, TrendingUp, Wallet as WalletIcon, ArrowRight, Info, Percent } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Partner {
  id: string;
  name: string;
  basePercentage: number;
  caixaPercentage: number;
}

interface ProfitDistributionReportProps {
  transactions: Transaction[];
  registries: {
    banks: Bank[];
    wallets: Wallet[];
  };
}

export const ProfitDistributionReport: React.FC<ProfitDistributionReportProps> = ({ transactions, registries }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [cutoffDay, setCutoffDay] = useState(10);
  
  // Opções de sócios
  const [partners, setPartners] = useState<Partner[]>([
    { id: '1', name: 'Sócio A', basePercentage: 25, caixaPercentage: 25 },
    { id: '2', name: 'Sócio B', basePercentage: 25, caixaPercentage: 25 },
    { id: '3', name: 'Sócio C', basePercentage: 25, caixaPercentage: 25 },
    { id: '4', name: 'Sócio D', basePercentage: 25, caixaPercentage: 25 },
  ]);

  const [activeTab, setActiveTab] = useState<'summary' | 'details'>('summary');

  // Identifica a carteira GT Braz e as contas Caixa/Banco
  const gtBrazWallet = registries.wallets.find(w => w.name.toUpperCase().includes('GT BRAZ'));
  const caixaBank = registries.banks.find(b => b.name.toUpperCase().includes('CAIXA'));
  const bancoBank = registries.banks.find(b => b.name.toUpperCase().includes('BANCO') && !b.name.toUpperCase().includes('CAIXA'));

  const monthRange = useMemo(() => {
    // Se hoje é dia 17 e o corte é dia 10, o "mês atual" de distribuição
    // Termina no dia 10 do mês selecionado e começou no dia 11 do mês anterior.
    const end = new Date(selectedMonth);
    end.setDate(cutoffDay);
    
    const start = new Date(end);
    start.setMonth(start.getMonth() - 1);
    start.setDate(cutoffDay + 1);
    
    return { start, end };
  }, [selectedMonth, cutoffDay]);

  const stats = useMemo(() => {
    if (!gtBrazWallet) return null;

    const filtered = transactions.filter(t => {
      const date = parseISO(t.date);
      return t.walletId === gtBrazWallet.id && isWithinInterval(date, monthRange);
    });

    const caixaTransactions = filtered.filter(t => t.bankId === caixaBank?.id);
    const bancoTransactions = filtered.filter(t => t.bankId === bancoBank?.id);

    const calcNet = (txs: Transaction[]) => {
      const income = txs.filter(t => t.type === 'CREDIT').reduce((acc, t) => acc + t.value, 0);
      const expense = txs.filter(t => t.type === 'DEBIT').reduce((acc, t) => acc + t.value, 0);
      return { income, expense, net: income - expense };
    };

    const caixaStats = calcNet(caixaTransactions);
    const bancoStats = calcNet(bancoTransactions);
    const totalStats = {
      income: caixaStats.income + bancoStats.income,
      expense: caixaStats.expense + bancoStats.expense,
      net: caixaStats.net + bancoStats.net
    };

    return { caixaStats, bancoStats, totalStats };
  }, [transactions, gtBrazWallet, caixaBank, bancoBank, monthRange]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const handlePercentageChange = (id: string, field: 'basePercentage' | 'caixaPercentage', value: string) => {
    const num = parseFloat(value) || 0;
    setPartners(prev => prev.map(p => p.id === id ? { ...p, [field]: num } : p));
  };

  if (!gtBrazWallet) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Info className="w-8 h-8 text-slate-300" />
        </div>
        <h3 className="text-lg font-black text-slate-800">Carteira "GT Braz" não encontrada</h3>
        <p className="text-sm text-slate-400 mt-2">Certifique-se de que a carteira foi cadastrada corretamente nos registros.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com Filtro de Mês */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-100">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800 tracking-tight">Distribuição de Lucros</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Empresa: GT Braz</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl">
            <button 
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-400"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
            </button>
            <span className="px-4 text-xs font-black uppercase tracking-widest text-slate-700 min-w-[140px] text-center">
              Até {format(monthRange.end, "dd 'de' MMMM", { locale: ptBR })}
            </span>
            <button 
              onClick={() => setSelectedMonth(new Date(selectedMonth.setMonth(selectedMonth.getMonth() + 1)))}
              className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-400"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
            Período: {format(monthRange.start, 'dd/MM/yy')} — {format(monthRange.end, 'dd/MM/yy')}
          </div>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-[0.03] translate-x-1/4 -translate-y-1/4 group-hover:scale-110 transition-transform duration-500">
            <WalletIcon className="w-24 h-24 text-slate-900" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <div className="w-1 h-1 bg-slate-400 rounded-full" />
              <span className="text-[10px] font-black uppercase tracking-widest">Saldo Caixa</span>
            </div>
            <div className="text-2xl font-black text-slate-800 font-mono">
              {formatCurrency(stats?.caixaStats.net || 0)}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-end">
              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase">Entradas</p>
                <p className="text-xs font-bold text-emerald-600">{formatCurrency(stats?.caixaStats.income || 0)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-slate-400 font-bold uppercase">Saídas</p>
                <p className="text-xs font-bold text-red-600">{formatCurrency(stats?.caixaStats.expense || 0)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-[0.03] translate-x-1/4 -translate-y-1/4 group-hover:scale-110 transition-transform duration-500">
            <TrendingUp className="w-24 h-24 text-slate-900" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <div className="w-1 h-1 bg-slate-400 rounded-full" />
              <span className="text-[10px] font-black uppercase tracking-widest">Saldo Banco</span>
            </div>
            <div className="text-2xl font-black text-slate-800 font-mono">
              {formatCurrency(stats?.bancoStats.net || 0)}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-end">
              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase">Entradas</p>
                <p className="text-xs font-bold text-emerald-600">{formatCurrency(stats?.bancoStats.income || 0)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-slate-400 font-bold uppercase">Saídas</p>
                <p className="text-xs font-bold text-red-600">{formatCurrency(stats?.bancoStats.expense || 0)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-indigo-600 border border-indigo-700 rounded-3xl p-6 shadow-xl shadow-indigo-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 translate-x-1/4 -translate-y-1/4 group-hover:scale-110 transition-transform duration-500">
            <TrendingUp className="w-24 h-24 text-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-indigo-200 mb-1">
              <div className="w-1 h-1 bg-white rounded-full animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">Lucro Total Distribuível</span>
            </div>
            <div className="text-2xl font-black text-white font-mono">
              {formatCurrency(stats?.totalStats.net || 0)}
            </div>
            <div className="mt-4 pt-4 border-t border-indigo-500/30 flex justify-between items-end">
              <div>
                <p className="text-[9px] text-indigo-200 font-bold uppercase">Meta de Distribuição</p>
                <p className="text-xs font-bold text-white">Dia 10 do mês</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Configuração de Sócios e Simulação */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configurações */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Configuração de Sócios</h3>
            <button className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest transition-colors">Resetar</button>
          </div>

          <div className="space-y-4">
            {partners.map(partner => (
              <div key={partner.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-slate-700 uppercase">{partner.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Banco %</label>
                    <div className="relative">
                      <input 
                        type="number"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-500"
                        value={partner.basePercentage}
                        onChange={(e) => handlePercentageChange(partner.id, 'basePercentage', e.target.value)}
                      />
                      <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Caixa %</label>
                    <div className="relative">
                      <input 
                        type="number"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-500"
                        value={partner.caixaPercentage}
                        onChange={(e) => handlePercentageChange(partner.id, 'caixaPercentage', e.target.value)}
                      />
                      <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Simulação de Distribuição */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Simulação de Repasse</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Cálculo proporcional ao lucro líquido do período</p>
            </div>
            <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
              <button 
                onClick={() => setActiveTab('summary')}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'summary' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Resumo
              </button>
              <button 
                onClick={() => setActiveTab('details')}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'details' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Visualização
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 sticky top-0">
                <tr>
                  <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Sócio</th>
                  <th className="p-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Do Caixa</th>
                  <th className="p-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Do Banco</th>
                  <th className="p-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Total a Receber</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partners.map(partner => {
                  const caixaValue = (stats?.caixaStats.net || 0) * (partner.caixaPercentage / 100);
                  const bancoValue = (stats?.bancoStats.net || 0) * (partner.basePercentage / 100);
                  const total = caixaValue + bancoValue;

                  return (
                    <tr key={partner.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700 uppercase">{partner.name}</span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase">{partner.basePercentage}% / {partner.caixaPercentage}%</span>
                        </div>
                      </td>
                      <td className="p-4 text-right text-xs font-bold text-slate-500 font-mono">
                        {formatCurrency(caixaValue)}
                      </td>
                      <td className="p-4 text-right text-xs font-bold text-slate-500 font-mono">
                        {formatCurrency(bancoValue)}
                      </td>
                      <td className="p-4 text-right text-xs font-black text-indigo-600 font-mono">
                        {formatCurrency(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50/50 font-black">
                <tr>
                  <td className="p-4 text-[10px] uppercase text-slate-800">Total</td>
                  <td className="p-4 text-right text-xs font-mono text-slate-800">{formatCurrency(stats?.caixaStats.net || 0)}</td>
                  <td className="p-4 text-right text-xs font-mono text-slate-800">{formatCurrency(stats?.bancoStats.net || 0)}</td>
                  <td className="p-4 text-right text-xs font-mono text-slate-800">{formatCurrency(stats?.totalStats.net || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
            <Info className="w-4 h-4 text-indigo-400 shrink-0" />
            <p className="text-[10px] text-slate-500 font-bold uppercase leading-relaxed">
              Base de cálculo considera entradas diminuídas das despesas em ambas as contas (Caixa e Banco) registradas para a carteira GT Braz no período selecionado.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
