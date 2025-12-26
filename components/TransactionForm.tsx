
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Save, ArrowRightLeft, Repeat, Search, ChevronDown, Plus, Loader2 } from 'lucide-react';
import { Transaction, Bank, Category, CostCenter, Participant, Wallet, TransactionType, TransactionStatus } from '../types';

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transaction: Transaction | Transaction[]) => void;
  onAddParticipant: (name: string) => Promise<Participant>;
  initialData?: Transaction | null;
  defaultStatus?: TransactionStatus;
  registries: {
    banks: Bank[];
    categories: Category[];
    costCenters: CostCenter[];
    participants: Participant[];
    wallets: Wallet[];
  };
}

const emptyTransaction: Omit<Transaction, 'id'> = {
  date: new Date().toISOString().split('T')[0],
  description: '',
  docNumber: '',
  value: 0,
  type: 'DEBIT',
  status: 'PENDING',
  bankId: '',
  categoryId: '',
  costCenterId: '',
  participantId: '',
  walletId: '',
};

type FormMode = 'DEFAULT' | 'TRANSFER';
type RecurrenceFreq = 'DAILY' | 'BUSINESS_DAYS' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export const TransactionForm: React.FC<TransactionFormProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  onAddParticipant,
  initialData,
  defaultStatus = 'PENDING',
  registries 
}) => {
  const [formData, setFormData] = useState<Omit<Transaction, 'id'>>(emptyTransaction);
  const [id, setId] = useState<string>('');
  const [mode, setMode] = useState<FormMode>('DEFAULT');
  const [targetBankId, setTargetBankId] = useState('');
  
  const [participantSearch, setParticipantSearch] = useState('');
  const [isParticipantDropdownOpen, setIsParticipantDropdownOpen] = useState(false);
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isRecurrence, setIsRecurrence] = useState(false);
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFreq>('MONTHLY');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');

  const sortedBanks = useMemo(() => [...registries.banks].sort((a, b) => a.name.localeCompare(b.name)), [registries.banks]);
  const sortedCategories = useMemo(() => [...registries.categories].sort((a, b) => a.name.localeCompare(b.name)), [registries.categories]);
  const sortedWallets = useMemo(() => [...registries.wallets].sort((a, b) => a.name.localeCompare(b.name)), [registries.wallets]);
  const sortedCostCenters = useMemo(() => [...registries.costCenters].sort((a, b) => a.name.localeCompare(b.name)), [registries.costCenters]);

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setFormData({ ...initialData });
      setId(initialData.id);
      setMode('DEFAULT');
      setIsRecurrence(false);
      setTargetBankId('');
      setRecurrenceEndDate('');
      const p = registries.participants.find(x => x.id === initialData.participantId);
      setParticipantSearch(p?.name || '');
    } else {
      setFormData({ ...emptyTransaction, status: defaultStatus });
      setId('');
      setMode('DEFAULT');
      setIsRecurrence(false);
      setTargetBankId('');
      setRecurrenceEndDate('');
      setParticipantSearch('');
    }
  }, [initialData, isOpen, defaultStatus]); // Removido registries.participants das dependências para evitar reset indesejado

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsParticipantDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredParticipants = useMemo(() => {
    const term = participantSearch.toLowerCase();
    return registries.participants
      .filter(p => p.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [registries.participants, participantSearch]);

  const switchToTransfer = () => {
    setMode('TRANSFER');
    const targetCategory = sortedCategories.find(c => 
      c.name.trim().toLowerCase() === "transferência mesma titularidade" ||
      c.name.trim().toLowerCase() === "transferencia mesma titularidade"
    );
    const targetParticipant = registries.participants.find(p => 
      p.name.trim().toLowerCase() === "renzo do amaral braz"
    );

    setFormData(prev => ({
      ...prev,
      categoryId: targetCategory?.id || prev.categoryId,
      participantId: targetParticipant?.id || prev.participantId,
    }));

    if (targetParticipant) {
      setParticipantSearch(targetParticipant.name);
    } else if (!formData.participantId) {
      setParticipantSearch("Renzo do Amaral Braz");
    }
  };

  const switchToDefault = () => setMode('DEFAULT');

  const handleQuickAddParticipant = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!participantSearch.trim() || isAddingParticipant) return;

    setIsAddingParticipant(true);
    try {
        const newP = await onAddParticipant(participantSearch.trim());
        handleChange('participantId', newP.id);
        setParticipantSearch(newP.name);
        setIsParticipantDropdownOpen(false);
    } catch (error) {
        console.error("Erro ao criar participante rápido:", error);
    } finally {
        setIsAddingParticipant(false);
    }
  };

  const generateRecurrenceDates = (start: string, end: string, freq: RecurrenceFreq): string[] => {
    const dates: string[] = [];
    let current = new Date(start + 'T12:00:00');
    const stop = new Date(end + 'T12:00:00');
    while (current <= stop) {
        if (freq === 'BUSINESS_DAYS') {
            const day = current.getDay();
            if (day !== 0 && day !== 6) dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        } else {
            dates.push(current.toISOString().split('T')[0]);
            if (freq === 'DAILY') current.setDate(current.getDate() + 1);
            else if (freq === 'WEEKLY') current.setDate(current.getDate() + 7);
            else if (freq === 'MONTHLY') current.setMonth(current.getMonth() + 1);
            else if (freq === 'YEARLY') current.setFullYear(current.getFullYear() + 1);
        }
    }
    return dates;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const transactionsToSave: Transaction[] = [];
    const baseDates = isRecurrence && recurrenceEndDate ? generateRecurrenceDates(formData.date, recurrenceEndDate, recurrenceFreq) : [formData.date];

    baseDates.forEach((dateStr, index) => {
        const suffix = isRecurrence ? ` (${index + 1}/${baseDates.length})` : '';
        if (mode === 'TRANSFER') {
            const sourceBank = registries.banks.find(b => b.id === formData.bankId);
            const targetBank = registries.banks.find(b => b.id === targetBankId);
            transactionsToSave.push({
                ...formData, id: '', date: dateStr, description: `Transf. enviada p/ ${targetBank?.name || 'Destino'}${suffix}`, type: 'DEBIT', bankId: formData.bankId, walletId: formData.walletId,
            });
            transactionsToSave.push({
                ...formData, id: '', date: dateStr, description: `Transf. recebida de ${sourceBank?.name || 'Origem'}${suffix}`, type: 'CREDIT', bankId: targetBankId, walletId: formData.walletId,
            });
        } else {
            transactionsToSave.push({
                ...formData, id: isRecurrence ? '' : id, date: dateStr, description: formData.description + suffix
            });
        }
    });
    onSave(transactionsToSave.length === 1 ? transactionsToSave[0] : transactionsToSave);
    onClose();
  };

  const handleChange = (field: keyof Transaction, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  const inputClass = "w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-800 disabled:bg-gray-100 disabled:text-gray-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex flex-col border-b border-gray-100 bg-gray-50">
            <div className="flex justify-between items-center p-6 pb-2">
                <h2 className="text-xl font-bold text-slate-800">{id ? 'Editar Lançamento' : 'Novo Lançamento'}</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-6 h-6" /></button>
            </div>
            {!id && (
                <div className="flex px-6 gap-6">
                    <button type="button" onClick={switchToDefault} className={`pb-3 text-sm font-medium border-b-2 transition-colors ${mode === 'DEFAULT' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Receita / Despesa</button>
                    <button type="button" onClick={switchToTransfer} className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${mode === 'TRANSFER' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><ArrowRightLeft className="w-4 h-4" />Transferência Bancária</button>
                </div>
            )}
        </div>

        <div className="p-6 overflow-y-auto bg-white flex-1">
          <form id="transaction-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data {isRecurrence && 'Inicial'}</label>
                <input type="date" required value={formData.date} onChange={(e) => handleChange('date', e.target.value)} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input type="text" value={formData.description} onChange={(e) => handleChange('description', e.target.value)} className={inputClass} placeholder={mode === 'TRANSFER' ? "Opcional (Ex: Mensalidade)" : "Ex: Fornecedor de TI"} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
               <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                <input type="number" step="0.01" min="0" required value={formData.value} onChange={(e) => handleChange('value', parseFloat(e.target.value) || 0)} className={`${inputClass} font-mono`} />
              </div>
              {mode === 'DEFAULT' && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                    <select value={formData.type} onChange={(e) => handleChange('type', e.target.value as TransactionType)} className={inputClass}>
                        <option value="DEBIT">Débito (Saída)</option>
                        <option value="CREDIT">Crédito (Entrada)</option>
                    </select>
                </div>
              )}
               <div className="flex items-end pb-2">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" checked={formData.status === 'PAID'} onChange={(e) => handleChange('status', e.target.checked ? 'PAID' : 'PENDING')} />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-green-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                  </div>
                  <span className={`text-sm font-medium ${formData.status === 'PAID' ? 'text-green-700' : 'text-gray-500'}`}>{formData.status === 'PAID' ? 'Pago' : 'Pendente'}</span>
                </label>
              </div>
              <div className={mode === 'TRANSFER' ? 'hidden' : 'block'}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nº Doc</label>
                  <input type="text" value={formData.docNumber} onChange={(e) => handleChange('docNumber', e.target.value)} className={inputClass} />
              </div>
            </div>

            <div className={mode === 'TRANSFER' ? "p-5 bg-blue-50 border border-blue-100 rounded-xl space-y-6 shadow-sm" : "space-y-6"}>
                {mode === 'TRANSFER' && (
                    <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-2"><ArrowRightLeft className="w-4 h-4" />Dados da Transferência</h3>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className={`block text-xs font-bold mb-1 uppercase tracking-wider ${mode === 'TRANSFER' ? 'text-blue-900' : 'text-gray-700'}`}>Carteira</label>
                        <select required value={formData.walletId} onChange={(e) => handleChange('walletId', e.target.value)} className={inputClass}>
                            <option value="">Selecione...</option>
                            {sortedWallets.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                    {mode === 'TRANSFER' ? (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-blue-900 mb-1 uppercase tracking-wider">Banco Origem</label>
                                <select required value={formData.bankId} onChange={(e) => handleChange('bankId', e.target.value)} className={inputClass}>
                                    <option value="">Selecione...</option>
                                    {sortedBanks.map(r => <option key={r.id} value={r.id} disabled={r.id === targetBankId}>{r.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-blue-900 mb-1 uppercase tracking-wider">Banco Destino</label>
                                <select required value={targetBankId} onChange={(e) => setTargetBankId(e.target.value)} className={inputClass}>
                                    <option value="">Selecione...</option>
                                    {sortedBanks.map(r => <option key={r.id} value={r.id} disabled={r.id === formData.bankId}>{r.name}</option>)}
                                </select>
                            </div>
                        </>
                    ) : (
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Banco</label>
                            <select required value={formData.bankId} onChange={(e) => handleChange('bankId', e.target.value)} className={inputClass}>
                                <option value="">Selecione...</option>
                                {sortedBanks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                        </div>
                    )}
                </div>

                <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 ${mode === 'TRANSFER' ? 'pt-4 border-t border-blue-100' : ''}`}>
                    <div>
                        <label className={`block text-xs font-bold mb-1 uppercase tracking-wider ${mode === 'TRANSFER' ? 'text-blue-900' : 'text-gray-700'}`}>Categoria</label>
                        <select required value={formData.categoryId} onChange={(e) => handleChange('categoryId', e.target.value)} className={inputClass}>
                            <option value="">Selecione...</option>
                            {sortedCategories.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                    
                    <div className="relative md:col-span-2" ref={dropdownRef}>
                        <label className={`block text-xs font-bold mb-1 uppercase tracking-wider flex justify-between items-center ${mode === 'TRANSFER' ? 'text-blue-900' : 'text-gray-700'}`}>
                            <span>Participante</span>
                            {formData.participantId && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Selecionado</span>}
                        </label>
                        <div className="relative">
                            <input 
                                type="text"
                                value={participantSearch}
                                onChange={(e) => {
                                    setParticipantSearch(e.target.value);
                                    setIsParticipantDropdownOpen(true);
                                    if (!e.target.value) handleChange('participantId', '');
                                }}
                                onFocus={() => setIsParticipantDropdownOpen(true)}
                                className={`${inputClass} pr-10`}
                                placeholder="Digite para buscar ou criar..."
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-slate-400">
                                <Search className="w-4 h-4" />
                            </div>
                        </div>
                        
                        {isParticipantDropdownOpen && (
                            <div className="absolute z-[60] mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto animate-fade-in">
                                {participantSearch.trim() && (
                                    <button
                                        type="button"
                                        disabled={isAddingParticipant}
                                        onClick={handleQuickAddParticipant}
                                        className="w-full text-left px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-bold flex items-center gap-2 border-b border-blue-200 transition-colors"
                                    >
                                        {isAddingParticipant ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Plus className="w-4 h-4" />
                                        )}
                                        Cadastrar novo: "{participantSearch}"
                                    </button>
                                )}
                                {filteredParticipants.length > 0 ? (
                                    filteredParticipants.map(p => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => {
                                                handleChange('participantId', p.id);
                                                setParticipantSearch(p.name);
                                                setIsParticipantDropdownOpen(false);
                                            }}
                                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0 ${formData.participantId === p.id ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-700'}`}
                                        >
                                            <div className="truncate">{p.name}</div>
                                        </button>
                                    ))
                                ) : (
                                    !participantSearch.trim() && <div className="px-4 py-8 text-center text-slate-400 text-sm">Digite para buscar...</div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="md:col-span-1">
                        <label className={`block text-xs font-bold mb-1 uppercase tracking-wider ${mode === 'TRANSFER' ? 'text-blue-900' : 'text-gray-700'}`}>Centro de Custo (Opcional)</label>
                        <select value={formData.costCenterId} onChange={(e) => handleChange('costCenterId', e.target.value)} className={inputClass}>
                            <option value="">Selecione...</option>
                            {sortedCostCenters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {!id && (
                <div className="border-t border-gray-100 pt-6">
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700 mb-4 select-none">
                        <input type="checkbox" checked={isRecurrence} onChange={(e) => setIsRecurrence(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                        <ArrowRightLeft className="w-4 h-4 text-slate-500" /> Repetir este lançamento?
                    </label>
                    {isRecurrence && (
                        <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-orange-900 mb-1">Frequência</label>
                                <select value={recurrenceFreq} onChange={(e) => setRecurrenceFreq(e.target.value as RecurrenceFreq)} className={inputClass}>
                                    <option value="BUSINESS_DAYS">Dias úteis</option>
                                    <option value="WEEKLY">Semanal</option>
                                    <option value="MONTHLY">Mensal</option>
                                    <option value="YEARLY">Anual</option>
                                    <option value="DAILY">Diário</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-orange-900 mb-1">Até quando?</label>
                                <input type="date" required value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)} min={formData.date} className={inputClass} />
                            </div>
                        </div>
                    )}
                </div>
            )}
          </form>
        </div>

        <div className="p-6 border-t border-gray-100 bg-white flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition-colors">Cancelar</button>
          <button type="submit" form="transaction-form" className="px-6 py-2 bg-blue-600 rounded-lg text-white font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm shadow-blue-100">
            <Save className="w-4 h-4" /> {isRecurrence ? 'Gerar Lançamentos' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};
