
import React, { useState } from 'react';
import { financeService } from '../services/financeService';
import { Lock, Mail, Loader2, Wallet, ArrowRight, UserPlus, Key } from 'lucide-react';

interface AuthProps {
  onLogin: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isForgotPassword) {
        if (!email) {
          throw new Error('Por favor, informe seu e-mail.');
        }
        await financeService.resetPassword(email);
        setSuccess('E-mail enviado! Um link de redefinição de senha foi enviado para sua caixa de entrada.');
        setIsForgotPassword(false);
      } else if (isSignUp) {
        await financeService.signUp(email, password);
        setSuccess('Cadastro realizado! Um e-mail de confirmação foi enviado. Por favor, verifique sua caixa de entrada e clique no link para ativar sua conta.');
        setIsSignUp(false);
      } else {
        await financeService.login(email, password);
        onLogin();
      }
    } catch (err: any) {
      console.error(err);
      let message = err.message || 'Erro ao processar sua solicitação';

      if (message.includes('Email not confirmed')) {
        message = 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada e clique no link de confirmação.';
      } else if (message.includes('Password should') || message.includes('Password is too weak') || message.includes('at least') || message.includes('password')) {
        message = 'Senha muito fraca. Use ao menos 8 caracteres, combinando letras maiúsculas, minúsculas, números e símbolos.';
      } else if (message.includes('Invalid login credentials') || message.includes('invalid_credentials')) {
        message = 'E-mail ou senha incorretos. Verifique seus dados e tente novamente.';
      } else if (message.includes('Email already registered') || message.includes('already been registered') || message.includes('already registered')) {
        message = 'Este e-mail já está cadastrado. Tente fazer login ou recuperar sua senha.';
      } else if (message.includes('User not found')) {
        message = 'Usuário não encontrado. Verifique o e-mail informado.';
      } else if (message.includes('Token has expired') || message.includes('token has expired')) {
        message = 'O link expirou. Solicite um novo link de recuperação de senha.';
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrength = () => {
    if (!password) return null;
    if (password.length < 6) {
      return { text: 'Fraca', color: 'bg-red-500', textColor: 'text-red-500', width: 'w-1/3' };
    }
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    if (password.length >= 8 && hasNumber && hasSymbol) {
      return { text: 'Forte', color: 'bg-green-500', textColor: 'text-green-500', width: 'w-full' };
    }
    return { text: 'Média', color: 'bg-amber-500', textColor: 'text-amber-500', width: 'w-2/3' };
  };

  const strength = getPasswordStrength();

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
              {isForgotPassword ? (
                <Key className="w-5 h-5 text-blue-600" />
              ) : isSignUp ? (
                <UserPlus className="w-5 h-5 text-blue-600" />
              ) : (
                <Lock className="w-5 h-5 text-blue-600" />
              )}
              {isForgotPassword ? 'Recuperar senha' : isSignUp ? 'Criar nova conta' : 'Acesse sua conta'}
            </h2>

            {success && (
              <div className="p-4 rounded-xl text-sm mb-6 bg-green-50 text-green-700 border border-green-100 font-medium animate-fade-in">
                {success}
              </div>
            )}

            {error && (
              <div className="p-4 rounded-xl text-sm mb-6 bg-red-50 text-red-700 border border-red-100 font-medium animate-fade-in">
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

              {!isForgotPassword && (
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
                  {isSignUp && strength && (
                    <div className="mt-2 space-y-1 animate-fade-in">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-300 ${strength.color} ${strength.width}`} />
                      </div>
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] text-slate-400 font-medium">Força da senha</span>
                        <span className={`text-[10px] font-bold ${strength.textColor}`}>
                          {strength.text}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 group mt-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>{isForgotPassword ? 'Enviar link de recuperação' : isSignUp ? 'Cadastrar' : 'Entrar'}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              {isForgotPassword && (
                <div className="text-center pt-2 animate-fade-in">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(false);
                      setError(null);
                      setSuccess(null);
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Voltar para o login
                  </button>
                </div>
              )}

              {!isForgotPassword && !isSignUp && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setError(null);
                      setSuccess(null);
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              )}
            </form>
          </div>

          {!isForgotPassword && (
            <div className="bg-slate-50 border-t border-slate-100 p-6 text-center">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setSuccess(null);
                }}
                className="text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
              >
                {isSignUp ? 'Já tem uma conta? Faça login' : 'Não tem conta? Cadastre-se grátis'}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-slate-400 text-xs mt-8">
          Seus dados estão protegidos por criptografia e Row-Level Security (RLS) no Supabase.
        </p>
      </div>
    </div>
  );
};
