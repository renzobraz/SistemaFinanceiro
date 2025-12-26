
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
  TrendingUp
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === 'true';
  });

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebar_collapsed', String(newState));
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
    { id: 'payables', label: 'Contas a Pagar/Receber', icon: CalendarClock },
    { id: 'bank-transactions', label: 'Movimentação Bancária', icon: ArrowRightLeft },
    { id: 'registries', label: 'Cadastros', icon: Database },
  ];

  const widthClass = isCollapsed ? 'w-20' : 'w-20 lg:w-64';
  const textClass = isCollapsed ? 'hidden' : 'hidden lg:block';

  return (
    <div className={`${widthClass} bg-slate-900 text-white min-h-screen flex flex-col transition-all duration-300 flex-shrink-0 z-20`}>
      <div className="h-16 flex items-center justify-center border-b border-slate-800 transition-all duration-300 overflow-hidden whitespace-nowrap px-4">
        <Wallet className="w-8 h-8 text-blue-500 flex-shrink-0" />
        <span className={`ml-3 font-bold text-xl transition-opacity duration-300 ${textClass}`}>
          FinControl
        </span>
      </div>

      <nav className="flex-1 py-6 overflow-y-auto overflow-x-hidden">
        <ul className="space-y-2 px-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  title={isCollapsed ? item.label : ''}
                  className={`w-full flex items-center px-3 py-3 rounded-lg transition-colors duration-200 group relative ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  } ${isCollapsed ? 'justify-center' : 'justify-center lg:justify-start'}`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className={`ml-3 font-medium whitespace-nowrap transition-opacity duration-200 ${textClass}`}>
                    {item.label}
                  </span>
                  
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                      {item.label}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-2 border-t border-slate-800 space-y-2">
        <button 
          onClick={() => setActiveTab('settings')}
          title={isCollapsed ? 'Configurações' : ''}
          className={`w-full flex items-center px-3 py-3 rounded-lg transition-colors ${
             activeTab === 'settings' 
             ? 'bg-blue-600 text-white' 
             : 'text-slate-400 hover:text-white hover:bg-slate-800'
          } ${isCollapsed ? 'justify-center' : 'justify-center lg:justify-start'}`}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          <span className={`ml-3 whitespace-nowrap ${textClass}`}>Configurações</span>
        </button>

        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
          title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
        >
          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};
