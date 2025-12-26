
import React, { useMemo } from 'react';
import { Transaction } from '../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  Line, 
  ComposedChart,
  Area
} from 'recharts';
import { TrendingUp, TrendingDown, Scale, Info } from 'lucide-react';

interface CashFlowReportProps {
  transactions: Transaction[];
}

export const CashFlowReport: React.FC<CashFlowReportProps> = ({ transactions }) => {
  const cashFlowData = useMemo(() => {
    const monthlyMap = new Map<string, { month: string, income: number, expense: number, net: number }>();

    // Ordenar transações por data para o cálculo do saldo acumulado
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

    sorted.forEach(t => {
      const date = new Date(t.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase();

      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, { month: monthLabel, income: 0, expense: 0, net: 0 });
      }

      const entry = monthlyMap.get(key)!;
      if (t.type === 'CREDIT') {
        entry.income += t.value;
      } else {
        entry.expense += t.value;
      }
      entry.net = entry.income - entry.expense;
    });

    const data = Array.from(monthlyMap.values());
    
    // Adicionar saldo acumulado
    let accumulated = 0;
    return data.map(item => {
      accumulated += item.net;
      return { ...item, accumulated };
    });
  }, [transactions]);

  const stats = useMemo(() => {
    if (cashFlowData.length === 0) return null;
    const totalIncome = cashFlowData.reduce((acc, curr) => acc + curr.income, 0);
    const totalExpense = cashFlowData.reduce((acc, curr) => acc + curr.expense, 0);
    const avgNet = (totalIncome - totalExpense) / cashFlowData.length;
    
    return {
      totalIncome,
      totalExpense,
      avgNet,
      bestMonth: [...cashFlowData].sort((a, b) => b.net - a.net)[0]
    };
  }, [cashFlowData]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  if (cashFlowData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 text-slate-400">
        <Info className="w-12 h-12 mb-4 opacity-20" />
        <p>Não há dados suficientes para gerar o relatório de fluxo de caixa.</p>
        <p className="text-sm">Tente ajustar os filtros de data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg"><TrendingUp className="w-5 h-5 text-green-600" /></div>
            <span className="text-sm font-medium text-slate-500">Média Mensal de Entradas</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(stats ? stats.totalIncome / cashFlowData.length : 0)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-50 rounded-lg"><TrendingDown className="w-5 h-5 text-red-600" /></div>
            <span className="text-sm font-medium text-slate-500">Média Mensal de Saídas</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(stats ? stats.totalExpense / cashFlowData.length : 0)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg"><Scale className="w-5 h-5 text-blue-600" /></div>
            <span className="text-sm font-medium text-slate-500">Saldo Médio por Período</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(stats?.avgNet || 0)}</p>
        </div>
      </div>

      {/* Gráfico Principal */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-6">Tendência de Fluxo Mensal</h3>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={cashFlowData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="month" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#64748b', fontSize: 12}} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#64748b', fontSize: 12}} 
                tickFormatter={(val) => `R$ ${val/1000}k`}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number) => [formatCurrency(value), '']}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar name="Entradas" dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
              <Bar name="Saídas" dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={30} />
              <Line 
                name="Saldo Acumulado" 
                type="monotone" 
                dataKey="accumulated" 
                stroke="#3b82f6" 
                strokeWidth={3} 
                dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Detalhamento Mensal</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-slate-100">
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">Mês</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Entradas</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Saídas</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Resultado</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cashFlowData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-sm font-semibold text-slate-700">{row.month}</td>
                  <td className="p-4 text-sm text-green-600 text-right">{formatCurrency(row.income)}</td>
                  <td className="p-4 text-sm text-red-600 text-right">{formatCurrency(row.expense)}</td>
                  <td className={`p-4 text-sm font-bold text-right ${row.net >= 0 ? 'text-slate-700' : 'text-red-500'}`}>
                    {formatCurrency(row.net)}
                  </td>
                  <td className={`p-4 text-sm font-bold text-right ${row.accumulated >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatCurrency(row.accumulated)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
