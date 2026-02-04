
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Edit2, 
  Trash2, 
  Search, 
  CheckSquare, 
  Square,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  FileSpreadsheet,
  FilterX,
  Info,
  ChevronFirst,
  ChevronLast,
  Zap
} from 'lucide-react';
import { Transaction, Bank, Category, CostCenter, Participant, Wallet } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface TransactionListProps {
  transactions: Transaction[];
  registries: {
    banks: Bank[];
    categories: Category[];
    costCenters: CostCenter[];
    participants: Participant[];
    wallets?: Wallet[];
  };
  onEdit: (t: Transaction) => void;
  onDelete: (ids: string[]) => void;
  onImport: (importedData: any[]) => void;
  variant?: 'card' | 'full';
  externalBalanceMap?: Record<string, number>;
  initialSortByStatus?: 'PAID' | 'PENDING' | 'ALL';
  totalInDatabase?: number;
}

interface ColumnFilters {
  bankId: string;
  walletId: string;
  categoryId: string;
  participantId: string;
  costCenterId: string;
  description: string;
  debit: string;
  credit: string;
}

const initialFilters: ColumnFilters = {
  bankId: '',
  walletId: '',
  categoryId: '',
  participantId: '',
  costCenterId: '',
  description: '',
  debit: '',
  credit: ''
};

