
import React, { useState, useEffect } from 'react';
import { Database, Save, CheckCircle2, AlertCircle, Copy, Terminal, Unplug, Info } from 'lucide-react';
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

  useEffect(() => {
    const savedUrl = localStorage.getItem('supabase_url');
    const savedKey = localStorage.getItem('supabase_key');
    if (savedUrl && savedKey) {
        setUrl(savedUrl);
        setKey(savedKey);
        setStatus('SUCCESS');
    }
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('TESTING');
    setErrorMessage('');

    const cleanUrl = url.trim();
    const cleanKey = key.trim();

    try {
      if (!cleanUrl || !cleanKey) throw new Error("URL e Chave são obrigatórios.");

      const client = createClient(cleanUrl, cleanKey);
      
      // Teste real de conexão buscando metadados (ou tentando um select simples)
      const { error } = await client.from('banks').select('id').limit(1);
      
      if (error && error.message !== 'JSON object requested, multiple (or no) rows returned') {
          // Nota: Erro de tabela não existente é aceitável aqui, o importante é a comunicação HTTP
          if (error.message.includes('Failed to fetch')) throw error;
      }
      
      localStorage.setItem('supabase_url', cleanUrl);
      localStorage.setItem('supabase_key', cleanKey);
      
      setUrl(cleanUrl);
      setKey(cleanKey);
      setStatus('SUCCESS');
      onSaveConfig(cleanUrl, cleanKey);
    } catch (err: any) {
      console.error("Connection error:", err);
      setStatus('ERROR');
      let msg = err.message || "Falha ao conectar. Verifique as credenciais.";
      if (msg === 'Failed to fetch') {
          msg = "Erro de Rede: Verifique sua conexão e se a URL do Supabase está correta (sem espaços extras). Certifique-se também que o projeto não está pausado.";
      }
      setErrorMessage(msg);
    }
  };

  const requestDisconnect = () => {
      setIsConfirmOpen(true);
  };

  const confirmDisconnect = () => {
    localStorage.removeItem('supabase_url');
    localStorage.removeItem('supabase_key');
    setUrl('');
    setKey('');
    setStatus('IDLE');
    onSaveConfig('', '');
  };

  const sqlSchema = `
-- Habilite a extensão de UUID
create extension if not exists "uuid-ossp";

-- 1. Tabela de Bancos
create table if not exists banks (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
alter table banks disable row level security;

-- 2. Tabela de Categorias
create table if not exists categories (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
alter table categories disable row level security;

-- 3. Tabela de Centros de Custo
create table if not exists cost_centers (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
alter table cost_centers disable row level security;

-- 4. Tabela de Participantes
create table if not exists participants (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
alter table participants disable row level security;

-- 5. Tabela de Carteiras
create table if not exists wallets (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  bank_id uuid references banks(id),
  created_at timestamp with time zone default timezone('utc'::text, now())
);
alter table wallets disable row level security;

-- 6. Tabela de Transações
create table if not exists transactions (
  id uuid default uuid_generate_v4() primary key,
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
  created_at timestamp with time zone default timezone('utc'::text, now())
);
alter table transactions disable row level security;
  `;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlSchema);
    alert("SQL copiado para a área de transferência!");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-10">
      
      {/* Configuration Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg">
            <Database className="w-5 h-5 text-slate-700" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Configuração do Banco de Dados</h2>
            <p className="text-sm text-slate-500">Conecte sua aplicação ao Supabase para persistência de dados.</p>
          </div>
        </div>

        <div className="p-6">
          <form onSubmit={handleConnect} className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex gap-3 text-sm text-blue-700 mb-4">
              <Info className="w-5 h-5 flex-shrink-0" />
              <p>Dica: Certifique-se de copiar a URL e a Chave exatamente como no Supabase. O sistema removerá espaços extras automaticamente ao salvar.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Supabase URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://sua-url-do-projeto.supabase.co"
                disabled={status === 'SUCCESS'}
                className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Supabase Anon Key</label>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="eyJh..."
                disabled={status === 'SUCCESS'}
                className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 font-mono disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            {status === 'ERROR' && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {status === 'SUCCESS' && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Conexão ativa com o Supabase. Seus dados estão sendo sincronizados.
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              {status === 'SUCCESS' ? (
                  <button
                    type="button"
                    onClick={requestDisconnect}
                    className="px-6 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors flex items-center gap-2 border border-red-200"
                  >
                    <Unplug className="w-4 h-4" />
                    Desconectar
                  </button>
              ) : (
                  <button
                    type="submit"
                    disabled={status === 'TESTING'}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    {status === 'TESTING' ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Testando Conexão...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Salvar e Conectar
                      </>
                    )}
                  </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* SQL Schema Helper */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-slate-100 rounded-lg">
                <Terminal className="w-5 h-5 text-slate-700" />
            </div>
            <div>
                <h3 className="text-lg font-bold text-slate-800">Esquema SQL</h3>
                <p className="text-sm text-slate-500">Execute este comando no Editor SQL do Supabase para configurar as tabelas.</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={copyToClipboard}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 px-3 py-1.5 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Copy className="w-4 h-4" />
            Copiar SQL
          </button>
        </div>
        <div className="bg-slate-900 p-6 overflow-x-auto">
          <pre className="text-sm font-mono text-green-400 whitespace-pre">
            {sqlSchema.trim()}
          </pre>
        </div>
      </div>

      <ConfirmModal 
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={confirmDisconnect}
        title="Desconectar do Supabase?"
        message="Se você desconectar, o sistema voltará a usar o armazenamento local do navegador e você não verá mais os dados salvos na nuvem."
        isDestructive={true}
        confirmText="Sim, desconectar"
      />

    </div>
  );
};
