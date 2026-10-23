import React, { useState, useEffect } from 'react';
import { financeService } from '../services/financeService';
import { RecurringRule, Bank, Category, CostCenter, Participant } from '../types';
import {
  Repeat,
  Loader2,
  Trash2,
  Power,
  Info,
} from 'lucide-react';

const FREQ_LABEL: Record<string, string> = {
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
};

interface RecurringRulesProps {
  registries: {
    banks: Bank[];
    categories: Category[];
    costCenters: CostCenter[];
    participants: Participant[];
  };
}

export const RecurringRules: React.FC<RecurringRulesProps> = ({ registries }) => {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    try {
      const data = await financeService.getRecurringRules();
      setRules(data);
    } catch (err) {
      console.error('Erro ao carregar recorrências:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const getName = (list: { id?: string; name: string }[], id?: string) =>
    list.find(i => i.id === id)?.name || '—';

  const formatMoney = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const handleToggleActive = async (rule: RecurringRule) => {
    if (!rule.id) return;
    setBusyId(rule.id);
    try {
      await financeService.toggleRecurringRuleActive(rule.id, !rule.active);
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao atualizar recorrência' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    if (!confirm('Excluir esta recorrência? Os lançamentos já gerados NÃO são apagados, só a regra deixa de gerar novos.')) return;
    setBusyId(id);
    try {
      await financeService.deleteRecurringRule(id);
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao excluir recorrência' });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-slate-500 font-medium">Carregando recorrências...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <Repeat className="w-6 h-6 text-purple-600" />
          Recorrências sem Data de Fim
        </h2>
        <p className="text-slate-500 font-medium">
          Lançamentos criados com "Repetir? → Sem data de fim" aparecem aqui. Todo dia o sistema gera a próxima
          ocorrência sozinho, até você pausar ou excluir a regra.
        </p>
      </div>

      <div className="bg-blue-50 rounded-2xl p-4 flex gap-4 border border-blue-100">
        <div className="bg-blue-600 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white shadow-sm shadow-blue-200">
          <Info className="w-4 h-4" />
        </div>
        <p className="text-sm text-blue-800 leading-relaxed font-medium">
          Para criar uma nova recorrência sem data de fim, use "Novo Lançamento" → marque "Repetir?" → "Sem data de fim".
          Esta tela serve só para ver, pausar ou excluir as que já existem.
        </p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          <span className="text-sm font-bold">{message.text}</span>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-sm text-slate-400 px-1">Nenhuma recorrência sem data de fim criada ainda.</p>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-bold text-slate-800">
                  {rule.description} — {formatMoney(rule.value)} ({rule.type === 'CREDIT' ? 'Crédito' : 'Débito'})
                </span>
                <span className="text-xs text-slate-500">
                  {getName(registries.banks, rule.bankId)} · {getName(registries.categories, rule.categoryId)}
                  {rule.costCenterId ? ` · ${getName(registries.costCenters, rule.costCenterId)}` : ''}
                  {rule.participantId ? ` · ${getName(registries.participants, rule.participantId)}` : ''}
                </span>
                <span className="text-xs text-purple-600 font-bold">
                  {FREQ_LABEL[rule.frequency] || rule.frequency} · Próxima ocorrência: {formatDate(rule.nextDate)}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleToggleActive(rule)}
                  disabled={busyId === rule.id}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${rule.active ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {rule.active ? 'Ativa' : 'Pausada'}
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  disabled={busyId === rule.id}
                  className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
