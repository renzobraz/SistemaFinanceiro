import React from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer,
  Legend 
} from 'recharts';
import currency from 'currency.js';
import { Transaction, Bank, Category, CostCenter, Participant, Wallet, AssetType, AssetSector, AssetTicker } from '../../../types';

interface Registries {
  banks: Bank[];
  categories: Category[];
  costCenters: CostCenter[];
  participants: Participant[];
  wallets: Wallet[];
  assetTypes: AssetType[];
  assetSectors: AssetSector[];
  assetTickers: AssetTicker[];
}

interface ExpenseDistributionChartProps {
  transactions: Transaction[];
  registries: Registries;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

export const ExpenseDistributionChart: React.FC<ExpenseDistributionChartProps> = ({ transactions, registries }) => {
  const expenseData = React.useMemo(() => {
    const categories: Record<string, number> = {};

    transactions
      .filter(t => t.type === 'DEBIT')
      .forEach(t => {
        const category = registries.categories.find(c => c.id === t.categoryId)?.name || 'Outros';
        categories[category] = currency(categories[category] || 0).add(t.value).value;
      });

    const sortedData = Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Limit to top 7 and group the rest in "Outros" to avoid legend overflow
    if (sortedData.length > 8) {
      const top7 = sortedData.slice(0, 7);
      const othersValue = sortedData.slice(7).reduce((acc, curr) => currency(acc).add(curr.value).value, 0);
      return [...top7, { name: 'Outros', value: othersValue }];
    }

    return sortedData;
  }, [transactions, registries]);

  const totalExpenses = React.useMemo(() => {
    return expenseData.reduce((acc, curr) => currency(acc).add(curr.value).value, 0);
  }, [expenseData]);

  const formatCurrency = (value: number) => {
    // Garante que o valor zero não seja exibido como negativo devido a erros de precisão
    const absoluteVal = Math.abs(value) < 0.001 ? 0 : value;
    return currency(absoluteVal, { symbol: 'R$ ', separator: '.', decimal: ',', precision: 2 }).format();
  };

  const renderLegendText = (value: string, entry: any) => {
    const { payload } = entry;
    const percentage = totalExpenses > 0 ? ((payload.value / totalExpenses) * 100).toFixed(1) : 0;
    return (
      <span className="text-slate-600 font-bold ml-1">
        {value} <span className="text-blue-500 ml-1">{percentage}%</span>
      </span>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Distribuição de Despesas</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Por categoria de gasto</p>
        </div>
      </div>

      <div className="h-[320px] w-full flex flex-col items-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={expenseData}
              cx="40%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {expenseData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  const percentage = totalExpenses > 0 ? ((data.value / totalExpenses) * 100).toFixed(1) : 0;
                  return (
                    <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100 min-w-[150px]">
                      <p className="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">{data.name}</p>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[10px] text-slate-900 font-black">{formatCurrency(data.value)}</span>
                        <span className="text-[10px] text-blue-600 font-black">{percentage}%</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend 
               layout="vertical" 
               verticalAlign="middle" 
               align="right"
               iconType="circle"
               formatter={renderLegendText}
               wrapperStyle={{ 
                 fontSize: 10, 
                 fontWeight: 'bold', 
                 textTransform: 'uppercase', 
                 letterSpacing: '0.05em',
                 paddingLeft: 10,
                 maxWidth: '50%'
               }}
            />
          </PieChart>
        </ResponsiveContainer>
        
        {expenseData.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-slate-300 text-xs font-bold uppercase tracking-widest">Sem despesas no período</span>
          </div>
        )}
      </div>
    </div>
  );
};
