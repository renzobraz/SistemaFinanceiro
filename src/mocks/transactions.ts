export interface Transaction {
  id: string;
  date: string;
  description: string;
  value: number;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  costCenter: string;
  participant: string;
}

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: '1', date: '2024-05-01', description: 'Pró-labore Mensal', value: 25000.00, type: 'INCOME', category: 'Trabalho', costCenter: 'Pessoal', participant: 'Renzo Amaral' },
  { id: '2', date: '2024-05-02', description: 'Fatura Cartão Black - Nubank', value: 8540.20, type: 'EXPENSE', category: 'Cartão de Crédito', costCenter: 'Geral', participant: 'Renzo Amaral' },
  { id: '3', date: '2024-05-05', description: 'Rendimentos Dividendos - Carteira', value: 3450.00, type: 'INCOME', category: 'Investimentos', costCenter: 'Financeiro', participant: 'Renzo Amaral' },
  { id: '4', date: '2024-05-10', description: 'Suplementos Whey / Creatina', value: 450.00, type: 'EXPENSE', category: 'Saúde', costCenter: 'Pessoal', participant: 'Renzo Amaral' },
  { id: '5', date: '2024-05-12', description: 'Restaurante D.O.M - Jantar', value: 1200.00, type: 'EXPENSE', category: 'Lazer', costCenter: 'Lazer', participant: 'Renzo Amaral' },
  { id: '6', date: '2024-05-15', description: 'Mensalidade Pilates', value: 380.00, type: 'EXPENSE', category: 'Saúde', costCenter: 'Pessoal', participant: 'Renzo Amaral' },
  { id: '7', date: '2024-05-18', description: 'Smartwatch Apple Watch Ultra', value: 5400.00, type: 'EXPENSE', category: 'Eletrônicos', costCenter: 'Geral', participant: 'Renzo Amaral' },
  { id: '8', date: '2024-05-20', description: 'Adega - Seleção Vinhos Tintos', value: 2100.00, type: 'EXPENSE', category: 'Lazer', costCenter: 'Lazer', participant: 'Renzo Amaral' },
  { id: '9', date: '2024-05-25', description: 'Viagem Paris - Hotel Plaza', value: 12500.00, type: 'EXPENSE', category: 'Viagens', costCenter: 'Lazer', participant: 'Renzo Amaral' },
  
  { id: '10', date: '2024-04-01', description: 'Pró-labore Mensal', value: 25000.00, type: 'INCOME', category: 'Trabalho', costCenter: 'Pessoal', participant: 'Renzo Amaral' },
  { id: '11', date: '2024-04-10', description: 'Seguro Saúde Familiar', value: 2800.00, type: 'EXPENSE', category: 'Saúde', costCenter: 'Geral', participant: 'Renzo Amaral' },
  { id: '12', date: '2024-04-15', description: 'Compra TV 75 OLED Samsung', value: 8900.00, type: 'EXPENSE', category: 'Eletrônicos', costCenter: 'Moradia', participant: 'Renzo Amaral' },
  { id: '13', date: '2024-04-20', description: 'Dividendos Petrobras', value: 1200.00, type: 'INCOME', category: 'Investimentos', costCenter: 'Financeiro', participant: 'Renzo Amaral' },
  { id: '14', date: '2024-04-25', description: 'Aluguel Garagem Coletiva', value: 600.00, type: 'EXPENSE', category: 'Moradia', costCenter: 'Geral', participant: 'Renzo Amaral' },
  
  { id: '15', date: '2024-03-01', description: 'Pró-labore Mensal', value: 25000.00, type: 'INCOME', category: 'Trabalho', costCenter: 'Pessoal', participant: 'Renzo Amaral' },
  { id: '16', date: '2024-03-05', description: 'Manutenção Carro - Revisão', value: 1800.00, type: 'EXPENSE', category: 'Transporte', costCenter: 'Geral', participant: 'Renzo Amaral' },
  { id: '17', date: '2024-03-15', description: 'Viagem Buenos Aires - Passagens', value: 4500.00, type: 'EXPENSE', category: 'Viagens', costCenter: 'Lazer', participant: 'Renzo Amaral' },
  { id: '18', date: '2024-03-25', description: 'Rendimentos FIIs Mensais', value: 2100.50, type: 'INCOME', category: 'Investimentos', costCenter: 'Financeiro', participant: 'Renzo Amaral' },
];
