
import React, { useState, useEffect } from 'react';
import { Database, Save, CheckCircle2, AlertCircle, Copy, Terminal, Unplug, Info, AlertTriangle, Loader2, Play, Search, CheckCircle, RefreshCcw, Settings } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { ConfirmModal } from './ConfirmModal';
import { DEFAULT_SUPABASE_CONFIG, financeService } from '../services/financeService';
import { Bank, Wallet, UserPreferences, DateRangeOption } from '../types';

interface SettingsViewProps {
  onSaveConfig: (url: string, key: string) => void;
  onSavePrefs: (prefs: UserPreferences) => void;
  registries: { banks: Bank[], wallets: Wallet[] };
  hideHeaders?: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onSaveConfig, onSavePrefs, registries, hideHeaders = false }) => {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'TESTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [tableCheck, setTableCheck] = useState<{checked: boolean, exists: boolean, details: string}>({checked: false, exists: false, details: ''});
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncData = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const stats = await financeService.syncAuxiliaryRegistries();
      alert(`Sincronização concluída!\n\nNovos Tipos: ${stats.types}\nNovos Setores: ${stats.sectors}\nNovos Tickers: ${stats.tickers}\n\nSeus cadastros antigos foram recuperados com sucesso.`);
    } catch (error: any) {
      alert("Erro ao sincronizar dados: " + error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const [prefs, setPrefs] = useState<UserPreferences>(() => financeService.getUserPreferences());
  const [prefsSaved, setPrefsSaved] = useState(false);

  const handleSavePrefs = () => {
    financeService.saveUserPreferences(prefs);
    onSavePrefs(prefs);
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 3000);
  };

  useEffect(() => {
    const savedUrl = localStorage.getItem('supabase_url');
    const savedKey = localStorage.getItem('supabase_key');
    if (savedUrl && savedKey) {
        setUrl(savedUrl);
        setKey(savedKey);
        setStatus('SUCCESS');
    } else if (DEFAULT_SUPABASE_CONFIG.url && DEFAULT_SUPABASE_CONFIG.key) {
        // Use default config if nothing is saved
        setUrl(DEFAULT_SUPABASE_CONFIG.url);
        setKey(DEFAULT_SUPABASE_CONFIG.key);
        setStatus('SUCCESS');
    }
  }, []);

  const verifyTables = async () => {
      if (!url || !key) return;
      setTableCheck({checked: true, exists: false, details: 'Verificando...'});
      try {
          const client = createClient(url, key);
          const { error } = await client.from('transactions').select('id').limit(1);
          if (error) {
              if (error.code === '42P01' || error.code === 'PGRST205') {
                  setTableCheck({checked: true, exists: false, details: 'Tabelas não encontradas (Erro ' + error.code + '). Por favor, execute o SQL de migração ou completo abaixo.'});
              } else if (error.code === '42501') {
                  setTableCheck({checked: true, exists: false, details: 'Permissão negada (Erro 42501). Execute o SQL abaixo para corrigir.'});
              } else {
                  throw error;
              }
          } else {
              setTableCheck({checked: true, exists: true, details: 'Tabelas encontradas e prontas para uso!'});
          }
      } catch (e: any) {
          setTableCheck({checked: true, exists: false, details: `Erro na verificação: ${e.message}`});
      }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('TESTING');
    setErrorMessage('');
    const cleanUrl = url.trim();
    const cleanKey = key.trim();
    try {
      if (!cleanUrl || !cleanKey) throw new Error("URL e Chave são obrigatórios.");
      const client = createClient(cleanUrl, cleanKey);
      
      const { error } = await client.from('banks').select('id').limit(1);
      
      // Ignora erro de permissão ou tabela inexistente durante conexão inicial, 
      // pois o usuário pode ainda não ter rodado o SQL.
      if (error && (error.code === '42P01' || error.code === '42501')) {
          localStorage.setItem('supabase_url', cleanUrl);
          localStorage.setItem('supabase_key', cleanKey);
          setStatus('SUCCESS');
          onSaveConfig(cleanUrl, cleanKey);
          return;
      }
      
      if (error && error.message.includes('Failed to fetch')) throw error;
      
      localStorage.setItem('supabase_url', cleanUrl);
      localStorage.setItem('supabase_key', cleanKey);
      setStatus('SUCCESS');
      onSaveConfig(cleanUrl, cleanKey);
    } catch (err: any) {
      setStatus('ERROR');
      setErrorMessage(err.message || "Falha ao conectar.");
    }
  };

  const confirmDisconnect = () => {
    localStorage.removeItem('supabase_url');
    localStorage.removeItem('supabase_key');
    // Don't clear fields if they match default, but reset status
    if (url === DEFAULT_SUPABASE_CONFIG.url) {
        setStatus('IDLE');
    } else {
        setUrl('');
        setKey('');
        setStatus('IDLE');
    }
    setTableCheck({checked: false, exists: false, details: ''});
    onSaveConfig('', '');
  };

  const sqlFullSchema = `-- 1. Configuração de Schema e Extensões
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- 2. Tabelas de Cadastro
create table if not exists public.banks (
  id uuid default gen_random_uuid() primary key, 
  name text not null,
  type text default 'CHECKING', -- 'CHECKING' ou 'INVESTMENT'
  currency text default 'BRL'
);
create table if not exists public.categories (id uuid default gen_random_uuid() primary key, name text not null);
create table if not exists public.cost_centers (id uuid default gen_random_uuid() primary key, name text not null);
create table if not exists public.participants (
  id uuid default gen_random_uuid() primary key, 
  name text not null,
  category text,
  sector text,
  ticker text,
  currency text default 'BRL',
  current_price numeric(15,2),
  target_price numeric(15,2),
  last_update timestamp with time zone
);
create table if not exists public.wallets (id uuid default gen_random_uuid() primary key, name text not null, bank_id uuid references public.banks(id));
create table if not exists public.asset_types (id uuid default gen_random_uuid() primary key, name text not null);
create table if not exists public.asset_sectors (id uuid default gen_random_uuid() primary key, name text not null);
create table if not exists public.asset_tickers (id uuid default gen_random_uuid() primary key, name text not null, ticker text not null);

-- 3. Tabela de Transações
create table if not exists public.transactions (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  description text not null,
  doc_number text,
  value numeric(15,2) not null,
  type text not null check (type in ('CREDIT', 'DEBIT')),
  status text not null check (status in ('PAID', 'PENDING')),
  bank_id uuid references public.banks(id),
  category_id uuid references public.categories(id),
  cost_center_id uuid references public.cost_centers(id),
  participant_id uuid references public.participants(id),
  wallet_id uuid references public.wallets(id),
  linked_id uuid, -- Vínculo para transferências
  created_at timestamp with time zone default now()
);

-- 4. Garantir Permissões Explícitas (Corrigir Erro 42501)
grant all on public.banks to anon, authenticated, service_role;
grant all on public.categories to anon, authenticated, service_role;
grant all on public.cost_centers to anon, authenticated, service_role;
grant all on public.participants to anon, authenticated, service_role;
grant all on public.wallets to anon, authenticated, service_role;
grant all on public.asset_types to anon, authenticated, service_role;
grant all on public.asset_sectors to anon, authenticated, service_role;
grant all on public.asset_tickers to anon, authenticated, service_role;
grant all on public.transactions to anon, authenticated, service_role;

-- 5. Habilitar RLS e criar políticas de acesso (Resolve avisos de segurança)
alter table public.banks enable row level security;
alter table public.categories enable row level security;
alter table public.cost_centers enable row level security;
alter table public.participants enable row level security;
alter table public.wallets enable row level security;
alter table public.asset_types enable row level security;
alter table public.asset_sectors enable row level security;
alter table public.asset_tickers enable row level security;
alter table public.transactions enable row level security;

-- Criar política permitindo acesso total (já que o app não exige login)
create policy "Allow all operations" on public.banks for all using (true) with check (true);
create policy "Allow all operations" on public.categories for all using (true) with check (true);
create policy "Allow all operations" on public.cost_centers for all using (true) with check (true);
create policy "Allow all operations" on public.participants for all using (true) with check (true);
create policy "Allow all operations" on public.wallets for all using (true) with check (true);
create policy "Allow all operations" on public.asset_types for all using (true) with check (true);
create policy "Allow all operations" on public.asset_sectors for all using (true) with check (true);
create policy "Allow all operations" on public.asset_tickers for all using (true) with check (true);
create policy "Allow all operations" on public.transactions for all using (true) with check (true);`;

  const sqlMigration = `-- EXECUTE ESTE SQL SE VOCÊ JÁ TEM AS TABELAS CRIADAS:
alter table public.banks add column if not exists type text default 'CHECKING';
alter table public.banks add column if not exists currency text default 'BRL';
alter table public.participants add column if not exists sector text;

create table if not exists public.asset_types (id uuid default gen_random_uuid() primary key, name text not null);
create table if not exists public.asset_sectors (id uuid default gen_random_uuid() primary key, name text not null);
create table if not exists public.asset_tickers (id uuid default gen_random_uuid() primary key, name text not null, ticker text not null);

grant all on public.asset_types to anon, authenticated, service_role;
grant all on public.asset_sectors to anon, authenticated, service_role;
grant all on public.asset_tickers to anon, authenticated, service_role;

alter table public.asset_types enable row level security;
alter table public.asset_sectors enable row level security;
alter table public.asset_tickers enable row level security;

create policy "Allow all operations" on public.asset_types for all using (true) with check (true);
create policy "Allow all operations" on public.asset_sectors for all using (true) with check (true);
create policy "Allow all operations" on public.asset_tickers for all using (true) with check (true);

-- Recarregar o cache do PostgREST (opcional, o Supabase faz automático em alguns segundos)
-- NOTA: Se o erro PGRST204 persistir, tente rodar os comandos acima novamente.`;

  return (
    <div className={`space-y-8 pb-10 ${hideHeaders ? '' : 'max-w-4xl mx-auto pt-4'}`}>
      
      {!hideHeaders && (
        <div className="flex items-center gap-4 mb-10">
          <div className="p-4 bg-slate-900 rounded-[20px] text-white shadow-xl shadow-slate-200">
            <Settings className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Configurações Gerais</h1>
            <p className="text-slate-500 font-medium">Personalize e gerencie sua infraestrutura financeira.</p>
          </div>
        </div>
      )}

      {/* Somente mostra os filtros se não estiver oculto ou se for a aba específica */}
      {!hideHeaders ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-lg text-white">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">Filtros Padrão de Inicialização</h2>
                  <p className="text-sm text-slate-500">Defina como o sistema deve carregar os lançamentos ao ser aberto.</p>
                </div>
            </div>
          </div>

          <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Período Padrão</label>
                <select 
                  value={prefs.defaultDateRange} 
                  onChange={(e) => setPrefs({...prefs, defaultDateRange: e.target.value as DateRangeOption})}
                  className="w-full px-5 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all bg-slate-50/50"
                >
                  <option value="CURRENT_MONTH">Mês Atual</option>
                  <option value="CURRENT_WEEK">Semana Corrente</option>
                  <option value="LAST_3_DAYS">Últimos 3 dias</option>
                  <option value="TODAY">Dia Atual</option>
                  <option value="LAST_30_DAYS">Últimos 30 dias</option>
                  <option value="PREVIOUS_MONTH">Mês Anterior</option>
                  <option value="ALL">Todas as Datas</option>
                </select>
            </div>
            <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Status Padrão</label>
                <select 
                  value={prefs.defaultStatus} 
                  onChange={(e) => setPrefs({...prefs, defaultStatus: e.target.value as any})}
                  className="w-full px-5 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all bg-slate-50/50"
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="PAID">Apenas Pagos/Recebidos</option>
                  <option value="PENDING">Apenas Pendentes</option>
                </select>
            </div>
            <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Banco Padrão</label>
                <select 
                  value={prefs.defaultBankId} 
                  onChange={(e) => setPrefs({...prefs, defaultBankId: e.target.value})}
                  className="w-full px-5 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all bg-slate-50/50"
                >
                  <option value="">Todos os Bancos</option>
                  {registries.banks.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
            </div>
            <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Carteira Padrão</label>
                <select 
                  value={prefs.defaultWalletId} 
                  onChange={(e) => setPrefs({...prefs, defaultWalletId: e.target.value})}
                  className="w-full px-5 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all bg-slate-50/50"
                >
                  <option value="">Todas as Carteiras</option>
                  {registries.wallets.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
            </div>
          </div>

          <div className="mt-10 pt-8 border-t border-slate-100">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                  <Play className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Relatório de Performance</h3>
                  <p className="text-sm text-slate-500">Defina o banco e carteira padrão para abrir o relatório de performance mais rápido.</p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Banco Padrão (Performance)</label>
                  <select 
                    value={prefs.defaultPerformanceBankId} 
                    onChange={(e) => setPrefs({...prefs, defaultPerformanceBankId: e.target.value})}
                    className="w-full px-5 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                  >
                    <option value="ALL">Todos os Bancos</option>
                    {registries.banks.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
              </div>
              <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Carteira Padrão (Performance)</label>
                  <select 
                    value={prefs.defaultPerformanceWalletId} 
                    onChange={(e) => setPrefs({...prefs, defaultPerformanceWalletId: e.target.value})}
                    className="w-full px-5 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                  >
                    <option value="ALL">Todas as Carteiras</option>
                    {registries.wallets.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
              </div>
            </div>
          </div>
          
          <div className="mt-8 flex items-center gap-4">
              <button onClick={handleSavePrefs} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2 transform active:scale-95">
                  <Save className="w-5 h-5" />
                  Salvar Preferências
              </button>
              {prefsSaved && (
                <span className="text-green-600 font-bold text-sm flex items-center gap-1 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4" /> Salvo com sucesso!
                </span>
              )}
          </div>
        </div>
      </div>
      ) : null}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
          <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg text-white">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">Conexão com Banco de Dados</h2>
                <p className="text-sm text-slate-500">Conecte sua conta do Supabase para salvar os dados na nuvem.</p>
              </div>
          </div>
        </div>

        <div className="p-8">
          <form onSubmit={handleConnect} className="space-y-8">
            <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Supabase URL</label>
                    <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://vosso-projeto.supabase.co" className="w-full px-5 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all bg-slate-50/50" />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Anon Key (API Key)</label>
                    <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="vossa-chave-api-secreta" className="w-full px-5 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all bg-slate-50/50" />
                </div>
            </div>
            
            {status === 'ERROR' && (
                <div className="text-red-600 text-sm font-medium bg-red-50 p-4 rounded-xl flex items-start gap-3 border border-red-100 animate-fade-in">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <div>
                        <p className="font-bold">Falha Crítica</p>
                        <p className="opacity-80">{errorMessage}</p>
                    </div>
                </div>
            )}
            
            <div className="flex items-center gap-4">
                <button type="submit" className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2 transform active:scale-95">
                    {status === 'TESTING' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {status === 'SUCCESS' ? 'Atualizar Conexão' : 'Conectar Agora'}
                </button>
                {status === 'SUCCESS' && (
                    <button type="button" onClick={() => setIsConfirmOpen(true)} className="text-slate-400 text-sm font-bold hover:text-red-600 flex items-center gap-2 transition-colors px-4 py-2 rounded-lg hover:bg-red-50">
                        <Unplug className="w-5 h-5" /> Desconectar
                    </button>
                )}
            </div>
          </form>
        </div>
      </div>

      {status === 'SUCCESS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                        <Search className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-slate-800">Verificador de Tabelas</h3>
                  </div>
                  <p className="text-sm text-slate-500 mb-6">Verifique se o seu projeto Supabase já possui as tabelas necessárias criadas e permissões corretas.</p>
                  
                  <div className="mt-auto space-y-4">
                      {tableCheck.checked && (
                          <div className={`p-4 rounded-xl border flex items-start gap-3 ${tableCheck.exists ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                              {tableCheck.exists ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
                              <p className="text-xs font-bold leading-tight">{tableCheck.details}</p>
                          </div>
                      )}
                      <button onClick={verifyTables} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
                        Executar Verificação
                      </button>
                  </div>
              </div>

              <div className="bg-blue-600 p-8 rounded-2xl shadow-xl shadow-blue-200 flex flex-col text-white">
                  <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <Terminal className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold">Configuração Inicial</h3>
                  </div>
                  <p className="text-sm text-blue-50/80 mb-6 leading-relaxed">Se as tabelas não existem ou você vê "Permission Denied", copie o código SQL abaixo e execute no <strong>SQL Editor</strong> do Supabase.</p>
                  
                  <div className="space-y-3 mt-auto">
                    <button 
                      onClick={() => { navigator.clipboard.writeText(sqlMigration); alert("SQL de Migração Copiado!"); }}
                      className="w-full py-3 bg-blue-500 text-white rounded-xl text-sm font-black hover:bg-blue-400 transition-all flex items-center justify-center gap-2 border border-blue-400 shadow-inner"
                    >
                      <Copy className="w-4 h-4" /> Copiar SQL de Migração
                    </button>

                    <button 
                      onClick={() => { navigator.clipboard.writeText(sqlFullSchema); alert("SQL Completo Copiado!"); }}
                      className="w-full py-3 bg-white text-blue-600 rounded-xl text-sm font-black hover:bg-blue-50 transition-all flex items-center justify-center gap-2 shadow-lg"
                    >
                      <Copy className="w-4 h-4" /> Copiar SQL Completo
                    </button>
                  </div>
              </div>

              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:col-span-2">
                  <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                        <RefreshCcw className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-slate-800">Recuperação de Dados Antigos</h3>
                  </div>
                  <p className="text-sm text-slate-500 mb-6">
                    Se você já tinha participantes cadastrados com Tickers, Tipos ou Setores, use este botão para extrair esses dados e preencher automaticamente as novas tabelas de cadastros auxiliares. Isso evitará que você tenha que cadastrá-los novamente.
                  </p>
                  
                  <button 
                    onClick={handleSyncData} 
                    disabled={isSyncing}
                    className="w-full md:w-auto px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 disabled:opacity-50"
                  >
                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                    Recuperar Cadastros dos Participantes
                  </button>
              </div>
          </div>
      )}

      {status === 'SUCCESS' && (
          <div className="bg-slate-900 rounded-2xl overflow-hidden animate-fade-in shadow-2xl border border-slate-800">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="ml-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">SQL Schema Explorer</span>
                </div>
            </div>
            <div className="relative">
                <pre className="p-8 text-[11px] font-mono leading-relaxed text-blue-300 overflow-auto max-h-[400px] bg-slate-900/50 backdrop-blur-xl">
                    {sqlFullSchema}
                </pre>
                <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={() => { navigator.clipboard.writeText(sqlFullSchema); }} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors border border-slate-700" title="Copiar tudo">
                        <Copy className="w-4 h-4" />
                    </button>
                </div>
            </div>
          </div>
      )}
      
      <ConfirmModal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} onConfirm={confirmDisconnect} title="Desconectar Supabase?" message="Você voltará ao modo offline e usará o banco de dados do seu navegador. Seus dados no Supabase continuarão seguros lá." isDestructive={true} />
    </div>
  );
};
