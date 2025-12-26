
import React, { useState, useRef, useMemo } from 'react';
import { Plus, Trash2, Edit2, Save, X, Upload, Search, Tag, Loader2 } from 'lucide-react';
import { BaseEntity } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface RegistryManagerProps {
  title: string;
  items: (BaseEntity & { [key: string]: any })[];
  onAdd: (name: string, extraData?: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (id: string, name: string, extraData?: any) => Promise<void>;
  onImport: (names: string[]) => Promise<void>;
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
  foreignItems,
  foreignLabel,
  foreignKey
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [tempForeignKey, setTempForeignKey] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'DELETE' | 'IMPORT';
    data: any;
    message: string;
    title: string;
  }>({ isOpen: false, type: 'DELETE', data: null, message: '', title: '' });

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return items.filter(item => 
      item.name.toLowerCase().includes(term)
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchTerm]);

  const handleStartAdd = () => {
    setTempName('');
    setTempForeignKey('');
    setIsAdding(true);
  };

  const handleSaveAdd = async () => {
    if (tempName.trim() && !isSaving) {
      setIsSaving(true);
      try {
        const extra = foreignKey ? { [foreignKey]: tempForeignKey } : undefined;
        await onAdd(tempName, extra);
        setTempName('');
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
        const extra = foreignKey ? { [foreignKey]: tempForeignKey } : undefined;
        await onEdit(editingId, tempName, extra);
        setEditingId(null);
        setTempName('');
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
            if (text.includes('')) {
                const latin1Decoder = new TextDecoder('iso-8859-1');
                text = latin1Decoder.decode(buffer);
            }
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
          await onDelete(confirmModal.data);
      } else if (confirmModal.type === 'IMPORT') {
          await onImport(confirmModal.data);
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
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".csv,.txt" />
              <button onClick={handleImportClick} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
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

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col flex-1 min-w-0 pr-4">
                    <span className="text-sm text-slate-700 font-semibold truncate" title={item.name}>{item.name}</span>
                    {foreignKey && item[foreignKey] && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                        {getForeignName(item[foreignKey])}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
      
      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({...prev, isOpen: false}))}
        onConfirm={handleConfirmAction}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={confirmModal.type === 'DELETE'}
        confirmText={confirmModal.type === 'DELETE' ? 'Excluir' : 'Importar'}
      />
    </>
  );
};
