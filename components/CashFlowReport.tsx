
import React, { useMemo, useState, useEffect } from 'react';
import { Transaction, Bank, Category, CostCenter, Participant } from '../types';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  Line, 
  ComposedChart,
  Bar,
  Area
} from 'recharts';
import { 
  Calendar, 
  List, 
  ChevronRight, 
  ChevronDown, 
  Landmark, 
  Plus, 
  Minus, 
  // FIX: Using correct icon name 'Equal' from lucide-react
  Equal,
  Filter,
  CheckSquare,
  Square
} from 'lucide-react';

interface CashFlowReportProps {
  allTransactions: Transaction[];
  startDate: string;
  endDate: string;
  registries: {
    banks: Bank[];
    categories: Category[];
    costCenters: CostCenter[];
    participants: Participant[];
  };
}

type Granularity = 'MONTHLY' | 'DAILY';

interface CashFlowRow {
  period: string;
  key: string;
  initial: number;
  income: number;
  expense: number;
  operational: number;
  final: number;
  transactions: Transaction[];
}

export const CashFlowReport: React.FC<CashFlowReportProps> = ({ 
  allTransactions, 
  startDate, 
  endDate, 
  registries 
}) => {
  const [granularity, setGranularity] = useState<Granularity>('MONTHLY');
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showBankSelector, setShowBankSelector] = useState(false);

  // Inicializa com todos os bancos selecionados na primeira carga
  useEffect(() => {
    if (selectedBankIds.size === 0 && registries.banks.length > 0) {
      setSelectedBankIds(new Set(registries.banks.map(b => b.id)));
    }
  }, [registries.banks]);

  const toggleBank = (id: string) => {
    const next = new Set(selectedBankIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedBankIds(next);
  };

  const toggleAllBanks = () => {
    if (selectedBankIds.size === registries.banks.length) {
      setSelectedBankIds(new Set());
    } else {
      setSelectedBankIds(new Set(registries.banks.map(b => b.id)));
    }
  };

  const cashFlowData = useMemo(() => {
    // 1. Calcular Saldo Inicial Histórico (Tudo antes de startDate para os bancos selecionados)
    let historicalBalance = 0;
    if (startDate) {
      allTransactions.forEach(t => {
        if (t.date < startDate && selectedBankIds.has(t.bankId) && t.status === 'PAID') {
          historicalBalance += (t.type === 'CREDIT' ? t.value : -t.value);
        }
      });
    }

    // 2. Agrupar transações do período filtrado
    const periodMap = new Map<string, { period: string, key: string, income: number, expense: number, transactions: Transaction[] }>();
    
    // Filtra transações do período e dos bancos selecionados
    const periodTransactions = allTransactions.filter(t => {
      const inDateRange = (!startDate || t.date >= startDate) && (!endDate || t.date <= endDate);
      const isSelectedBank = selectedBankIds.has(t.bankId);
      return inDateRange && isSelectedBank;
    });

    const sorted = [...periodTransactions].sort((a, b) => a.date.localeCompare(b.date));

    sorted.forEach(t => {
      const date = new Date(t.date + 'T12:00:00');
      let key = '';
      let label = '';

      if (granularity === 'MONTHLY') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        label = date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase();
      } else {
        key = t.date;
        label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      }

      if (!periodMap.has(key)) {
        periodMap.set(key, { period: label, key, income: 0, expense: 0, transactions: [] });
      }

      const entry = periodMap.get(key)!;
      if (t.type === 'CREDIT') entry.income += t.value;
      else entry.expense += t.value;
      entry.transactions.push(t);
    });

    // 3. Gerar as linhas finais com a lógica solicitada
    const periods = Array.from(periodMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const finalData: CashFlowRow[] = [];
    
    let runningBalance = historicalBalance;

    periods.forEach(p => {
      const initial = runningBalance;
      const operational = p.income - p.expense;
      const final = initial + operational;
      
      finalData.push({
        ...p,
        initial,
        operational,
        final,
      });

      runningBalance = final;
    });

    return finalData;
  }, [allTransactions, startDate, endDate, granularity, selectedBankIds]);

  const toggleRow = (key: string) => {
    const next = new Set(expandedRows);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedRows(next);
  };

  const formatCurrency = (val: number, showSign: boolean = false) => {
    const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    if (!showSign) return formatted;
    return val > 0 ? `+ ${formatted}` : formatted;
  };

  const getName = (list: { id: string, name: string }[] | undefined, id: string) => {
    if (!list) return '-';
    return list.find(item => item.id === id)?.name || '-';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Controles e Filtros de Banco */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-700 mr-2">Visão:</span>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button 
                      onClick={() => setGranularity('MONTHLY')}
                      className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${granularity === 'MONTHLY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      MENSAL
                  </button>
                  <button 
                      onClick={() => setGranularity('DAILY')}
                      className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${granularity === 'DAILY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      DIÁRIO
                  </button>
              </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowBankSelector(!showBankSelector)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors border ${showBankSelector ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              <Landmark className="w-4 h-4" />
              <span>Bancos para Saldo ({selectedBankIds.size})</span>
              {showBankSelector ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {showBankSelector && (
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 animate-fade-in">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Selecionar Contas para Composição do Saldo</span>
              <button onClick={toggleAllBanks} className="text-xs text-blue-600 font-bold hover:underline">
                {selectedBankIds.size === registries.banks.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {registries.banks.map(bank => (
                <button 
                  key={bank.id} 
                  onClick={() => toggleBank(bank.id)}
                  className={`flex items-center gap-2 p-2 rounded-md border text-xs transition-all ${selectedBankIds.has(bank.id) ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                >
                  {selectedBankIds.has(bank.id) ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                  <span className="truncate">{bank.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Gráfico de Evolução de Caixa */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Tendência de Disponibilidade Acumulada
        </h3>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={cashFlowData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
              <Tooltip 
                formatter={(value: number) => [formatCurrency(value), '']}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="top" height={36}/>
              <Area name="Saldo Final" type="monotone" dataKey="final" fill="#3b82f6" fillOpacity={0.1} stroke="#3b82f6" strokeWidth={3} />
              <Bar name="Fluxo Operacional" dataKey="operational" fill="#10b981" barSize={granularity === 'DAILY' ? 10 : 30}>
                 {cashFlowData.map((entry, index) => (
                    <Bar key={`bar-${index}`} dataKey="operational" fill={entry.operational >= 0 ? '#10b981' : '#ef4444'} />
                 ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela Lógica do Fluxo de Caixa */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <List className="w-4 h-4 text-blue-600" /> Demonstração de Fluxo de Caixa
          </h3>
          <div className="text-[10px] text-slate-400 font-medium">Lógica: Inicial + Entradas - Saídas = Final</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-white border-b border-slate-100">
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase">Período</th>
                <th className="p-4 text-[10px] font-bold text-blue-600 uppercase text-right">(+) Saldo Inicial</th>
                <th className="p-4 text-[10px] font-bold text-green-600 uppercase text-right">(+) Entradas</th>
                <th className="p-4 text-[10px] font-bold text-red-600 uppercase text-right">(-) Saídas</th>
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase text-right">(=) Operacional</th>
                <th className="p-4 text-[10px] font-bold text-slate-800 uppercase text-right bg-blue-50/50">(=) Saldo Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cashFlowData.map((row) => (
                <React.Fragment key={row.key}>
                    <tr 
                        onClick={() => toggleRow(row.key)}
                        className={`hover:bg-slate-50 transition-colors cursor-pointer group ${expandedRows.has(row.key) ? 'bg-blue-50/20' : ''}`}
                    >
                        <td className="p-4 text-sm font-semibold text-slate-700">
                            <div className="flex items-center gap-2">
                                {expandedRows.has(row.key) ? <ChevronDown className="w-4 h-4 text-blue-500" /> : <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400" />}
                                {row.period}
                            </div>
                        </td>
                        <td className="p-4 text-sm text-blue-600 text-right font-mono font-medium">{formatCurrency(row.initial)}</td>
                        <td className="p-4 text-sm text-green-600 text-right font-mono">{formatCurrency(row.income)}</td>
                        <td className="p-4 text-sm text-red-600 text-right font-mono">{formatCurrency(row.expense)}</td>
                        <td className={`p-4 text-sm font-bold text-right font-mono ${row.operational >= 0 ? 'text-slate-700' : 'text-red-500'}`}>
                            {formatCurrency(row.operational, true)}
                        </td>
                        <td className={`p-4 text-sm font-black text-right font-mono bg-blue-50/30 ${row.final >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                            {formatCurrency(row.final)}
                        </td>
                    </tr>
                    {/* Detalhamento de Transações do Período */}
                    {expandedRows.has(row.key) && (
                        <tr className="bg-slate-50/30">
                            <td colSpan={6} className="p-4">
                                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden animate-slide-down shadow-inner">
                                    <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-600 uppercase">Movimentação em {row.period}</span>
                                        <span className="text-[10px] text-slate-400 italic">Considerando apenas bancos selecionados</span>
                                    </div>
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase tracking-tighter">
                                            <tr>
                                                <th className="p-3">Data</th>
                                                <th className="p-3">Descrição</th>
                                                <th className="p-3">Banco</th>
                                                <th className="p-3">Categoria</th>
                                                <th className="p-3 text-right">Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {row.transactions.map((t) => (
                                                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-3 text-xs text-slate-500">{t.date.split('-').reverse().join('/')}</td>
                                                    <td className="p-3 text-xs font-semibold text-slate-700">{t.description}</td>
                                                    <td className="p-3 text-xs text-slate-400 font-medium">{getName(registries.banks, t.bankId)}</td>
                                                    <td className="p-3 text-xs text-slate-500">{getName(registries.categories, t.categoryId)}</td>
                                                    <td className={`p-3 text-xs text-right font-bold ${t.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                                                        {t.type === 'CREDIT' ? '+' : '-'} {formatCurrency(t.value)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </td>
                        </tr>
                    )}
                </React.Fragment>
              ))}
              {cashFlowData.length === 0 && (
                  <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-400 italic">
                          Nenhuma movimentação encontrada para o período e bancos selecionados.
                      </td>
                  </tr>
              )}
            </tbody>
            {/* Rodapé com Balanço Operacional Total */}
            {cashFlowData.length > 0 && (
                <tfoot className="bg-slate-100/50 font-bold border-t-2 border-slate-200">
                    <tr>
                        <td className="p-4 text-xs text-slate-600 uppercase">Totais Visíveis</td>
                        <td className="p-4 text-xs text-right text-blue-600 italic">Cálculo Dinâmico</td>
                        <td className="p-4 text-xs text-right text-green-600">
                            {formatCurrency(cashFlowData.reduce((acc, curr) => acc + curr.income, 0))}
                        </td>
                        <td className="p-4 text-xs text-right text-red-600">
                            {formatCurrency(cashFlowData.reduce((acc, curr) => acc + curr.expense, 0))}
                        </td>
                        <td className="p-4 text-xs text-right text-slate-700">
                            {formatCurrency(cashFlowData.reduce((acc, curr) => acc + curr.operational, 0), true)}
                        </td>
                        <td className="p-4 text-xs text-right text-blue-700 bg-blue-100/30">
                            {formatCurrency(cashFlowData[cashFlowData.length - 1].final)}
                        </td>
                    </tr>
                </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};