
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Save, ArrowRightLeft, Plus, Loader2, Search, User, Repeat, CalendarClock } from 'lucide-react';
import { Transaction, Bank, Category, CostCenter, Participant, Wallet, TransactionStatus } from '../types';

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transaction: Transaction | Transaction[]) => Promise<void>;
  onAddParticipant: (name: string) => Promise<Participant>;
  initialData?: Transaction | null;
  partnerData?: Transaction | null; 
  defaultStatus?: TransactionStatus;
  preSelectedBankId?: string;
  preSelectedWalletId?: string;
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
type RecurrenceFrequency = 'MONTHLY' | 'WEEKLY' | 'YEARLY';

export const TransactionForm: React.FC<TransactionFormProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  onAddParticipant,
  initialData,
  partnerData,
  defaultStatus = 'PENDING',
  preSelectedBankId,
  preSelectedWalletId,
  registries 
}) => {
  const [formData, setFormData] = useState<Omit<Transaction, 'id'>>(emptyTransaction);
  const [id, setId] = useState<string>('');
  const [mode, setMode] = useState<FormMode>('DEFAULT');
  const [targetBankId, setTargetBankId] = useState('');
  const [linkedId, setLinkedId] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  
  // Recurrence State
  const [isRecurrent, setIsRecurrent] = useState(false);
  const [recurrenceCount, setRecurrenceCount] = useState(2);
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFrequency>('MONTHLY');

  const [participantSearch, setParticipantSearch] = useState('');
  const [isParticipantDropdownOpen, setIsParticipantDropdownOpen] = useState(false);
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sortedBanks = useMemo(() => [...registries.banks].sort((a, b) => a.name.localeCompare(b.name)), [registries.banks]);
  const sortedCategories = useMemo(() => [...registries.categories].sort((a, b) => a.name.localeCompare(b.name)), [registries.categories]);
  const sortedCostCenters = useMemo(() => [...registries.costCenters].sort((a, b) => a.name.localeCompare(b.name)), [registries.costCenters]);
  const sortedWallets = useMemo(() => [...registries.wallets].sort((a, b) => a.name.localeCompare(b.name)), [registries.wallets]);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsParticipantDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  useEffect(() => {
    if (!isOpen) return;
    setIsSaving(false);
    setIsParticipantDropdownOpen(false);

    if (initialData) {
      setFormData({ ...initialData });
      setId(initialData.id);
      setLinkedId(initialData.linkedId);
      
      // Reset recurrence on edit mode (usually not supported or complex to manage)
      setIsRecurrent(false);
      setRecurrenceCount(2);
      
      if (initialData.linkedId) {
        setMode('TRANSFER');
        if (partnerData) {
            setTargetBankId(partnerData.bankId);
        } else {
            setTargetBankId('');
        }
      } else {
        setMode('DEFAULT');
        setTargetBankId('');
      }

      const participant = registries.participants.find(p => p.id === initialData.participantId);
      setParticipantSearch(participant?.name || '');
    } else {
      // Novo Lançamento: Usa os pré-selecionados se disponíveis
      setFormData({ 
        ...emptyTransaction, 
        status: defaultStatus,
        bankId: preSelectedBankId || '',
        walletId: preSelectedWalletId || ''
      });
      setId('');
      setLinkedId(undefined);
      setMode('DEFAULT');
      setTargetBankId('');
      setParticipantSearch('');
      setIsRecurrent(false);
      setRecurrenceCount(2);
      setRecurrenceFreq('MONTHLY');
    }
  }, [initialData, partnerData, isOpen, defaultStatus, registries.participants, preSelectedBankId, preSelectedWalletId]);

  const handleQuickAddParticipant = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!participantSearch.trim() || isAddingParticipant) return;
    setIsAddingParticipant(true);
    try {
        const newP = await onAddParticipant(participantSearch.trim());
        setFormData(prev => ({...prev, participantId: newP.id}));
        setParticipantSearch(newP.name);
        setIsParticipantDropdownOpen(false);
    } finally {
        setIsAddingParticipant(false);
    }
  };

  const calculateDate = (startDate: string, offset: number, freq: RecurrenceFrequency): string => {
      const [y, m, d] = startDate.split('-').map(Number);
      const date = new Date(y, m - 1, d);

      if (freq === 'MONTHLY') {
          date.setMonth(date.getMonth() + offset);
          // Ajuste para evitar pular mês (ex: 31 Jan + 1 mês -> 3 Março ou 28 Fev)
          // Se o dia mudou, significa que o mês destino tinha menos dias
          if (date.getDate() !== d) {
              date.setDate(0); // Volta para o último dia do mês anterior
          }
      } else if (freq === 'WEEKLY') {
          date.setDate(date.getDate() + (offset * 7));
      } else if (freq === 'YEARLY') {
          date.setFullYear(date.getFullYear() + offset);
      }

      const yy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);

    try {
      const transactionsToSave: Transaction[] = [];
      const isNew = !id;
      const loops = (isNew && isRecurrent) ? Math.max(1, recurrenceCount) : 1;

      for (let i = 0; i < loops; i++) {
          const currentData = { ...formData };
          
          if (i > 0) {
              currentData.date = calculateDate(formData.date, i, recurrenceFreq);
              currentData.status = 'PENDING'; // Recorrências futuras geralmente nascem pendentes
          }
          
          // Sufixo na descrição se for recorrente
          if (loops > 1) {
              currentData.description = `${formData.description} (${i+1}/${loops})`;
          }

          if (mode === 'TRANSFER') {
              // Garante que o linkedId seja mantido ou gerado agora
              // Se for edição, mantém o linkedId original. Se for recorrência, gera um novo par.
              const currentLinkedId = (i === 0 && linkedId) ? linkedId : crypto.randomUUID();
              
              const sourceBank = registries.banks.find(b => b.id === formData.bankId);
              const targetBank = registries.banks.find(b => b.id === targetBankId);

              let debitLegId = '';
              let creditLegId = '';

              // Se for o primeiro item e estamos editando, tenta manter os IDs originais
              if (i === 0 && initialData) {
                   if (initialData.linkedId) {
                      if (initialData.type === 'DEBIT') {
                          debitLegId = initialData.id;
                          creditLegId = partnerData?.id || '';
                      } else {
                          creditLegId = initialData.id;
                          debitLegId = partnerData?.id || '';
                      }
                  } else {
                      debitLegId = initialData.id;
                      creditLegId = ''; 
                  }
              }

              transactionsToSave.push({
                  ...currentData,
                  id: debitLegId, // Vazio se for novo ou recorrência > 0
                  description: `Transf. p/ ${targetBank?.name || 'Destino'} ${loops > 1 ? `(${i+1}/${loops})` : ''}`,
                  type: 'DEBIT',
                  linkedId: currentLinkedId,
                  bankId: formData.bankId
              });

              transactionsToSave.push({
                  ...currentData,
                  id: creditLegId, // Vazio se for novo ou recorrência > 0
                  description: `Transf. de ${sourceBank?.name || 'Origem'} ${loops > 1 ? `(${i+1}/${loops})` : ''}`,
                  type: 'CREDIT',
                  linkedId: currentLinkedId,
                  bankId: targetBankId
              });
          } else {
              transactionsToSave.push({ 
                  ...currentData, 
                  id: (i === 0) ? id : '', // Mantém ID se for edição do primeiro, senão limpa
                  linkedId: undefined 
              });
          }
      }

      await onSave(transactionsToSave);
      onClose();
    } catch (error) {
      console.error("Erro ao salvar lançamento:", error);
      alert("Erro ao salvar lançamento. Tente novamente.");
      setIsSaving(false);
    }
  };

  const inputClass = "w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 disabled:bg-gray-50 disabled:text-gray-400";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex flex-col border-b border-gray-100 bg-gray-50">
            <div className="flex justify-between items-center p-6 pb-2">
                <h2 className="text-xl font-bold text-slate-800">{id ? 'Editar Lançamento' : 'Novo Lançamento'}</h2>
                <button onClick={onClose} disabled={isSaving} className="text-gray-400 hover:text-gray-600 disabled:opacity-50"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex px-6 gap-6">
                <button type="button" disabled={isSaving} onClick={() => setMode('DEFAULT')} className={`pb-3 text-sm font-medium border-b-2 transition-colors ${mode === 'DEFAULT' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>Receita / Despesa</button>
                <button type="button" disabled={isSaving} onClick={() => { setMode('TRANSFER'); const cat = sortedCategories.find(c => c.name.toLowerCase().includes("transferência")); if(cat) setFormData(p => ({...p, categoryId: cat.id})); }} className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${mode === 'TRANSFER' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}><ArrowRightLeft className="w-4 h-4" />Transferência</button>
            </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto bg-white flex-1 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <input type="date" required disabled={isSaving} value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input type="text" disabled={isSaving} value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className={inputClass} placeholder="Ex: Pagamento Fornecedor" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
               <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                <input type="number" step="0.01" required disabled={isSaving} value={formData.value} onChange={(e) => setFormData({...formData, value: parseFloat(e.target.value) || 0})} className={inputClass} />
              </div>
              {mode === 'DEFAULT' ? (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                    <select disabled={isSaving} value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value as any})} className={inputClass}>
                        <option value="DEBIT">Débito</option>
                        <option value="CREDIT">Crédito</option>
                    </select>
                </div>
              ) : (
                <div className="flex items-end pb-2">
                   <span className="text-xs font-bold text-blue-600 uppercase bg-blue-50 px-3 py-2 rounded-lg border border-blue-100 flex items-center gap-2">
                     <ArrowRightLeft className="w-3 h-3" /> Modo Transferência
                   </span>
                </div>
              )}
               
               {/* Flags: Pago & Recorrência */}
               <div className="flex flex-col justify-end gap-2 pb-1">
                 <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" disabled={isSaving} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={formData.status === 'PAID'} onChange={(e) => setFormData({...formData, status: e.target.checked ? 'PAID' : 'PENDING'})} />
                    <span className="text-sm font-medium text-gray-700">Pago / Recebido</span>
                 </label>
                 
                 {!id && (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" disabled={isSaving} className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" checked={isRecurrent} onChange={(e) => setIsRecurrent(e.target.checked)} />
                        <span className="text-sm font-medium text-gray-700 flex items-center gap-1"><Repeat className="w-3 h-3 text-purple-500" /> Repetir?</span>
                    </label>
                 )}
              </div>

              <div className={mode === 'TRANSFER' ? 'invisible' : ''}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nº Doc</label>
                  <input type="text" disabled={isSaving} value={formData.docNumber} onChange={(e) => setFormData({...formData, docNumber: e.target.value})} className={inputClass} />
              </div>
            </div>
            
            {/* Linha Condicional de Recorrência */}
            {isRecurrent && !id && (
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 animate-fade-in grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-purple-700 uppercase mb-1">Frequência</label>
                        <select 
                            value={recurrenceFreq} 
                            onChange={(e) => setRecurrenceFreq(e.target.value as any)} 
                            className="w-full px-3 py-2 bg-white border border-purple-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500 outline-none"
                        >
                            <option value="MONTHLY">Mensal</option>
                            <option value="WEEKLY">Semanal</option>
                            <option value="YEARLY">Anual</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-purple-700 uppercase mb-1">Quantidade (Parcelas)</label>
                        <div className="flex items-center gap-2">
                             <input 
                                type="number" 
                                min="2" 
                                max="360" 
                                value={recurrenceCount} 
                                onChange={(e) => setRecurrenceCount(parseInt(e.target.value) || 2)} 
                                className="w-24 px-3 py-2 bg-white border border-purple-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                            <span className="text-xs text-purple-600 italic">vezes</span>
                        </div>
                    </div>
                </div>
            )}

            <div className={`grid grid-cols-1 gap-6 ${mode === 'TRANSFER' ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Carteira</label>
                    <select required disabled={isSaving} value={formData.walletId} onChange={(e) => setFormData({...formData, walletId: e.target.value})} className={inputClass}>
                        <option value="">Selecione...</option>
                        {sortedWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{mode === 'TRANSFER' ? 'Banco Origem' : 'Banco'}</label>
                    <select required disabled={isSaving} value={formData.bankId} onChange={(e) => setFormData({...formData, bankId: e.target.value})} className={inputClass}>
                        <option value="">Selecione...</option>
                        {sortedBanks.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                </div>
                {mode === 'TRANSFER' && (
                    <div>
                        <label className="block text-xs font-bold text-blue-600 uppercase mb-1">Banco Destino</label>
                        <select required disabled={isSaving} value={targetBankId} onChange={(e) => setTargetBankId(e.target.value)} className={`${inputClass} border-blue-200 bg-blue-50/30`}>
                            <option value="">Selecione...</option>
                            {sortedBanks.map(b => (
                                <option key={b.id} value={b.id} disabled={b.id === formData.bankId}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                )}
                <div className="relative" ref={dropdownRef}>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Participante</label>
                    <div className="relative">
                        <input 
                            type="text" 
                            disabled={isSaving} 
                            value={participantSearch} 
                            onChange={(e) => { 
                                setParticipantSearch(e.target.value); 
                                setIsParticipantDropdownOpen(true); 
                            }} 
                            onFocus={() => setIsParticipantDropdownOpen(true)} 
                            className={`${inputClass} pr-10`} 
                            placeholder="Buscar..." 
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                             {participantSearch ? <User className="w-4 h-4 text-blue-500" /> : <Search className="w-4 h-4" />}
                        </div>
                    </div>

                    {isParticipantDropdownOpen && !isSaving && (
                        <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-72 overflow-y-auto transform origin-top animate-fade-in custom-scrollbar">
                            {participantSearch.trim() && !registries.participants.some(p => p.name.toLowerCase() === participantSearch.toLowerCase()) && (
                                <button type="button" onClick={handleQuickAddParticipant} className="w-full text-left p-4 text-white bg-blue-600 hover:bg-blue-700 font-bold flex items-center gap-2 sticky top-0 z-10 transition-colors">
                                    <Plus className="w-5 h-5" /> 
                                    <span>Cadastrar Novo: "{participantSearch}"</span>
                                </button>
                            )}
                            
                            <div className="py-1">
                                {registries.participants
                                    .filter(p => p.name.toLowerCase().includes(participantSearch.toLowerCase()))
                                    .map((p, idx) => (
                                    <button 
                                        key={p.id} 
                                        type="button" 
                                        onClick={() => { 
                                            setFormData({...formData, participantId: p.id}); 
                                            setParticipantSearch(p.name); 
                                            setIsParticipantDropdownOpen(false); 
                                        }} 
                                        className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 transition-colors ${
                                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                                        } hover:bg-blue-50 hover:text-blue-700`}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                                            {p.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <span className="font-medium">{p.name}</span>
                                    </button>
                                ))}
                                {registries.participants.filter(p => p.name.toLowerCase().includes(participantSearch.toLowerCase())).length === 0 && !participantSearch.trim() && (
                                    <div className="p-4 text-center text-gray-400 text-sm italic">
                                        Digite para buscar...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Categoria</label>
                    <select required disabled={isSaving} value={formData.categoryId} onChange={(e) => setFormData({...formData, categoryId: e.target.value})} className={inputClass}>
                        <option value="">Selecione...</option>
                        {sortedCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Centro de Custo</label>
                    <select disabled={isSaving} value={formData.costCenterId} onChange={(e) => setFormData({...formData, costCenterId: e.target.value})} className={inputClass}>
                        <option value="">Selecione...</option>
                        {sortedCostCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                    </select>
                </div>
            </div>
        </form>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isSaving} className="px-6 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={isSaving} onClick={handleSubmit} className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200 disabled:bg-blue-400">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Salvando...' : `Salvar ${isRecurrent && !id ? 'Lançamentos' : 'Lançamento'}`}
          </button>
        </div>
      </div>
    </div>
  );
};
