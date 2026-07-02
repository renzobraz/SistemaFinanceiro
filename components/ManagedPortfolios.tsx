import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Edit2, Save, X, Trash2, TrendingUp, TrendingDown, Calendar, Building2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { financeService } from '../services/financeService';
import { Wallet, Transaction, Category, Participant } from '../types';
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
  transactions?: Transaction[];
  categories?: Category[];
  participants?: Participant[];
  assetPrices?: Record<string, number>;
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

export const ManagedPortfolios: React.FC<ManagedPortfoliosProps> = ({ wallets, organizationId, userRole, transactions = [], categories = [], participants = [], assetPrices = {} }) => {
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

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

  const portfolioStats = useMemo(() => {
    const stats: Record<string, { totalAportado: number; totalRecebido: number; proventos: number; firstDate: string | null }> = {};
    transactions
      .filter(t => t.managedPortfolioId && t.status === 'PAID')
      .forEach(t => {
        const id = t.managedPortfolioId!;
        if (!stats[id]) stats[id] = { totalAportado: 0, totalRecebido: 0, proventos: 0, firstDate: null };
        const s = stats[id];
        const catName = categories.find(c => c.id === t.categoryId)?.name?.toLowerCase() || '';
        const desc = t.description?.toLowerCase() || '';
        const isProvento = catName.includes('provento') || catName.includes('divid') || catName.includes('jcp') ||
          desc.includes('divid') || desc.includes('jcp') || desc.includes('rendimento') || desc.includes('aluguel');
        if (t.type === 'DEBIT') {
          s.totalAportado += t.value;
        } else if (isProvento) {
          s.proventos += t.value;
        } else {
          s.totalRecebido += t.value;
        }
        if (!s.firstDate || t.date < s.firstDate) s.firstDate = t.date;
      });
    return stats;
  }, [transactions, categories]);

  const portfolioQtyMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    transactions
      .filter(t => t.managedPortfolioId && t.status === 'PAID' && t.participantId)
      .forEach(t => {
        const pid = t.managedPortfolioId!;
        if (!map[pid]) map[pid] = {};
        const catName = categories.find(c => c.id === t.categoryId)?.name?.toLowerCase() || '';
        const desc = t.description?.toLowerCase() || '';
        const isProvento = catName.includes('provento') || catName.includes('divid') || catName.includes('jcp') ||
          desc.includes('divid') || desc.includes('jcp') || desc.includes('rendimento') || desc.includes('aluguel');
        if (isProvento) return;
        const qty = t.quantity || 0;
        if (t.type === 'DEBIT') {
          map[pid][t.participantId] = (map[pid][t.participantId] || 0) + qty;
        } else {
          map[pid][t.participantId] = (map[pid][t.participantId] || 0) - qty;
        }
      });
    return map;
  }, [transactions, categories]);

  const portfolioComposition = useMemo(() => {
    const composition: Record<string, string[]> = {};
    Object.entries(portfolioQtyMap).forEach(([pid, assetQtys]) => {
      const tickers = Object.entries(assetQtys)
        .filter(([, qty]) => qty > 0.001)
        .map(([participantId]) => {
          const p = participants.find(p => p.id === participantId);
          return p?.ticker || p?.name?.split(' ')[0] || '';
        })
        .filter(Boolean)
        .sort();
      composition[pid] = tickers;
    });
    return composition;
  }, [portfolioQtyMap, participants]);

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

                {/* Métricas calculadas das transações */}
                {(() => {
                  const s = portfolioStats[p.id];
                  if (!s || s.totalAportado === 0) return null;
                  const saldoCusto = s.totalAportado - s.totalRecebido - s.proventos;
                  const retornoTotal = s.totalRecebido + s.proventos - s.totalAportado;
                  const retornoPct = s.totalAportado > 0 ? (retornoTotal / s.totalAportado) * 100 : 0;
                  const isPositive = retornoTotal >= 0;
                  const activeAssets = Object.entries(portfolioQtyMap[p.id] || {}).filter(([, qty]) => qty > 0.001);
                  const marketValue = activeAssets.reduce((sum, [participantId, qty]) => {
                    const price = assetPrices[participantId];
                    return price ? sum + qty * price : sum;
                  }, 0);
                  const pricesAvailable = Object.keys(assetPrices).length > 0;
                  const assetsWithPrice = activeAssets.filter(([participantId]) => !!assetPrices[participantId]).length;
                  return (
                    <div className="px-4 pb-3 flex flex-wrap gap-2 border-t border-slate-50 pt-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total aportado</span>
                        <span className="text-[11px] font-black text-slate-700">{fmtBRL(s.totalAportado)}</span>
                      </div>
                      {s.totalRecebido > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Resgates</span>
                          <span className="text-[11px] font-black text-slate-700">{fmtBRL(s.totalRecebido)}</span>
                        </div>
                      )}
                      {s.proventos > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-lg">
                          <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Proventos</span>
                          <span className="text-[11px] font-black text-emerald-700">{fmtBRL(s.proventos)}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 rounded-lg">
                        <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Saldo custo</span>
                        <span className="text-[11px] font-black text-blue-700">{fmtBRL(saldoCusto)}</span>
                      </div>
                      {(s.totalRecebido > 0 || s.proventos > 0) && (
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${isPositive ? 'bg-emerald-50' : 'bg-red-50'}`}>
                          <span className={`text-[9px] font-black uppercase tracking-widest ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>Retorno realizado</span>
                          <span className={`text-[11px] font-black ${isPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                            {isPositive ? '+' : ''}{fmtBRL(retornoTotal)} ({isPositive ? '+' : ''}{retornoPct.toFixed(1)}%)
                          </span>
                        </div>
                      )}
                      {pricesAvailable && activeAssets.length > 0 && (
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${marketValue >= saldoCusto ? 'bg-emerald-50' : 'bg-red-50'}`}>
                          <span className={`text-[9px] font-black uppercase tracking-widest ${marketValue >= saldoCusto ? 'text-emerald-600' : 'text-red-500'}`}>
                            Saldo mercado{assetsWithPrice < activeAssets.length ? ` (${assetsWithPrice}/${activeAssets.length})` : ''}
                          </span>
                          <span className={`text-[11px] font-black ${marketValue >= saldoCusto ? 'text-emerald-700' : 'text-red-600'}`}>
                            {fmtBRL(marketValue)}
                          </span>
                          {saldoCusto > 0 && (
                            <span className={`text-[10px] font-bold ${marketValue >= saldoCusto ? 'text-emerald-600' : 'text-red-500'}`}>
                              ({marketValue >= saldoCusto ? '+' : ''}{(((marketValue - saldoCusto) / saldoCusto) * 100).toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Composição atual */}
                {(() => {
                  const tickers = portfolioComposition[p.id];
                  if (!tickers || tickers.length === 0) return null;
                  return (
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5 items-center border-t border-slate-50 pt-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Composição atual:</span>
                      {tickers.map(ticker => (
                        <span key={ticker} className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded-full text-[10px] font-bold text-slate-600 transition-colors">
                          {ticker}
                        </span>
                      ))}
                    </div>
                  );
                })()}

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
