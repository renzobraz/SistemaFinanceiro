import React from 'react';
import { useReportStore } from '../../stores/useReportStore';
import { Calendar, User, Briefcase, Filter, X } from 'lucide-react';
import { Bank, Category, CostCenter, Participant, Wallet, AssetType, AssetSector, AssetTicker } from '../../../types';

interface Registries {
  banks: Bank[];
  categories: Category[];
  costCenters: CostCenter[];
  participants: Participant[];
  wallets: Wallet[];
  assetTypes: AssetType[];
  assetSectors: AssetSector[];
  assetTickers: AssetTicker[];
}

interface FilterBarProps {
  registries: Registries;
}

export const FilterBar: React.FC<FilterBarProps> = ({ registries }) => {
  const { 
    startDate, 
    endDate, 
    participantId, 
    costCenterId, 
    walletId, 
    bankId, 
    categoryId, 
    excludeTransfers,
    setFilters, 
    resetFilters 
  } = useReportStore();

  return (
    <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm overflow-x-auto">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-2">
           <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filtros de Relatório</h2>
           <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-blue-600 transition-colors">
                    Ignorar Transferências Internas
                  </div>
                  <div 
                    onClick={() => setFilters({ excludeTransfers: !excludeTransfers })}
                    className={`w-8 h-4 rounded-full relative transition-colors ${excludeTransfers ? 'bg-blue-600' : 'bg-slate-200'}`}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${excludeTransfers ? 'left-4.5' : 'left-0.5'}`} />
                  </div>
              </label>
           </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-grow sm:flex-grow-0 min-w-[280px]">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setFilters({ startDate: e.target.value })}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full"
            />
            <span className="text-slate-300">|</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setFilters({ endDate: e.target.value })}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-[150px]">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <select 
              value={participantId}
              onChange={(e) => setFilters({ participantId: e.target.value })}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full appearance-none cursor-pointer"
            >
              <option value="ALL">Participante</option>
              {registries.participants.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-[150px]">
            <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
            <select 
              value={costCenterId}
              onChange={(e) => setFilters({ costCenterId: e.target.value })}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full appearance-none cursor-pointer"
            >
              <option value="ALL">Centro de Custo</option>
              {registries.costCenters.map(cc => (
                <option key={cc.id} value={cc.id}>{cc.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-[150px]">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select 
              value={bankId}
              onChange={(e) => setFilters({ bankId: e.target.value })}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full appearance-none cursor-pointer"
            >
              <option value="ALL">Banco</option>
              {registries.banks.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-[150px]">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select 
              value={walletId}
              onChange={(e) => setFilters({ walletId: e.target.value })}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full appearance-none cursor-pointer"
            >
              <option value="ALL">Carteira</option>
              {registries.wallets.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-[150px]">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select 
              value={categoryId}
              onChange={(e) => setFilters({ categoryId: e.target.value })}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full appearance-none cursor-pointer"
            >
              <option value="ALL">Categoria</option>
              {registries.categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={resetFilters}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Limpar Filtros"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
