
export type TransactionType = 'CREDIT' | 'DEBIT';
export type TransactionStatus = 'PAID' | 'PENDING';

export interface BaseEntity {
  id: string;
  name: string;
}

export interface Bank extends BaseEntity {}
export interface Category extends BaseEntity {}
export interface CostCenter extends BaseEntity {}
export interface Participant extends BaseEntity {}
export interface Wallet extends BaseEntity {
  bankId?: string; // Vínculo com banco
}

export interface Transaction {
  id: string;
  date: string; // ISO Date
  description: string;
  docNumber: string;
  value: number;
  type: TransactionType;
  status: TransactionStatus;
  
  // Relations
  bankId: string;
  categoryId: string;
  participantId: string;
  costCenterId: string;
  walletId: string;

  // Link for transfers
  linkedId?: string;
}

export interface FinancialSummary {
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  pendingIncome: number;
  pendingExpense: number;
}
