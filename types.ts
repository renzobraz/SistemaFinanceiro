
export type TransactionType = 'CREDIT' | 'DEBIT';
export type TransactionStatus = 'PAID' | 'PENDING';

export interface BaseEntity {
  id: string;
  name: string;
}

export interface Bank extends BaseEntity {
  currency: Currency;
  type: WalletType;
}
export interface Category extends BaseEntity {}
export interface CostCenter extends BaseEntity {}
export interface Participant extends BaseEntity {
  category?: string; // Ex: 'Ação', 'FII', 'ETF', 'Cripto'
  ticker?: string;   // Símbolo (ex: PETR4, AAPL)
  currency?: Currency; // Moeda do ativo
  currentPrice?: number; // Preço atual (mercado)
  targetPrice?: number;  // Preço alvo para compra/venda
  lastUpdate?: string;   // Data da última atualização de preço
}
export type Currency = 'BRL' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CHF' | 'CAD' | 'AUD' | 'CNY';

export type WalletType = 'CHECKING' | 'INVESTMENT';

export interface Wallet extends BaseEntity {}

export interface Transaction {
  id: string;
  date: string; // ISO Date
  description: string;
  docNumber: string;
  value: number;
  quantity?: number;
  unitPrice?: number;
  type: TransactionType;
  status: TransactionStatus;
  
  // Exchange fields (for transfers between different currencies)
  exchangeRate?: number; // Cotação comercial
  spread?: number;       // Margem do banco (%)
  iof?: number;          // Imposto (%)
  vet?: number;          // Valor Efetivo Total
  originalValue?: number; // Valor na moeda de origem
  originalCurrency?: Currency;

  // Relations
  bankId: string;
  categoryId: string;
  participantId: string;
  costCenterId: string;
  walletId: string;

  // Link for transfers
  linkedId?: string;
}

export type DateRangeOption = 'CURRENT_MONTH' | 'CURRENT_WEEK' | 'LAST_3_DAYS' | 'TODAY' | 'LAST_30_DAYS' | 'PREVIOUS_MONTH' | 'ALL';

export interface UserPreferences {
  defaultDateRange: DateRangeOption;
  defaultStatus: 'ALL' | 'PENDING' | 'PAID';
  defaultBankId: string;
  defaultWalletId: string;
}

export interface FinancialSummary {
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  pendingIncome: number;
  pendingExpense: number;
}
