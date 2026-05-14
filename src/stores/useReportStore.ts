import { create } from 'zustand';
import { startOfMonth, endOfMonth, format } from 'date-fns';

interface ReportFilters {
  startDate: string;
  endDate: string;
  participantId: string;
  costCenterId: string;
  walletId: string;
  bankId: string;
  categoryId: string;
  excludeTransfers: boolean;
  setFilters: (filters: Partial<Omit<ReportFilters, 'setFilters'>>) => void;
  resetFilters: () => void;
}

export const useReportStore = create<ReportFilters>((set) => ({
  startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  participantId: 'ALL',
  costCenterId: 'ALL',
  walletId: 'ALL',
  bankId: 'ALL',
  categoryId: 'ALL',
  excludeTransfers: true,
  setFilters: (newFilters) => set((state) => ({ ...state, ...newFilters })),
  resetFilters: () => set({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    participantId: 'ALL',
    costCenterId: 'ALL',
    walletId: 'ALL',
    bankId: 'ALL',
    categoryId: 'ALL',
    excludeTransfers: true,
  }),
}));
