import React, { useMemo } from 'react';
import { parseISO, isWithinInterval } from 'date-fns';
import { FilterBar } from './FilterBar';
import { KPICards } from './KPICards';
import { CashFlowChart } from './CashFlowChart';
import { ExpenseDistributionChart } from './ExpenseDistributionChart';
import { AIInsights } from './AIInsights';
import { useReportStore } from '../../stores/useReportStore';
import { Transaction, Bank, Category, CostCenter, Participant, Wallet, AssetType, AssetSector, AssetTicker } from '../../../types';
import { LayoutDashboard, FileText, Download } from 'lucide-react';

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

interface ReportsDashboardProps {
  transactions: Transaction[];
  registries: Registries;
}

const ReportsDashboard: React.FC<ReportsDashboardProps> = ({ transactions, registries }) => {
  const { startDate, endDate, participantId, costCenterId, walletId, bankId, categoryId, excludeTransfers } = useReportStore();

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const transDate = parseISO(t.date);
      const isDateMatch = isWithinInterval(transDate, {
        start: parseISO(startDate),
        end: parseISO(endDate)
      });

      const isParticipantMatch = participantId === 'ALL' || t.participantId === participantId;
      const isCostCenterMatch = costCenterId === 'ALL' || t.costCenterId === costCenterId;
      const isWalletMatch = walletId === 'ALL' || t.walletId === walletId;
      const isBankMatch = bankId === 'ALL' || t.bankId === bankId;
      const isCategoryMatch = categoryId === 'ALL' || t.categoryId === categoryId;

      // Logic to identify internal transfers
      const category = registries.categories.find(c => c.id === t.categoryId);
      const isTransfer = !!t.linkedId || category?.name.toLowerCase().includes('transferência') || category?.name.toLowerCase().includes('titularidade');

      if (excludeTransfers && isTransfer) {
        return false;
      }

      return isDateMatch && isParticipantMatch && isCostCenterMatch && isWalletMatch && isBankMatch && isCategoryMatch;
    });
  }, [startDate, endDate, participantId, costCenterId, walletId, bankId, categoryId, excludeTransfers, transactions, registries]);

  return (
    <div className="bg-slate-50 font-sans h-full overflow-auto">
      <FilterBar registries={registries} />
      
      <main className="animate-in fade-in slide-in-from-top-4 duration-500 pb-12">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200">
                <LayoutDashboard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                  Painel de Controle Financeiro
                </h1>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-0.5">
                  Análise Pessoal Consolidada
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                <FileText className="w-4 h-4 text-slate-400" />
                <span>PDF</span>
              </button>
              <button className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl shadow-slate-200 translate-y-0 active:translate-y-0.5 transform">
                <Download className="w-4 h-4 text-slate-400" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          <KPICards transactions={filteredTransactions} />

          <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <AIInsights transactions={filteredTransactions} registries={registries} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
              <CashFlowChart transactions={filteredTransactions} />
            </div>
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              <ExpenseDistributionChart transactions={filteredTransactions} registries={registries} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ReportsDashboard;
