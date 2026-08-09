import React, { useState, useEffect, useRef } from 'react';
import { financeService } from '../services/financeService';
import { ReportSchedule, ReportFrequency, ReportFilters, ReportColumnKey, Bank, Wallet, Category, CostCenter } from '../types';
import {
  CalendarClock,
  Mail,
  Send,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  Power,
  Filter,
  ListChecks,
  Pencil,
  X
} from 'lucide-react';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Mesma ordem usada nas telas do sistema (Data, Banco, Categoria, Participante, Centro de Custo, Descrição, Valor)
const COLUMN_OPTIONS: { key: ReportColumnKey; label: string }[] = [
  { key: 'date', label: 'Vencimento' },
  { key: 'bank', label: 'Banco' },
  { key: 'category', label: 'Categoria' },
  { key: 'participant', label: 'Participante' },
  { key: 'costCenter', label: 'Centro de Custo' },
  { key: 'description', label: 'Descrição' },
  { key: 'value', label: 'Valor' },
  { key: 'docNumber', label: 'Nº Documento' },
];

const DEFAULT_COLUMNS: ReportColumnKey[] = ['date', 'description', 'value'];

interface FormState {
  id?: string;
  recipients: string;
  subject: string;
  message: string;
  filters: ReportFilters;
  columns: ReportColumnKey[];
  saveAndSchedule: boolean;
  frequency: ReportFrequency;
  day_of_week: number;
  day_of_month: number;
  active: boolean;
}

const emptyForm: FormState = {
  recipients: '',
  subject: '',
  message: '',
  filters: {},
  columns: [...DEFAULT_COLUMNS],
  saveAndSchedule: false,
  frequency: 'daily',
  day_of_week: 1,
  day_of_month: 1,
  active: true,
};

function describeSchedule(s: ReportSchedule): string {
  if (s.frequency === 'daily') return 'Todo dia';
  if (s.frequency === 'weekly') return `Toda ${WEEKDAYS[s.day_of_week ?? 1]}`;
  return `Todo dia ${s.day_of_month} do mês`;
}

interface ReportSchedulesProps {
  registries: {
    banks: Bank[];
    wallets: Wallet[];
    categories: Category[];
    costCenters: CostCenter[];
  };
}

