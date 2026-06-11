// types.ts - Definições de tipos globais do FinControl Pro adaptado para Multi-Tenant

export type TransactionType = 'CREDIT' | 'DEBIT';
export type TransactionStatus = 'PAID' | 'PENDING';

// Interface das organizações (empresas) do sistema
export interface Organization {
  id: string;
  name: string;
  slug: string; // Identificador amigável na URL, ex: "empresa-abc"
  owner_id: string; // ID do criador/dono da organização que referencia auth.users
  plan: 'free' | 'basic' | 'premium' | string;
  active: boolean;
  created_at: string;
}

// Interface dos membros vinculados a cada organização
export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  invited_by?: string | null;
  created_at: string;
}

// Entidade base com suporte a multi-tenant (organization_id)
export interface BaseEntity {
  id: string;
  name: string;
  active?: boolean;
  walletId?: string;
  organization_id?: string; // Isolamento multi-tenant
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
  sinacorName?: string; // Nome oficial B3/Sinacor (ex: FII KINEA UN CI)
  currency?: Currency; // Moeda do ativo
  currentPrice?: number; // Preço atual (mercado)
  targetPrice?: number;  // Preço alvo para compra/venda
  lastUpdate?: string;   // Data da última atualização de preço
  isPartner?: boolean;   // Se este participante é um sócio para distribuição
  sharePercent?: number; // % de participação padrão
  cashSharePercent?: number; // % de participação específica para Caixa
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
  
  // Isolamento multi-tenant
  organization_id?: string;

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
  notes?: string;

  // Link for transfers
  linkedId?: string;
  createdAt?: string;
  managedPortfolioId?: string;
  importBatchId?: string;
}

export interface AssetAccrual {
  id: string;
  assetId: string;
  bankId?: string;
  date: string;
  value: number;
  description: string;
  createdAt?: string;
  organization_id?: string; // Isolamento multi-tenant
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
  organization_id?: string; // Isolamento multi-tenant nas preferências
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
  organization_id?: string; // Isolamento multi-tenant
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
  organization_id?: string; // Isolamento multi-tenant
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
    expectedTradesCount?: number;
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

// ---- Importação de fatura de cartão (genérico, multi-emissor) ----
export interface CardStatementItem {
  rawDescription: string;     // estabelecimento como aparece na fatura
  purchaseDate: string;       // ISO YYYY-MM-DD (ano inferido pela data de fechamento)
  value: number;              // sempre positivo
  isRefund: boolean;          // true para estornos/créditos
  installmentNumber?: number; // ex.: 9 (de "09/10")
  installmentTotal?: number;  // ex.: 10
}

export interface CardSection {
  cardLast4: string;
  holderName: string;
  printedTotal: number;       // total impresso do cartão (vindo da IA)
  anchorTotal?: number;       // total do mesmo cartão extraído por regex (fonte confiável)
  parsedTotal: number;        // soma dos itens (positivos - refunds)
  totalsMatch: boolean;       // parsedTotal bate com anchorTotal||printedTotal (tol. R$0,02)
  items: CardStatementItem[];
}

export interface CardStatement {
  issuer: string;             // ex.: "Itau" (a IA identifica)
  metadata: {
    dueDate: string;          // vencimento (ISO)
    closingDate: string;      // fechamento/emissão (ISO)
    statementTotal: number;   // "Total dos lançamentos atuais" (impresso)
  };
  cards: CardSection[];
  grandParsedTotal: number;
  grandAnchorTotal: number;   // total geral via regex (confiável)
  grandTotalsMatch: boolean;
}

export interface MerchantAlias {
  id: string;
  organizationId: string;
  rawPattern: string;
  canonicalName: string;
  defaultCategoryId?: string| null;
  defaultCostCenterId?: string | null;
  active?: boolean;
}

// ---- Conciliação fatura × Contas a Pagar ----
export type MatchConfidence = 'HIGH' | 'LOW' | 'NONE';

export interface CandidateMatch {
  transaction: Transaction;   // transação PENDING do Contas a Pagar
  confidence: MatchConfidence;
  reason: string;             // ex.: "Valor exato + nome similar (Mercado Livre)"
  similarityScore: number;    // 0.0 a 1.0 (para ordenação)
}

export interface ReconciliationItem {
  statementItem: CardStatementItem;
  cardLast4: string;
  candidates: CandidateMatch[];     // vazio = nenhum candidato (NEW)
  status: 'MATCHED' | 'UNCERTAIN' | 'NEW';
  // 'MATCHED'   → ≥1 candidato com confiança HIGH
  // 'UNCERTAIN' → ≥1 candidato com confiança LOW, nenhum HIGH
  // 'NEW'       → sem candidatos
}

export interface ReconciliationResult {
  items: ReconciliationItem[];
  matchedCount: number;
  uncertainCount: number;
  newCount: number;
}

