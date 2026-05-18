import React, { useMemo, useState } from 'react';
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
  ClipboardList
} from 'lucide-react';
import { Transaction, Participant } from '../types';

interface BrokerageNotesReportProps {
  transactions: Transaction[];
  participants: Participant[];
}

export const BrokerageNotesReport: React.FC<BrokerageNotesReportProps> = ({ transactions, participants }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({
    key: 'date',
    direction: 'desc'
  });

  // Filtra apenas transações que tenham número de nota (docNumber) e sejam de investimentos
  const brokerageData = useMemo(() => {
    return transactions
      .filter(t => {
        const participant = participants.find(p => p.id === t.participantId);
        const isInvestment = !!participant?.category; // Assumindo que participantes com categoria são ativos investíveis
        const hasDoc = !!t.docNumber && t.docNumber.trim() !== '';
        
        const matchesSearch = 
          t.docNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          participant?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          participant?.ticker?.toLowerCase().includes(searchTerm.toLowerCase());

        return isInvestment && hasDoc && matchesSearch;
      })
      .map(t => {
        const participant = participants.find(p => p.id === t.participantId);
        return {
          ...t,
          ticker: participant?.ticker || 'N/A',
          assetName: participant?.name || 'Desconhecido',
        };
      });
  }, [transactions, participants, searchTerm]);

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
    // Garante que o valor zero não seja exibido como negativo devido a erros de precisão
    const absoluteVal = Math.abs(value) < 0.001 ? 0 : value;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(absoluteVal);
  };

  const getSortIcon = (key: string) => {
    if (sortConfig?.key !== key) return <ChevronsUpDown className="w-3 h-3 text-slate-300" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />;
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
            <ClipboardList className="w-3 h-3" /> Ver relação de números
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
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-sm font-bold border border-slate-100 hover:bg-slate-100 transition-all">
            <Filter className="w-4 h-4" /> Filtros Avançados
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-100 hover:bg-blue-700 transition-all">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Tabela de Detalhamento */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
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
                  <td colSpan={7} className="p-20 text-center">
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

      {/* Modal de Notas Únicas */}
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
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data de Emissão</span>
                </div>
                {uniqueNotesList.map((note) => (
                  <div 
                    key={note.number} 
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-blue-50/50 border border-transparent hover:border-blue-100 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                        <FileText className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-mono font-black text-slate-700 tracking-wider">
                        {note.number}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg group-hover:bg-blue-100 group-hover:text-blue-700 transition-all">
                      {new Date(note.date).toLocaleDateString('pt-BR')}
                    </span>
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
    </div>
  );
};
