
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Edit2, 
  Trash2, 
  Search, 
  CheckSquare, 
  Square,
  AlertCircle,
  Upload,
  Download,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  FileSpreadsheet
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
}

export const TransactionList: React.FC<TransactionListProps> = ({ 
  transactions, 
  registries, 
  onEdit, 
  onDelete,
  onImport,
  variant = 'card',
  externalBalanceMap,
  initialSortByStatus = 'ALL'
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Define ordenação padrão baseada no contexto (Pendentes: Antigos primeiro | Realizados: Novos primeiro)
  const defaultSort: { key: keyof Transaction, direction: 'asc' | 'desc' } = useMemo(() => {
    if (initialSortByStatus === 'PENDING') return { key: 'date', direction: 'asc' };
    return { key: 'date', direction: 'desc' };
  }, [initialSortByStatus]);

  const [sortConfig, setSortConfig] = useState<{ key: keyof Transaction, direction: 'asc' | 'desc' } | null>(defaultSort);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(500); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    ids: string[];
    message: string;
  }>({ isOpen: false, ids: [], message: '' });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortConfig, transactions, itemsPerPage]);

  const getName = (list: { id: string, name: string }[] | undefined, id: string) => {
    if (!list) return '-';
    return list.find(item => item.id === id)?.name || '-';
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
  }, [transactions, searchTerm, sortConfig, registries, externalBalanceMap]);

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

  const requestBulkDelete = () => {
    setConfirmModal({
        isOpen: true,
        ids: selectedIds,
        message: `Tem certeza que deseja excluir ${selectedIds.length} itens selecionados? Esta ação não pode ser desfeita.`
    });
  };

  const requestSingleDelete = (id: string) => {
      setConfirmModal({
          isOpen: true,
          ids: [id],
          message: 'Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.'
      });
  };

  const confirmDelete = () => {
      onDelete(confirmModal.ids);
      setSelectedIds(prev => prev.filter(id => !confirmModal.ids.includes(id)));
  };

  const formatDateDisplay = (dateString: string) => {
      if (!dateString) return '-';
      const [year, month, day] = dateString.split('-');
      if (year && month && day) {
          return `${day}/${month}/${year}`;
      }
      return dateString;
  };

  const handleExportExcel = () => {
    if (filteredTransactions.length === 0) {
      alert("Não há dados para exportar com os filtros atuais.");
      return;
    }

    const headers = [
      "Data",
      "Nº Documento",
      "Descrição",
      "Valor (R$)",
      "Tipo",
      "Status",
      "Banco",
      "Carteira",
      "Categoria",
      "Centro de Custo",
      "Participante"
    ];

    const csvRows = filteredTransactions.map(t => {
      const valStr = t.value.toFixed(2).replace('.', ',');
      const descStr = t.description ? `"${t.description.replace(/"/g, '""')}"` : '';
      
      const row = [
        formatDateDisplay(t.date),
        t.docNumber || '',
        descStr,
        valStr,
        t.type === 'CREDIT' ? 'Crédito' : 'Débito',
        t.status === 'PAID' ? 'Pago' : 'Pendente',
        getName(registries.banks, t.bankId),
        getName(registries.wallets, t.walletId),
        getName(registries.categories, t.categoryId),
        getName(registries.costCenters, t.costCenterId),
        getName(registries.participants, t.participantId)
      ];
      return row.join(';');
    });

    const csvContent = "\uFEFF" + headers.join(';') + "\n" + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}`;
    link.setAttribute("href", url);
    link.setAttribute("download", `movimentacao_financeira_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTemplate = () => {
    const headers = "Data;Nº Documento;Banco;Categoria;C. de Custo;Participante;Descrição;N parcelas;Total Parcelas;Débito;Crédito;Status";
    const example = "25/10/2023;1001;Nubank;Vendas;Operacional;Cliente A;Pagamento Exemplo;1;1;;150,00;Pago";
    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + example;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "modelo_importacao_financeiro.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        if (!buffer) return;
        const utf8Decoder = new TextDecoder('utf-8');
        let text = utf8Decoder.decode(buffer);
        if (text.includes('')) {
            const latin1Decoder = new TextDecoder('iso-8859-1');
            text = latin1Decoder.decode(buffer);
        }
        if (text) {
            const lines = text.split(/[\r\n]+/);
            const parsedData = [];
            const firstLine = lines.find(l => l.trim().length > 0);
            const delimiter = firstLine && firstLine.includes(';') ? ';' : ',';
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                let cols: string[];
                if (!line.includes('"')) {
                    cols = line.split(delimiter).map(c => c.trim());
                } else {
                    const splitRegex = new RegExp(`\\s*${delimiter}\\s*(?=(?:[^"]*"[^"]*")*[^"]*$)`);
                    cols = line.split(splitRegex).map(c => c.replace(/^"|"$/g, '').trim());
                }
                if (cols.length < 3) continue; 
                
                const dateRaw = cols[0];
                let dateIso: string | null = null;
                
                if (dateRaw) {
                    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateRaw)) {
                        const parts = dateRaw.split('/');
                        if (parts.length === 3) {
                            const d = parseInt(parts[0], 10);
                            const m = parseInt(parts[1], 10);
                            const y = parseInt(parts[2], 10);
                            if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
                                const fullYear = y < 100 ? 2000 + y : y;
                                dateIso = `${fullYear}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                            }
                        }
                    } 
                    else if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
                        dateIso = dateRaw;
                    }
                }

                if (!dateIso) continue;

                const docNumber = cols[1] || '';
                const bankName = cols[2] || '';
                const categoryName = cols[3] || '';
                const costCenterName = cols[4] || '';
                let participantName = cols[5] || '';
                const descriptionRaw = cols[6] || 'Importado';
                
                const installmentRaw = cols[7] || '';
                const totalInstallmentsRaw = cols[8] || '';
                
                const instNum = parseInt(installmentRaw, 10);
                const totalNum = parseInt(totalInstallmentsRaw, 10);
                
                let description = descriptionRaw;
                
                if (!isNaN(instNum) && !isNaN(totalNum) && totalNum > 1) {
                    description = `${descriptionRaw} (${instNum}/${totalNum})`;
                }

                const parseMoney = (val: string) => {
                    if (!val) return 0;
                    if (val.includes(',') && val.includes('.')) {
                        const clean = val.replace(/\./g, '').replace(',', '.');
                        const num = parseFloat(clean);
                        return isNaN(num) ? 0 : num;
                    } else if (val.includes(',')) {
                         const clean = val.replace(',', '.');
                         const num = parseFloat(clean);
                         return isNaN(num) ? 0 : num;
                    } else {
                        const num = parseFloat(val);
                        return isNaN(num) ? 0 : num;
                    }
                };
                const debitVal = parseMoney(cols[9]);
                const creditVal = parseMoney(cols[10]);
                let value = 0;
                let type: 'CREDIT' | 'DEBIT' = 'DEBIT';
                if (creditVal > 0) {
                    value = creditVal;
                    type = 'CREDIT';
                } else if (debitVal > 0) {
                    value = debitVal;
                    type = 'DEBIT';
                }
                const statusRaw = cols[11]?.toUpperCase() || '';
                const status = (statusRaw === 'PAGO' || statusRaw === 'PAID' || statusRaw === 'OK' || statusRaw === 'S') ? 'PAID' : 'PENDING';
                parsedData.push({
                    date: dateIso,
                    docNumber,
                    bankName,
                    categoryName,
                    costCenterName,
                    participantName,
                    description,
                    value,
                    type,
                    status,
                    walletName: ''
                });
            }
            if (parsedData.length > 0) {
                onImport(parsedData);
            } else {
                alert("Nenhum dado válido encontrado no arquivo.");
            }
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const requestSort = (key: keyof Transaction) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const formatMoney = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const containerClasses = variant === 'card' 
    ? "bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full"
    : "bg-white overflow-hidden flex flex-col h-full";

  return (
    <>
        <div className={containerClasses}>
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                    type="text" 
                    placeholder="Buscar por descrição, doc..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-amber-200 bg-amber-50/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                </div>
                
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                    accept=".csv,.txt" 
                />
                
                <button 
                    type="button" 
                    onClick={handleExportExcel}
                    className="p-2 text-green-600 bg-white border border-gray-300 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                    title="Exportar para Excel (CSV)"
                >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span className="hidden lg:inline">Exportar</span>
                </button>

                <div className="h-6 w-px bg-gray-300 mx-1 hidden sm:block"></div>

                <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-slate-600 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                    title="Importar CSV"
                >
                    <Upload className="w-4 h-4" />
                    <span className="hidden lg:inline">Importar</span>
                </button>
                <button 
                    type="button" 
                    onClick={handleDownloadTemplate}
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Baixar Modelo CSV"
                >
                    <Download className="w-4 h-4" />
                </button>
            </div>

            {selectedIds.length > 0 && (
            <div className="flex items-center gap-3 animate-fade-in">
                <div className="flex items-center gap-1 text-sm text-slate-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                    <ListChecks className="w-4 h-4 text-blue-500" />
                    <span className="font-medium text-blue-700">{selectedIds.length}</span>
                    <span>selecionados</span>
                </div>
                <button 
                type="button"
                onClick={requestBulkDelete}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 font-medium transition-colors border border-red-100"
                >
                <Trash2 className="w-4 h-4" />
                Excluir
                </button>
            </div>
            )}
        </div>

        <div className="overflow-auto flex-1 border-b border-slate-200 relative">
            <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="p-3 w-10 text-center bg-slate-50">
                    <button type="button" onClick={handleSelectAll} className="text-gray-400 hover:text-blue-600" title="Selecionar todos os visíveis na página">
                    {isAllSelected && currentTransactions.length > 0 ? (
                        <CheckSquare className="w-4 h-4" />
                    ) : (
                        <Square className="w-4 h-4" />
                    )}
                    </button>
                </th>
                <th className="p-3 font-semibold cursor-pointer hover:text-slate-700 bg-slate-50" onClick={() => requestSort('date')}>Data</th>
                <th className="p-3 font-semibold bg-slate-50">Banco</th>
                <th className="p-3 font-semibold bg-slate-50">Categoria</th>
                <th className="p-3 font-semibold bg-slate-50">Participante</th>
                <th className="p-3 font-semibold bg-slate-50">Centro de Custo</th>
                <th className="p-3 font-semibold cursor-pointer hover:text-slate-700 bg-slate-50" onClick={() => requestSort('description')}>Descrição</th>
                <th className="p-3 font-semibold text-right text-red-600 bg-slate-50">Débito</th>
                <th className="p-3 font-semibold text-right text-green-600 bg-slate-50">Crédito</th>
                <th className="p-3 font-semibold text-right bg-slate-50">Saldo</th>
                <th className="p-3 font-semibold text-center bg-slate-50">Status</th>
                <th className="p-3 font-semibold text-right bg-slate-50">Ações</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {currentTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors group text-sm">
                    <td className="p-3 text-center">
                    <button type="button" onClick={() => toggleSelect(t.id)} className={`transition-colors ${selectedIds.includes(t.id) ? 'text-blue-600' : 'text-gray-300 group-hover:text-gray-400'}`}>
                        {selectedIds.includes(t.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">
                        {formatDateDisplay(t.date)}
                    </td>
                    <td className="p-3 text-slate-600">{getName(registries.banks, t.bankId)}</td>
                    <td className="p-3 text-slate-600">{getName(registries.categories, t.categoryId)}</td>
                    <td className="p-3 text-slate-600 truncate max-w-[150px]" title={getName(registries.participants, t.participantId)}>
                        {getName(registries.participants, t.participantId)}
                    </td>
                    <td className="p-3 text-slate-600">{getName(registries.costCenters, t.costCenterId)}</td>
                    <td className="p-3 text-slate-800 font-medium">
                        {t.description}
                        {t.docNumber && <span className="text-xs text-slate-400 block">Doc: {t.docNumber}</span>}
                    </td>
                    <td className="p-3 text-right text-red-600 font-medium">
                        {t.type === 'DEBIT' ? formatMoney(t.value) : '-'}
                    </td>
                    <td className="p-3 text-right text-green-600 font-medium">
                        {t.type === 'CREDIT' ? formatMoney(t.value) : '-'}
                    </td>
                    <td className={`p-3 text-right font-bold ${balanceMap[t.id] !== undefined ? (balanceMap[t.id] >= 0 ? 'text-slate-700' : 'text-red-500') : 'text-slate-300'}`}>
                        {balanceMap[t.id] !== undefined ? formatMoney(balanceMap[t.id]) : '(Pendente)'}
                    </td>
                    <td className="p-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                        t.status === 'PAID' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                        {t.status === 'PAID' ? 'Pago' : 'Pendente'}
                    </span>
                    </td>
                    <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1 transition-opacity">
                        <button 
                        type="button"
                        onClick={() => onEdit(t)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Editar">
                        <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            requestSingleDelete(t.id);
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                    </td>
                </tr>
                ))}
                {filteredTransactions.length === 0 && (
                    <tr>
                        <td colSpan={12} className="p-12 text-center text-slate-400">
                            <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>Nenhuma movimentação encontrada para o filtro atual.</p>
                        </td>
                    </tr>
                )}
            </tbody>
            </table>
        </div>
        
        <div className="bg-slate-50 p-3 flex flex-col sm:flex-row justify-between items-center gap-3 flex-shrink-0 border-t border-slate-200">
            <div className="flex items-center gap-4">
                <div className="text-xs text-slate-500">
                    Mostrando {currentTransactions.length} de {filteredTransactions.length} registros
                </div>
                
                <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span>Exibir:</span>
                    <select 
                        value={itemsPerPage} 
                        onChange={(e) => setItemsPerPage(Number(e.target.value))}
                        className="bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                        <option value={15}>15</option>
                        <option value={30}>30</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                        <option value={1000}>1000</option>
                        <option value={5000}>5000</option>
                        <option value={10000}>10000</option>
                    </select>
                </div>
            </div>
            
            {totalPages > 1 && (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 mr-2">
                        Página {currentPage} de {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-md hover:bg-white border border-transparent hover:border-gray-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:border-transparent transition-all"
                    >
                        <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </button>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-md hover:bg-white border border-transparent hover:border-gray-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:border-transparent transition-all"
                    >
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                    </button>
                </div>
            )}
        </div>
        </div>

        <ConfirmModal 
            isOpen={confirmModal.isOpen}
            onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            onConfirm={confirmDelete}
            title="Confirmar Exclusão"
            message={confirmModal.message}
            isDestructive={true}
            confirmText="Sim, excluir"
        />
    </>
  );
};
