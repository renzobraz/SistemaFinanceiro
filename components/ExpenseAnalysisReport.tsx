
import React, { useMemo, useState } from 'react';
import { Transaction, Bank, Category, CostCenter, Participant } from '../types';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { LayoutGrid, Tags, Users, TrendingDown, Table as TableIcon, BarChart3, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';

interface ExpenseAnalysisReportProps {
  transactions: Transaction[];
  registries: {
    banks: Bank[];
    categories: Category[];
    costCenters: CostCenter[];
    participants: Participant[];
  };
}

const COLORS = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#64748b'];

export const ExpenseAnalysisReport: React.FC<ExpenseAnalysisReportProps> = ({ transactions, registries }) => {
  const [viewType, setViewType] = useState<'CATEGORY' | 'COST_CENTER' | 'PARTICIPANT'>('CATEGORY');
  const [displayMode, setDisplayMode] = useState<'CHARTS' | 'TABLE'>('CHARTS');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'total', direction: 'desc' });

  const expenses = useMemo(() => transactions.filter(t => t.type === 'DEBIT'), [transactions]);

  const analysisData = useMemo(() => {
    const totalMap = new Map<string, number>();
    
    expenses.forEach(t => {
      let key = 'Indefinido';
      if (viewType === 'CATEGORY') {
        key = registries.categories.find(c => c.id === t.categoryId)?.name || 'Sem Categoria';
      } else if (viewType === 'COST_CENTER') {
        key = registries.costCenters.find(cc => cc.id === t.costCenterId)?.name || 'Sem Centro de Custo';
      } else {
        key = registries.participants.find(p => p.id === t.participantId)?.name || 'Sem Participante';
      }

      totalMap.set(key, (totalMap.get(key) || 0) + t.value);
    });

    return Array.from(totalMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenses, viewType, registries]);

  // Dados para a Tabela Mensal (Pivot)
  const monthlyTableData = useMemo(() => {
    const pivot: Record<string, Record<string, number>> = {};
    const monthsSet = new Set<string>();

    expenses.forEach(t => {
      const date = new Date(t.date + 'T12:00:00');
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthsSet.add(monthKey);

      let entityName = 'Indefinido';
      if (viewType === 'CATEGORY') {
        entityName = registries.categories.find(c => c.id === t.categoryId)?.name || 'Sem Categoria';
      } else if (viewType === 'COST_CENTER') {
        entityName = registries.costCenters.find(cc => cc.id === t.costCenterId)?.name || 'Sem Centro de Custo';
      } else {
        entityName = registries.participants.find(p => p.id === t.participantId)?.name || 'Sem Participante';
      }

      if (!pivot[entityName]) pivot[entityName] = {};
      pivot[entityName][monthKey] = (pivot[entityName][monthKey] || 0) + t.value;
    });

    const sortedMonths = Array.from(monthsSet).sort();
    let rows = Object.entries(pivot).map(([name, monthlyValues]) => {
      const total = Object.values(monthlyValues).reduce((a, b) => a + b, 0);
      return { name, monthlyValues, total };
    });

    // Ordenação dinâmica
    rows.sort((a, b) => {
      let valA: any, valB: any;
      if (sortConfig.key === 'name') {
        valA = a.name; valB = b.name;
      } else if (sortConfig.key === 'total') {
        valA = a.total; valB = b.total;
      } else {
        valA = a.monthlyValues[sortConfig.key] || 0;
        valB = b.monthlyValues[sortConfig.key] || 0;
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return { rows, sortedMonths };
  }, [expenses, viewType, registries, sortConfig]);

  const totalExpenseValue = useMemo(() => expenses.reduce((acc, curr) => acc + curr.value, 0), [expenses]);

  const formatCurrency = (val: number, decimals: boolean = true) => 
    new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL',
      maximumFractionDigits: decimals ? 2 : 0,
      minimumFractionDigits: decimals ? 2 : 0
    }).format(val);

  const formatMonth = (key: string) => {
    const [year, month] = key.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase();
  };

  const requestSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortConfig.key !== colKey) return <ChevronDown className="w-3 h-3 opacity-20" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />;
  };

  return (
    <div className="space-y-6 animate-fade-in w-full">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 whitespace-nowrap">
                <TrendingDown className="w-5 h-5 text-red-500" /> Análise de Gastos
            </h2>
            
            <div className="flex bg-slate-100 p-1 rounded-lg ml-2">
                <button 
                    onClick={() => setDisplayMode('CHARTS')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${displayMode === 'CHARTS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <BarChart3 className="w-3 h-3" /> GRÁFICOS
                </button>
                <button 
                    onClick={() => setDisplayMode('TABLE')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${displayMode === 'TABLE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <TableIcon className="w-3 h-3" /> TABELA MENSAL
                </button>
            </div>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => setViewType('CATEGORY')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewType === 'CATEGORY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Tags className="w-3 h-3" /> CATEGORIA
          </button>
          <button 
            onClick={() => setViewType('COST_CENTER')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewType === 'COST_CENTER' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <LayoutGrid className="w-3 h-3" /> C. CUSTO
          </button>
          <button 
            onClick={() => setViewType('PARTICIPANT')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewType === 'PARTICIPANT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Users className="w-3 h-3" /> PARTICIPANTE
          </button>
        </div>
      </div>

      {displayMode === 'CHARTS' ? (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
                {/* Gráfico de Pizza */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-h-[450px]">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Distribuição Percentual</h3>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={analysisData}
                                    cx="50%"
                                    cy="40%"
                                    innerRadius={70}
                                    outerRadius={110}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {analysisData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    formatter={(value: number) => [formatCurrency(value), 'Gasto']}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend 
                                    layout="horizontal" 
                                    verticalAlign="bottom" 
                                    align="center"
                                    wrapperStyle={{ 
                                        paddingTop: '20px',
                                        fontSize: '11px'
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Gráfico de Barras */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-h-[450px]">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Volume por Grupo</h3>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analysisData} layout="vertical" margin={{ left: 10, right: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={110} tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    formatter={(value: number) => formatCurrency(value)}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                                    {analysisData.map((_, index) => (
                                        <Cell key={`cell-bar-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Lista Detalhada */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden w-full">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Detalhamento dos Valores</h3>
                    <div className="text-xs font-medium text-slate-500">
                        Total do Período: <span className="text-red-600 font-bold">{formatCurrency(totalExpenseValue)}</span>
                    </div>
                </div>
                <div className="divide-y divide-slate-50">
                    {analysisData.map((item, idx) => {
                        const percent = (item.value / totalExpenseValue) * 100;
                        return (
                            <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="w-2 h-10 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                    <div className="flex-1">
                                        <h4 className="text-sm font-bold text-slate-700">{item.name}</h4>
                                        <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${percent}%`, backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right ml-8">
                                    <div className="text-sm font-bold text-slate-800">{formatCurrency(item.value)}</div>
                                    <div className="text-[10px] text-slate-400 font-medium uppercase">{percent.toFixed(1)}% do total</div>
                                </div>
                            </div>
                        );
                    })}
                    {analysisData.length === 0 && (
                        <div className="p-12 text-center text-slate-400 italic">Nenhuma despesa encontrada para os critérios selecionados.</div>
                    )}
                </div>
            </div>
        </>
      ) : (
        /* Nova Visão: TABELA MENSAL - SEM BARRA DE ROLAGEM E SEM DECIMAIS */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in w-full">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Gastos Mensais Detalhados</h3>
                <span className="text-xs text-slate-500">Total Geral: <strong className="text-red-600">{formatCurrency(totalExpenseValue, false)}</strong></span>
            </div>
            <div className="w-full">
                <table className="w-full text-left border-collapse table-fixed">
                    <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-200">
                            <th 
                                onClick={() => requestSort('name')}
                                className="p-2 text-[10px] font-bold text-slate-500 uppercase w-1/4 cursor-pointer hover:bg-slate-100 transition-colors"
                            >
                                <div className="flex items-center gap-1">Descrição <SortIcon colKey="name" /></div>
                            </th>
                            {monthlyTableData.sortedMonths.map(month => (
                                <th 
                                    key={month} 
                                    onClick={() => requestSort(month)}
                                    className="p-2 text-[10px] font-bold text-slate-500 uppercase text-right cursor-pointer hover:bg-slate-100 transition-colors"
                                >
                                    <div className="flex items-center justify-end gap-1">{formatMonth(month)} <SortIcon colKey={month} /></div>
                                </th>
                            ))}
                            <th 
                                onClick={() => requestSort('total')}
                                className="p-2 text-[10px] font-bold text-slate-500 uppercase text-right bg-blue-50/30 w-[100px] cursor-pointer hover:bg-blue-100/50 transition-colors"
                            >
                                <div className="flex items-center justify-end gap-1">Total <SortIcon colKey="total" /></div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {monthlyTableData.rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                <td className="p-2 text-xs font-bold text-slate-700 truncate">
                                    <div className="flex items-center gap-1.5 truncate">
                                        <div className="w-1 h-3 flex-shrink-0 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                        <span className="truncate">{row.name}</span>
                                    </div>
                                </td>
                                {monthlyTableData.sortedMonths.map(month => {
                                    const val = row.monthlyValues[month] || 0;
                                    return (
                                        <td key={month} className={`p-2 text-xs text-right whitespace-nowrap ${val > 0 ? 'text-slate-600' : 'text-slate-200'}`}>
                                            {val > 0 ? formatCurrency(val, false) : '-'}
                                        </td>
                                    );
                                })}
                                <td className="p-2 text-xs font-bold text-red-600 text-right bg-blue-50/10 whitespace-nowrap">
                                    {formatCurrency(row.total, false)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-100/50 font-bold border-t-2 border-slate-200">
                        <tr>
                            <td className="p-2 text-[10px] text-slate-600 uppercase">Totais</td>
                            {monthlyTableData.sortedMonths.map(month => {
                                const monthTotal = monthlyTableData.rows.reduce((acc, row) => acc + (row.monthlyValues[month] || 0), 0);
                                return (
                                    <td key={month} className="p-2 text-xs text-right text-red-600 whitespace-nowrap">
                                        {formatCurrency(monthTotal, false)}
                                    </td>
                                );
                            })}
                            <td className="p-2 text-xs text-right text-red-700 bg-blue-100/20 whitespace-nowrap">
                                {formatCurrency(totalExpenseValue, false)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            {monthlyTableData.rows.length === 0 && (
                <div className="p-12 text-center text-slate-400 italic">Nenhum dado encontrado para gerar a tabela.</div>
            )}
        </div>
      )}
    </div>
  );
};
