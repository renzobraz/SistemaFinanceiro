import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Save, X, Trash2, TrendingUp, TrendingDown, Calendar, Building2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { financeService } from '../services/financeService';
import { Wallet } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface ManagedPortfolio {
  id: string;
  organization_id: string;
  wallet_id?: string;
  name: string;
  manager?: string;
  color: string;
  active: boolean;
  started_at?: string;
  ended_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface ManagedPortfoliosProps {
  wallets: Wallet[];
  organizationId: string;
  userRole?: string;
}

const COLOR_OPTIONS = [
  { value: 'blue',   label: 'Azul',     bg: '#E6F1FB', text: '#0C447C', border: '#185FA5' },
  { value: 'green',  label: 'Verde',    bg: '#EAF3DE', text: '#27500A', border: '#3B6D11' },
  { value: 'amber',  label: 'Laranja',  bg: '#FAEEDA', text: '#633806', border: '#854F0B' },
  { value: 'purple', label: 'Roxo',     bg: '#EEEDFE', text: '#26215C', border: '#534AB7' },
  { value: 'teal',   label: 'Teal',     bg: '#E1F5EE', text: '#04342C', border: '#0F6E56' },
  { value: 'pink',   label: 'Rosa',     bg: '#FBEAF0', text: '#4B1528', border: '#993556' },
];

const getColor = (color: string) => COLOR_OPTIONS.find(c => c.value === color) || COLOR_OPTIONS[0];

const EMPTY_FORM = { name: '', manager: '', color: 'blue', wallet_id: '', started_at: '', notes: '' };

export const ManagedPortfolios: React.FC<ManagedPortfoliosProps> = ({ wallets, organizationId, userRole }) => {
  const [portfolios, setPortfolios] = useState<ManagedPortfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmClose, setConfirmClose] = useState<ManagedPortfolio | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ManagedPortfolio | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const canEdit = !userRole || userRole === 'owner' || userRole === 'admin';

  const load = useCallback(async () => {
    const supabase = financeService.getSupabase();
    if (!supabase || !organizationId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('managed_portfolios')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });
    if (!error && data) setPortfolios(data);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return; }
    const supabase = financeService.getSupabase();
    if (!supabase) return;
    setSaving(true); setError('');
    const payload: any = {
      organization_id: organizationId,
      name: form.name.trim(),
      manager: form.manager.trim() || null,
      color: form.color,
      wallet_id: form.wallet_id || null,
      started_at: form.started_at || null,
      notes: form.notes.trim() || null,
      active: true,
    };
    let err;
    if (editingId) {
      ({ error: err } = await supabase.from('managed_portfolios').update(payload).eq('id', editingId));
    } else {
      ({ error: err } = await supabase.from('managed_portfolios').insert(payload));
    }
    setSaving(false);
    if (err) { setError('Erro ao salvar: ' + err.message); return; }
    setShowForm(false); setEditingId(null); setForm(EMPTY_FORM);
    load();
  };

  const handleClose = async (portfolio: ManagedPortfolio) => {
    const supabase = financeService.getSupabase();
    if (!supabase) return;
    await supabase.from('managed_portfolios').update({
      active: false,
      ended_at: new Date().toISOString().split('T')[0]
    }).eq('id', portfolio.id);
    setConfirmClose(null);
    load();
  };

  const handleDelete = async (portfolio: ManagedPortfolio) => {
    const supabase = financeService.getSupabase();
    if (!supabase) return;
    await supabase.from('managed_portfolios').delete().eq('id', portfolio.id);
    setConfirmDelete(null);
    load();
  };

  const startEdit = (p: ManagedPortfolio) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      manager: p.manager || '',
      color: p.color || 'blue',
      wallet_id: p.wallet_id || '',
      started_at: p.started_at || '',
      notes: p.notes || '',
    });
    setShowForm(true);
    setError('');
  };

  const cancelForm = () => {
    setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setError('');
  };

  const fmt = (d?: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Carteiras Gerenciadas</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Carteiras automatizadas geridas por instituições financeiras</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); setError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Nova Carteira
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-blue-200 rounded-2xl p-5 shadow-sm">
          <h4 className="text-sm font-black text-slate-700 mb-4">{editingId ? 'Editar Carteira' : 'Nova Carteira Gerenciada'}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nome *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Top 5, Dividendos, Small Caps"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Gestor / Instituição</label>
              <input
                type="text"
                value={form.manager}
                onChange={e => setForm(f => ({ ...f, manager: e.target.value }))}
                placeholder="Ex: Itaú, BTG, XP"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Carteira</label>
              <select
                value={form.wallet_id}
                onChange={e => setForm(f => ({ ...f, wallet_id: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-white"
              >
                <option value="">Selecione uma carteira</option>
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Data de Início</label>
              <input
                type="date"
                value={form.started_at}
                onChange={e => setForm(f => ({ ...f, started_at: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Cor */}
          <div className="mb-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Cor de identificação</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setForm(f => ({ ...f, color: c.value }))}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all border-2 ${form.color === c.value ? 'border-slate-700 scale-105' : 'border-transparent'}`}
                  style={{ background: c.bg, color: c.text }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Observações</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Informações adicionais sobre a carteira..."
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button onClick={cancelForm} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-lg hover:bg-slate-50 transition-all">
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-all shadow-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {editingId ? 'Salvar' : 'Criar Carteira'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : portfolios.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400 font-medium">Nenhuma carteira gerenciada cadastrada</p>
          <p className="text-[11px] text-slate-300 mt-1">Crie sua primeira carteira automatizada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {portfolios.map(p => {
            const col = getColor(p.color);
            const isExpanded = expandedId === p.id;
            const wallet = wallets.find(w => w.id === p.wallet_id);
            return (
              <div key={p.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {/* Card header */}
                <div className="flex items-center gap-3 p-4">
                  {/* Badge colorido */}
                  <div className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black" style={{ background: col.bg, color: col.text }}>
                    {p.name}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.manager && (
                        <span className="text-[10px] text-slate-400 font-medium">{p.manager}</span>
                      )}
                      {wallet && (
                        <span className="text-[10px] text-slate-400">· {wallet.name}</span>
                      )}
                      <span className="text-[10px] text-slate-300">
                        {fmt(p.started_at)} {p.ended_at ? `→ ${fmt(p.ended_at)}` : '→ presente'}
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="shrink-0 flex items-center gap-1.5">
                    {p.active ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" /> Ativa
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                        <XCircle className="w-3 h-3" /> Encerrada
                      </span>
                    )}
                  </div>

                  {/* Ações */}
                  {canEdit && (
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        onClick={() => startEdit(p)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {p.active && (
                        <button
                          onClick={() => setConfirmClose(p)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                          title="Encerrar carteira"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDelete(p)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    className="p-1.5 text-slate-300 hover:text-slate-600 rounded-lg transition-all"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Expandido */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-50 pt-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 rounded-xl p-3">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Gestor</div>
                        <div className="text-sm font-bold text-slate-700">{p.manager || '—'}</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Carteira</div>
                        <div className="text-sm font-bold text-slate-700">{wallet?.name || '—'}</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Início</div>
                        <div className="text-sm font-bold text-slate-700">{fmt(p.started_at)}</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Encerramento</div>
                        <div className="text-sm font-bold text-slate-700">{fmt(p.ended_at)}</div>
                      </div>
                    </div>
                    {p.notes && (
                      <div className="mt-3 bg-slate-50 rounded-xl p-3">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Observações</div>
                        <div className="text-sm text-slate-600">{p.notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm close */}
      {confirmClose && (
        <ConfirmModal
          isOpen={!!confirmClose}
          title="Encerrar Carteira"
          message={`Tem certeza que deseja encerrar a carteira "${confirmClose.name}"? Os ativos continuarão na sua custódia normalmente. Esta ação pode ser desfeita editando a carteira.`}
          confirmText="Encerrar"
          isDestructive={false}
          onConfirm={() => handleClose(confirmClose)}
          onClose={() => setConfirmClose(null)}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <ConfirmModal
          isOpen={!!confirmDelete}
          title="Excluir Carteira"
          message={`Tem certeza que deseja excluir "${confirmDelete.name}"? As transações vinculadas perderão a referência à carteira, mas não serão excluídas.`}
          confirmText="Excluir"
          isDestructive={true}
          onConfirm={() => handleDelete(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};
