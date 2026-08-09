import React, { useState, useEffect } from 'react';
import { financeService } from '../services/financeService';
import { ReportSchedule, ReportFrequency } from '../types';
import {
  CalendarClock,
  Mail,
  Save,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  Power,
  Plus
} from 'lucide-react';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const emptyForm: ReportSchedule = {
  report_type: 'contas_a_pagar',
  frequency: 'daily',
  day_of_week: 1,
  day_of_month: 1,
  recipients: '',
  active: true,
};

function describeSchedule(s: ReportSchedule): string {
  if (s.frequency === 'daily') return 'Todo dia';
  if (s.frequency === 'weekly') return `Toda ${WEEKDAYS[s.day_of_week ?? 1]}`;
  return `Todo dia ${s.day_of_month} do mês`;
}

export const ReportSchedules: React.FC = () => {
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ReportSchedule>(emptyForm);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.recipients.trim()) {
      setMessage({ type: 'error', text: 'Informe ao menos um e-mail de destino.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await financeService.saveReportSchedule(form);
      setForm(emptyForm);
      setMessage({ type: 'success', text: 'Agendamento salvo com sucesso!' });
      await loadSchedules();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao salvar agendamento' });
    } finally {
      setSaving(false);
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
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-blue-600" />
          Relatórios Agendados
        </h2>
        <p className="text-slate-500 font-medium">Receba o relatório de Contas a Pagar automaticamente por e-mail.</p>
      </div>

      <div className="bg-blue-50 rounded-2xl p-4 flex gap-4 border border-blue-100">
        <div className="bg-blue-600 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white shadow-sm shadow-blue-200">
          <Info className="w-4 h-4" />
        </div>
        <p className="text-sm text-blue-800 leading-relaxed font-medium">
          O envio usa a configuração de e-mail (SMTP) cadastrada em "Configuração E-mail". O horário de envio é fixo, próximo das 07h.
        </p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8">
          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Relatório</label>
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700">
                Contas a Pagar
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Frequência</label>
                <select
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value as ReportFrequency })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                >
                  <option value="daily">Diário</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                </select>
              </div>

              {form.frequency === 'weekly' && (
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Dia da Semana</label>
                  <select
                    value={form.day_of_week ?? 1}
                    onChange={(e) => setForm({ ...form, day_of_week: parseInt(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  >
                    {WEEKDAYS.map((label, index) => (
                      <option key={index} value={index}>{label}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.frequency === 'monthly' && (
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Dia do Mês</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.day_of_month ?? 1}
                    onChange={(e) => setForm({ ...form, day_of_month: parseInt(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Destinatários</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                <textarea
                  required
                  value={form.recipients}
                  onChange={(e) => setForm({ ...form, recipients: e.target.value })}
                  placeholder="financeiro@empresa.com, socio@empresa.com"
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1.5 px-1">Separe múltiplos e-mails por vírgula.</p>
            </div>

            {message && (
              <div className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in duration-300 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                <span className="text-sm font-bold">{message.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold py-3.5 px-8 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 group"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span>Adicionar Agendamento</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest pl-1">Agendamentos Ativos</h3>
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
