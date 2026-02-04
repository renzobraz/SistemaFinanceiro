
import React, { useState, useEffect } from 'react';
import { Database, Save, CheckCircle2, AlertCircle, Copy, Terminal, Unplug, Info, AlertTriangle, Loader2, Play, Search, CheckCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { ConfirmModal } from './ConfirmModal';

interface SettingsViewProps {
  onSaveConfig: (url: string, key: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onSaveConfig }) => {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'TESTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [tableCheck, setTableCheck] = useState<{checked: boolean, exists: boolean, details: string}>({checked: false, exists: false, details: ''});

  useEffect(() => {
    const savedUrl = localStorage.getItem('supabase_url');
    const savedKey = localStorage.getItem('supabase_key');
    if (savedUrl && savedKey) {
        setUrl(savedUrl);
        setKey(savedKey);
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
              if (error.code === '42P01') {
                  setTableCheck({checked: true, exists: false, details: 'Tabelas não encontradas. Por favor, execute o SQL de criação.'});
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
      
      if (error && error.code === '42P01') {
          // Tabela não existe mas a conexão funcionou
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
    setUrl('');
    setKey('');
    setStatus('IDLE');
    setTableCheck({checked: false, exists: false, details: ''});
    onSaveConfig('', '');
  };

  const sqlFullSchema = `-- 1. Tabelas de Cadastro
create table if not exists banks (id uuid default gen_random_uuid() primary key, name text not null);
create table if not exists categories (id uuid default gen_random_uuid() primary key, name text not null);
create table if not exists cost_centers (id uuid default gen_random_uuid() primary key, name text not null);
create table if not exists participants (id uuid default gen_random_uuid() primary key, name text not null);
create table if not exists wallets (id uuid default gen_random_uuid() primary key, name text not null, bank_id uuid references banks(id));

-- 2. Tabela de Transações
create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  description text not null,
  doc_number text,
  value numeric(15,2) not null,
  type text not null check (type in ('CREDIT', 'DEBIT')),
  status text not null check (status in ('PAID', 'PENDING')),
  bank_id uuid references banks(id),
  category_id uuid references categories(id),
  cost_center_id uuid references cost_centers(id),
  participant_id uuid references participants(id),
  wallet_id uuid references wallets(id),
  linked_id uuid, -- Vínculo para transferências
  created_at timestamp with time zone default now()
);

-- Desabilitar RLS para desenvolvimento
alter table banks disable row level security;
alter table categories disable row level security;
alter table cost_centers disable row level security;
alter table participants disable row level security;
alter table wallets disable row level security;
alter table transactions disable row level security;`;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
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
                  <p className="text-sm text-slate-500 mb-6">Verifique se o seu projeto Supabase já possui as tabelas necessárias criadas.</p>
                  
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
                  <p className="text-sm text-blue-50/80 mb-6 leading-relaxed">Se as tabelas ainda não existem, copie o código SQL e cole no seu **SQL Editor** do Supabase.</p>
                  
                  <button 
                    onClick={() => { navigator.clipboard.writeText(sqlFullSchema); alert("SQL Copiado com sucesso!"); }}
                    className="w-full mt-auto py-3 bg-white text-blue-600 rounded-xl text-sm font-black hover:bg-blue-50 transition-all flex items-center justify-center gap-2 shadow-lg"
                  >
                    <Copy className="w-4 h-4" /> Copiar Código SQL
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
