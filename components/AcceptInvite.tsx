import React, { useState, useEffect } from 'react';
import { financeService } from '../services/financeService';
import { Key, User, ShieldCheck, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface AcceptInviteProps {
  inviteToken: string;
  onSuccess: (user: any) => void;
  onCancel: () => void;
}

export const AcceptInvite: React.FC<AcceptInviteProps> = ({ inviteToken, onSuccess, onCancel }) => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // No carregamento inicial, força a sessão usando o token de convite recebido
  useEffect(() => {
    const initializeSession = async () => {
      try {
        const supabase = financeService.getSupabase();
        if (!supabase) throw new Error('Supabase não configurado.');

        // Faz logout de qualquer sessão existente para evitar conflitos
        await supabase.auth.signOut();

        // Se temos o token do convite, usa ele diretamente
        if (inviteToken) {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: inviteToken,
            refresh_token: inviteToken,
          });

          if (sessionError) {
            // Tenta getUser com o token diretamente
            const { data: userData, error: userError } = await supabase.auth.getUser(inviteToken);
            if (userError || !userData.user) {
              throw new Error('Token do convite expirado ou inválido. Peça ao administrador para reenviar o convite.');
            }
            setEmail(userData.user.email || null);
          } else {
            const currentUser = data?.user || (await supabase.auth.getUser()).data.user;
            if (currentUser) setEmail(currentUser.email || null);
            else throw new Error('Não foi possível carregar as informações do usuário.');
          }
          return;
        }

        // Sem token — verifica se há sessão ativa do convite
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setEmail(session.user.email || null);
          return;
        }

        throw new Error('Token do convite não encontrado. O link pode ter expirado.');

      } catch (err: any) {
        console.error('[AcceptInvite] Erro:', err);
        setError(err.message || 'Token do convite expirado ou inválido.');
      } finally {
        setInitLoading(false);
      }
    };

    initializeSession();
  }, [inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('A senha deve conter ao menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas digitadas não coincidem.');
      return;
    }

    setLoading(true);

    try {
      const supabase = financeService.getSupabase();
      if (!supabase) {
        throw new Error('Supabase não configurado.');
      }

      // 1. Atualizar senha do usuário convidado logado temporariamente
      const { data: updateData, error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      const activeUser = updateData?.user || (await supabase.auth.getUser()).data.user;
      if (!activeUser) {
        throw new Error('Falha ao reaver dados do usuário após atualização.');
      }

      // 2. Se o usuário preencheu o nome de exibição, vamos atualizar no mapeamento de permissões/perfis
      if (name.trim()) {
        try {
          await supabase.auth.updateUser({
            data: { display_name: name.trim() }
          });
        } catch (nameErr) {
          console.warn('Erro secundário ao salvar nome de exibição:', nameErr);
        }
      }

      // 3. Ativar permissões e vincular carteiras no financeService
      await financeService.acceptInvitationByEmail(activeUser.email!);

      // 4. Entra na aplicação enviando o usuário ativo para o login
      onSuccess(activeUser);
    } catch (err: any) {
      console.error('[AcceptInvite] Erro ao aceitar convite:', err);
      setError(err.message || 'Erro inesperado ao definir senha do convite.');
    } finally {
      setLoading(false);
    }
  };

  if (initLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-slate-100 shadow-sm text-center">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800">Validando Convite</h2>
          <p className="text-slate-400 mt-2 text-sm">Carregando informações seguras da sua credencial...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-slate-100 shadow-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <ShieldCheck className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Crie sua Senha</h2>
          <p className="text-slate-500 mt-2 text-sm font-medium">
            Você foi convidado! Defina sua credencial para acessar a conta do {email || 'FinControl'}.
          </p>
        </div>

        {error ? (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="text-xs text-red-700 font-medium">
              <span className="font-bold block mb-1">Problema ao aceitar:</span>
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1.5">
              Seu Nome Completo (Opcional)
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Ex: João Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:bg-white focus:border-blue-500 transition-all font-medium text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1.5">
              Crie uma Nova Senha (Mín. 6 caracteres)
            </label>
            <div className="relative">
              <Key className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••"
                value={password}
                required
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:bg-white focus:border-blue-500 transition-all font-medium text-slate-800 placeholder-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1.5">
              Confirme sua Nova Senha
            </label>
            <div className="relative">
              <Key className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••"
                value={confirmPassword}
                required
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:bg-white focus:border-blue-500 transition-all font-medium text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-2xl shadow-sm hover:shadow transition-all text-sm flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Definir Senha e Entrar'
            )}
          </button>
          
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="w-full bg-slate-50 hover:bg-slate-100 text-slate-500 font-bold py-3 px-4 rounded-2xl transition-all text-sm"
          >
            Voltar para o Login
          </button>
        </form>
      </div>
    </div>
  );
};