export const ReportSchedules: React.FC<ReportSchedulesProps> = ({ registries }) => {
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const isEditing = !!form.id;

  const loadSchedules = async () => {
    try {
      const data = await financeService.getReportSchedules();
      setSchedules(data);
    } catch (err) {
      console.error('Erro ao carregar agendamentos de relatório:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const toggleColumn = (key: ReportColumnKey) => {
    setForm(f => ({
      ...f,
      columns: f.columns.includes(key) ? f.columns.filter(c => c !== key) : [...f.columns, key],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.recipients.trim()) {
      setMessage({ type: 'error', text: 'Informe ao menos um e-mail de destino.' });
      return;
    }

    setSending(true);
    setMessage(null);
    try {
      if (isEditing) {
        await financeService.saveReportSchedule({
          id: form.id,
          report_type: 'contas_a_pagar',
          frequency: form.frequency,
          day_of_week: form.day_of_week,
          day_of_month: form.day_of_month,
          recipients: form.recipients,
          subject: form.subject,
          message: form.message,
          filters: form.filters,
          columns: form.columns,
          active: form.active,
        });
        setMessage({ type: 'success', text: 'Agendamento atualizado com sucesso!' });
      } else if (form.saveAndSchedule) {
        const scheduleId = await financeService.saveReportSchedule({
          report_type: 'contas_a_pagar',
          frequency: form.frequency,
          day_of_week: form.day_of_week,
          day_of_month: form.day_of_month,
          recipients: form.recipients,
          subject: form.subject,
          message: form.message,
          filters: form.filters,
          columns: form.columns,
          active: form.active,
        });
        await financeService.sendReportNow({ scheduleId });
        setMessage({ type: 'success', text: 'Agendamento salvo e relatório enviado com sucesso!' });
      } else {
        await financeService.sendReportNow({
          report_type: 'contas_a_pagar',
          recipients: form.recipients,
          subject: form.subject,
          message: form.message,
          filters: form.filters,
          columns: form.columns,
        });
        setMessage({ type: 'success', text: 'Relatório enviado com sucesso!' });
      }
      setForm(emptyForm);
      await loadSchedules();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao enviar relatório' });
    } finally {
      setSending(false);
    }
  };

  const handleEdit = (schedule: ReportSchedule) => {
    setForm({
      id: schedule.id,
      recipients: schedule.recipients || '',
      subject: schedule.subject || '',
      message: schedule.message || '',
      filters: schedule.filters || {},
      columns: (schedule.columns && schedule.columns.length > 0) ? schedule.columns : [...DEFAULT_COLUMNS],
      saveAndSchedule: true,
      frequency: schedule.frequency,
      day_of_week: schedule.day_of_week ?? 1,
      day_of_month: schedule.day_of_month ?? 1,
      active: schedule.active,
    });
    setMessage(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCancelEdit = () => {
    setForm(emptyForm);
    setMessage(null);
  };

  const handleSendExisting = async (schedule: ReportSchedule) => {
    if (!schedule.id) return;
    setSendingId(schedule.id);
    setMessage(null);
    try {
      await financeService.sendReportNow({ scheduleId: schedule.id });
      setMessage({ type: 'success', text: 'Relatório enviado com sucesso!' });
      await loadSchedules();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao enviar relatório' });
    } finally {
      setSendingId(null);
    }
  };

  const handleToggleActive = async (schedule: ReportSchedule) => {
    try {
      await financeService.saveReportSchedule({ ...schedule, active: !schedule.active });
      await loadSchedules();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao atualizar agendamento' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este agendamento de relatório?')) return;
    try {
      await financeService.deleteReportSchedule(id);
      await loadSchedules();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao remover agendamento' });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-slate-500 font-medium">Carregando agendamentos...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-blue-600" />
          Relatórios Agendados
        </h2>
        <p className="text-slate-500 font-medium">Envie o relatório de Contas a Pagar agora, ou agende para repetir automaticamente.</p>
      </div>

      <div className="bg-blue-50 rounded-2xl p-4 flex gap-4 border border-blue-100">
        <div className="bg-blue-600 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white shadow-sm shadow-blue-200">
          <Info className="w-4 h-4" />
        </div>
        <p className="text-sm text-blue-800 leading-relaxed font-medium">
          O envio usa a configuração de e-mail (SMTP) cadastrada em "Configuração E-mail". Agendamentos automáticos são verificados 1x por dia, próximo das 07h.
        </p>
      </div>

      <div ref={formRef} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8">
          {isEditing && (
            <div className="mb-6 flex items-center justify-between bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3">
              <span className="text-sm font-bold text-amber-800 flex items-center gap-2">
                <Pencil className="w-4 h-4" />
                Editando agendamento salvo
              </span>
              <button type="button" onClick={handleCancelEdit} className="flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-900">
                <X className="w-3.5 h-3.5" />
                Cancelar edição
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* DADOS DO ENVIO */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600" />
                  Dados do Envio
                </h3>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Destinatário(s)</label>
                  <textarea
                    required
                    value={form.recipients}
                    onChange={(e) => setForm({ ...form, recipients: e.target.value })}
                    placeholder="financeiro@empresa.com, socio@empresa.com"
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Separe múltiplos e-mails por vírgula.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Assunto</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="Contas a Pagar — Sua Empresa"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Mensagem</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Olá, segue o relatório solicitado."
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* FILTROS */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Filter className="w-4 h-4 text-blue-600" />
                  Filtros do Relatório
                </h3>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Status</label>
                  <select
                    value={form.filters.status || 'PENDING'}
                    onChange={(e) => setForm({ ...form, filters: { ...form.filters, status: e.target.value as any } })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="PENDING">Apenas Pendentes</option>
                    <option value="PAID">Apenas Pagas</option>
                    <option value="ALL">Todos os Status</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Banco</label>
                  <select
                    value={form.filters.bankId || ''}
                    onChange={(e) => setForm({ ...form, filters: { ...form.filters, bankId: e.target.value || undefined } })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="">Todos os Bancos</option>
                    {registries.banks
                      .filter(b => {
                        if (b.id === form.filters.bankId) return true; // sempre mostra o selecionado
                        if (!form.filters.walletId) return true;
                        return b.walletId === form.filters.walletId;
                      })
                      .map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Carteira</label>
                  <select
                    value={form.filters.walletId || ''}
                    onChange={(e) => setForm({ ...form, filters: { ...form.filters, walletId: e.target.value || undefined } })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="">Todas Carteiras</option>
                    {registries.wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Categoria</label>
                  <select
                    value={form.filters.categoryId || ''}
                    onChange={(e) => setForm({ ...form, filters: { ...form.filters, categoryId: e.target.value || undefined } })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="">Todas Categorias</option>
                    {registries.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Centro de Custo</label>
                  <select
                    value={form.filters.costCenterId || ''}
                    onChange={(e) => setForm({ ...form, filters: { ...form.filters, costCenterId: e.target.value || undefined } })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="">Todos os Centros de Custo</option>
                    {registries.costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* COLUNAS */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-blue-600" />
                    Colunas do Relatório
                  </h3>
                  <div className="flex gap-2 text-[11px] font-bold">
                    <button type="button" onClick={() => setForm(f => ({ ...f, columns: COLUMN_OPTIONS.map(c => c.key) }))} className="text-blue-600 hover:underline">Todas</button>
                    <button type="button" onClick={() => setForm(f => ({ ...f, columns: [] }))} className="text-slate-400 hover:underline">Nenhuma</button>
                  </div>
                </div>

                <div className="space-y-2 bg-slate-50 rounded-xl p-4 border border-slate-200">
                  {COLUMN_OPTIONS.map(col => (
                    <label key={col.key} className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.columns.includes(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        className="w-4 h-4 rounded accent-blue-600"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* SALVAR E AGENDAR */}
            <div className="pt-6 border-t border-slate-100 space-y-4">
              {!isEditing && (
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.saveAndSchedule}
                    onChange={(e) => setForm({ ...form, saveAndSchedule: e.target.checked })}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  Salvar e Agendar Relatório (repetir automaticamente)
                </label>
              )}

              {(isEditing || form.saveAndSchedule) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 rounded-2xl p-6 border border-slate-100 animate-in fade-in duration-300">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Frequência</label>
                    <select
                      value={form.frequency}
                      onChange={(e) => setForm({ ...form, frequency: e.target.value as ReportFrequency })}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    >
                      <option value="daily">Diário</option>
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensal</option>
                    </select>
                  </div>

                  {form.frequency === 'weekly' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">Dia da Semana</label>
                      <select
                        value={form.day_of_week}
                        onChange={(e) => setForm({ ...form, day_of_week: parseInt(e.target.value) })}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      >
                        {WEEKDAYS.map((label, index) => (
                          <option key={index} value={index}>{label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {form.frequency === 'monthly' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">Dia do Mês</label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={form.day_of_month}
                        onChange={(e) => setForm({ ...form, day_of_month: parseInt(e.target.value) })}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {message && (
              <div className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in duration-300 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                <span className="text-sm font-bold">{message.text}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={sending}
                className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold py-3.5 px-8 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 group"
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isEditing ? (
                  <>
                    <Pencil className="w-4 h-4" />
                    <span>Salvar Alterações</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    <span>Enviar Agora</span>
                  </>
                )}
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="py-3.5 px-6 rounded-xl font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest pl-1">Agendamentos Salvos</h3>
        {schedules.length === 0 ? (
          <p className="text-sm text-slate-400 px-1">Nenhum agendamento criado ainda.</p>
        ) : (
          <div className="space-y-3">
            {schedules.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-slate-800">Contas a Pagar — {describeSchedule(s)}</span>
                  <span className="text-xs text-slate-500">{s.recipients}</span>
                  {s.last_sent_at && (
                    <span className="text-xs text-slate-400">Último envio: {new Date(s.last_sent_at).toLocaleString('pt-BR')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleSendExisting(s)}
                    disabled={sendingId === s.id}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-all disabled:opacity-50"
                  >
                    {sendingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Enviar Agora
                  </button>
                  <button
                    onClick={() => handleEdit(s)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => handleToggleActive(s)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${s.active ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {s.active ? 'Ativo' : 'Pausado'}
                  </button>
                  <button
                    onClick={() => s.id && handleDelete(s.id)}
                    className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
