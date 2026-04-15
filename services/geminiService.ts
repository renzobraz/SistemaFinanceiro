
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
      // BUSCA REAL: Chama o nosso novo backend que consulta o Yahoo Finance
      const response = await fetch(`/api/prices?tickers=${tickers.join(",")}`);
      if (!response.ok) throw new Error("Falha ao buscar preços reais");
      
      const sanitizedData = await response.json();
      
      // Mescla com cache existente
      const existingRaw = localStorage.getItem(CACHE_KEYS.ASSET_PRICES);
      const existing = existingRaw ? JSON.parse(existingRaw).data : {};
      const merged = { ...existing, ...sanitizedData };
      setCachedData(CACHE_KEYS.ASSET_PRICES, merged);
      
      return { prices: sanitizedData, timestamp: Date.now() };
    } catch (error) {
      console.error("Erro ao buscar preços reais via Backend:", error);
      
      // Se falhar o real, tenta o cache mesmo expirado
      const stale = localStorage.getItem(CACHE_KEYS.ASSET_PRICES);
      if (stale) {
        try { 
          const parsed = JSON.parse(stale);
          return { prices: parsed.data, timestamp: parsed.timestamp }; 
        } catch(e) {}
      }
    }

    return { prices: {}, timestamp: Date.now() };
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
  }
};
