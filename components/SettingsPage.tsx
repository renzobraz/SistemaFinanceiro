import React, { useState, useEffect } from 'react';
import { 
  Users, 
  AtSign, 
  Settings, 
  Database, 
  Terminal, 
  Filter,
  ChevronRight,
  ShieldCheck,
  BookOpen,
  Save,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { TeamManagement } from './TeamManagement';
import { SmtpSettings } from './SmtpSettings';
import { HelpManual } from './HelpManual';
import { SettingsView } from './SettingsView';
import { financeService } from '../services/financeService';
import { Bank, Wallet, UserPreferences } from '../types';

interface SettingsPageProps {
  activeSubTab?: string;
  registries: {
    banks: Bank[];
    wallets: Wallet[];
  };
  onSaveConfig?: () => void;
  onUpdatePrefs: (prefs: UserPreferences) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ activeSubTab, registries, onSaveConfig, onUpdatePrefs }) => {
  const [activeTab, setActiveTab] = useState<'team' | 'email' | 'filters' | 'database' | 'sql' | 'manual'>('filters');
  const [prefs, setPrefs] = useState<UserPreferences>({
    defaultDateRange: 'CURRENT_MONTH',
    defaultStatus: 'ALL',
    defaultBankId: '',
    defaultWalletId: '',
    defaultPerformanceBankId: 'ALL',
    defaultPerformanceWalletId: 'ALL'
  });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Sincroniza a aba ativa quando alterada pela Sidebar
  useEffect(() => {
    if (activeSubTab && activeSubTab.startsWith('settings-')) {
      const sub = activeSubTab.replace('settings-', '') as any;
      setActiveTab(sub);
    }
  }, [activeSubTab]);

  // Carrega configurações iniciais
  useEffect(() => {
    const loadSettings = async () => {
      const savedPrefs = await financeService.getUserSettings();
      setPrefs(savedPrefs);
    };
    loadSettings();
  }, []);

  const handleSavePreferences = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      await financeService.saveUserSettings(prefs);
      onUpdatePrefs(prefs);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error("Erro ao salvar configurações", error);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Área de Conteúdo Única */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm min-h-[600px] overflow-hidden flex flex-col">
        <div className="p-8 flex-1">
          {activeTab === 'filters' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                    <Filter className="w-5 h-5 text-blue-600" />
                    Filtro de Inicialização
                  </h3>
                  <p className="text-slate-500 text-sm">Personalize como o sistema deve carregar os dados ao abrir.</p>
                </div>

                <button
                  onClick={handleSavePreferences}
                  disabled={saving}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg ${
                    saveStatus === 'success' 
                    ? 'bg-green-500 text-white shadow-green-100' 
                    : saveStatus === 'error'
                    ? 'bg-red-500 text-white shadow-red-100'
                    : 'bg-blue-600 text-white shadow-blue-100 hover:bg-blue-700'
                  } disabled:opacity-50`}
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : saveStatus === 'success' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : saveStatus === 'error' ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {saveStatus === 'success' ? 'Salvo!' : saveStatus === 'error' ? 'Erro' : 'Salvar Preferências'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-50/50 p-8 rounded-[32px] border border-slate-100">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Página Inicial Padrão</label>
                  <select 
                    value={prefs.defaultTab}
                    onChange={(e) => setPrefs({...prefs, defaultTab: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  >
                    <option value="dashboard">Dashboard</option>
                    <option value="transactions">Fluxo de Caixa</option>
                    <option value="payables">Contas a Pagar/Receber</option>
                    <option value="bank-transactions">Movimentação Bancária</option>
                    <option value="investments">Investimentos</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Período Padrão</label>
                  <select 
                    value={prefs.defaultDateRange}
                    onChange={(e) => setPrefs({...prefs, defaultDateRange: e.target.value as any})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  >
                    <option value="CURRENT_MONTH">Mês Atual</option>
                    <option value="PREVIOUS_MONTH">Mês Anterior</option>
                    <option value="CURRENT_WEEK">Semana Atual</option>
                    <option value="LAST_30_DAYS">Últimos 30 Dias</option>
                    <option value="LAST_3_DAYS">Últimos 3 Dias</option>
                    <option value="TODAY">Hoje</option>
                    <option value="ALL">Todo o Histórico</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Status Padrão</label>
                  <select 
                    value={prefs.defaultStatus}
                    onChange={(e) => setPrefs({...prefs, defaultStatus: e.target.value as any})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  >
                    <option value="ALL">Todos os Status</option>
                    <option value="PAID">Apenas Pagas</option>
                    <option value="PENDING">Apenas Pendentes</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Banco Padrão</label>
                  <select 
                    value={prefs.defaultBankId}
                    onChange={(e) => setPrefs({...prefs, defaultBankId: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  >
                    <option value="">Todos os Bancos</option>
                    {registries.banks.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Carteira Padrão</label>
                  <select 
                    value={prefs.defaultWalletId}
                    onChange={(e) => setPrefs({...prefs, defaultWalletId: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  >
                    <option value="">Todas Carteiras</option>
                    {registries.wallets.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-start gap-4">
                 <div className="bg-white p-2 rounded-lg shadow-sm">
                    <ShieldCheck className="w-5 h-5 text-blue-600" />
                 </div>
                 <div>
                    <h4 className="text-sm font-bold text-blue-900">Configurações Sincronizadas</h4>
                    <p className="text-xs text-blue-700/70 leading-relaxed mt-1">
                      Suas preferências de filtro são salvas na nuvem e serão aplicadas automaticamente em qualquer dispositivo que você usar.
                    </p>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'team' && <TeamManagement />}
          
          {activeTab === 'email' && <SmtpSettings />}

          {activeTab === 'database' && (
            <div className="animate-in fade-in duration-500">
               <SettingsView 
                 onSaveConfig={onSaveConfig} 
                 onSavePrefs={onUpdatePrefs}
                 registries={registries}
                 hideHeaders={true}
               />
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="flex flex-col gap-1 mb-8">
                <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-blue-600" />
                  Configuração SQL
                </h3>
                <p className="text-slate-500 text-sm">Scripts de manutenção e esquema das tabelas.</p>
              </div>

              <div className="bg-slate-900 rounded-2xl p-6 overflow-x-auto">
                 <pre className="text-blue-400 text-xs font-mono leading-relaxed">
{`-- Exemplo de Esquema de Tabelas
CREATE TABLE public.transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  date date NOT NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  ...
);

-- Ativação de RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;`}
                 </pre>
              </div>
              <p className="text-slate-400 text-xs italic">* Para executar comandos SQL diretamente, acesse o painel SQL Editor no Console do Supabase.</p>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="animate-in fade-in duration-500">
              <HelpManual />
            </div>
          )}
        </div>
        
        <div className="bg-slate-50 px-8 py-4 border-t border-slate-100 flex items-center justify-between">
           <div className="flex items-center gap-2 text-slate-400">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Configurações Seguras via RLS</span>
           </div>
           <div className="text-[10px] text-slate-300 font-medium">ID da Instância: uiekbavvgvrcsmbvoqtt</div>
        </div>
      </div>
    </div>
  );
};
