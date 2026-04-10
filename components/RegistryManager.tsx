
import React, { useState, useRef, useMemo } from 'react';
import { Plus, Trash2, Edit2, Save, X, Upload, Search, Tag, Loader2, Wand2, Sparkles, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { BaseEntity, Currency, WalletType } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface RegistryManagerProps {
  title: string;
  items: (BaseEntity & { [key: string]: any })[];
  onAdd: (name: string, extraData?: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (id: string, name: string, extraData?: any) => Promise<void>;
  onImport: (names: string[]) => Promise<void>;
  onDeduplicate?: (onProgress?: (current: number, total: number) => void) => Promise<{ merged: number, deleted: number }>;
  onFindSimilar?: () => Promise<Array<{ master: any, duplicates: any[] }>>;
  onMerge?: (masterId: string, duplicateIds: string[]) => Promise<void>;
  onIgnoreSimilar?: (masterId: string, duplicateIds: string[]) => Promise<void>;
  onGetIgnored?: () => Promise<Array<{ id: string, name1: string, name2: string, pairId: string }>>;
  onRemoveIgnored?: (pairId: string) => Promise<void>;
  onAutoFillTickers?: () => Promise<number>;
  foreignItems?: BaseEntity[];
  foreignLabel?: string;
  foreignKey?: string;
}

export const RegistryManager: React.FC<RegistryManagerProps> = ({ 
  title, 
  items, 
  onAdd, 
  onDelete,
  onEdit,
  onImport,
  onDeduplicate,
  onFindSimilar,
  onMerge,
  onIgnoreSimilar,
  onGetIgnored,
  onRemoveIgnored,
  onAutoFillTickers,
  foreignItems,
  foreignLabel,
  foreignKey
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [tempCategory, setTempCategory] = useState('');
  const [tempCurrency, setTempCurrency] = useState<Currency>('BRL');
  const [tempWalletType, setTempWalletType] = useState<WalletType>('CHECKING');
  const [tempTicker, setTempTicker] = useState('');
  const [tempCurrentPrice, setTempCurrentPrice] = useState<number>(0);
  const [tempForeignKey, setTempForeignKey] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [dedupProgress, setDedupProgress] = useState<{current: number, total: number} | null>(null);
  const [similarGroups, setSimilarGroups] = useState<Array<{ master: any, duplicates: any[] }>>([]);
  const [editingItemInModal, setEditingItemInModal] = useState<{groupIdx: number, itemId: string} | null>(null);
  const [tempModalName, setTempModalName] = useState('');
  const [ignoredUnifications, setIgnoredUnifications] = useState<Array<{ id: string, name1: string, name2: string, pairId: string }>>([]);
  const [isShowingIgnored, setIsShowingIgnored] = useState(false);
  const [isSearchingSimilar, setIsSearchingSimilar] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tickerFilter, setTickerFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [sortField, setSortField] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uniqueCategories = useMemo(() => Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort(), [items]);
  const uniqueTickers = useMemo(() => Array.from(new Set(items.map(i => i.ticker).filter(Boolean))).sort(), [items]);
  const uniqueCurrencies = useMemo(() => Array.from(new Set(items.map(i => i.currency).filter(Boolean))).sort(), [items]);
  
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'DELETE' | 'IMPORT' | 'DEDUPLICATE' | 'AUTOFILL';
    data: any;
    message: string;
    title: string;
  }>({ isOpen: false, type: 'DELETE', data: null, message: '', title: '' });

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const filtered = items.filter(item => {
      const matchesSearch = !term || item.name.toLowerCase().includes(term);
      const matchesName = !nameFilter || item.name.toLowerCase().includes(nameFilter.toLowerCase());
      const matchesCategory = !categoryFilter || (item.category || '').toLowerCase().includes(categoryFilter.toLowerCase());
      const matchesTicker = !tickerFilter || (item.ticker || '').toLowerCase().includes(tickerFilter.toLowerCase());
      const matchesCurrency = !currencyFilter || (item.currency || '').toLowerCase().includes(currencyFilter.toLowerCase());
      
      return matchesSearch && matchesName && matchesCategory && matchesTicker && matchesCurrency;
    });

    return filtered.sort((a, b) => {
      const valA = (a[sortField] || '').toString().toLowerCase();
      const valB = (b[sortField] || '').toString().toLowerCase();
      
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, searchTerm, nameFilter, categoryFilter, tickerFilter, currencyFilter, sortField, sortDirection]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const handleStartAdd = () => {
    setTempName('');
    setTempCategory('');
    setTempCurrency('BRL');
    setTempWalletType('CHECKING');
    setTempTicker('');
    setTempCurrentPrice(0);
    setTempForeignKey('');
    setIsAdding(true);
  };

  const handleSaveAdd = async () => {
    if (tempName.trim() && !isSaving) {
      setIsSaving(true);
      try {
        const extra: any = foreignKey ? { [foreignKey]: tempForeignKey } : {};
        if (title.toLowerCase().includes('participante')) {
          extra.category = tempCategory;
          extra.ticker = tempTicker;
          extra.currency = tempCurrency;
          extra.currentPrice = tempCurrentPrice;
        }
        if (title.toLowerCase().includes('banco')) {
          extra.currency = tempCurrency;
          extra.type = tempWalletType;
        }
        if (title.toLowerCase().includes('carteira')) {
          // Wallet is now just a portfolio/company name
        }
        await onAdd(tempName, extra);
        setTempName('');
        setTempCategory('');
        setTempCurrency('BRL');
        setTempTicker('');
        setTempCurrentPrice(0);
        setTempForeignKey('');
        setIsAdding(false);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleStartEdit = (item: BaseEntity & { [key: string]: any }) => {
    setEditingId(item.id);
    setTempName(item.name);
    setTempCategory(item.category || '');
    setTempCurrency(item.currency || 'BRL');
    setTempWalletType(item.type || 'CHECKING');
    setTempTicker(item.ticker || '');
    setTempCurrentPrice(item.currentPrice || 0);
    if (foreignKey && item[foreignKey]) {
        setTempForeignKey(item[foreignKey]);
    } else {
        setTempForeignKey('');
    }
  };

  const handleSaveEdit = async () => {
    if (editingId && tempName.trim() && !isSaving) {
      setIsSaving(true);
      try {
        const extra: any = foreignKey ? { [foreignKey]: tempForeignKey } : {};
        if (title.toLowerCase().includes('participante')) {
          extra.category = tempCategory;
          extra.ticker = tempTicker;
          extra.currency = tempCurrency;
          extra.currentPrice = tempCurrentPrice;
        }
        if (title.toLowerCase().includes('banco')) {
          extra.currency = tempCurrency;
          extra.type = tempWalletType;
        }
        if (title.toLowerCase().includes('carteira')) {
          // Wallet is now just a portfolio/company name
        }
        await onEdit(editingId, tempName, extra);
        setEditingId(null);
        setTempName('');
        setTempCategory('');
        setTempCurrency('BRL');
        setTempTicker('');
        setTempCurrentPrice(0);
        setTempForeignKey('');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        if (buffer) {
            const utf8Decoder = new TextDecoder('utf-8');
            let text = utf8Decoder.decode(buffer);
            // Removido check redundante que causava erro de sintaxe por caractere invisível
            const lines = text.split(/[\r\n]+/)
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('id') && !line.startsWith('name'));
            if (lines.length > 0) {
                setConfirmModal({
                    isOpen: true,
                    type: 'IMPORT',
                    data: lines,
                    title: 'Importar Registros',
                    message: `Deseja importar ${lines.length} itens para ${title}?`
                });
            }
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const requestDelete = (id: string) => {
      setConfirmModal({
          isOpen: true,
          type: 'DELETE',
          data: id,
          title: 'Excluir Registro',
          message: 'Tem certeza que deseja excluir este registro?'
      });
  };

  const handleConfirmAction = async () => {
      if (confirmModal.type === 'DELETE') {
          try {
              await onDelete(confirmModal.data);
          } catch (error: any) {
              alert(error.message);
          }
      } else if (confirmModal.type === 'IMPORT') {
          await onImport(confirmModal.data);
      } else if (confirmModal.type === 'DEDUPLICATE' && onDeduplicate) {
          setConfirmModal(prev => ({...prev, isOpen: false}));
          setIsSaving(true);
          setDedupProgress({ current: 0, total: 1 });
          try {
              const result = await onDeduplicate((current, total) => {
                  setDedupProgress({ current, total });
              });
              alert(`${result.deleted} registros duplicados foram unificados com sucesso!`);
          } catch (error: any) {
              alert('Erro ao unificar: ' + error.message);
          } finally {
              setIsSaving(false);
              setDedupProgress(null);
          }
      } else if (confirmModal.type === 'AUTOFILL' && onAutoFillTickers) {
          setConfirmModal(prev => ({...prev, isOpen: false}));
          setIsAutoFilling(true);
          try {
              const count = await onAutoFillTickers();
              alert(`${count} tickers foram preenchidos com sucesso!`);
          } catch (error: any) {
              alert('Erro ao preencher: ' + error.message);
          } finally {
              setIsAutoFilling(false);
          }
      }
  };

  const handleFindSimilar = async () => {
    if (onFindSimilar) {
      setIsSearchingSimilar(true);
      try {
        const groups = await onFindSimilar();
        setSimilarGroups(groups);
        if (groups.length === 0) {
          alert('Nenhum registro similar encontrado.');
        }
      } catch (error: any) {
        alert('Erro ao buscar similares: ' + error.message);
      } finally {
        setIsSearchingSimilar(false);
      }
    }
  };

  const handleMerge = async (masterId: string, duplicateIds: string[]) => {
    if (onMerge) {
      setIsSaving(true);
      try {
        await onMerge(masterId, duplicateIds);
        setSimilarGroups(prev => prev.filter(g => g.master.id !== masterId));
      } catch (error: any) {
        alert('Erro ao unificar: ' + error.message);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleSetMaster = (groupIdx: number, itemId: string) => {
    setSimilarGroups(prev => {
      const newGroups = [...prev];
      const group = { ...newGroups[groupIdx] };
      const allItems = [group.master, ...group.duplicates];
      const newMaster = allItems.find(i => i.id === itemId);
      const newDuplicates = allItems.filter(i => i.id !== itemId);
      
      if (newMaster) {
        group.master = newMaster;
        group.duplicates = newDuplicates;
        newGroups[groupIdx] = group;
      }
      return newGroups;
    });
  };

  const handleRemoveFromGroup = (groupIdx: number, itemId: string) => {
    setSimilarGroups(prev => {
      const newGroups = [...prev];
      const group = { ...newGroups[groupIdx] };
      const allItems = [group.master, ...group.duplicates].filter(i => i.id !== itemId);
      
      if (allItems.length < 2) {
        // Se sobrar menos de 2 itens, o grupo não faz mais sentido
        return prev.filter((_, i) => i !== groupIdx);
      }

      const newMaster = allItems[0];
      const newDuplicates = allItems.slice(1);
      
      group.master = newMaster;
      group.duplicates = newDuplicates;
      newGroups[groupIdx] = group;
      
      return newGroups;
    });
  };

  const handleStartRenameInModal = (groupIdx: number, item: any) => {
    setEditingItemInModal({ groupIdx, itemId: item.id });
    setTempModalName(item.name);
  };

  const handleSaveRenameInModal = async () => {
    if (!editingItemInModal || !tempModalName.trim()) return;
    
    const { groupIdx, itemId } = editingItemInModal;
    setIsSaving(true);
    try {
      // Primeiro atualiza no banco/serviço
      await onEdit(itemId, tempModalName);
      
      // Depois atualiza na UI do modal
      setSimilarGroups(prev => {
        const newGroups = [...prev];
        const group = { ...newGroups[groupIdx] };
        
        if (group.master.id === itemId) {
          group.master = { ...group.master, name: tempModalName };
        } else {
          group.duplicates = group.duplicates.map(d => 
            d.id === itemId ? { ...d, name: tempModalName } : d
          );
        }
        
        newGroups[groupIdx] = group;
        return newGroups;
      });
      
      setEditingItemInModal(null);
    } catch (error: any) {
      alert('Erro ao renomear: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleIgnoreGroup = async (groupIndex: number) => {
    const group = similarGroups[groupIndex];
    if (onIgnoreSimilar) {
      await onIgnoreSimilar(group.master.id, group.duplicates.map(d => d.id));
    }
    setSimilarGroups(prev => prev.filter((_, i) => i !== groupIndex));
  };

  const handleShowIgnored = async () => {
    if (onGetIgnored) {
      const ignored = await onGetIgnored();
      setIgnoredUnifications(ignored);
      setIsShowingIgnored(true);
    }
  };

  const handleRemoveIgnored = async (pairId: string) => {
    if (onRemoveIgnored) {
      await onRemoveIgnored(pairId);
      setIgnoredUnifications(prev => prev.filter(i => i.id !== pairId));
    }
  };

  const getForeignName = (id: string) => foreignItems?.find(i => i.id === id)?.name || '';

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Tag className="w-5 h-5 text-blue-600" />
              {title}
              <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {items.length}
              </span>
            </h3>
            <div className="flex gap-2">
              {onGetIgnored && (
                <button 
                  onClick={handleShowIgnored}
                  className="p-2 text-slate-400 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors" 
                  title="Ver Sugestões Ignoradas"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
              {onAutoFillTickers && (
                <button 
                  onClick={() => setConfirmModal({
                    isOpen: true,
                    type: 'AUTOFILL',
                    data: null,
                    title: 'Preencher Tickers',
                    message: 'Deseja buscar e preencher automaticamente os Tickers das ações brasileiras já cadastradas? (Ex: Petrobras -> PETR4)'
                  })}
                  disabled={isAutoFilling}
                  className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50" 
                  title="Preencher Tickers Automaticamente"
                >
                  {isAutoFilling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                </button>
              )}
              {onDeduplicate && (
                <button 
                  onClick={() => setConfirmModal({
                    isOpen: true,
                    type: 'DEDUPLICATE',
                    data: null,
                    title: 'Limpar Duplicados',
                    message: 'Esta ação irá procurar registros com o nome exatamente igual, unificá-los e atualizar todos os lançamentos vinculados. Deseja continuar?'
                  })}
                  className="p-2 text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors" 
                  title="Limpar Duplicados"
                >
                  <Wand2 className="w-5 h-5" />
                </button>
              )}
              {onFindSimilar && (
                <button 
                  onClick={handleFindSimilar}
                  disabled={isSearchingSimilar}
                  className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50" 
                  title="Sugerir Unificação (Nomes Parecidos)"
                >
                  {isSearchingSimilar ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                </button>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".csv,.txt" />
              <button onClick={handleImportClick} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Importar TXT/CSV (Formato: Nome,Categoria)">
                <Upload className="w-5 h-5" />
              </button>
              <button onClick={handleStartAdd} disabled={isAdding || isSaving} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm shadow-blue-100">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder={`Pesquisar em ${title.toLowerCase()}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {title.toLowerCase().includes('participante') && (
            <div className="grid grid-cols-[2fr,1fr,1fr,1fr,80px] gap-4 px-4 py-2 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
              <div className="flex flex-col gap-1">
                <button 
                  onClick={() => toggleSort('name')}
                  className="flex items-center gap-1 hover:text-blue-600 transition-colors text-left"
                >
                  Nome {getSortIcon('name')}
                </button>
                <input 
                  type="text" 
                  value={nameFilter} 
                  onChange={e => setNameFilter(e.target.value)}
                  className="font-normal lowercase p-1 border border-slate-200 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Filtrar..."
                />
              </div>
              <div className="flex flex-col gap-1">
                <button 
                  onClick={() => toggleSort('category')}
                  className="flex items-center gap-1 hover:text-blue-600 transition-colors text-left"
                >
                  Tipo {getSortIcon('category')}
                </button>
                <select 
                  value={categoryFilter} 
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="font-normal lowercase p-1 border border-slate-200 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 text-[10px]"
                >
                  <option value="">Todos</option>
                  {uniqueCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <button 
                  onClick={() => toggleSort('ticker')}
                  className="flex items-center gap-1 hover:text-blue-600 transition-colors text-left"
                >
                  Ticker {getSortIcon('ticker')}
                </button>
                <select 
                  value={tickerFilter} 
                  onChange={e => setTickerFilter(e.target.value)}
                  className="font-normal lowercase p-1 border border-slate-200 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 text-[10px]"
                >
                  <option value="">Todos</option>
                  {uniqueTickers.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <button 
                  onClick={() => toggleSort('currency')}
                  className="flex items-center gap-1 hover:text-blue-600 transition-colors text-left"
                >
                  Moeda {getSortIcon('currency')}
                </button>
                <select 
                  value={currencyFilter} 
                  onChange={e => setCurrencyFilter(e.target.value)}
                  className="font-normal lowercase p-1 border border-slate-200 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 text-[10px]"
                >
                  <option value="">Todas</option>
                  {uniqueCurrencies.map(curr => <option key={curr} value={curr}>{curr}</option>)}
                </select>
              </div>
              <div className="flex items-end pb-1">Ações</div>
            </div>
          )}

          <div className="p-4 space-y-2">
            {isAdding && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg animate-fade-in shadow-sm">
              <input
                autoFocus
                type="text"
                disabled={isSaving}
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className="flex-1 w-full bg-white border border-blue-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                placeholder="Nome do registro..."
              />
              {title.toLowerCase().includes('banco') && (
                <>
                  <select
                    disabled={isSaving}
                    value={tempWalletType}
                    onChange={(e) => setTempWalletType(e.target.value as WalletType)}
                    className="w-full sm:w-32 bg-white border border-blue-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                  >
                    <option value="CHECKING">Corrente</option>
                    <option value="INVESTMENT">Investimento</option>
                  </select>
                    <select
                      disabled={isSaving}
                      value={tempCurrency}
                      onChange={(e) => setTempCurrency(e.target.value as Currency)}
                      className="w-full sm:w-24 bg-white border border-blue-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                    >
                      <option value="BRL">BRL</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="JPY">JPY</option>
                      <option value="CHF">CHF</option>
                      <option value="CAD">CAD</option>
                      <option value="AUD">AUD</option>
                      <option value="CNY">CNY</option>
                    </select>
                </>
              )}
              {title.toLowerCase().includes('participante') && (
                <>
                    <input
                      list="category-options"
                      disabled={isSaving}
                      value={tempCategory}
                      onChange={(e) => setTempCategory(e.target.value)}
                      className="w-full sm:w-32 bg-white border border-blue-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                      placeholder="Tipo..."
                    />
                    <datalist id="category-options">
                      <option value="Ação" />
                      <option value="FII" />
                      <option value="ETF" />
                      <option value="Cripto" />
                      <option value="BDR" />
                      <option value="Renda Fixa" />
                      <option value="Tesouro Direto" />
                      <option value="Outros" />
                    </datalist>
                    <input
                      type="text"
                      disabled={isSaving}
                      value={tempTicker}
                      onChange={(e) => setTempTicker(e.target.value)}
                      className="w-full sm:w-24 bg-white border border-blue-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 uppercase"
                      placeholder="Ticker"
                    />
                    <select
                      disabled={isSaving}
                      value={tempCurrency}
                      onChange={(e) => setTempCurrency(e.target.value as Currency)}
                      className="w-full sm:w-20 bg-white border border-blue-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                    >
                      <option value="BRL">BRL</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="JPY">JPY</option>
                      <option value="CHF">CHF</option>
                      <option value="CAD">CAD</option>
                      <option value="AUD">AUD</option>
                      <option value="CNY">CNY</option>
                    </select>
                </>
              )}
              {title.toLowerCase().includes('carteira') && (
                null // Wallet is now just a portfolio/company name
              )}
              {foreignItems && (
                <select
                  disabled={isSaving}
                  value={tempForeignKey}
                  onChange={(e) => setTempForeignKey(e.target.value)}
                  className="w-full sm:w-48 bg-white border border-blue-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                >
                  <option value="">{foreignLabel || 'Selecione...'}</option>
                  {foreignItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              )}
              <div className="flex gap-1 w-full sm:w-auto justify-end">
                <button onClick={handleSaveAdd} disabled={isSaving} className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
                <button onClick={() => setIsAdding(false)} disabled={isSaving} className="bg-slate-200 text-slate-600 p-2 rounded-lg hover:bg-slate-300 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {filteredItems.map(item => (
            <div key={item.id} className="group flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
              {editingId === item.id ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-1 animate-fade-in">
                  <input
                    autoFocus
                    type="text"
                    disabled={isSaving}
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="flex-1 w-full bg-white border border-blue-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                  />
                  {title.toLowerCase().includes('participante') && (
                    <>
                      <input
                        list="category-options"
                        disabled={isSaving}
                        value={tempCategory}
                        onChange={(e) => setTempCategory(e.target.value)}
                        className="w-full sm:w-32 bg-white border border-blue-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                        placeholder="Tipo..."
                      />
                      <input
                        type="text"
                        disabled={isSaving}
                        value={tempTicker}
                        onChange={(e) => setTempTicker(e.target.value)}
                        className="w-full sm:w-24 bg-white border border-blue-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 uppercase"
                        placeholder="Ticker"
                      />
                      <select
                        disabled={isSaving}
                        value={tempCurrency}
                        onChange={(e) => setTempCurrency(e.target.value as Currency)}
                        className="w-full sm:w-20 bg-white border border-blue-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                      >
                        <option value="BRL">BRL</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="JPY">JPY</option>
                        <option value="CHF">CHF</option>
                        <option value="CAD">CAD</option>
                        <option value="AUD">AUD</option>
                        <option value="CNY">CNY</option>
                      </select>
                    </>
                  )}
                  {title.toLowerCase().includes('banco') && (
                    <>
                      <select
                        disabled={isSaving}
                        value={tempWalletType}
                        onChange={(e) => setTempWalletType(e.target.value as WalletType)}
                        className="w-full sm:w-32 bg-white border border-blue-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                      >
                        <option value="CHECKING">Corrente</option>
                        <option value="INVESTMENT">Investimento</option>
                      </select>
                      <select
                        disabled={isSaving}
                        value={tempCurrency}
                        onChange={(e) => setTempCurrency(e.target.value as Currency)}
                        className="w-full sm:w-24 bg-white border border-blue-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                      >
                        <option value="BRL">BRL</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="JPY">JPY</option>
                        <option value="CHF">CHF</option>
                        <option value="CAD">CAD</option>
                        <option value="AUD">AUD</option>
                        <option value="CNY">CNY</option>
                      </select>
                    </>
                  )}
                  {title.toLowerCase().includes('carteira') && (
                    null // Wallet is now just a portfolio/company name
                  )}
                  {foreignItems && (
                    <select
                      disabled={isSaving}
                      value={tempForeignKey}
                      onChange={(e) => setTempForeignKey(e.target.value)}
                      className="w-full sm:w-48 bg-white border border-blue-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                    >
                      <option value="">{foreignLabel || 'Selecione...'}</option>
                      {foreignItems.map(fItem => <option key={fItem.id} value={fItem.id}>{fItem.name}</option>)}
                    </select>
                  )}
                  <div className="flex gap-1 w-full sm:w-auto justify-end">
                    <button onClick={handleSaveEdit} disabled={isSaving} className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center">
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setEditingId(null)} disabled={isSaving} className="bg-slate-200 text-slate-600 p-2 rounded-lg hover:bg-slate-300 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`flex items-center justify-between w-full ${title.toLowerCase().includes('participante') ? 'grid grid-cols-[2fr,1fr,1fr,1fr,80px] gap-4' : ''}`}>
                  <div className="flex flex-col flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-700 font-semibold truncate" title={item.name}>{item.name}</span>
                    </div>
                    {foreignKey && item[foreignKey] && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                        {getForeignName(item[foreignKey])}
                      </span>
                    )}
                  </div>

                  {title.toLowerCase().includes('participante') && (
                    <>
                      <div className="flex items-center">
                        {item.category && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-bold uppercase">
                            {item.category}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center">
                        {item.ticker && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-black uppercase">
                            {item.ticker}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center">
                        {item.currency && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100 font-bold uppercase">
                            {item.currency}
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {!title.toLowerCase().includes('participante') && (
                    <div className="flex items-center gap-2">
                      {item.ticker && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-black uppercase">
                          {item.ticker}
                        </span>
                      )}
                      {item.category && (
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-bold uppercase">
                          {item.category}
                        </span>
                      )}
                      {item.currency && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100 font-bold uppercase">
                          {item.currency}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                    <button onClick={() => handleStartEdit(item)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => requestDelete(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {filteredItems.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 italic text-sm">
              <Search className="w-8 h-8 mb-2 opacity-20" />
              <p>{searchTerm ? 'Nenhum resultado para a busca.' : 'Lista vazia.'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
      
      {/* Modal de Sugestões de Unificação */}
      {similarGroups.length > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden transform transition-all">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Sugestões de Unificação</h3>
                <p className="text-sm text-slate-500">Encontramos registros com nomes muito parecidos.</p>
              </div>
              <button onClick={() => setSimilarGroups([])} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {similarGroups.map((group, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl p-5 border border-slate-200 shadow-sm">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
                    <div className="flex-1 w-full">
                      <div className="mb-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Selecione o nome principal (o que será mantido):</span>
                        <div className="grid grid-cols-1 gap-2">
                          {[group.master, ...group.duplicates].map(item => (
                            <div key={item.id} className="group relative">
                              {editingItemInModal?.itemId === item.id ? (
                                <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                                  <input
                                    autoFocus
                                    type="text"
                                    value={tempModalName}
                                    onChange={(e) => setTempModalName(e.target.value)}
                                    className="flex-1 bg-white border border-blue-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveRenameInModal()}
                                  />
                                  <button onClick={handleSaveRenameInModal} className="p-1 text-green-600 hover:bg-green-100 rounded">
                                    <Save className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setEditingItemInModal(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleSetMaster(idx, item.id)}
                                    className={`flex-1 flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                                      group.master.id === item.id 
                                        ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-500/20' 
                                        : 'bg-white border-slate-200 hover:border-blue-300'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                        group.master.id === item.id ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                                      }`}>
                                        {group.master.id === item.id && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                      </div>
                                      <span className={`text-sm ${group.master.id === item.id ? 'font-bold text-blue-700' : 'text-slate-600'}`}>
                                        {item.name}
                                      </span>
                                    </div>
                                    {group.master.id === item.id && (
                                      <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded uppercase">Principal</span>
                                    )}
                                  </button>
                                  
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={() => handleStartRenameInModal(idx, item)}
                                      title="Renomear"
                                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => handleRemoveFromGroup(idx, item.id)}
                                      title="Remover deste grupo"
                                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                        <p className="text-[11px] text-amber-700 leading-tight">
                          <strong>Atenção:</strong> Todos os lançamentos dos outros nomes serão movidos para o nome selecionado acima, e os nomes secundários serão excluídos.
                        </p>
                      </div>
                    </div>

                    <div className="sm:w-32 flex flex-col items-center justify-center gap-3">
                      <button 
                        onClick={() => handleMerge(group.master.id, group.duplicates.map(d => d.id))}
                        disabled={isSaving}
                        className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-200 disabled:opacity-50 flex flex-col items-center justify-center gap-1"
                      >
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                        <span>Unificar</span>
                      </button>
                      <button 
                        onClick={() => handleIgnoreGroup(idx)}
                        className="text-[11px] text-slate-400 hover:text-slate-600 font-medium underline"
                      >
                        Ignorar este grupo
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button 
                onClick={() => setSimilarGroups([])}
                className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-100 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Sugestões Ignoradas */}
      {isShowingIgnored && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                  <X className="w-6 h-6 text-slate-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Sugestões Ignoradas</h3>
                  <p className="text-sm text-slate-500">Estes pares de nomes não aparecerão mais nas sugestões</p>
                </div>
              </div>
              <button onClick={() => setIsShowingIgnored(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {ignoredUnifications.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-slate-200" />
                  </div>
                  <p className="text-slate-400 font-medium">Nenhuma sugestão ignorada.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {ignoredUnifications.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 group">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">{item.name1}</span>
                        <span className="text-xs text-slate-400">vs</span>
                        <span className="text-sm font-bold text-slate-700">{item.name2}</span>
                      </div>
                      <button 
                        onClick={() => handleRemoveIgnored(item.pairId)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="Remover dos ignorados"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button 
                onClick={() => setIsShowingIgnored(false)}
                className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-100 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({...prev, isOpen: false}))}
        onConfirm={handleConfirmAction}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={confirmModal.type === 'DELETE' || confirmModal.type === 'DEDUPLICATE'}
        confirmText={confirmModal.type === 'DELETE' ? 'Excluir' : confirmModal.type === 'DEDUPLICATE' ? 'Unificar' : 'Importar'}
      />

      {dedupProgress && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 flex flex-col items-center text-center">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
            <h3 className="text-lg font-bold text-slate-800 mb-2">Unificando Registros...</h3>
            <p className="text-slate-500 text-sm mb-4">Por favor, aguarde. Isso pode levar alguns minutos dependendo da quantidade de dados.</p>
            <div className="w-full bg-slate-100 rounded-full h-3 mb-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-full transition-all duration-300 ease-out"
                style={{ width: `${dedupProgress.total > 0 ? (dedupProgress.current / dedupProgress.total) * 100 : 0}%` }}
              ></div>
            </div>
            <p className="text-sm font-medium text-slate-700">
              {dedupProgress.current} de {dedupProgress.total} grupos processados
            </p>
          </div>
        </div>
      )}
    </>
  );
};
