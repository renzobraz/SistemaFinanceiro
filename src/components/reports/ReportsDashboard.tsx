import React, { useMemo, useState } from 'react';
import { parseISO, isWithinInterval } from 'date-fns';
import { FilterBar } from './FilterBar';
import { KPICards } from './KPICards';
import { CashFlowChart } from './CashFlowChart';
import { ExpenseDistributionChart } from './ExpenseDistributionChart';
import { AIInsights } from './AIInsights';
import { useReportStore } from '../../stores/useReportStore';
import { Transaction, Bank, Category, CostCenter, Participant, Wallet, AssetType, AssetSector, AssetTicker } from '../../../types';
import { LayoutDashboard, FileText, Download, Users } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { ExpenseDetailsTable } from './ExpenseDetailsTable';
import { ProfitDistributionReport } from './ProfitDistributionReport';
import { format } from 'date-fns';

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
  userModulePermissions?: Record<string, any>;
  userRole?: string;
}

const ReportsDashboard: React.FC<ReportsDashboardProps> = ({ 
  transactions, 
  registries,
  userModulePermissions = {},
  userRole = ""
}) => {
  const { startDate, endDate, participantId, costCenterId, walletId, bankId, categoryId, excludeTransfers } = useReportStore();
  const [activeTab, setActiveTab] = useState<'general' | 'distribution'>('general');

  const hasExportPermission = useMemo(() => {
    return (
      !userModulePermissions ||
      Object.keys(userModulePermissions).length === 0 ||
      userRole === 'owner' ||
      userRole === 'admin' ||
      userModulePermissions['reports']?.can_export === true
    );
  }, [userModulePermissions, userRole]);

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

  const exportToPDF = () => {
    const doc = new jsPDF();
    const tableData = filteredTransactions.map(t => [
      format(parseISO(t.date), 'dd/MM/yyyy'),
      t.description,
      registries.categories.find(c => c.id === t.categoryId)?.name || '-',
      registries.banks.find(b => b.id === t.bankId)?.name || '-',
      t.type === 'CREDIT' ? 'Receita' : 'Despesa',
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.value)
    ]);

    doc.text('Painel de Controle Financeiro - Análise Consolidada', 14, 15);
    doc.setFontSize(10);
    doc.text(`Período: ${format(parseISO(startDate), 'dd/MM/yyyy')} até ${format(parseISO(endDate), 'dd/MM/yyyy')}`, 14, 22);

    autoTable(doc, {
      head: [['Data', 'Descrição', 'Categoria', 'Banco', 'Tipo', 'Valor']],
      body: tableData,
      startY: 30,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }
    });

    doc.save(`relatorio-financeiro-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const exportToExcel = () => {
    const exportData = filteredTransactions.map(t => ({
      'Data': format(parseISO(t.date), 'dd/MM/yyyy'),
      'Descrição': t.description,
      'Categoria': registries.categories.find(c => c.id === t.categoryId)?.name || '-',
      'Banco': registries.banks.find(b => b.id === t.bankId)?.name || '-',
      'Tipo': t.type === 'CREDIT' ? 'Receita' : 'Despesa',
      'Valor': t.value,
      'Notas': t.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimentações');
    XLSX.writeFile(wb, `relatorio-financeiro-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

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
              <div className="flex bg-white border border-slate-200 p-1 rounded-xl shadow-sm mr-2">
                <button 
                  onClick={() => setActiveTab('general')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'general' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <LayoutDashboard className="w-3 h-3" />
                  <span>Geral</span>
                </button>
                <button 
                  onClick={() => setActiveTab('distribution')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'distribution' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Users className="w-3 h-3" />
                  <span>Lucros</span>
                </button>
              </div>

              {hasExportPermission && (
                <>
                  <button 
                    onClick={exportToPDF}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                  >
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span>PDF</span>
                  </button>
                  <button 
                    onClick={exportToExcel}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl shadow-slate-200 translate-y-0 active:translate-y-0.5 transform"
                  >
                    <Download className="w-4 h-4 text-slate-400" />
                    <span>Excel</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {activeTab === 'general' ? (
            <>
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

              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
                <ExpenseDetailsTable transactions={filteredTransactions} registries={registries} />
              </div>
            </>
          ) : (
            <div className="animate-in fade-in zoom-in-95 duration-500">
              <ProfitDistributionReport transactions={transactions} registries={registries} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ReportsDashboard;
