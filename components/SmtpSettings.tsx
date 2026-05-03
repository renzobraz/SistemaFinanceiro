import React, { useState, useEffect } from 'react';
import { financeService } from '../services/financeService';
import { SmtpSettings as SmtpSettingsType } from '../types';
import { 
  Mail, 
  Server, 
  Lock, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Save,
  Globe,
  Hash,
  AtSign,
  Info,
  TestTube
} from 'lucide-react';

export const SmtpSettings: React.FC = () => {
  const [settings, setSettings] = useState<Omit<SmtpSettingsType, 'id' | 'user_id'>>({
    host: '',
    port: 465,
    user: '',
    pass: '',
    from_name: 'FinControl',
    from_email: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    // Busca o e-mail do usuário logado para sugerir como destinatário de teste
    const handleGetUserEmail = async () => {
      const supabase = (financeService as any).getSupabase();
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          setTestEmail(session.user.email);
        }
      }
    };
    handleGetUserEmail();
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await financeService.getSmtpSettings();
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, user_id, ...rest } = data as any;
          setSettings(rest);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await financeService.saveSmtpSettings(settings);
      setMessage({ type: 'success', text: 'Configurações de e-mail salvas com sucesso!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao salvar configurações' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      setTestResult({ type: 'error', text: 'Informe um e-mail para receber o teste.' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, testEmail })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        let errorMsg = data.details || data.error || 'Erro no servidor durante o teste';
        
        // Detecta erro de autenticação do Gmail ou outros (Código 535)
        if (errorMsg.includes('535') || errorMsg.includes('Invalid login') || errorMsg.includes('Username and Password not accepted')) {
          errorMsg = 'Falha de Autenticação (Login Recusado). Se você usa Gmail, verifique se está usando uma "Senha de App" em vez da sua senha normal da conta.';
        }
        
        throw new Error(errorMsg);
      }

      setTestResult({ type: 'success', text: 'E-mail de teste enviado! Verifique sua caixa de entrada.' });
    } catch (err: any) {
      console.error("Erro no teste de SMTP:", err);
      setTestResult({ type: 'error', text: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-slate-500 font-medium">Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <AtSign className="w-6 h-6 text-blue-600" />
          Configurações de E-mail (SMTP)
        </h2>
        <p className="text-slate-500 font-medium">Configure seu próprio servidor de e-mail para enviar convites e notificações.</p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8">
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* SERVIDOR */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Servidor SMTP (Host)</label>
                <div className="relative">
                  <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={settings.host}
                    onChange={(e) => setSettings({ ...settings, host: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    placeholder="smtp.gmail.com"
                  />
                </div>
              </div>

              {/* PORTA */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Porta</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    required
                    value={settings.port}
                    onChange={(e) => setSettings({ ...settings, port: parseInt(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    placeholder="465"
                  />
                </div>
              </div>

              {/* USUÁRIO */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Usuário / E-mail</label>
                <div className="relative">
                  <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={settings.user}
                    onChange={(e) => setSettings({ ...settings, user: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    placeholder="seu-email@gmail.com"
                  />
                </div>
              </div>

              {/* SENHA */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Senha / Senha de App</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={settings.pass}
                    onChange={(e) => setSettings({ ...settings, pass: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {/* NOME REMETENTE */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Nome do Remetente</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={settings.from_name}
                    onChange={(e) => setSettings({ ...settings, from_name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    placeholder="FinControl"
                  />
                </div>
              </div>

              {/* E-MAIL REMETENTE */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">E-mail do Remetente</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={settings.from_email}
                    onChange={(e) => setSettings({ ...settings, from_email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    placeholder="no-reply@seu-dominio.com"
                  />
                </div>
              </div>
            </div>

            <div className="bg-blue-50 rounded-2xl p-4 flex gap-4 border border-blue-100 mt-4">
              <div className="bg-blue-600 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white shadow-sm shadow-blue-200">
                <Info className="w-4 h-4" />
              </div>
              <p className="text-sm text-blue-800 leading-relaxed font-medium">
                <span className="font-bold">Dica para Gmail:</span> Se você usa Gmail, não use sua senha do e-mail. Crie uma <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline font-black">Senha de App</a> nas configurações de segurança do seu Google Account.
              </p>
            </div>

            {/* SEÇÃO DE TESTE */}
            <div className="pt-6 border-t border-slate-100 mt-6 space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest pl-1">Testar Conexão</h3>
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="email"
                            placeholder="E-mail para receber o teste"
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handleTest}
                        disabled={testing || !settings.host || !settings.user || !settings.pass}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 text-white rounded-xl font-bold transition-all shadow-lg shadow-slate-100 flex-shrink-0"
                    >
                        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                        {testing ? 'Testando...' : 'Testar Agora'}
                    </button>
                </div>

                {testResult && (
                    <div className={`p-4 rounded-xl flex items-start gap-3 animate-in fade-in zoom-in duration-300 ${testResult.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                        {testResult.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold">{testResult.type === 'success' ? 'Sucesso!' : 'Ocorreu um erro'}</span>
                            <span className="text-xs font-medium leading-relaxed">{testResult.text}</span>
                        </div>
                    </div>
                )}
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
                  <span>Salvar Configurações</span>
                  <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest pl-1">Exemplo de Configuração Comum</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
             <h4 className="font-bold text-slate-800 mb-2">Google / Gmail</h4>
             <ul className="text-xs text-slate-500 space-y-1.5">
               <li><span className="font-bold text-slate-700">Host:</span> smtp.gmail.com</li>
               <li><span className="font-bold text-slate-700">Porta:</span> 465</li>
               <li><span className="font-bold text-slate-700">Usuário:</span> seu-email@gmail.com</li>
               <li><span className="font-bold text-slate-700">Senha:</span> Sua Senha de App</li>
             </ul>
          </div>
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
             <h4 className="font-bold text-slate-800 mb-2">Outlook / Hotmail</h4>
             <ul className="text-xs text-slate-500 space-y-1.5">
               <li><span className="font-bold text-slate-700">Host:</span> smtp.office365.com</li>
               <li><span className="font-bold text-slate-700">Porta:</span> 587</li>
               <li><span className="font-bold text-slate-700">Usuário:</span> seu-email@outlook.com</li>
               <li><span className="font-bold text-slate-700">Senha:</span> Sua senha comum</li>
             </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
