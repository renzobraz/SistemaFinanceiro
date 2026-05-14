import React from 'react';
import currency from 'currency.js';
import { TrendingUp, TrendingDown, Wallet, PieChart } from 'lucide-react';
import { Transaction } from '../../../types';

interface KPICardsProps {
  transactions: Transaction[];
}

export const KPICards: React.FC<KPICardsProps> = ({ transactions }) => {
  const formatBRL = (value: number) => {
    return currency(value, { 
      symbol: 'R$ ', 
      separator: '.', 
      decimal: ',', 
      precision: 2 
    }).format();
  };

  const totals = transactions.reduce((acc, t) => {
    const val = currency(t.value);
    if (t.type === 'CREDIT') {
      acc.income = acc.income.add(val);
    } else {
      acc.expense = acc.expense.add(val);
    }
    return acc;
  }, { 
    income: currency(0), 
    expense: currency(0) 
  });

  const netBalance = totals.income.subtract(totals.expense);
  const savingMargin = totals.income.value > 0 
    ? netBalance.divide(totals.income.value).multiply(100).value 
    : 0;

  const cards = [
    {
      title: 'Total de Receitas',
      value: formatBRL(totals.income.value),
      icon: TrendingUp,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-100'
    },
    {
      title: 'Total de Despesas',
      value: formatBRL(totals.expense.value),
      icon: TrendingDown,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-100'
    },
    {
      title: 'Saldo Líquido',
      value: formatBRL(netBalance.value),
      icon: Wallet,
      color: netBalance.value >= 0 ? 'text-blue-600' : 'text-orange-600',
      bgColor: netBalance.value >= 0 ? 'bg-blue-50' : 'bg-orange-50',
      borderColor: netBalance.value >= 0 ? 'border-blue-100' : 'border-orange-100'
    },
    {
      title: 'Margem de Economia',
      value: `${savingMargin.toFixed(2)}%`,
      icon: PieChart,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-100'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 max-w-7xl mx-auto">
      {cards.map((card, index) => (
        <div 
          key={index}
          className={`bg-white border ${card.borderColor} rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{card.title}</span>
            <div className={`p-2 ${card.bgColor} rounded-xl group-hover:scale-110 transition-transform`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
          </div>
          <div className={`text-2xl font-black ${card.color} tracking-tight`}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
};
