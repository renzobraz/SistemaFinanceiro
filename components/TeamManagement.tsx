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
  UserCheck,
  Key,
  Pencil,
  X
} from 'lucide-react';

// Definição dos módulos existentes no sistema conforme planejado
const MODULES = [
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'reports', name: 'Relatórios' },
  { id: 'cashflow', name: 'Fluxo de Caixa' },
  { id: 'expenses', name: 'Análise de Gastos' },
  { id: 'investments', name: 'Investimentos' },
  { id: 'distribution', name: 'Distribuição de Lucros' },
  { id: 'payables', name: 'Contas a Pagar' },
  { id: 'transactions', name: 'Movimentação Bancária' },
  { id: 'brokerage', name: 'Notas de Corretagem' },
  { id: 'registries', name: 'Cadastros' },
];

export const TeamManagement: React.FC = () => {
  // --- ESTADOS DA ABA DE EQUIPE (Membros) ---
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [myInvitations, setMyInvitations] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [selectedWallets, setSelectedWallets] = useState<Record<string, string>>({});

  // --- ESTADOS DE EDICAO & RECUPERACAO ---
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [resettingEmail, setResettingEmail] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPermissionToEdit, setSelectedPermissionToEdit] = useState<UserPermission | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserProfileId, setEditUserProfileId] = useState('');
  const [editSelectedWallets, setEditSelectedWallets] = useState<Record<string, string>>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // --- ESTADOS DA NOVA ABA DE PERFIS ---
  const [activeTab, setActiveTab] = useState<'team' | 'profiles'>('team');
  const [myRole, setMyRole] = useState<'owner' | 'admin' | 'editor' | 'viewer' | null>(null);
  
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [profilePermissions, setProfilePermissions] = useState<Record<string, any>>({});
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileDesc, setNewProfileDesc] = useState('');
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Carrega as informações básicas de convites e o papel de organizador do usuário atual
  const loadData = async () => {
    setLoading(true);
    try {
      const [mine, sentToMe] = await Promise.all([
        financeService.getMyInvitations().catch(() => []),
        financeService.getInvitationsSentToMe().catch(() => [])
      ]);
      setPermissions(mine);
      setMyInvitations(sentToMe);

      // Descobre o papel atual do usuário logado na organização ativa
      const supabase = financeService.getSupabase();
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const orgId = financeService.activeOrganizationId;

        if (user && orgId) {
          setCurrentUserEmail(user.email || '');
          const { data: memberData } = await supabase
            .from('organization_members')
            .select('role')
            .eq('organization_id', orgId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (memberData) {
            setMyRole(memberData.role);
          } else {
            // Verifica se é o criador real da organização
            const { data: orgData } = await supabase
              .from('organizations')
              .select('owner_id')
              .eq('id', orgId)
              .maybeSingle();

            if (orgData?.owner_id === user.id) {
              setMyRole('owner');
            } else {
              setMyRole('viewer');
            }
          }

          // Busca os perfis criados para a seleção no convite
          const { data: profilesData } = await supabase
            .from('organization_profiles')
            .select('*')
            .eq('organization_id', orgId)
            .order('name', { ascending: true });
          
          if (profilesData) {
            setProfiles(profilesData);
          }

          // Busca as carteiras da organização para gerenciar o vínculo
          const walletsData = await financeService.getRegistry<any>('wallets').catch(() => []);
          setWallets(walletsData || []);
        } else {
          setMyRole('viewer');
        }
      } else {
        setMyRole('viewer');
      }
    } catch (err: any) {
      console.error('[loadData] Erro:', err);
      setMyRole('viewer'); // Fallback para evitar travamentos
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // --- CARREGAMENTO DE PERFIS (ABA 2) ---
  const loadProfiles = async () => {
    const supabase = financeService.getSupabase();
    if (!supabase) return;
    const orgId = financeService.activeOrganizationId;
    if (!orgId) return;

    setLoadingProfiles(true);
    try {
      const { data: profilesData, error } = await supabase
        .from('organization_profiles')
        .select('*')
        .eq('organization_id', orgId)
        .order('name', { ascending: true });

      if (error) throw error;
      setProfiles(profilesData || []);
      
      // Seleciona o primeiro perfil por padrão se houver
      if (profilesData && profilesData.length > 0) {
        if (!selectedProfile || !profilesData.some(p => p.id === selectedProfile.id)) {
          setSelectedProfile(profilesData[0]);
        }
      } else {
        setSelectedProfile(null);
      }
    } catch (err: any) {
      console.error('[loadProfiles] Erro:', err);
      setProfileMessage({ type: 'error', text: 'Não foi possível buscar os perfis.' });
    } finally {
      setLoadingProfiles(false);
    }
  };

  // Carrega as permissões detalhadas por módulo sempre que mudar o perfil selecionado
  const loadProfilePermissions = async (profileId: string) => {
    const supabase = financeService.getSupabase();
    if (!supabase) return;

    try {
      const { data: permissionsData, error } = await supabase
        .from('profile_module_permissions')
        .select('*')
        .eq('profile_id', profileId);

      if (error) throw error;

      // Monta um record contendo todos os módulos configurados
      const permMap: Record<string, any> = {};
      MODULES.forEach(m => {
        permMap[m.id] = {
          can_view: false,
          can_create: false,
          can_edit: false,
          can_delete: false,
          can_export: false,
        };
      });

      if (permissionsData) {
        permissionsData.forEach((p: any) => {
          permMap[p.module] = {
            id: p.id,
            can_view: !!p.can_view,
            can_create: !!p.can_create,
            can_edit: !!p.can_edit,
            can_delete: !!p.can_delete,
            can_export: !!p.can_export,
          };
        });
      }

      setProfilePermissions(permMap);
    } catch (err: any) {
      console.error('[loadProfilePermissions] Erro:', err);
    }
  };

  // Recarrega perfis sempre que a aba de perfis é ativada
  useEffect(() => {
    if (activeTab === 'profiles') {
      loadProfiles();
    }
  }, [activeTab]);

  // Recarrega permissões ao alternar perfil selecionado
  useEffect(() => {
    if (selectedProfile?.id) {
      loadProfilePermissions(selectedProfile.id);
    } else {
      setProfilePermissions({});
    }
  }, [selectedProfile?.id]);

  // --- INTERAÇÕES DA ABA EQUIPE ---
  const handleWalletToggle = (walletId: string) => {
    setSelectedWallets(prev => {
      const copy = { ...prev };
      if (walletId in copy) {
        delete copy[walletId];
      } else {
        const defaultProfile = profiles.find(p => p.is_default) || profiles[0];
        copy[walletId] = defaultProfile ? defaultProfile.id : '';
      }
      return copy;
    });
  };

  const handleWalletProfileChange = (walletId: string, profileId: string) => {
    setSelectedWallets(prev => ({
      ...prev,
      [walletId]: profileId
    }));
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (profiles.length === 0) {
      setMessage({
        type: 'error',
        text: 'Atenção: Você precisa criar pelo menos um perfil de permissões na aba Perfis antes de convidar novos usuários.'
      });
      return;
    }

    if (wallets.length === 0) {
      setMessage({
        type: 'error',
        text: 'Atenção: Não há carteiras cadastradas nesta organização. Crie uma carteira primeiro.'
      });
      return;
    }

    const selectedEntries = Object.entries(selectedWallets);
    if (selectedEntries.length === 0) {
      setMessage({
        type: 'error',
        text: 'Selecione pelo menos uma carteira para vincular a este convite.'
      });
      return;
    }

    for (const [walletId, profileId] of selectedEntries) {
      if (!profileId) {
        setMessage({
          type: 'error',
          text: 'Selecione um perfil de permissões para cada carteira marcada.'
        });
        return;
      }
    }

    setInviting(true);
    setMessage(null);
    try {
      await financeService.inviteUser(email, role, selectedWallets);
      setMessage({ type: 'success', text: 'Convite enviado com sucesso!' });
      setEmail('');
      setSelectedWallets({});
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

  const handleResendInvite = async (email: string, role: string) => {
    setResendingEmail(email);
    try {
      await financeService.resendInvite(email, role);
      alert('Convite reenviado com sucesso!');
    } catch (err: any) {
      alert(err.message || 'Erro ao reenviar convite');
    } finally {
      setResendingEmail(null);
    }
  };

  // --- AUXILIARES E ACOES DE MEMBROS (MODELO DE EDITAR E PASSWORD RESET) ---
  const getWalletProfilesOfPermission = (p: UserPermission & { rawRole?: string }): Record<string, string> => {
    let walletProfiles: Record<string, string> = {};
    const rawRole = p.rawRole || '';
    if (rawRole && rawRole.includes(':')) {
      try {
        const jsonPart = rawRole.substring(rawRole.indexOf(':') + 1);
        walletProfiles = JSON.parse(jsonPart);
      } catch (err) {
        console.warn("Failed parsing wallet profiles from rawRole:", err);
      }
    } else if (p.invited_email && p.invited_email.includes('+wperms_')) {
      try {
        const start = p.invited_email.indexOf('+wperms_') + 8;
        const end = p.invited_email.indexOf('@');
        const encoded = p.invited_email.substring(start, end);
        const jsonStr = decodeURIComponent(escape(atob(encoded)));
        walletProfiles = JSON.parse(jsonStr);
      } catch (err) {
        console.warn("Failed parsing wallet profiles from email:", err);
      }
    }
    return walletProfiles;
  };

  const handleResetPassword = async (email: string) => {
    const supabase = financeService.getSupabase();
    if (!supabase) return;
    
    setResettingEmail(email);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      alert(`E-mail de redefinição enviado para ${email}`);
    } catch (err: any) {
      console.error('[handleResetPassword] Erro:', err);
      alert(`Falha ao enviar e-mail de redefinição: ${err.message || err}`);
    } finally {
      setResettingEmail(null);
    }
  };

  const handleOpenEditModal = (p: UserPermission & { rawRole?: string }) => {
    setSelectedPermissionToEdit(p);
    
    const mappings = getWalletProfilesOfPermission(p);
    
    const userName = mappings._user_name || '';
    setEditUserName(userName);
    
    let selectedProfileId = '';
    const checkedWallets: Record<string, string> = {};
    
    Object.entries(mappings).forEach(([k, v]) => {
      if (!k.startsWith('_')) {
        checkedWallets[k] = v;
        if (!selectedProfileId) {
          selectedProfileId = v;
        }
      }
    });
    
    if (!selectedProfileId && profiles.length > 0) {
      selectedProfileId = profiles[0].id;
    }
    
    setEditUserProfileId(selectedProfileId);
    setEditSelectedWallets(checkedWallets);
    setIsEditModalOpen(true);
  };

  const handleEditWalletToggle = (walletId: string) => {
    setEditSelectedWallets(prev => {
      const copy = { ...prev };
      if (walletId in copy) {
        delete copy[walletId];
      } else {
        copy[walletId] = editUserProfileId;
      }
      return copy;
    });
  };

  const handleEditProfileIdChange = (profileId: string) => {
    setEditUserProfileId(profileId);
    setEditSelectedWallets(prev => {
      const copy = { ...prev };
      Object.keys(copy).forEach(k => {
        if (!k.startsWith('_')) {
          copy[k] = profileId;
        }
      });
      return copy;
    });
  };

  const handleSaveEdit = async () => {
    if (!selectedPermissionToEdit) return;
    const supabase = financeService.getSupabase();
    if (!supabase) return;
    
    setIsSavingEdit(true);
    try {
      const orgId = financeService.activeOrganizationId;
      if (!orgId) throw new Error("Nenhuma organização ativa encontrada.");
      
      const walletProfiles: Record<string, string> = {};
      Object.entries(editSelectedWallets).forEach(([walletId, profileId]) => {
        if (!walletId.startsWith('_')) {
          walletProfiles[walletId] = profileId;
        }
      });
      
      if (Object.keys(walletProfiles).length === 0) {
        throw new Error("Selecione pelo menos uma carteira permitida.");
      }
      
      if (editUserName.trim()) {
        walletProfiles._user_name = editUserName.trim();
      }
      
      const originalMappings = getWalletProfilesOfPermission(selectedPermissionToEdit);
      const guestUserId = originalMappings._user_id || null;
      
      if (guestUserId) {
        walletProfiles._user_id = guestUserId;
      }
      
      const cleanRoleName = selectedPermissionToEdit.role || 'viewer';
      const updatedRole = `${cleanRoleName}:${JSON.stringify(walletProfiles)}`;
      
      const { error: permError } = await supabase
        .from('user_permissions')
        .update({ role: updatedRole })
        .eq('id', selectedPermissionToEdit.id);
        
      if (permError) throw permError;
      
      if (selectedPermissionToEdit.status === 'active') {
        let userId = guestUserId;
        
        if (!userId) {
          const walletIdsToCheck = Object.keys(originalMappings).filter(k => !k.startsWith('_'));
          if (walletIdsToCheck.length > 0) {
            const { data: wps } = await supabase
              .from('user_wallet_permissions')
              .select('user_id')
              .eq('organization_id', orgId)
              .in('wallet_id', walletIdsToCheck)
              .limit(1);
            if (wps && wps.length > 0) {
              userId = wps[0].user_id;
            }
          }
        }
        
        if (userId) {
          const { error: delErr } = await supabase
            .from('user_wallet_permissions')
            .delete()
            .eq('organization_id', orgId)
            .eq('user_id', userId);
            
          if (delErr) throw delErr;
          
          const inserts = Object.entries(walletProfiles)
            .filter(([k]) => !k.startsWith('_'))
            .map(([walletId, profileId]) => ({
              organization_id: orgId,
              user_id: userId,
              wallet_id: walletId,
              profile_id: profileId
            }));
            
          if (inserts.length > 0) {
            const { error: insErr } = await supabase
              .from('user_wallet_permissions')
              .insert(inserts);
            if (insErr) throw insErr;
          }
        }
      }
      
      alert("Perfil editado com sucesso!");
      setIsEditModalOpen(false);
      loadData();
    } catch (err: any) {
      console.error('[handleSaveEdit] Erro:', err);
      alert(err.message || "Falha ao salvar as alterações do perfil.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // --- INTERAÇÕES DA ABA PERFIS ---
  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = financeService.getSupabase();
    if (!supabase) return;

    const orgId = financeService.activeOrganizationId;
    if (!orgId) {
      setProfileMessage({ type: 'error', text: 'Nenhuma organização ativa configurada.' });
      return;
    }

    if (!newProfileName.trim()) return;

    setCreatingProfile(true);
    setProfileMessage(null);
    try {
      // 1. Cria o perfil
      const { data: newProfile, error } = await supabase
        .from('organization_profiles')
        .insert({
          organization_id: orgId,
          name: newProfileName.trim(),
          description: newProfileDesc.trim(),
          is_default: false
        })
        .select()
        .single();

      if (error) throw error;

      // 2. Cria as permissões padrão para cada módulo como falsas por padrão
      const defaultPermissions = MODULES.map(m => ({
        profile_id: newProfile.id,
        module: m.id,
        can_view: true, // daremos visão habilitada por padrão para facilitar a customização
        can_create: false,
        can_edit: false,
        can_delete: false,
        can_export: false
      }));

      const { error: permError } = await supabase
        .from('profile_module_permissions')
        .insert(defaultPermissions);

      if (permError) throw permError;

      // Atualiza os estados locais
      setProfiles(prev => [...prev, newProfile]);
      setSelectedProfile(newProfile);
      setNewProfileName('');
      setNewProfileDesc('');
      setProfileMessage({ type: 'success', text: `Perfil "${newProfile.name}" criado! Ajuste suas regras abaixo.` });
    } catch (err: any) {
      console.error(err);
      setProfileMessage({ type: 'error', text: 'Falha ao criar perfil de acesso.' });
    } finally {
      setCreatingProfile(false);
    }
  };

  const handleDeleteProfile = async (profileId: string, profileName: string) => {
    const supabase = financeService.getSupabase();
    if (!supabase) return;

    if (!window.confirm(`Tem certeza que deseja excluir o perfil "${profileName}"? Esta ação é irreversível.`)) return;

    setProfileMessage(null);
    try {
      // 1. Verifica se existem usuários associados no user_wallet_permissions
      const { count, error: countError } = await supabase
        .from('user_wallet_permissions')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', profileId);

      if (countError) throw countError;

      if (count && count > 0) {
        setProfileMessage({
          type: 'error',
          text: `Não é possível remover o perfil "${profileName}" pois há ${count} usuários associados a ele.`
        });
        return;
      }

      // 2. Remove o perfil (a cascata de exclusão do BD limpa profile_module_permissions)
      const { error: deleteError } = await supabase
        .from('organization_profiles')
        .delete()
        .eq('id', profileId);

      if (deleteError) throw deleteError;

      const remaining = profiles.filter(p => p.id !== profileId);
      setProfiles(remaining);
      setSelectedProfile(remaining.length > 0 ? remaining[0] : null);
      setProfileMessage({ type: 'success', text: 'Perfil removido com sucesso.' });
    } catch (err: any) {
      console.error(err);
      setProfileMessage({ type: 'error', text: 'Erro ao remover o perfil.' });
    }
  };

  const handleCheckboxChange = (moduleId: string, field: string, checked: boolean) => {
    setProfilePermissions(prev => ({
      ...prev,
      [moduleId]: {
        ...prev[moduleId],
        [field]: checked
      }
    }));
  };

  const handleSaveProfilePermissions = async () => {
    if (!selectedProfile) return;
    const supabase = financeService.getSupabase();
    if (!supabase) return;

    setSavingPermissions(true);
    setProfileMessage(null);
    try {
      // Monta os payloads para atualizar no Supabase
      const payloads = MODULES.map(m => {
        const state = profilePermissions[m.id] || {};
        return {
          profile_id: selectedProfile.id,
          module: m.id,
          can_view: !!state.can_view,
          can_create: !!state.can_create,
          can_edit: !!state.can_edit,
          can_delete: !!state.can_delete,
          can_export: !!state.can_export,
        };
      });

      // Deleta as antigas e insere as novas para evitar conflitos de restrições
      const { error: deleteError } = await supabase
        .from('profile_module_permissions')
        .delete()
        .eq('profile_id', selectedProfile.id);

      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase
        .from('profile_module_permissions')
        .insert(payloads);

      if (insertError) throw insertError;

      setProfileMessage({ type: 'success', text: `Permissões de "${selectedProfile.name}" salvas com sucesso!` });
    } catch (err: any) {
      console.error(err);
      setProfileMessage({ type: 'error', text: 'Falha ao salvar permissões no Supabase.' });
    } finally {
      setSavingPermissions(false);
    }
  };

  // Loader inicial
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-slate-500 font-medium">Carregando gerenciamento de controle de acessos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* SEÇÃO DO CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Equipe & Permissões
          </h2>
          <p className="text-slate-500 font-medium">
            Gerencie colaboradores e controle detalhadamente quem pode visualizar ou alterar seus lançamentos por módulo.
          </p>
        </div>
      </div>

      {/* SELETOR DE ABAS SUB-NAVEGAÇÃO */}
      <div className="flex border-b border-slate-100 gap-2 pb-0.5">
        <button
          onClick={() => setActiveTab('team')}
          className={`px-4 py-2.5 text-sm font-black transition-all flex items-center gap-2 border-b-2 -mb-[2px] ${
            activeTab === 'team'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Users className="w-4 h-4" />
          Membros da Equipe
        </button>
        {/* A aba de perfis só é visível para o proprietário (owner) ou administrador (admin) */}
        {(myRole === 'owner' || myRole === 'admin' || myRole === null) && (
          <button
            onClick={() => setActiveTab('profiles')}
            className={`px-4 py-2.5 text-sm font-black transition-all flex items-center gap-2 border-b-2 -mb-[2px] ${
              activeTab === 'profiles'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Shield className="w-4 h-4" />
            Perfis de Acesso
          </button>
        )}
      </div>

      {/* RENDERIZAÇÃO DA ABA 1: EQUIPE */}
      {activeTab === 'team' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* SEÇÃO DO FORMULÁRIO DE NOVO CONVITE */}
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
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Nível de Acesso Geral</label>
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
                        <div className="text-[10px] text-slate-500 leading-tight">Apenas visualiza dados gerais (de acordo com as carteiras).</div>
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
                        <div className="text-[10px] text-slate-500 leading-tight">Pode criar e editar lançamentos nas carteiras liberadas.</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Seleção de Carteiras e Perfis (Fase 2) */}
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider px-1">
                    Permissões por Carteira
                  </label>
                  
                  {profiles.length === 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-700 font-semibold leading-relaxed">
                      Atenção: Você precisa criar pelo menos um perfil de acesso na aba <strong>Perfis de Acesso</strong> para configurar as permissões de carteira antes de convidar.
                    </div>
                  ) : wallets.length === 0 ? (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-500">
                      Não há carteiras cadastradas nesta organização. Crie uma carteira primeiro para estruturar os acessos.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {wallets.map(wallet => {
                        const isChecked = wallet.id in selectedWallets;
                        const currentProfileId = selectedWallets[wallet.id] || '';
                        
                        return (
                          <div key={wallet.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 transition-colors hover:bg-slate-100/50">
                            <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleWalletToggle(wallet.id)}
                                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-slate-300"
                              />
                              <span className="text-xs font-bold text-slate-700 truncate">{wallet.name}</span>
                            </label>
                            
                            {isChecked && (
                              <select
                                value={currentProfileId}
                                onChange={(e) => handleWalletProfileChange(wallet.id, e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg text-[11px] font-bold py-1.5 px-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-600 max-w-[120px]"
                              >
                                <option value="" disabled>Perfil...</option>
                                {profiles.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                Segurança Dinâmica
              </h4>
              <p className="text-blue-100 text-sm leading-relaxed">
                Utilizamos Row Level Security (RLS) no Supabase. O banco de dados valida se as permissões e vínculos de carteiras do usuário existem antes de liberar os registros no frontend.
              </p>
            </div>
          </div>

          {/* SEÇÃO DA LISTA DE MEMBROS E CONVITES RECEBIDOS */}
          <div className="lg:col-span-2 space-y-6">
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

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-50">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  Pessoas com Acesso
                </h3>
              </div>
              
              {permissions.length === 0 && !(myRole === 'owner' && currentUserEmail) ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                     <Users className="w-8 h-8" />
                  </div>
                  <p className="text-slate-400 font-medium">Nenhum convidado ainda.</p>
                  <p className="text-slate-300 text-xs mt-1">Sua conta é privada e só você tem acesso.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {/* Proprietário / Owner (Sempre no topo) */}
                  {myRole === 'owner' && currentUserEmail && (
                    <div className="p-5 flex items-center justify-between bg-purple-50/10 hover:bg-purple-50/20 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-100 text-amber-600 border border-amber-200/40 shadow-sm">
                          <ShieldCheck className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <span>{currentUserEmail}</span>
                            <span className="text-[9px] font-black tracking-widest bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full uppercase">
                              PROPRIETÁRIO
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold text-green-600">
                              Conta Ativa
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Sem ações para o Proprietário */}
                      <div className="w-20"></div>
                    </div>
                  )}

                  {permissions.map(p => {
                    const mappings = getWalletProfilesOfPermission(p);
                    const displayName = mappings._user_name || null;
                    return (
                      <div key={p.id} className="p-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${p.status === 'active' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                            {p.status === 'active' ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-800">
                              {displayName ? (
                                <span className="flex flex-col">
                                  <span>{displayName}</span>
                                  <span className="text-xs text-slate-400 font-normal">{p.invited_email}</span>
                                </span>
                              ) : (
                                p.invited_email
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {p.status === 'pending' ? (
                                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200">
                                  AGUARDANDO
                                </span>
                              ) : (
                                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                  p.role === 'admin' ? 'bg-purple-100 text-purple-700' : 
                                  p.role === 'editor' ? 'bg-blue-100 text-blue-700' : 
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {p.role}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400">•</span>
                              <span className={`text-[10px] font-bold ${p.status === 'active' ? 'text-green-600' : 'text-amber-500'}`}>
                                {p.status === 'active' ? 'Ativo' : 'Aguardando Aceite'}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          {/* Reenviar Convite */}
                          {p.status === 'pending' && (
                            <button
                              onClick={() => handleResendInvite(p.invited_email, p.role)}
                              className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
                              title="Reenviar e-mail de convite"
                              disabled={resendingEmail === p.invited_email}
                            >
                              {resendingEmail === p.invited_email ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Mail className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          {/* Reset de Senha */}
                          {p.status === 'active' && (
                            <button
                              onClick={() => handleResetPassword(p.invited_email)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                              title="Redefinir senha"
                              disabled={resettingEmail === p.invited_email}
                            >
                              {resettingEmail === p.invited_email ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Key className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          {/* Editar Perfil */}
                          {p.status === 'active' && (
                            <button
                              onClick={() => handleOpenEditModal(p)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                              title="Editar perfil"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}

                          {/* Excluir acesso */}
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            title="Remover acesso"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RENDERIZAÇÃO DA ABA 2: PERFIS E PERMISSÕES DETALHADAS */}
      {activeTab === 'profiles' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
          
          {/* PAINEL ESQUERDO: LISTA DE PERFIS E CRIAÇÃO INLINE */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Formulário Compacto de Novo Perfil */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Novo Perfil
              </h3>

              <form onSubmit={handleCreateProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Nome do Perfil</label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                    placeholder="Ex: Contador, Investidor"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 px-1">Descrição</label>
                  <textarea
                    maxLength={150}
                    value={newProfileDesc}
                    onChange={(e) => setNewProfileDesc(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 h-20 resize-none"
                    placeholder="Ex: Permite visualizar relatórios e extratos..."
                  />
                </div>

                {profileMessage && (
                  <div className={`p-3 rounded-xl text-xs font-semibold animate-in fade-in zoom-in duration-300 ${
                    profileMessage.type === 'success' 
                      ? 'bg-green-50 text-green-700 border border-green-100' 
                      : 'bg-red-50 text-red-700 border border-red-100'
                  }`}>
                    {profileMessage.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={creatingProfile || !newProfileName.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md shadow-blue-200 flex items-center justify-center gap-2"
                >
                  {creatingProfile ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Criar Perfil</span>
                      <Plus className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Listagem de Perfis Cadastrados */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                Perfis Cadastrados
              </h3>

              {loadingProfiles ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : profiles.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-400 text-sm font-medium">Nenhum perfil cadastrado.</p>
                  <p className="text-slate-300 text-xs mt-1">Crie o seu primeiro perfil no painel acima.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {profiles.map(p => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProfile(p)}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between group ${
                        selectedProfile?.id === p.id
                          ? 'bg-blue-50/50 border-blue-200 ring-2 ring-blue-500/5'
                          : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="text-sm font-bold text-slate-800 truncate">{p.name}</div>
                        {p.description && (
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{p.description}</div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProfile(p.id, p.name);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        title="Excluir perfil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PAINEL DIREITO: TABELA DE CHECKBOXES POR MÓDULO */}
          <div className="lg:col-span-2">
            {selectedProfile ? (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-6">
                
                {/* Header do painel de controle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">
                      Permissões de: {selectedProfile.name}
                    </h3>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Configure individualmente o que este perfil pode fazer em cada tela e módulo do sistema.
                    </p>
                  </div>
                  <button
                    onClick={handleSaveProfilePermissions}
                    disabled={savingPermissions}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-md shadow-blue-200 transition-all flex items-center justify-center gap-1.5 self-start sm:self-auto"
                  >
                    {savingPermissions ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Salvar Permissões</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Tabela de Grid de Módulos */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="py-3 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">Módulo</th>
                        <th className="py-3 px-4 text-center text-xs font-black text-slate-400 uppercase tracking-wider">Ver</th>
                        <th className="py-3 px-4 text-center text-xs font-black text-slate-400 uppercase tracking-wider">Criar</th>
                        <th className="py-3 px-4 text-center text-xs font-black text-slate-400 uppercase tracking-wider">Editar</th>
                        <th className="py-3 px-4 text-center text-xs font-black text-slate-400 uppercase tracking-wider">Excluir</th>
                        <th className="py-3 px-4 text-center text-xs font-black text-slate-400 uppercase tracking-wider">Exportar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {MODULES.map(m => {
                        const perm = profilePermissions[m.id] || {
                          can_view: false,
                          can_create: false,
                          can_edit: false,
                          can_delete: false,
                          can_export: false,
                        };

                        return (
                          <tr key={m.id} className="hover:bg-slate-50/20 transition-all">
                            <td className="py-3 px-4">
                              <span className="text-sm font-bold text-slate-700">{m.name}</span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <input
                                type="checkbox"
                                checked={!!perm.can_view}
                                onChange={(e) => handleCheckboxChange(m.id, 'can_view', e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 transition-all cursor-pointer"
                              />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <input
                                type="checkbox"
                                checked={!!perm.can_create}
                                onChange={(e) => handleCheckboxChange(m.id, 'can_create', e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 transition-all cursor-pointer"
                              />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <input
                                type="checkbox"
                                checked={!!perm.can_edit}
                                onChange={(e) => handleCheckboxChange(m.id, 'can_edit', e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 transition-all cursor-pointer"
                              />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <input
                                type="checkbox"
                                checked={!!perm.can_delete}
                                onChange={(e) => handleCheckboxChange(m.id, 'can_delete', e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 transition-all cursor-pointer"
                              />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <input
                                type="checkbox"
                                checked={!!perm.can_export}
                                onChange={(e) => handleCheckboxChange(m.id, 'can_export', e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 transition-all cursor-pointer"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-50">
                  <button
                    onClick={handleSaveProfilePermissions}
                    disabled={savingPermissions}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold text-xs py-3 px-6 rounded-xl shadow-md shadow-blue-200 transition-all flex items-center justify-center gap-1.5"
                  >
                    {savingPermissions ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Salvar Modificações</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-12 text-center h-64 flex flex-col items-center justify-center">
                <Shield className="w-10 h-10 text-slate-300 mb-3" />
                <h4 className="text-slate-700 font-bold mb-1">Nenhum Perfil Selecionado</h4>
                <p className="text-slate-400 text-xs max-w-xs leading-relaxed">
                  Selecione um dos perfis à esquerda da lista para configurar e gerenciar suas permissões de forma granular.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      {/* MODAL DE EDITAR PERFIL DO USUÁRIO */}
      {isEditModalOpen && selectedPermissionToEdit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Editar Perfil de Acesso</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              {/* Informações básicas do usuário */}
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">E-mail do Usuário</span>
                <p className="text-sm font-bold text-slate-700 mt-1 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-100">
                  {selectedPermissionToEdit.invited_email}
                </p>
              </div>

              {/* Campo: Nome do Usuário */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Nome do Usuário
                </label>
                <input
                  type="text"
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                  placeholder="Nome descritivo do usuário"
                  className="w-full text-sm font-semibold text-slate-700 mt-1 border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 px-3.5 py-2.5 rounded-xl transition-all"
                />
              </div>

              {/* Campo: Perfil de acesso (dropdown) */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Perfil de Acesso
                </label>
                <select
                  value={editUserProfileId}
                  onChange={(e) => handleEditProfileIdChange(e.target.value)}
                  className="w-full text-sm font-semibold text-slate-700 mt-1 border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 px-3.5 py-2.5 rounded-xl transition-all bg-white"
                >
                  <option value="" disabled>Selecione um Perfil</option>
                  {profiles.map(prof => (
                    <option key={prof.id} value={prof.id}>
                      {prof.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Campo: Carteiras permitidas (checkboxes) */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-2">
                  Carteiras Permitidas
                </label>
                <div className="border border-slate-200/60 rounded-2xl p-4 max-h-40 overflow-y-auto space-y-2 bg-slate-50/50">
                  {wallets.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-4">Nenhuma carteira cadastrada.</p>
                  ) : (
                    wallets.map(w => {
                      const isChecked = w.id in editSelectedWallets;
                      return (
                        <label key={w.id} className="flex items-center gap-3 cursor-pointer group text-slate-700 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleEditWalletToggle(w.id)}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 transition-all cursor-pointer"
                          />
                          <span className="text-slate-600 group-hover:text-slate-800 transition-colors">
                            {w.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4.5 py-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-blue-200"
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Salvar Alterações</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
