
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
export interface AssetType extends BaseEntity {}
export interface AssetSector extends BaseEntity {}
export interface AssetTicker extends BaseEntity {
  ticker: string;
}
export interface Participant extends BaseEntity {
  category?: string; // Ex: 'Ação', 'FII', 'ETF', 'Cripto'
  sector?: string;   // Ex: 'Tecnologia', 'Financeiro', 'Energia'
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
  createdAt?: string;
}

export type DateRangeOption = 'CURRENT_MONTH' | 'CURRENT_WEEK' | 'LAST_3_DAYS' | 'TODAY' | 'LAST_30_DAYS' | 'PREVIOUS_MONTH' | 'ALL';

export interface UserPreferences {
  defaultDateRange: DateRangeOption;
  defaultStatus: 'ALL' | 'PENDING' | 'PAID';
  defaultBankId: string;
  defaultWalletId: string;
  defaultPerformanceBankId?: string;
  defaultPerformanceWalletId?: string;
  defaultTab?: string;
}

export interface FinancialSummary {
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  pendingIncome: number;
  pendingExpense: number;
}

export interface UserPermission {
  id: string;
  owner_id: string;
  invited_email: string;
  status: 'pending' | 'active';
  role: 'viewer' | 'editor' | 'admin';
  created_at: string;
}

export interface SmtpSettings {
  id?: string;
  user_id?: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  from_name: string;
  from_email: string;
}

export interface BrokerageTrade {
  ticker: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  total: number;
  assetName: string;
}

export interface BrokerageNote {
  metadata: {
    date: string;
    noteNumber: string;
    liquidValue: number;
    settlementDate: string;
    isCredit?: boolean;
  };
  summary?: {
    totalSales: number;
    totalPurchases: number;
    clearingFees: number;
    exchangeFees: number;
    brokerage: number;
    taxes: number;
    otherCosts: number;
  };
  trades: BrokerageTrade[];
  costs: {
    total: number;
    details: string;
  };
}
