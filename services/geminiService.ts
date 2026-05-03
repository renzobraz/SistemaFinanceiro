
import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: any = null;

function getAi() {
  try {
    // Segue estritamente a recomendação da Skill para React (Vite)
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
      console.warn("GEMINI_API_KEY não definida. Recursos de IA desativados.");
      return null;
    }
    if (!aiInstance) {
      aiInstance = new GoogleGenAI({ apiKey });
    }
    return aiInstance;
  } catch (e) {
    console.error("Error initializing Gemini SDK", e);
    return null;
  }
}

export interface AssetPrice {
  ticker: string;
  price: number;
  currency: string;
  name: string;
}

export interface InvestmentSuggestion {
  ticker: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  reason: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

const CACHE_KEYS = {
  EXCHANGE_RATES: 'fincontrol_cache_rates',
  ASSET_PRICES: 'fincontrol_cache_prices',
};

const CACHE_EXPIRY = {
  EXCHANGE_RATES: 60 * 60 * 1000, // 1 hora
  ASSET_PRICES: 15 * 60 * 1000,   // 15 minutos
};

const STRINGS_PARA_SILENCIAR = [
  'subErrors',
  'validation failed',
  'Failed validation',
  'yahoo-finance2',
  'QuoteResponseArray',
  'QuoteSummaryResult'
];

function cleanErrorMessage(error: any): string {
  let msg = typeof error === 'string' ? error : (error?.message || String(error));
  if (STRINGS_PARA_SILENCIAR.some(s => msg.includes(s))) {
    return msg.split('\n')[0].split('https://')[0].split('{')[0].trim() || "Erro na consulta de dados financeiros";
  }
  return msg;
}

interface CachedResult<T> {
  data: T;
  timestamp: number;
}

function getCachedDataFull<T>(key: string, expiry: number): CachedResult<T> | null {
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  
  try {
    const parsed = JSON.parse(cached);
    const { data, timestamp } = parsed;
    if (Date.now() - timestamp < expiry) {
      return { data, timestamp };
    }
  } catch (e) {
    localStorage.removeItem(key);
  }
  return null;
}

function getCachedData<T>(key: string, expiry: number): T | null {
  return getCachedDataFull<T>(key, expiry)?.data || null;
}

function setCachedData(key: string, data: any) {
  localStorage.setItem(key, JSON.stringify({
    data,
    timestamp: Date.now()
  }));
}

export const geminiService = {
  async fetchAssetPrices(tickers: string[], force: boolean = false): Promise<{prices: Record<string, { current: number; target: number | null }>, timestamp: number}> {
    if (tickers.length === 0) return { prices: {}, timestamp: Date.now() };
    
    // Tenta cache primeiro
    if (!force) {
      const cached = getCachedDataFull<Record<string, { current: number; target: number | null }>>(CACHE_KEYS.ASSET_PRICES, CACHE_EXPIRY.ASSET_PRICES);
      if (cached) {
        const allPresent = tickers.every(t => cached.data[t] !== undefined);
        if (allPresent) return { prices: cached.data, timestamp: cached.timestamp };
      }
    }

    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // BUSCA REAL: Chama o nosso novo backend que consulta o Yahoo Finance
        // Adiciona um timestamp para evitar cache do navegador
        const response = await fetch(`/api/prices?tickers=${encodeURIComponent(tickers.join(","))}&_t=${Date.now()}`);
        
        const contentType = response.headers.get("content-type");
        
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
          const text = (await response.text()).substring(0, 500);
          
          if (text.includes("Starting Server...") || (response.status === 200 && text.includes("<!DOCTYPE html>"))) {
            console.warn(`Attempt ${attempt + 1}: Backend ainda iniciando ou retornando HTML. Retentando em 2s...`);
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          
          throw new Error(`Falha ao buscar preços reais: Status ${response.status}${!contentType?.includes("application/json") ? " (Não-JSON)" : ""}`);
        }
        
        const sanitizedData = await response.json();
        
        // Mescla apenas dados válidos com o cache existente
        const existingRaw = localStorage.getItem(CACHE_KEYS.ASSET_PRICES);
        const existing = existingRaw ? JSON.parse(existingRaw).data : {};
        
        const validDataToCache: Record<string, any> = {};
        Object.entries(sanitizedData).forEach(([t, val]: [string, any]) => {
          if (val && val.current !== null) {
            validDataToCache[t] = val;
          }
        });

        const merged = { ...existing, ...validDataToCache };
        setCachedData(CACHE_KEYS.ASSET_PRICES, merged);
        
        return { prices: sanitizedData, timestamp: Date.now() };
      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${attempt + 1} failed:`, cleanErrorMessage(error));
        if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, 1500));
      }
    }

    console.error("Todas as tentativas de buscar preços falharam:", cleanErrorMessage(lastError));
    
    // Se falhar o real após retentativas, tenta o cache mesmo expirado
    const stale = localStorage.getItem(CACHE_KEYS.ASSET_PRICES);
    if (stale) {
      try { 
        const parsed = JSON.parse(stale);
        return { prices: parsed.data, timestamp: parsed.timestamp }; 
      } catch(e) {}
    }

    return { prices: {}, timestamp: Date.now() };
  },

  async fetchAssetHistory(ticker: string): Promise<{date: string, close: number}[]> {
    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`/api/history?ticker=${encodeURIComponent(ticker)}&_t=${Date.now()}`);
        
        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
          const text = (await response.text()).substring(0, 500);
          
          if (text.includes("Starting Server...") || (response.status === 200 && text.includes("<!DOCTYPE html>"))) {
            console.warn(`Attempt ${attempt + 1}: Backend history ainda iniciando. Retentando em 2s...`);
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw new Error(`Falha ao buscar histórico: Status ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        lastError = error;
        console.warn(`History attempt ${attempt + 1} failed:`, cleanErrorMessage(error));
        if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, 1500));
      }
    }

    console.error("Erro ao buscar histórico após retentativas:", cleanErrorMessage(lastError));
    return [];
  },

  async getInvestmentSuggestions(assets: any[]): Promise<InvestmentSuggestion[]> {
    if (assets.length === 0) return [];

    const ai = getAi();
    // Se não tiver IA, apenas retorna HOLD sem inventar
    if (!ai) return assets.map(a => ({
      ticker: a.ticker,
      action: 'HOLD',
      reason: "IA não configurada para sugestões.",
      riskLevel: 'MEDIUM'
    }));

    const assetsSummary = assets.map(a => `${a.ticker}: Avg Price ${a.averagePrice}, Current Price ${a.lastPrice || 'N/A'}, Qty ${a.currentQuantity}`).join('\n');
    const prompt = `Analyze the following assets in my portfolio and provide BUY, SELL, or HOLD suggestions based on the current market scenario:
    ${assetsSummary}
    
    Return a JSON array of objects with: ticker, action, reason (in Portuguese), riskLevel (LOW, MEDIUM, HIGH).`;

    try {
      // Para sugestões, o Gemini ainda é ótimo, mas agora usamos sem a ferramenta de busca 
      // para evitar o erro 403, já que os preços já são reais vindos do Yahoo
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
          systemInstruction: "You are an expert financial analyst. Analyze the provided prices and quantities. Always respond with 'reason' in Portuguese."
        }
      });

      const text = response.text;
      if (text) {
        const cleanedText = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanedText);
      }
    } catch (error) {
      console.error("Erro ao buscar sugestões via Gemini:", error);
    }

    return assets.map(a => ({
      ticker: a.ticker,
      action: 'HOLD',
      reason: "Análise indisponível no momento.",
      riskLevel: 'MEDIUM'
    }));
  },

  async getExchangeRates(force: boolean = false): Promise<{rates: Record<string, number>, timestamp: number}> {
    if (!force) {
      const cached = getCachedDataFull<Record<string, number>>(CACHE_KEYS.EXCHANGE_RATES, CACHE_EXPIRY.EXCHANGE_RATES);
      if (cached) return { rates: cached.data, timestamp: cached.timestamp };
    }

    try {
      // BUSCA REAL: Usa uma API pública de câmbio (ExchangeRate-API) que é gratuita e precisa
      const response = await fetch("https://api.exchangerate-api.com/v4/latest/BRL");
      if (!response.ok) throw new Error("Falha ao buscar taxas de câmbio");
      
      const data = await response.json();
      const rates = data.rates;
      
      // A API retorna quanto 1 Real vale em outras moedas (ex: USD: 0.19)
      // Precisamos inverter para saber quanto 1 Moeda Estrangeira vale em Reais
      const sanitizedRates: Record<string, number> = {
        BRL: 1,
        USD: Number((1 / rates.USD).toFixed(4)),
        EUR: Number((1 / rates.EUR).toFixed(4)),
        GBP: Number((1 / rates.GBP).toFixed(4))
      };

      setCachedData(CACHE_KEYS.EXCHANGE_RATES, sanitizedRates);
      return { rates: sanitizedRates, timestamp: Date.now() };
    } catch (error) {
      console.error("Erro ao buscar taxas de câmbio reais:", error);
      
      const stale = localStorage.getItem(CACHE_KEYS.EXCHANGE_RATES);
      if (stale) {
        try { 
          const parsed = JSON.parse(stale);
          return { rates: parsed.data, timestamp: parsed.timestamp }; 
        } catch(e) {}
      }
    }

    return { rates: { BRL: 1, USD: 5.15, EUR: 5.60, GBP: 6.55 }, timestamp: Date.now() };
  },

  async parseTransaction(description: string): Promise<any> {
    const ai = getAi();
    if (!ai) return null;
    
    const prompt = `Analise a seguinte descrição de transação bancária e extraia os dados em JSON:
    "${description}"
    
    Campos necessários:
    - description: Uma descrição limpa.
    - amount: O valor numérico (positivo).
    - type: 'INCOME' ou 'EXPENSE'.
    - category: Uma categoria provável (ex: Alimentação, Transporte, Lazer, etc).
    - participant: Nome da empresa ou pessoa envolvida.
    
    Responda APENAS o JSON puro.`;
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      return JSON.parse(response.text.replace(/```json|```/g, '').trim());
    } catch (e) {
      return null;
    }
  },

  async parseBrokerageNote(fileBase64: string, mimeType: string): Promise<any> {
    const ai = getAi();
    if (!ai) throw new Error("IA não configurada.");
    
    const prompt = `Analise esta Nota de Corretagem (Padrão SINACOR) e extraia os dados de forma estruturada em JSON.
    
    ESTRUTURA DESEJADA:
    {
      "metadata": { 
        "date": "YYYY-MM-DD", 
        "noteNumber": "string", 
        "liquidValue": number, 
        "settlementDate": "YYYY-MM-DD",
        "isCredit": boolean (true se o valor líquido for C, false se for D)
      },
      "summary": {
        "totalSales": number,
        "totalPurchases": number,
        "clearingFees": number,
        "exchangeFees": number,
        "brokerage": number,
        "taxes": number,
        "otherCosts": number
      },
      "trades": Array de [{ 
         "ticker": "string", 
         "type": "BUY" | "SELL", 
         "quantity": number, 
         "price": number, 
         "total": number, 
         "assetName": "string" 
       }],
      "costs": { "total": number, "details": "string" }
    }

    INSTRUÇÕES CRÍTICAS PARA NOTAS LONGAS:
    - Esta nota pode ter MUITAS páginas ou linhas. NÃO OMITA NENHUMA LINHA de "Negócios Realizados".
    - Se a tabela de negócios continuar em outra página, continue extraindo todos os itens.
    - O "liquidValue" deve ser o valor exato encontrado no campo "Líquido para [Data]" ou "Total Líquido da Nota".
    - "totalSales" é a soma de todos os itens com 'V' (Venda).
    - "totalPurchases" é a soma de todos os itens com 'C' (Compra).
    - "costs.total" deve ser a soma de TODAS as taxas (Liquidação, Registro, Emolumentos, Corretagem, ISS, IRRF).
    
    REGRAS DE VALIDAÇÃO:
    - O valor de cada linha deve ser (quantidade * preço).
    - O valor líquido final deve ser (Vendas - Compras - Taxas). Se vendas > compras+taxas, é Crédito (C). Caso contrário, Débito (D).
    
    Responda APENAS o JSON puro.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { inlineData: { data: fileBase64, mimeType } },
          prompt
        ],
        config: { 
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });

      const rawText = response.text || "";
      
      // Limpeza profunda para encontrar o bloco JSON
      let cleanedText = rawText.trim();
      
      // Remove blocos de código se existirem
      if (cleanedText.includes("```")) {
        cleanedText = cleanedText.replace(/```json|```/g, "").trim();
      }
      
      // Tenta localizar o primeiro '{' e o último '}' para garantir que temos apenas o objeto
      const firstBrace = cleanedText.indexOf("{");
      const lastBrace = cleanedText.lastIndexOf("}");
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
      }

      try {
        return JSON.parse(cleanedText);
      } catch (parseError) {
        console.error("Erro de parse inicial, tentando limpeza agressiva:", parseError);
        // Tenta remover possíveis comentários ou vírgulas pendentes que quebram o JSON
        const aggressiveClean = cleanedText
          .replace(/,\s*([\]}])/g, "$1") // Remove vírgulas antes de fechar colchetes/chaves
          .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, ""); // Remove comentários
        
        return JSON.parse(aggressiveClean);
      }
    } catch (e: any) {
      console.error("Erro ao processar nota com Gemini:", e);
      throw new Error(`Falha no processamento: ${e.message || "IA retornou dados inválidos"}. Tente subir apenas uma página por vez se a nota for muito grande.`);
    }
  }
};
