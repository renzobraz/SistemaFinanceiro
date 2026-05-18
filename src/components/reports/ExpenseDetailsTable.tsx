import React from 'react';
import { Transaction, Bank, Category } from '../../../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, ArrowUpDown } from 'lucide-react';

interface ExpenseDetailsTableProps {
  transactions: Transaction[];
  registries: {
    banks: Bank[];
    categories: Category[];
  };
}

export const ExpenseDetailsTable: React.FC<ExpenseDetailsTableProps> = ({ transactions, registries }) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [sortConfig, setSortConfig] = React.useState<{ key: keyof Transaction | 'bankName' | 'categoryName', direction: 'asc' | 'desc' }>({
    key: 'date',
    direction: 'desc'
  });

  // Filtra apenas despesas (DEBIT)
  const expenses = React.useMemo(() => {
    return transactions.filter(t => t.type === 'DEBIT');
  }, [transactions]);

  const sortedAndFilteredExpenses = React.useMemo(() => {
    let result = expenses.filter(t => {
      const category = registries.categories.find(c => c.id === t.categoryId)?.name || '';
      const bank = registries.banks.find(b => b.id === t.bankId)?.name || '';
      const searchStr = `${t.description} ${category} ${bank}`.toLowerCase();
      return searchStr.includes(searchTerm.toLowerCase());
    });

    result.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortConfig.key === 'bankName') {
        valA = registries.banks.find(bk => bk.id === a.bankId)?.name || '';
        valB = registries.banks.find(bk => bk.id === b.bankId)?.name || '';
      } else if (sortConfig.key === 'categoryName') {
        valA = registries.categories.find(c => c.id === a.categoryId)?.name || '';
        valB = registries.categories.find(c => c.id === b.categoryId)?.name || '';
      } else {
        valA = a[sortConfig.key as keyof Transaction] || '';
        valB = b[sortConfig.key as keyof Transaction] || '';
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [expenses, searchTerm, sortConfig, registries]);

  const handleSort = (key: keyof Transaction | 'bankName' | 'categoryName') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm mt-8">
      <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Detalhamento de Despesas</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Registros individuais filtrados</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar despesa..."
            className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-64 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleSort('date')}>
                <div className="flex items-center gap-1">Data <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleSort('description')}>
                <div className="flex items-center gap-1">Descrição <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleSort('categoryName')}>
                <div className="flex items-center gap-1">Categoria <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleSort('bankName')}>
                <div className="flex items-center gap-1">Banco <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="p-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleSort('value')}>
                <div className="flex items-center justify-end gap-1">Valor <ArrowUpDown className="w-3 h-3" /></div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedAndFilteredExpenses.map((t) => {
              const category = registries.categories.find(c => c.id === t.categoryId);
              const bank = registries.banks.find(b => b.id === t.bankId);

              return (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap">
                    {format(new Date(t.date), 'dd/MM/yyyy')}
                  </td>
                  <td className="p-4 text-xs font-bold text-slate-700">
                    <div className="flex flex-col">
                      <span>{t.description}</span>
                      {t.notes && <span className="text-[10px] text-slate-400 font-normal mt-0.5 line-clamp-1">{t.notes}</span>}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">
                      {category?.name || 'Sem Categoria'}
                    </span>
                  </td>
                  <td className="p-4 text-xs font-bold text-slate-500">
                    {bank?.name || '-'}
                  </td>
                  <td className="p-4 text-right text-xs font-black text-red-600 font-mono">
                    {formatCurrency(t.value)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sortedAndFilteredExpenses.length === 0 && (
        <div className="p-12 text-center">
          <p className="text-sm font-bold text-slate-400">Nenhuma despesa encontrada para os filtros atuais.</p>
        </div>
      )}

      <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        <span>Mostrando {sortedAndFilteredExpenses.length} despesas</span>
        <span className="text-slate-600">Total: {formatCurrency(sortedAndFilteredExpenses.reduce((acc, t) => acc + t.value, 0))}</span>
      </div>
    </div>
  );
};
