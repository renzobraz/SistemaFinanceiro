import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  ArrowRightLeft, 
  Database, 
  Wallet, 
  Settings, 
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  PieChart,
  BookOpen,
  BarChart3,
  Users,
  ChevronDown,
  Filter,
  Terminal,
  AtSign,
  X
} from 'lucide-react';
import { safeStorage } from '../services/financeService';

// Sombreia localmente o localStorage global para uso seguro em IFrames / Sandbox do AI Studio
const localStorage = safeStorage;

const sidebarToDbModuleMap: Record<string, string> = {
  'dashboard': 'dashboard',
  'reports': 'reports',
  'cashflow': 'cashflow',
  'expenses-analysis': 'expenses',
  'investments': 'investments',
  'distribution': 'distribution',
  'payables': 'payables',
  'bank-transactions': 'transactions',
  'brokerage-notes': 'brokerage',
  'registries': 'registries'
};

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  userModulePermissions?: Record<string, any>;
  userRole?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab, 
  isOpen = false, 
  onClose,
  userModulePermissions = {},
  userRole = ''
}) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === 'true';
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(() => activeTab.startsWith('settings'));

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebar_collapsed', String(newState));
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    { id: 'cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
    { id: 'expenses-analysis', label: 'Análise de Gastos', icon: PieChart },
    { id: 'investments', label: 'Investimentos', icon: BarChart3 },
    { id: 'distribution', label: 'Distribuição Lucros', icon: TrendingUp },
    { id: 'payables', label: 'Contas a Pagar/Receber', icon: CalendarClock },
    { id: 'bank-transactions', label: 'Movimentação Bancária', icon: ArrowRightLeft },
    { id: 'brokerage-notes', label: 'Notas de Corretagem', icon: BookOpen },
    { id: 'registries', label: 'Cadastros', icon: Database },
  ];

  const filteredMenuItems = menuItems.filter(item => {
    if (!userModulePermissions || Object.keys(userModulePermissions).length === 0) {
      return true;
    }
    const dbModule = sidebarToDbModuleMap[item.id] || item.id;
    return userModulePermissions[dbModule]?.can_view === true;
  });

  const settingsSubItems = [
    { id: 'settings-filters', label: 'Filtro Inicialização', icon: Filter },
    { id: 'settings-team', label: 'Gerenciar Equipe', icon: Users },
    { id: 'settings-email', label: 'Configuração E-mail', icon: AtSign },
    { id: 'settings-database', label: 'Conexão Banco de Dados', icon: Database },
    { id: 'settings-sql', label: 'Configuração SQL', icon: Terminal },
    { id: 'settings-manual', label: 'Manual / Ajuda', icon: BookOpen },
  ];

  const showSettingsSubmenu = !userRole || userRole === 'owner' || userRole === 'admin';

  const widthClass = isCollapsed ? 'w-64 lg:w-20' : 'w-64';
  const textClass = isCollapsed ? 'block lg:hidden' : 'block';

  return (
    <>
      {/* Backdrop overlay for mobile */}
      {isOpen && onClose && (
        <div 
          onClick={onClose} 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden cursor-pointer duration-300 animate-fade-in"
        />
      )}

      <div className={`${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 ${widthClass} bg-slate-900 text-white min-h-screen fixed lg:relative inset-y-0 left-0 flex flex-col transition-all duration-300 flex-shrink-0 z-50 lg:z-20`}>
        <div className="h-16 flex items-center justify-between border-b border-slate-800 transition-all duration-300 overflow-hidden whitespace-nowrap px-4 w-full">
          <div className="flex items-center">
            <Wallet className="w-8 h-8 text-blue-500 flex-shrink-0" />
            <span className={`ml-3 font-bold text-xl transition-all duration-300 ${textClass}`}>
              FinControl
            </span>
          </div>
          {/* Close Button on mobile */}
          {onClose && (
            <button 
              onClick={onClose} 
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden transition-colors"
              title="Fechar menu"
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        <nav className="flex-1 py-6 overflow-y-auto overflow-x-hidden text-sm uppercase tracking-tighter">
          <ul className="space-y-2 px-2">
            {filteredMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      setActiveTab(item.id);
                      if (onClose) onClose();
                    }}
                    title={isCollapsed ? item.label : ''}
                    className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-300 group relative ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 scale-[1.02]'
                        : 'text-slate-400 hover:bg-slate-800/80 hover:text-white hover:pl-5'
                    } ${isCollapsed ? 'justify-start lg:justify-center' : 'justify-start'}`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                    <span className={`ml-3 font-bold whitespace-nowrap transition-all duration-300 ${textClass}`}>
                      {item.label}
                    </span>
                    
                    {isCollapsed && (
                      <div className="absolute left-full ml-4 px-3 py-2 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 lg:group-hover:opacity-100 pointer-events-none transition-all z-50 whitespace-nowrap shadow-xl hidden lg:block">
                        {item.label}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}

            {/* Menu Configurações com Submenu */}
            <li>
              <button
                onClick={() => {
                  const isMobile = window.innerWidth < 1024;
                  if (isCollapsed && !isMobile) {
                    toggleSidebar();
                    setIsSettingsOpen(true);
                  } else {
                    setIsSettingsOpen(!isSettingsOpen);
                  }
                }}
                className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-300 group relative ${
                  activeTab.startsWith('settings')
                    ? 'bg-blue-600/10 text-blue-600'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                } ${isCollapsed ? 'justify-start lg:justify-center' : 'justify-start'}`}
              >
                <Settings className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${activeTab.startsWith('settings') ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span className={`ml-3 font-bold whitespace-nowrap transition-all duration-300 flex-1 text-left ${textClass}`}>
                  Configurações
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isSettingsOpen ? 'rotate-180' : ''} ${isCollapsed ? 'lg:hidden' : ''}`} />
              </button>

              {/* Submenu de Configurações */}
              {isSettingsOpen && showSettingsSubmenu && (
                <ul className={`mt-1 space-y-1 ml-6 border-l border-slate-800 pl-4 animate-in slide-in-from-top-2 duration-300 ${isCollapsed ? 'lg:hidden' : ''}`}>
                  {settingsSubItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const isSubActive = activeTab === sub.id;
                    return (
                      <li key={sub.id}>
                        <button
                          onClick={() => {
                            setActiveTab(sub.id);
                            if (onClose) onClose();
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                            isSubActive
                              ? 'text-blue-400 bg-blue-400/5'
                              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                          }`}
                        >
                          <SubIcon className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="whitespace-nowrap">{sub.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          </ul>
        </nav>

        <div className="p-3 border-t border-slate-800 lg:block hidden">
          <button
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center p-3 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition-all duration-300 group"
            title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : (
              <div className="flex items-center gap-3">
                <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-widest">Recolher Menu</span>
              </div>
            )}
          </button>
        </div>
      </div>
    </>
  );
};