export const TransactionList: React.FC<TransactionListProps> = ({ 
  transactions, 
  registries, 
  onEdit, 
  onDelete,
  variant = 'card',
  externalBalanceMap,
  initialSortByStatus = 'ALL',
  totalInDatabase = 0
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(initialFilters);
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  
  const defaultSort: { key: keyof Transaction, direction: 'asc' | 'desc' } = useMemo(() => {
    if (initialSortByStatus === 'PENDING') return { key: 'date', direction: 'asc' };
    return { key: 'date', direction: 'desc' };
  }, [initialSortByStatus]);

  const [sortConfig, setSortConfig] = useState<{ key: keyof Transaction, direction: 'asc' | 'desc' } | null>(defaultSort);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50); 
  
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    ids: string[];
    message: string;
    type: 'DELETE' | 'DEDUPLICATE';
  }>({ isOpen: false, ids: [], message: '', type: 'DELETE' });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, columnFilters, sortConfig, transactions, itemsPerPage]);

  const getName = (list: { id: string, name: string }[] | undefined, id: string | null | undefined) => {
    if (!list || !id) return '-';
    const searchId = String(id).trim();
    const item = list.find(x => String(x.id).trim() === searchId);
    return item ? item.name : '-';
  };

  const { filteredTransactions, balanceMap } = useMemo(() => {
    let data = [...transactions];

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      data = data.filter(t => 
        t.description.toLowerCase().includes(lowerTerm) ||
        t.docNumber.toLowerCase().includes(lowerTerm) ||
        getName(registries.participants, t.participantId).toLowerCase().includes(lowerTerm)
      );
    }

    if (columnFilters.bankId) data = data.filter(t => t.bankId === columnFilters.bankId);
    if (columnFilters.walletId) data = data.filter(t => t.walletId === columnFilters.walletId);
    if (columnFilters.categoryId) data = data.filter(t => t.categoryId === columnFilters.categoryId);
    if (columnFilters.participantId) data = data.filter(t => t.participantId === columnFilters.participantId);
    if (columnFilters.costCenterId) data = data.filter(t => t.costCenterId === columnFilters.costCenterId);
    if (columnFilters.description) {
        const descTerm = columnFilters.description.toLowerCase();
        data = data.filter(t => t.description.toLowerCase().includes(descTerm));
    }
    if (columnFilters.debit) {
        data = data.filter(t => t.type === 'DEBIT' && t.value.toString().includes(columnFilters.debit));
    }
    if (columnFilters.credit) {
        data = data.filter(t => t.type === 'CREDIT' && t.value.toString().includes(columnFilters.credit));
    }

    if (sortConfig) {
      data.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        
        if (sortConfig.key === 'date') {
            const dir = sortConfig.direction === 'asc' ? 1 : -1;
            return a.id.localeCompare(b.id) * dir;
        }

        return 0;
      });
    }

    let bMap: Record<string, number> = {};

    if (externalBalanceMap) {
        bMap = externalBalanceMap;
    } else {
        const chronoSorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        let runningBalance = 0;
        chronoSorted.forEach(t => {
            if (t.type === 'CREDIT') {
                runningBalance += t.value;
            } else {
                runningBalance -= t.value;
            }
            bMap[t.id] = runningBalance;
        });
    }

    return { filteredTransactions: data, balanceMap: bMap };
  }, [transactions, searchTerm, columnFilters, sortConfig, registries, externalBalanceMap]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentTransactions = filteredTransactions.slice(startIndex, startIndex + itemsPerPage);

  const isAllSelected = currentTransactions.length > 0 && currentTransactions.every(t => selectedIds.includes(t.id));

  const handleSelectAll = () => {
    if (isAllSelected) {
      const idsToDeselect = currentTransactions.map(t => t.id);
      setSelectedIds(prev => prev.filter(id => !idsToDeselect.includes(id)));
    } else {
      const newIds = currentTransactions.map(t => t.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...newIds])));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const confirmAction = () => {
      onDelete(confirmModal.ids);
      setSelectedIds(prev => prev.filter(id => !confirmModal.ids.includes(id)));
  };

  const findDuplicates = () => {
      const dupIds: string[] = [];
      const seen = new Map<string, string>(); 
      
      transactions.forEach(t => {
          const key = `${t.date}|${t.value.toFixed(2)}|${t.description.trim().toLowerCase()}|${t.bankId}|${t.type}`;
          if (seen.has(key)) {
              dupIds.push(t.id);
          } else {
              seen.set(key, t.id);
          }
      });

      if (dupIds.length === 0) {
          alert("Nenhum lançamento duplicado encontrado com base em Data, Valor, Descrição e Banco.");
          return;
      }

      setConfirmModal({
          isOpen: true,
          ids: dupIds,
          type: 'DEDUPLICATE',
          message: `Foram identificados ${dupIds.length} possíveis lançamentos duplicados (mesma data, valor, descrição e banco). Deseja removê-los agora?`
      });
  };

  const formatDateDisplay = (dateString: string) => {
      if (!dateString) return '-';
      const [year, month, day] = dateString.split('-');
      return year && month && day ? `${day}/${month}/${year}` : dateString;
  };

  const handleExportExcel = () => {
    if (filteredTransactions.length === 0) return;
    const headers = ["Data", "Nº Documento", "Descrição", "Valor (R$)", "Tipo", "Status", "Banco", "Carteira", "Categoria", "Centro de Custo", "Participante"];
    const csvRows = filteredTransactions.map(t => {
      return [
        formatDateDisplay(t.date), t.docNumber || '', `"${t.description.replace(/"/g, '""')}"`, t.value.toFixed(2).replace('.', ','),
        t.type === 'CREDIT' ? 'Crédito' : 'Débito', t.status === 'PAID' ? 'Pago' : 'Pendente',
        getName(registries.banks, t.bankId), getName(registries.wallets, t.walletId),
        getName(registries.categories, t.categoryId), getName(registries.costCenters, t.costCenterId),
        getName(registries.participants, t.participantId)
      ].join(';');
    });
    const csvContent = "\uFEFF" + headers.join(';') + "\n" + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `financeiro_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const requestSort = (key: keyof Transaction) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const formatMoney = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const containerClasses = variant === 'card' 
    ? "bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full"
    : "bg-white overflow-hidden flex flex-col h-full";

  const clearFilters = () => {
      setColumnFilters(initialFilters);
      setSearchTerm('');
  };

  const hasActiveFilters = Object.values(columnFilters).some(v => v !== '') || searchTerm !== '';

  const filterInputClass = "w-full px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-normal normal-case outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-300";

  return (
    <>
        <div className={containerClasses}>
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                    type="text" 
                    placeholder="Filtrar por texto ou nº doc..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-blue-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                </div>
                
                <button 
                    onClick={() => setShowColumnFilters(!showColumnFilters)}
                    className={`p-2 rounded-lg border transition-colors flex items-center gap-2 text-sm font-medium ${showColumnFilters ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                >
                    <Search className="w-4 h-4" />
                    <span className="hidden lg:inline">{showColumnFilters ? 'Fechar Filtros' : 'Mais Filtros'}</span>
                </button>

                {hasActiveFilters && (
                    <button onClick={clearFilters} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium" title="Limpar Filtros">
                        <FilterX className="w-4 h-4" />
                        <span className="hidden lg:inline">Limpar</span>
                    </button>
                )}

                <div className="h-6 w-px bg-gray-300 mx-1 hidden sm:block"></div>
                
                <button onClick={handleExportExcel} className="p-2 text-green-600 bg-white border border-gray-300 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span className="hidden lg:inline">Exportar Planilha</span>
                </button>

                <button onClick={findDuplicates} className="p-2 text-blue-600 bg-white border border-gray-300 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium" title="Remover Duplicados">
                    <Zap className="w-4 h-4" />
                    <span className="hidden lg:inline">Limpar Duplicados</span>
                </button>
            </div>

            {selectedIds.length > 0 && (
                <div className="flex items-center gap-3 animate-fade-in">
                    <div className="flex items-center gap-1 text-sm text-slate-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                        <ListChecks className="w-4 h-4 text-blue-500" />
                        <span className="font-medium text-blue-700">{selectedIds.length}</span>
                        <span>selecionados</span>
                    </div>
                    <button onClick={() => setConfirmModal({isOpen: true, ids: selectedIds, type: 'DELETE', message: `Deseja realmente excluir ${selectedIds.length} registros?`})} className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 font-medium transition-colors border border-red-100">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>

        <div className="overflow-auto flex-1 border-b border-slate-200 relative">
            <table className="w-full text-left border-collapse min-w-[1300px]">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-200">
                <th className="p-3 w-10 text-center bg-slate-50">
                    <button type="button" onClick={handleSelectAll} className="text-gray-400 hover:text-blue-600">
                    {isAllSelected && currentTransactions.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                </th>
                <th className="p-3 cursor-pointer hover:text-slate-700 bg-slate-50" onClick={() => requestSort('date')}>Data</th>
                <th className="p-3 bg-slate-50">Banco</th>
                <th className="p-3 bg-slate-50">Carteira</th>
                <th className="p-3 bg-slate-50">Categoria</th>
                <th className="p-3 bg-slate-50">Participante</th>
                <th className="p-3 bg-slate-50">Centro de Custo</th>
                <th className="p-3 cursor-pointer hover:text-slate-700 bg-slate-50" onClick={() => requestSort('description')}>Descrição</th>
                <th className="p-3 text-right text-red-600 bg-slate-50">Débito</th>
                <th className="p-3 text-right text-green-600 bg-slate-50">Crédito</th>
                <th className="p-3 text-right bg-slate-50">Saldo</th>
                <th className="p-3 text-center bg-slate-50">Status</th>
                <th className="p-3 text-right bg-slate-50">Ações</th>
                </tr>
                {showColumnFilters && (
                    <tr className="bg-slate-100 border-b border-slate-200 animate-fade-in">
                        <th className="p-2"></th>
                        <th className="p-2"></th>
                        <th className="p-2">
                            <select value={columnFilters.bankId} onChange={e => setColumnFilters(f => ({...f, bankId: e.target.value}))} className={filterInputClass}>
                                <option value="">Todos</option>
                                {registries.banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </th>
                        <th className="p-2">
                             <select value={columnFilters.walletId} onChange={e => setColumnFilters(f => ({...f, walletId: e.target.value}))} className={filterInputClass}>
                                <option value="">Todas</option>
                                {registries.wallets?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </th>
                        <th className="p-2">
                            <select value={columnFilters.categoryId} onChange={e => setColumnFilters(f => ({...f, categoryId: e.target.value}))} className={filterInputClass}>
                                <option value="">Todas</option>
                                {registries.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </th>
                        <th className="p-2">
                            <select value={columnFilters.participantId} onChange={e => setColumnFilters(f => ({...f, participantId: e.target.value}))} className={filterInputClass}>
                                <option value="">Todos</option>
                                {registries.participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </th>
                        <th className="p-2">
                            <select value={columnFilters.costCenterId} onChange={e => setColumnFilters(f => ({...f, costCenterId: e.target.value}))} className={filterInputClass}>
                                <option value="">Todos</option>
                                {registries.costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                            </select>
                        </th>
                        <th className="p-2">
                            <input type="text" placeholder="Filtrar descrição..." value={columnFilters.description} onChange={e => setColumnFilters(f => ({...f, description: e.target.value}))} className={filterInputClass} />
                        </th>
                        <th className="p-2">
                            <input type="text" placeholder="Busca valor..." value={columnFilters.debit} onChange={e => setColumnFilters(f => ({...f, debit: e.target.value}))} className={filterInputClass} />
                        </th>
                        <th className="p-2">
                            <input type="text" placeholder="Busca valor..." value={columnFilters.credit} onChange={e => setColumnFilters(f => ({...f, credit: e.target.value}))} className={filterInputClass} />
                        </th>
                        <th colSpan={3} className="p-2"></th>
                    </tr>
                )}
            </thead>
            <tbody className="divide-y divide-slate-100">
                {currentTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors group text-[13px]">
                    <td className="p-3 text-center">
                    <button onClick={() => toggleSelect(t.id)} className={`transition-colors ${selectedIds.includes(t.id) ? 'text-blue-600' : 'text-gray-300 group-hover:text-gray-400'}`}>
                        {selectedIds.includes(t.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">{formatDateDisplay(t.date)}</td>
                    <td className="p-3 text-slate-600 truncate max-w-[120px]">{getName(registries.banks, t.bankId)}</td>
                    <td className="p-3 text-slate-600 truncate max-w-[120px]">{getName(registries.wallets, t.walletId)}</td>
                    <td className="p-3 text-slate-600 truncate max-w-[120px]">{getName(registries.categories, t.categoryId)}</td>
                    <td className="p-3 text-slate-600 truncate max-w-[120px]" title={getName(registries.participants, t.participantId)}>{getName(registries.participants, t.participantId)}</td>
                    <td className="p-3 text-slate-600 truncate max-w-[120px]">{getName(registries.costCenters, t.costCenterId)}</td>
                    <td className="p-3 text-slate-800 font-bold">
                        {t.description}
                        {t.docNumber && <span className="text-[10px] text-slate-400 font-medium block">Nº {t.docNumber}</span>}
                    </td>
                    <td className="p-3 text-right text-red-600 font-bold">{t.type === 'DEBIT' ? formatMoney(t.value) : '-'}</td>
                    <td className="p-3 text-right text-green-600 font-bold">{t.type === 'CREDIT' ? formatMoney(t.value) : '-'}</td>
                    <td className={`p-3 text-right font-black ${balanceMap[t.id] >= 0 ? 'text-slate-700' : 'text-red-500'}`}>{balanceMap[t.id] !== undefined ? formatMoney(balanceMap[t.id]) : '(Pendente)'}</td>
                    <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${t.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{t.status === 'PAID' ? 'Pago' : 'Pendente'}</span>
                    </td>
                    <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1 transition-opacity">
                            <button onClick={() => onEdit(t)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => setConfirmModal({isOpen: true, ids: [t.id], type: 'DELETE', message: 'Deseja excluir este lançamento definitivamente?'})} className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
        
        <div className="bg-slate-50 p-4 flex flex-col sm:flex-row justify-between items-center flex-shrink-0 border-t border-slate-200 gap-4">
            <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Exibir:</span>
                    <select 
                        value={itemsPerPage} 
                        onChange={(e) => setItemsPerPage(Number(e.target.value))}
                        className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                    </select>
                </div>

                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-500" />
                    Mostrando {currentTransactions.length} de {filteredTransactions.length} filtrados
                </div>
                
                {totalInDatabase > 0 && (
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-l border-slate-300 pl-4 hidden md:block">
                        Total no Banco: {totalInDatabase}
                    </div>
                )}
            </div>
            
            {totalPages > 1 && (
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setCurrentPage(1)} 
                        disabled={currentPage === 1} 
                        className="p-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                        title="Primeira Página"
                    >
                        <ChevronFirst className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                        disabled={currentPage === 1} 
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" /> Anterior
                    </button>
                    
                    <div className="flex items-center px-4 py-1.5 bg-white rounded-lg border border-slate-300 shadow-inner text-xs font-black text-blue-600">
                        PÁGINA {currentPage} / {totalPages}
                    </div>

                    <button 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                        disabled={currentPage === totalPages} 
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                    >
                        Próxima <ChevronRight className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => setCurrentPage(totalPages)} 
                        disabled={currentPage === totalPages} 
                        className="p-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                        title="Última Página"
                    >
                        <ChevronLast className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
        </div>

        <ConfirmModal 
            isOpen={confirmModal.isOpen} 
            onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
            onConfirm={confirmAction} 
            title={confirmModal.type === 'DELETE' ? "Confirmação de Exclusão" : "Remover Duplicados"} 
            message={confirmModal.message} 
            isDestructive={true} 
            confirmText={confirmModal.type === 'DELETE' ? "Excluir" : "Remover Agora"}
        />
    </>
  );
};
