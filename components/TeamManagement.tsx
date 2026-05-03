
import React, { useState, useEffect } from 'react';
import { financeService } from '../services/financeService';
import { UserPermission } from '../types';
import { 
  Users, 
  UserPlus, 
  Mail, 
  Trash2, 
  Shield, 
  CheckCircle2, 
  Clock, 
  Loader2, 
  Plus,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  UserCheck
} from 'lucide-react';

export const TeamManagement: React.FC = () => {
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [myInvitations, setMyInvitations] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mine, sentToMe] = await Promise.all([
        financeService.getMyInvitations(),
        financeService.getInvitationsSentToMe()
      ]);
      setPermissions(mine);
      setMyInvitations(sentToMe);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setMessage(null);
    try {
      await financeService.inviteUser(email, role);
      setMessage({ type: 'success', text: 'Convite enviado com sucesso!' });
      setEmail('');
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao enviar convite' });
    } finally {
      setInviting(false);
    }
  };

  const handleAccept = async (id: string) => {
    try {
      await financeService.acceptInvitation(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este acesso?')) return;
    try {
      await financeService.deletePermission(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-slate-500 font-medium">Carregando gerenciamento da equipe...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Gerenciar Equipe
          </h2>
          <p className="text-slate-500 font-medium">Convide pessoas para visualizar ou editar seus dados financeiros.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* FORM SECTION */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              Novo Convite
            </h3>
            
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">E-mail do Convidado</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Nível de Acesso</label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('viewer')}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${role === 'viewer' ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-500/10' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${role === 'viewer' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Visualizador</div>
                      <div className="text-[10px] text-slate-500 leading-tight">Pode apenas ver os dados, sem alterar nada.</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('editor')}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${role === 'editor' ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-500/10' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${role === 'editor' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Editor</div>
                      <div className="text-[10px] text-slate-500 leading-tight">Pode criar e editar lançamentos e cadastros.</div>
                    </div>
                  </button>
                </div>
              </div>

              {message && (
                <div className={`p-3 rounded-xl text-xs font-medium animate-in fade-in zoom-in duration-300 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                  {message.text}
                </div>
              )}

              <button
                type="submit"
                disabled={inviting || !email}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 group mt-2"
              >
                {inviting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>Enviar Convite</span>
                    <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-100">
            <h4 className="font-black text-lg mb-2 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Segurança RLS
            </h4>
            <p className="text-blue-100 text-sm leading-relaxed">
              O Supabase garante que apenas as pessoas autorizadas vejam seus dados através de 
              <span className="font-bold text-white"> Row Level Security</span>. 
              Ao convidar alguém, você está autorizando o banco de dados a liberar seus registros para aquele e-mail específico.
            </p>
          </div>
        </div>

        {/* LIST SECTION */}
        <div className="lg:col-span-2 space-y-6">
          {/* INVITATIONS SENT TO ME */}
          {myInvitations.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6">
              <h3 className="text-lg font-bold text-amber-900 mb-4 flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Convites para Você
              </h3>
              <div className="space-y-3">
                {myInvitations.map(inv => (
                  <div key={inv.id} className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">Convite de Acesso</div>
                        <div className="text-xs text-slate-500">Status: <span className="font-bold uppercase">{inv.status === 'pending' ? 'Pendente' : 'Ativo'}</span></div>
                      </div>
                    </div>
                    {inv.status === 'pending' ? (
                      <button
                        onClick={() => handleAccept(inv.id)}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-amber-200 flex items-center gap-2"
                      >
                        Aceitar Acesso
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 text-green-600 font-bold text-xs bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
                        <UserCheck className="w-3 h-3" />
                        ACESSO ATIVO
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MY TEAM */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Pessoas com Acesso
              </h3>
            </div>
            
            {permissions.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                   <Users className="w-8 h-8" />
                </div>
                <p className="text-slate-400 font-medium">Nenhum convidado ainda.</p>
                <p className="text-slate-300 text-xs mt-1">Sua conta é privada e só você tem acesso.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {permissions.map(p => (
                  <div key={p.id} className="p-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${p.status === 'active' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                        {p.status === 'active' ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">{p.invited_email}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            p.role === 'admin' ? 'bg-purple-100 text-purple-700' : 
                            p.role === 'editor' ? 'bg-blue-100 text-blue-700' : 
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {p.role}
                          </span>
                          <span className="text-[10px] text-slate-400">•</span>
                          <span className={`text-[10px] font-bold ${p.status === 'active' ? 'text-green-600' : 'text-amber-500'}`}>
                            {p.status === 'active' ? 'Ativo' : 'Aguardando Aceite'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      title="Remover acesso"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
