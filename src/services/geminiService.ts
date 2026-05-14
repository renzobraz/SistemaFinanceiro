import { GoogleGenAI } from "@google/genai";
import { Transaction, Bank, Category, CostCenter, Participant, Wallet } from "../../types";
import currency from 'currency.js';

interface AnalysisData {
  transactions: Transaction[];
  registries: {
    banks: Bank[];
    categories: Category[];
    costCenters: CostCenter[];
    participants: Participant[];
    wallets: Wallet[];
  };
}

export const getAIInsights = async (data: AnalysisData): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Preparar os dados para o prompt para reduzir tokens e ser mais claro
  const summary = {
    totalTransactions: data.transactions.length,
    income: data.transactions
      .filter(t => t.type === 'CREDIT')
      .reduce((acc, t) => currency(acc).add(t.value).value, 0),
    expense: data.transactions
      .filter(t => t.type === 'DEBIT')
      .reduce((acc, t) => currency(acc).add(t.value).value, 0),
    byCategory: data.transactions
      .filter(t => t.type === 'DEBIT')
      .reduce((acc: Record<string, number>, t) => {
        const catName = data.registries.categories.find(c => c.id === t.categoryId)?.name || 'Outras';
        acc[catName] = currency(acc[catName] || 0).add(t.value).value;
        return acc;
      }, {}),
    byCostCenter: data.transactions
      .filter(t => t.type === 'DEBIT')
      .reduce((acc: Record<string, number>, t) => {
        const name = data.registries.costCenters.find(c => c.id === t.costCenterId)?.name || 'Outros';
        acc[name] = currency(acc[name] || 0).add(t.value).value;
        return acc;
      }, {})
  };

  const prompt = `
    Como um consultor financeiro pessoal especialista, analise os seguintes dados financeiros do período:
    
    RESUMO GERAL:
    - Receitas Totais: R$ ${summary.income}
    - Despesas Totais: R$ ${summary.expense}
    - Saldo do Período: R$ ${currency(summary.income).subtract(summary.expense).value}
    
    DESPESAS POR CATEGORIA:
    ${Object.entries(summary.byCategory).map(([name, val]) => `- ${name}: R$ ${val}`).join('\n')}
    
    DESPESAS POR CENTRO DE CUSTO:
    ${Object.entries(summary.byCostCenter).map(([name, val]) => `- ${name}: R$ ${val}`).join('\n')}
    
    REQUISITOS DA ANÁLISE:
    1. Seja direto, prático e motivador.
    2. Identifique os 3 maiores gastos e sugira formas de otimização.
    3. Comente sobre a saúde financeira (relação receita x despesa).
    4. Dê uma dica "fora da caixa" baseada nos centros de custo.
    5. Use Markdown para formatar (negrito, tópicos).
    6. Responda em Português do Brasil.
    7. Limite a resposta a no máximo 300 palavras.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "Não foi possível gerar insights no momento.";
  } catch (error) {
    console.error("Erro ao chamar Gemini:", error);
    return "Ocorreu um erro ao processar seus insights inteligentes. Verifique sua conexão ou chave de API.";
  }
};
