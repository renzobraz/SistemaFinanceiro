import React, { useMemo } from 'react';
import { Transaction, Bank } from '../types';
import { DollarSign, TrendingDown, TrendingUp, Clock, Landmark } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface SummaryProps {
  transactions: Transaction[];
  banks: Bank[];
}

export const Summary: React.FC<SummaryProps> = ({ transactions, banks }) => {
  const summary = useMemo(() => {
    return transactions.reduce(
      (acc, t) => {
        const val = t.value;
        if (t.type === 'CREDIT') {
          if (t.status === 'PAID') acc.balance += val;
          acc.income += val;
          if (t.status === 'PENDING') acc.pendingIncome += val;
        } else {
          if (t.status === 'PAID') acc.balance -= val;
          acc.expense += val;
          if (t.status === 'PENDING') acc.pendingExpense += val;
        }
        return acc;
      },
      { balance: 0, income: 0, expense: 0, pendingIncome: 0, pendingExpense: 0 }
    );
  }, [transactions]);

  // Cálculo dos saldos por banco
  const bankBalances = useMemo(() => {
    const balances = new Map<string, number>();

    // Inicializa bancos
    banks.forEach(b => balances.set(b.id, 0));

    // Soma apenas transações PAGAS
    transactions.forEach(t => {
      if (t.status === 'PAID' && t.bankId) {
        const current = balances.get(t.bankId) || 0;
        const val = t.type === 'CREDIT' ? t.value : -t.value;
        balances.set(t.bankId, current + val);
      }
    });

    return banks
      .map(b => ({
        id: b.id,
        name: b.name,
        balance: balances.get(b.id) || 0
      }))
      .filter(b => b.balance !== 0) // Filtra bancos zerados
      .sort((a, b) => b.balance - a.balance); // Ordena maior para menor
  }, [transactions, banks]);

  const chartData = useMemo(() => {
    return [
      { name: 'Receitas', value: summary.income, color: '#10b981' }, // green-500
      { name: 'Despesas', value: summary.expense, color: '#ef4444' }, // red-500
    ];
  }, [summary]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        {/* Cards */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Saldo Atual (Realizado)</p>
              <h3 className={`text-2xl font-bold mt-1 ${summary.balance >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                {formatCurrency(summary.balance)}
              </h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
          <div className="text-xs text-slate-400">Considera apenas baixados</div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Receitas Totais</p>
              <h3 className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(summary.income)}</h3>
            </div>
            <div className="p-3 bg-green-50 text-green-600 rounded-lg">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-yellow-600">
              <Clock className="w-3 h-3" />
              <span>Pendente: {formatCurrency(summary.pendingIncome)}</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Despesas Totais</p>
              <h3 className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(summary.expense)}</h3>
            </div>
            <div className="p-3 bg-red-50 text-red-600 rounded-lg">
              <TrendingDown className="w-6 h-6" />
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-yellow-600">
               <Clock className="w-3 h-3" />
              <span>Pendente: {formatCurrency(summary.pendingExpense)}</span>
          </div>
        </div>

        {/* Mini Chart */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center">
          <h4 className="text-sm font-medium text-slate-500 mb-2 w-full text-left">Visão Geral</h4>
          <div className="w-full h-24">
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                      <Tooltip 
                          cursor={{fill: 'transparent'}}
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          formatter={(value: number) => [formatCurrency(value), '']}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                      </Bar>
                  </BarChart>
              </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Seção de Saldos Bancários Detalhados */}
      {bankBalances.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
          <div className="flex items-center gap-2 mb-4 text-slate-800">
            <Landmark className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold">Saldos por Banco</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {bankBalances.map(b => (
              <div key={b.id} className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex flex-col hover:border-blue-200 transition-colors">
                <span className="text-sm text-slate-500 font-medium mb-1 truncate" title={b.name}>{b.name}</span>
                <span className={`text-xl font-bold ${b.balance >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                  {formatCurrency(b.balance)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};