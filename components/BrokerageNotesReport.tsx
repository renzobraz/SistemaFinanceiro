import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  ChevronsUpDown,
  Download,
  Filter,
  Calendar,
  Hash,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  ClipboardList,
  Trash2,
  Loader2,
  AlertCircle,
  CheckSquare,
  Square,
  Check
} from 'lucide-react';
import { Transaction, Participant } from '../types';
import { financeService } from '../services/financeService';

interface BrokerageNotesReportProps {
  transactions: Transaction[];
  participants: Participant[];
  banks?: any[];
  userModulePermissions?: Record<string, any>;
  userRole?: string;
  onRefresh?: () => void;
}

export const BrokerageNotesReport: React.FC<BrokerageNotesReportProps> = ({ 
  transactions, 
  participants,
  banks = [],
  userModulePermissions = {},
  userRole = "",
  onRefresh
}) => {
  const hasExportPermission = useMemo(() => {
    return (
      !userModulePermissions ||
      Object.keys(userModulePermissions).length === 0 ||
      userRole === 'owner' ||
      userRole === 'admin' ||
      userModulePermissions['reports']?.can_export === true
    );
  }, [userModulePermissions, userRole]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({
    key: 'date',
    direction: 'desc'
  });

  // State for Option A - Whole Card Note Deletion
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [deletingNote, setDeletingNote] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // State for Option B - Multi Selection Checkboxes
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null);

  // Deletion Progress
  const [deleteProgress, setDeleteProgress] = useState<{ completed: number; total: number } | null>(null);

  // Advanced Filters State
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterTicker, setFilterTicker] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterBankId, setFilterBankId] = useState('ALL');

  const handleDeleteConfirm = async () => {
    if (!noteToDelete) return;
    setDeletingNote(noteToDelete);
    setDeleteError(null);
    setDeleteProgress(null);
    try {
      await financeService.deleteBrokerageNote(noteToDelete, (completed, total) => {
        setDeleteProgress({ completed, total });
      });
      setNoteToDelete(null);
      // Remove any deleted transactions from current batch selections
      setSelectedTxIds([]);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error("Erro ao excluir nota:", err);
      setDeleteError("Erro ao excluir nota: " + (err?.message || err));
    } finally {
      setDeletingNote(null);
      setDeleteProgress(null);
    }
  };

  const handleBatchDeleteConfirm = async () => {
    if (selectedTxIds.length === 0) return;
    setDeletingBatch(true);
    setBatchDeleteError(null);
    setDeleteProgress(null);
    try {
      await financeService.deleteTransactions(selectedTxIds, (completed, total) => {
        setDeleteProgress({ completed, total });
      });
      setSelectedTxIds([]);
      setIsBatchDeleteModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error("Erro ao excluir lote de transações:", err);
      setBatchDeleteError("Erro ao excluir lote selecionado: " + (err?.message || err));
    } finally {
      setDeletingBatch(false);
      setDeleteProgress(null);
    }
  };

  // Unique bank/broker list for the advanced filter option list
  const uniqueBanks = useMemo(() => {
    if (banks && banks.length > 0) return banks;
    const bankIds = new Set(transactions.map(t => t.bankId).filter(Boolean));
    return Array.from(bankIds).map(id => ({ id, name: `Banco/Corretora ${id}` }));
  }, [banks, transactions]);

  // Filtra apenas transações que tenham número de nota (docNumber) e sejam de investimentos
  const brokerageData = useMemo(() => {
    return transactions
      .filter(t => {
        const participant = participants.find(p => p.id === t.participantId);
        const isInvestment = !!participant?.category; // Assumindo que participantes com categoria são ativos investíveis
        const hasDoc = !!t.docNumber && t.docNumber.trim() !== '';
        
        const matchesSearch = 
          !searchTerm ||
          t.docNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          participant?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          participant?.ticker?.toLowerCase().includes(searchTerm.toLowerCase());

        // Advanced filter - Ticker
        const matchesTicker = !filterTicker || participant?.ticker?.toLowerCase().includes(filterTicker.toLowerCase().trim());
        
        // Advanced filter - Type
        const matchesType = filterType === 'ALL' || t.type === filterType;

        // Advanced filter - Date range
        const transactionDateOnly = t.date?.split('T')[0];
        const matchesStartDate = !filterStartDate || transactionDateOnly >= filterStartDate;
        const matchesEndDate = !filterEndDate || transactionDateOnly <= filterEndDate;

        // Advanced filter - Bank/Corretora
        const matchesBank = filterBankId === 'ALL' || String(t.bankId) === String(filterBankId);

        return isInvestment && hasDoc && matchesSearch && matchesTicker && matchesType && matchesStartDate && matchesEndDate && matchesBank;
      })
      .map(t => {
        const participant = participants.find(p => p.id === t.participantId);
        return {
          ...t,
          ticker: participant?.ticker || 'N/A',
          assetName: participant?.name || 'Desconhecido',
        };
      });
  }, [transactions, participants, searchTerm, filterTicker, filterType, filterStartDate, filterEndDate, filterBankId]);

  // Ordenação
  const sortedData = useMemo(() => {
    if (!sortConfig) return brokerageData;

    return [...brokerageData].sort((a: any, b: any) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [brokerageData, sortConfig]);

  // Multi-Selection Checkbox States
  const isAllSelected = useMemo(() => {
    if (sortedData.length === 0) return false;
    return sortedData.every(item => selectedTxIds.includes(item.id));
  }, [sortedData, selectedTxIds]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allFilteredIds = sortedData.map(item => item.id);
      setSelectedTxIds(prev => {
        const unique = new Set([...prev, ...allFilteredIds]);
        return Array.from(unique);
      });
    } else {
      const filteredIdsSet = new Set(sortedData.map(item => item.id));
      setSelectedTxIds(prev => prev.filter(id => !filteredIdsSet.has(id)));
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedTxIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Resumo das Notas
  const summary = useMemo(() => {
    const uniqueNotes = new Set(brokerageData.map(t => t.docNumber));
    const buyOps = brokerageData.filter(t => t.type === 'DEBIT');
    const sellOps = brokerageData.filter(t => t.type === 'CREDIT');

    const totalBuy = buyOps.reduce((acc, t) => acc + t.value, 0);
    const totalSell = sellOps.reduce((acc, t) => acc + t.value, 0);
    const totalBuyQty = buyOps.reduce((acc, t) => acc + (t.quantity || 0), 0);
    const totalSellQty = sellOps.reduce((acc, t) => acc + (t.quantity || 0), 0);

    return {
      noteCount: uniqueNotes.size,
      operationCount: brokerageData.length,
      totalBuy,
      totalSell,
      totalBuyQty,
      totalSellQty
    };
  }, [brokerageData]);

  const uniqueNotesList = useMemo(() => {
    const notesMap = new Map<string, string>();
    brokerageData.forEach(t => {
      if (t.docNumber && !notesMap.has(t.docNumber)) {
        notesMap.set(t.docNumber, t.date);
      }
    });

    return Array.from(notesMap.entries())
      .map(([number, date]) => ({ number, date }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [brokerageData]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const formatCurrency = (value: number) => {
    const absoluteVal = Math.abs(value) < 0.001 ? 0 : value;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(absoluteVal);
  };

  const getSortIcon = (key: string) => {
    if (sortConfig?.key !== key) return <ChevronsUpDown className="w-3 h-3 text-slate-300" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />;
  };

  const handleExportCSV = () => {
    if (sortedData.length === 0) return;

    // Define CSV header
    const headers = ['Data', 'Corretora', 'Número da Nota', 'Ticker', 'Ativo', 'Tipo', 'Quantidade', 'Preço Unitário (R$)', 'Total Bruto (R$)'];
    
    // Map rows
    const rows = sortedData.map(item => {
      const dateFormatted = new Date(item.date).toLocaleDateString('pt-BR');
      const bankName = banks?.find(b => String(b.id) === String(item.bankId))?.name || 'B3 S.A.';
      const unitPrice = item.quantity && item.quantity > 0 ? item.value / item.quantity : 0;
      const typeText = item.type === 'DEBIT' ? 'Compra' : 'Venda';
      
      return [
        dateFormatted,
        bankName,
        item.docNumber || '',
        item.ticker || '',
        item.assetName || '',
        typeText,
        item.quantity || 0,
        unitPrice.toFixed(4),
        item.value.toFixed(2)
      ];
    });

    // Create CSV content (using semicolon separator for Portuguese compatibility)
    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(val => {
        const strVal = String(val).replace(/"/g, '""');
        return `"${strVal}"`;
      }).join(';'))
    ].join('\n');

    // Generate download with UTF-8 BOM
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `notas_corretagem_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* Cabeçalho e Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button 
          onClick={() => setIsNotesModalOpen(true)}
          className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-left group overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronDown className="w-4 h-4 text-blue-400 rotate-[-90deg]" />
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Hash className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notas Únicas</span>
          </div>
          <div className="text-2xl font-black text-slate-800">{summary.noteCount}</div>
          <p className="text-[10px] text-blue-500 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <ClipboardList className="w-3 h-3" /> Ver relação de números / Excluir Notas
          </p>
          <p className="text-[10px] text-slate-400 mt-1 group-hover:hidden">Total de notas diferentes</p>
        </button>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Operações</span>
          </div>
          <div className="text-2xl font-black text-slate-800">{summary.operationCount}</div>
          <p className="text-[10px] text-slate-400 mt-1">Total de linhas de ativos detalhadas</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm border-l-4 border-l-red-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-50 rounded-lg text-red-600">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Compras</span>
          </div>
          <div className="text-2xl font-black text-red-600">{formatCurrency(summary.totalBuy)}</div>
          <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-tighter">
            Qtd Total: <span className="text-red-500 ml-1">{summary.totalBuyQty.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Vendas</span>
          </div>
          <div className="text-2xl font-black text-emerald-600">{formatCurrency(summary.totalSell)}</div>
          <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-tighter">
            Qtd Total: <span className="text-emerald-500 ml-1">{summary.totalSellQty.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </p>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por Nota, Ticker ou Ativo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
              showAdvancedFilters 
                ? 'bg-blue-50 border-blue-250 text-blue-600 font-extrabold' 
                : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100 font-bold'
            }`}
          >
            <Filter className="w-4 h-4" /> Filtros Avançados
          </button>
          {hasExportPermission && (
            <button 
              onClick={handleExportCSV}
              disabled={sortedData.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:shadow-none"
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          )}
        </div>
      </div>

      {/* Painel de Filtros Avançados */}
      {showAdvancedFilters && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4 overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">Filtros Avançados</h4>
            <button 
              onClick={() => {
                setFilterTicker('');
                setFilterType('ALL');
                setFilterStartDate('');
                setFilterEndDate('');
                setFilterBankId('ALL');
              }}
              className="text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest"
            >
              Limpar Filtros
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Ticker</label>
              <input 
                type="text"
                value={filterTicker}
                onChange={(e) => setFilterTicker(e.target.value)}
                placeholder="Ex: PETR4, MXRF11"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tipo Operação</label>
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="ALL">Todos os Tipos</option>
                <option value="DEBIT">Compra</option>
                <option value="CREDIT">Venda</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Data Inicial</label>
              <input 
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Data Final</label>
              <input 
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Corretora/Banco</label>
              <select 
                value={filterBankId}
                onChange={(e) => setFilterBankId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="ALL">Todas as Corretoras</option>
                {uniqueBanks.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>
      )}

      {/* Opção B - Barra de Ações em Massa */}
      {selectedTxIds.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm border-l-4 border-l-rose-500"
        >
          <div className="flex items-center gap-3">
            <span className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <CheckSquare className="w-5 h-5" />
            </span>
            <div>
              <span className="text-sm font-black text-slate-800">
                {selectedTxIds.length} {selectedTxIds.length === 1 ? 'item selecionado' : 'itens selecionados'} para exclusão
              </span>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Serão removidos de forma definitiva apenas os itens marcados abaixo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setSelectedTxIds([])}
              className="px-4 py-2 border border-slate-200 text-slate-650 rounded-xl text-xs font-black bg-white hover:bg-slate-100 transition-all uppercase tracking-wider"
            >
              Limpar Seleção
            </button>
            <button
              onClick={() => {
                setBatchDeleteError(null);
                setIsBatchDeleteModalOpen(true);
              }}
              className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-black shadow-md shadow-rose-100 hover:bg-rose-700 transition-all uppercase tracking-wider"
            >
              <Trash2 className="w-4 h-4" /> Excluir Selecionados
            </button>
          </div>
        </motion.div>
      )}

      {/* Tabela de Detalhamento */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {/* Opção B - Coluna Checkbox Selecionar Todos */}
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-12 text-center">
                  <input 
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 bg-slate-50 border-slate-200 rounded focus:ring-blue-500 checked:bg-blue-600 accent-blue-600 cursor-pointer"
                  />
                </th>
                <th 
                  className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => requestSort('date')}
                >
                  <div className="flex items-center gap-1">Data {getSortIcon('date')}</div>
                </th>
                <th 
                  className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => requestSort('docNumber')}
                >
                  <div className="flex items-center gap-1">Número da Nota {getSortIcon('docNumber')}</div>
                </th>
                <th 
                  className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => requestSort('ticker')}
                >
                  <div className="flex items-center gap-1">Ticker {getSortIcon('ticker')}</div>
                </th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Quantidade</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Preço Unit.</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Bruto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedData.length > 0 ? (
                sortedData.map((item, index) => {
                  const unitPrice = item.quantity && item.quantity > 0 ? item.value / item.quantity : 0;
                  
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                      {/* Opção B - Checkbox Individual */}
                      <td className="p-4 text-center w-12">
                        <input 
                          type="checkbox"
                          checked={selectedTxIds.includes(item.id)}
                          onChange={() => handleSelectOne(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 text-blue-600 bg-slate-50 border-slate-250 rounded focus:ring-blue-500 checked:bg-blue-600 accent-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">{new Date(item.date).toLocaleDateString('pt-BR')}</span>
                          <span className="text-[10px] text-slate-400 font-medium">B3 S.A.</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[11px] font-mono font-black border border-slate-200">
                          {item.docNumber}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-blue-700 tracking-tight">{item.ticker}</span>
                          <span className="text-[9px] text-slate-400 truncate max-w-[120px] font-medium">{item.assetName}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                          item.type === 'DEBIT' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          {item.type === 'DEBIT' ? 'Compra' : 'Venda'}
                        </span>
                      </td>
                      <td className="p-4 text-right text-xs font-black font-mono text-slate-700">
                        {item.quantity?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-right text-xs font-bold font-mono text-slate-500">
                        {formatCurrency(unitPrice)}
                      </td>
                      <td className={`p-4 text-right text-xs font-black font-mono ${
                        item.type === 'DEBIT' ? 'text-red-700' : 'text-emerald-700'
                      }`}>
                        {formatCurrency(item.value)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="p-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-slate-50 rounded-full text-slate-300">
                        <FileText className="w-10 h-10" />
                      </div>
                      <p className="text-slate-400 font-medium italic">Nenhuma nota de corretagem encontrada para os filtros aplicados.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Notas Únicas (Opção A) */}
      {isNotesModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-xl">
                  <Hash className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">Relação de Notas Fiscais</h3>
                  <p className="text-xs text-slate-500 font-medium">Foram identificadas {uniqueNotesList.length} notas únicas</p>
                </div>
              </div>
              <button 
                onClick={() => setIsNotesModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Número da Nota</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ações de Exclusão</span>
                </div>
                {uniqueNotesList.map((note) => (
                  <div 
                    key={note.number} 
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-blue-50/50 border border-transparent hover:border-blue-100 transition-all group animate-fade-in"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-mono font-black text-slate-700 tracking-wider">
                          Nº {note.number}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">
                          Emitida em: {new Date(note.date).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setNoteToDelete(note.number);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 rounded-xl transition-all text-xs font-black shadow-sm"
                        title="Excluir Nota e tudo gerado por ela em cascata"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir Nota
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100">
              <button 
                onClick={() => setIsNotesModalOpen(false)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-2xl shadow-lg shadow-slate-200 transition-all text-sm tracking-wide uppercase"
              >
                Fechar Listagem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão Cascata (Opção A) */}
      {noteToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-rose-200 w-full max-w-md overflow-hidden animate-slide-up">
            <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-rose-900 tracking-tight">Confirmar Exclusão</h3>
                <p className="text-xs text-rose-500 font-bold uppercase tracking-wider">Ação Irreversível</p>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                Tem certeza que deseja excluir a <strong>Nota de Corretagem Nº {noteToDelete}</strong>?
              </p>
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-xs space-y-2 text-slate-500 font-bold">
                <p className="text-rose-600 uppercase tracking-widest text-[10px] font-black mb-2">Isso apagará em cascata:</p>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>As transações na movimentação bancária</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>Os acréscimos e rendimentos lançados</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>Os registros de ativos transitórios</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>A própria nota de corretagem ({noteToDelete})</span>
                </div>
              </div>

              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setNoteToDelete(null)}
                disabled={!!deletingNote}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={!!deletingNote}
                className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-sm transition-all shadow-md shadow-rose-100 disabled:opacity-50 flex items-center gap-2"
              >
                {deletingNote ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {deleteProgress ? `Excluindo (${deleteProgress.completed} de ${deleteProgress.total})...` : "Excluindo..."}
                    </span>
                  </>
                ) : (
                  <span>Sim, Excluir Tudo</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão em Lote (Opção B) */}
      {isBatchDeleteModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-rose-200 w-full max-w-md overflow-hidden animate-slide-up">
            <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-rose-900 tracking-tight">Confirmar Exclusão</h3>
                <p className="text-xs text-rose-500 font-bold uppercase tracking-wider">Lote Selecionado</p>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                Tem certeza que deseja excluir os <strong>{selectedTxIds.length} itens correspondentes</strong> selecionados?
              </p>
              <p className="text-xs text-slate-400 font-bold leading-relaxed">
                Esta ação apagará individualmente as transações da listagem de corretagem, recalculará os saldos e sincronizará os dados imediatamente.
              </p>

              {batchDeleteError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{batchDeleteError}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsBatchDeleteModalOpen(false)}
                disabled={deletingBatch}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleBatchDeleteConfirm}
                disabled={deletingBatch}
                className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-sm transition-all shadow-md shadow-rose-100 disabled:opacity-50 flex items-center gap-2"
              >
                {deletingBatch ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {deleteProgress ? `Excluindo (${deleteProgress.completed} de ${deleteProgress.total})...` : "Excluindo Lote..."}
                    </span>
                  </>
                ) : (
                  <span>Sim, Excluir Marcados</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
