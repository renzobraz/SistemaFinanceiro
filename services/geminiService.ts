
import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: any = null;

function getAi() {
  try {
    // Tenta primeiro o padrão do Vite (Vercel) e depois o padrão do Node
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
      console.warn("GEMINI_API_KEY ou VITE_GEMINI_API_KEY não definida. Recursos de IA desativados.");
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
  async fetchAssetPrices(tickers: string[], force: boolean = false): Promise<{prices: Record<string, number>, timestamp: number}> {
    if (tickers.length === 0) return { prices: {}, timestamp: Date.now() };
    
    // Tenta cache primeiro
    if (!force) {
      const cached = getCachedDataFull<Record<string, number>>(CACHE_KEYS.ASSET_PRICES, CACHE_EXPIRY.ASSET_PRICES);
      if (cached) {
        const allPresent = tickers.every(t => cached.data[t] !== undefined);
        if (allPresent) return { prices: cached.data, timestamp: cached.timestamp };
      }
    }

    try {
      const ai = getAi();
      if (!ai) throw new Error("Gemini API Key missing");
      const prompt = `Forneça o preço de fechamento mais recente (ou cotação atual) para os seguintes ativos: ${tickers.join(', ')}. 
      Use o Google Finance como fonte principal para garantir a precisão dos valores de HOJE.
      Retorne APENAS um objeto JSON onde as chaves são os tickers e os valores são os preços numéricos. 
      Exemplo: {"PETR4": 36.50, "AAPL": 185.40}`;

      const model = ai.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });

      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearchRetrieval: {} } as any]
      });

      const text = response.response.text();
      if (text) {
        try {
          const cleanedText = text.replace(/```json|```/g, '').trim();
          const data = JSON.parse(cleanedText);
          
          // Mescla com cache existente
          const existingRaw = localStorage.getItem(CACHE_KEYS.ASSET_PRICES);
          const existing = existingRaw ? JSON.parse(existingRaw).data : {};
          const merged = { ...existing, ...data };
          setCachedData(CACHE_KEYS.ASSET_PRICES, merged);
          
          return { prices: data, timestamp: Date.now() };
        } catch (e) {
          console.error("Erro ao parsear JSON de preços", e);
        }
      }
    } catch (error: any) {
      if (error.status === 429 || error.message?.includes('429')) {
        console.warn("Limite de cota Gemini atingido para preços. Usando cache/fallback.");
      } else {
        console.error("Erro ao buscar preços via Gemini", error);
      }
      
      // Se for erro de quota, tenta retornar o que tem no cache mesmo expirado
      const stale = localStorage.getItem(CACHE_KEYS.ASSET_PRICES);
      if (stale) {
        try { 
          const parsed = JSON.parse(stale);
          return { prices: parsed.data, timestamp: parsed.timestamp }; 
        } catch(e) {}
      }
    }

    // Fallback para mock se falhar
    const mockPrices: Record<string, number> = {
      'PETR4': 36.50,
      'VALE3': 68.20,
      'ITUB4': 32.15,
      'AAPL': 185.40,
      'TSLA': 175.20,
      'BTC': 345000.00,
      'ETH': 18500.00
    };

    const result: Record<string, number> = {};
    tickers.forEach(t => {
      result[t] = mockPrices[t] || (10 + Math.random() * 90);
    });

    return { prices: result, timestamp: Date.now() };
  },

  async getInvestmentSuggestions(assets: any[]): Promise<InvestmentSuggestion[]> {
    if (assets.length === 0) return [];

    try {
      const ai = getAi();
      if (!ai) throw new Error("Gemini API Key missing");
      const assetsSummary = assets.map(a => `${a.ticker}: Preço Médio ${a.averagePrice}, Preço Atual ${a.lastPrice || 'N/A'}, Qtd ${a.currentQuantity}`).join('\n');
      const prompt = `Analise os seguintes ativos da minha carteira e dê sugestões de COMPRA, VENDA ou MANUTENÇÃO (HOLD) com base no cenário atual do mercado:
      ${assetsSummary}
      
      Retorne um array de objetos JSON com: ticker, action, reason (em português), riskLevel (LOW, MEDIUM, HIGH).`;

      const model = ai.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });

      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearchRetrieval: {} } as any]
      });

      const text = response.response.text();
      if (text) {
        try {
          const cleanedText = text.replace(/```json|```/g, '').trim();
          return JSON.parse(cleanedText);
        } catch (e) {
          console.error("Erro ao parsear sugestões", e);
        }
      }
    } catch (error: any) {
      if (error.status === 429 || error.message?.includes('429')) {
        console.warn("Limite de cota Gemini atingido para sugestões.");
      } else {
        console.error("Erro ao buscar sugestões via Gemini", error);
      }
    }

    return assets.map(a => ({
      ticker: a.ticker,
      action: 'HOLD',
      reason: "Análise indisponível no momento. Verifique sua conexão.",
      riskLevel: 'MEDIUM'
    }));
  },

  async getExchangeRates(force: boolean = false): Promise<{rates: Record<string, number>, timestamp: number}> {
    // Tenta cache primeiro
    if (!force) {
      const cached = getCachedDataFull<Record<string, number>>(CACHE_KEYS.EXCHANGE_RATES, CACHE_EXPIRY.EXCHANGE_RATES);
      if (cached) return { rates: cached.data, timestamp: cached.timestamp };
    }

    try {
      const ai = getAi();
      if (!ai) throw new Error("Gemini API Key missing");
      const today = new Date().toLocaleDateString('pt-BR');
      const prompt = `Hoje é dia ${today}. Forneça a cotação ATUAL E REAL (tempo real) do Dólar (USD), Euro (EUR), Libra (GBP) em relação ao Real Brasileiro (BRL).
      Use o Google Finance ou fontes de câmbio em tempo real para garantir que os valores são de HOJE.
      Retorne APENAS um objeto JSON com as taxas de câmbio onde 1 unidade da moeda estrangeira vale X Reais.
      Exemplo: {"BRL": 1, "USD": 5.15, "EUR": 5.55, "GBP": 6.45}.`;

      const model = ai.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });

      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearchRetrieval: {} } as any]
      });

      const text = response.response.text();
      if (text) {
        try {
          const cleanedText = text.replace(/```json|```/g, '').trim();
          const data = JSON.parse(cleanedText);
          setCachedData(CACHE_KEYS.EXCHANGE_RATES, data);
          return { rates: data, timestamp: Date.now() };
        } catch (e) {
          console.error("Erro ao parsear taxas de câmbio", e);
        }
      }
    } catch (error: any) {
      if (error.status === 429 || error.message?.includes('429')) {
        console.warn("Limite de cota Gemini atingido para câmbio. Usando cache/fallback.");
      } else {
        console.error("Erro ao buscar taxas via Gemini", error);
      }
      
      // Se for erro de quota, tenta retornar o que tem no cache mesmo expirado
      const stale = localStorage.getItem(CACHE_KEYS.EXCHANGE_RATES);
      if (stale) {
        try { 
          const parsed = JSON.parse(stale);
          return { rates: parsed.data, timestamp: parsed.timestamp }; 
        } catch(e) {}
      }
    }

    return { rates: { BRL: 1, USD: 5.15, EUR: 5.60, GBP: 6.55 }, timestamp: Date.now() };
  }
};
