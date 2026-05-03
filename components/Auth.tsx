
import React, { useState } from 'react';
import { financeService } from '../services/financeService';
import { Lock, Mail, Loader2, Wallet, ArrowRight, UserPlus } from 'lucide-react';

interface AuthProps {
  onLogin: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        await financeService.signUp(email, password);
        setError('Cadastro realizado! Um e-mail de confirmação foi enviado. Por favor, verifique sua caixa de entrada e clique no link para ativar sua conta.');
        setIsSignUp(false);
      } else {
        await financeService.login(email, password);
        onLogin();
      }
    } catch (err: any) {
      console.error(err);
      let message = err.message || 'Erro ao processar sua solicitação';
      
      if (message.includes('Email not confirmed')) {
        message = 'Seu e-mail ainda não foi confirmado. Por favor, verifique sua caixa de entrada e clique no link de ativação enviado pelo Supabase.';
      }
      
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo/Icon */}
        <div className="text-center mb-8">
          <div className="bg-blue-600 w-16 h-16 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center mx-auto mb-4">
            <Wallet className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">FinControl</h1>
          <p className="text-slate-500 mt-2 font-medium">Controle financeiro pessoal e investimentos</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
          <div className="p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              {isSignUp ? <UserPlus className="w-5 h-5 text-blue-600" /> : <Lock className="w-5 h-5 text-blue-600" />}
              {isSignUp ? 'Criar nova conta' : 'Acesse sua conta'}
            </h2>

            {error && (
              <div className={`p-4 rounded-xl text-sm mb-6 ${error.includes('Cadastro') ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1 px-1">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    placeholder="exemplo@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1 px-1">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 group"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>{isSignUp ? 'Cadastrar' : 'Entrar'}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="bg-slate-50 border-t border-slate-100 p-6 text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
            >
              {isSignUp ? 'Já tem uma conta? Faça login' : 'Não tem conta? Cadastre-se grátis'}
            </button>
          </div>
        </div>

        <p className="text-center text-slate-400 text-xs mt-8">
          Seus dados estão protegidos por criptografia e Row-Level Security (RLS) no Supabase.
        </p>
      </div>
    </div>
  );
};
