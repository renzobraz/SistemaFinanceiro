import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import currency from 'currency.js';
import { Transaction } from '../../../types';

interface CashFlowChartProps {
  transactions: Transaction[];
}

export const CashFlowChart: React.FC<CashFlowChartProps> = ({ transactions }) => {
  const chartData = React.useMemo(() => {
    const monthlyData: Record<string, { month: string, income: number, expense: number }> = {};

    transactions.forEach(t => {
      const date = parseISO(t.date);
      const monthKey = format(date, 'yyyy-MM');
      const monthLabel = format(date, 'MMM/yy', { locale: ptBR }).toUpperCase();

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { month: monthLabel, income: 0, expense: 0 };
      }

      if (t.type === 'CREDIT') {
        monthlyData[monthKey].income = currency(monthlyData[monthKey].income).add(t.value).value;
      } else {
        monthlyData[monthKey].expense = currency(monthlyData[monthKey].expense).add(t.value).value;
      }
    });

    return Object.values(monthlyData).sort((a, b) => {
        // Simple sort by label would be tricky with MMM/yy, so let's stick to key order if possible 
        // or re-parse. Since we object.values, let's sort keys first.
        return 0; // The processing above doesn't guarantee order, I'll fix this below.
    });
  }, [transactions]);

  // Better sorting for chartData
  const sortedChartData = React.useMemo(() => {
    const dataMap: Record<string, { month: string, income: number, expense: number, rawDate: string }> = {};

    transactions.forEach(t => {
      const date = parseISO(t.date);
      const monthKey = format(date, 'yyyy-MM');
      const monthLabel = format(date, 'MMM/yy', { locale: ptBR }).toUpperCase();

      if (!dataMap[monthKey]) {
        dataMap[monthKey] = { month: monthLabel, income: 0, expense: 0, rawDate: monthKey };
      }

      if (t.type === 'CREDIT') {
        dataMap[monthKey].income = currency(dataMap[monthKey].income).add(t.value).value;
      } else {
        dataMap[monthKey].expense = currency(dataMap[monthKey].expense).add(t.value).value;
      }
    });

    return Object.values(dataMap).sort((a, b) => a.rawDate.localeCompare(b.rawDate));
  }, [transactions]);

  const formatCurrency = (value: number) => {
    const absoluteVal = Math.abs(value) < 0.005 ? 0 : value;
    return currency(absoluteVal, { symbol: 'R$ ', separator: '.', decimal: ',', precision: 2 }).format();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Fluxo de Caixa Mensal</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Evolução de Receitas vs Despesas</p>
        </div>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sortedChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="month" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
              tickFormatter={(value) => value >= 1000 ? `${value / 1000}k` : value}
            />
            <Tooltip 
              cursor={{ fill: '#f8fafc' }}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100 min-w-[150px]">
                      <p className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">{label}</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[10px] text-emerald-600 font-bold">Receitas:</span>
                          <span className="text-[10px] text-slate-900 font-black">{formatCurrency(payload[0].value as number)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[10px] text-red-600 font-bold">Despesas:</span>
                          <span className="text-[10px] text-slate-900 font-black">{formatCurrency(payload[1].value as number)}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend 
              verticalAlign="top" 
              align="right" 
              iconType="circle"
              wrapperStyle={{ paddingBottom: 20, fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            />
            <Bar name="Receitas" dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
            <Bar name="Despesas" dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
