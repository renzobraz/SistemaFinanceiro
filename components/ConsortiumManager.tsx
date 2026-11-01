import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Save, X, Trash2, Search, Eye, EyeOff, Loader2 } from 'lucide-react';
import { financeService } from '../services/financeService';
import { Consortium, Wallet } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface ConsortiumManagerProps {
  consortiums: Consortium[];
  wallets: Wallet[];
  selectedWalletId: string;
  onRefresh: () => void;
}

const EMPTY_FORM = { name: '', administrator: '', groupNumber: '', quotaNumber: '', holderName: '', holderCnpj: '' };

export const ConsortiumManager: React.FC<ConsortiumManagerProps> = ({ consortiums, wallets, selectedWalletId, onRefresh }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Consortium | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const walletName = (id?: string) => wallets.find(w => w.id === id)?.name || '—';

  const filtered = useMemo(() => {
    return consortiums
      .filter(c => showArchived || c.active !== false)
      .filter(c => {
        if (!nameFilter.trim()) return true;
        const q = nameFilter.trim().toLowerCase();
        return (
          c.name?.toLowerCase().includes(q) ||
          c.administrator?.toLowerCase().includes(q) ||
          c.groupNumber?.toLowerCase().includes(q) ||
          c.quotaNumber?.toLowerCase().includes(q) ||
          c.holderName?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [consortiums, nameFilter, showArchived]);

  const startEdit = (c: Consortium) => {
    setEditingId(c.id);
    setIsAdding(false);
    setForm({
      name: c.name || '',
      administrator: c.administrator || '',
      groupNumber: c.groupNumber || '',
      quotaNumber: c.quotaNumber || '',
      holderName: c.holderName || '',
      holderCnpj: c.holderCnpj || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setForm(EMPTY_FORM);
    setError('');
  };

  const handleSave = async (id?: string) => {
    if (!form.name.trim()) { setError('O nome é obrigatório.'); return; }
    if (!id && (!selectedWalletId || selectedWalletId === 'ALL')) {
      setError('Selecione uma carteira específica antes de cadastrar um novo consórcio.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const existing = id ? consortiums.find(c => c.id === id) : undefined;
      await financeService.saveRegistryItem<Consortium>('consortiums', {
        id: id || '',
        name: form.name.trim(),
        walletId: existing?.walletId || selectedWalletId,
        administrator: form.administrator.trim() || undefined,
        groupNumber: form.groupNumber.trim() || undefined,
        quotaNumber: form.quotaNumber.trim() || undefined,
        holderName: form.holderName.trim() || undefined,
        holderCnpj: form.holderCnpj.trim() || undefined,
        active: existing?.active !== false,
      });
      cancelEdit();
      onRefresh();
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar o consórcio.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await financeService.deleteRegistryItem('consortiums', confirmDelete.id);
      setConfirmDelete(null);
      onRefresh();
    } catch (e: any) {
      setError(e.message || 'Não foi possível excluir — provavelmente há parcelas importadas vinculadas a este consórcio.');
      setConfirmDelete(null);
    }
  };

  const handleToggleActive = async (c: Consortium) => {
    setTogglingId(c.id);
    try {
      await financeService.toggleRegistryItemActive('consortiums', c.id, c.active === false);
      onRefresh();
    } finally {
      setTogglingId(null);
    }
  };

  const renderForm = (id?: string) => (
    <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nome (apelido) *</label>
          <input
            autoFocus
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ex: Apto Centro"
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Administradora</label>
          <input
            value={form.administrator}
            onChange={e => setForm(f => ({ ...f, administrator: e.target.value }))}
            placeholder="Ex: Sicredi Consórcios"
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Grupo</label>
          <input
            value={form.groupNumber}
            onChange={e => setForm(f => ({ ...f, groupNumber: e.target.value }))}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Cota</label>
          <input
            value={form.quotaNumber}
            onChange={e => setForm(f => ({ ...f, quotaNumber: e.target.value }))}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Titular</label>
          <input
            value={form.holderName}
            onChange={e => setForm(f => ({ ...f, holderName: e.target.value }))}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">CNPJ do titular</label>
          <input
            value={form.holderCnpj}
            onChange={e => setForm(f => ({ ...f, holderCnpj: e.target.value }))}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={cancelEdit} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1">
          <X className="w-3.5 h-3.5" /> Cancelar
        </button>
        <button
          onClick={() => handleSave(id)}
          disabled={saving}
          className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            placeholder="Buscar por nome, administradora, grupo, cota..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchived(s => !s)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
          >
            {showArchived ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showArchived ? 'Ocultar inativos' : 'Mostrar inativos'}
          </button>
          <button
            onClick={() => { setIsAdding(true); setEditingId(null); setForm(EMPTY_FORM); setError(''); }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Consórcio
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-2">
        {isAdding && renderForm()}

        {filtered.length === 0 && !isAdding && (
          <p className="text-sm text-slate-400 text-center py-12">Nenhum consórcio cadastrado ainda — eles também são criados automaticamente ao importar um extrato.</p>
        )}

        {filtered.map(c => (
          editingId === c.id ? (
            <div key={c.id}>{renderForm(c.id)}</div>
          ) : (
            <div key={c.id} className={`flex items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-xl ${c.active === false ? 'opacity-50' : ''}`}>
              <div className="min-w-0 flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                <div className="col-span-2 sm:col-span-1">
                  <p className="font-bold text-slate-800 truncate">{c.name}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold">{walletName(c.walletId)}</p>
                </div>
                <div className="text-slate-600 truncate"><span className="text-slate-400">Adm.:</span> {c.administrator || '—'}</div>
                <div className="text-slate-600"><span className="text-slate-400">Grupo:</span> {c.groupNumber || '—'}</div>
                <div className="text-slate-600"><span className="text-slate-400">Cota:</span> {c.quotaNumber || '—'}</div>
                <div className="text-slate-600 truncate"><span className="text-slate-400">Titular:</span> {c.holderName || '—'}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggleActive(c)}
                  disabled={togglingId === c.id}
                  className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                  title={c.active === false ? 'Reativar' : 'Arquivar'}
                >
                  {c.active === false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button onClick={() => startEdit(c)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => setConfirmDelete(c)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        ))}
      </div>

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Excluir Consórcio"
        message={`Deseja realmente excluir "${confirmDelete?.name}"? Isso só é possível se não houver parcelas importadas vinculadas a ele.`}
        isDestructive
        confirmText="Excluir"
      />
    </div>
  );
};
