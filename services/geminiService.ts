
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
      if (!ai) {
        console.error("ERRO: GEMINI_API_KEY não encontrada. Verifique as variáveis de ambiente no Vercel.");
        throw new Error("Gemini API Key missing");
      }
      
      const today = new Date().toISOString().split('T')[0];
      const prompt = `You are a real-time financial data fetcher. 
      TASK: Find the current stock price for these tickers: ${tickers.join(', ')}.
      DATE: ${today}
      
      INSTRUCTIONS:
      1. Use the Google Search tool to find the "current price" or "last close" on Google Finance or Yahoo Finance.
      2. DO NOT use your internal knowledge. If the search tool fails, return 0.
      3. Return ONLY a JSON object.
      
      Example Output:
      {"NVDA": 895.20, "AAPL": 172.10}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        tools: [{ googleSearch: {} }],
        config: {
          responseMimeType: "application/json",
          temperature: 0,
          systemInstruction: "You are a precise data extraction tool. You must use Google Search to verify every single price. Never provide data from your training set. If a price is not found via search, return 0."
        }
      });

      const text = response.text;
      console.log("Gemini Real-Time Prices Response:", text);
      if (text) {
        try {
          const cleanedText = text.replace(/```json|```/g, '').trim();
          const data = JSON.parse(cleanedText);
          
          // Sanitização: garante que os preços são números
          const sanitizedData: Record<string, number> = {};
          Object.entries(data).forEach(([ticker, price]) => {
            if (typeof price === 'string') {
              // Remove símbolos de moeda e converte para número
              const num = parseFloat(price.replace(/[^\d.,-]/g, '').replace(',', '.'));
              if (!isNaN(num)) sanitizedData[ticker] = num;
            } else if (typeof price === 'number') {
              sanitizedData[ticker] = price;
            }
          });
          
          // Mescla com cache existente
          const existingRaw = localStorage.getItem(CACHE_KEYS.ASSET_PRICES);
          const existing = existingRaw ? JSON.parse(existingRaw).data : {};
          const merged = { ...existing, ...sanitizedData };
          setCachedData(CACHE_KEYS.ASSET_PRICES, merged);
          
          return { prices: sanitizedData, timestamp: Date.now() };
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
      // Se falhar, retorna 0 ou o preço do mock se existir, mas sem random para não confundir
      result[t] = mockPrices[t] || 0;
    });

    return { prices: result, timestamp: Date.now() };
  },

  async getInvestmentSuggestions(assets: any[]): Promise<InvestmentSuggestion[]> {
    if (assets.length === 0) return [];

    try {
      const ai = getAi();
      if (!ai) throw new Error("Gemini API Key missing");
      const assetsSummary = assets.map(a => `${a.ticker}: Avg Price ${a.averagePrice}, Current Price ${a.lastPrice || 'N/A'}, Qty ${a.currentQuantity}`).join('\n');
      const prompt = `Analyze the following assets in my portfolio and provide BUY, SELL, or HOLD suggestions based on the current market scenario:
      ${assetsSummary}
      
      Return a JSON array of objects with: ticker, action, reason (in Portuguese), riskLevel (LOW, MEDIUM, HIGH).`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        tools: [{ googleSearch: {} }],
        config: {
          responseMimeType: "application/json",
          temperature: 0,
          systemInstruction: "You are an expert financial analyst. Use the Google Search tool to check current market trends before giving advice. Always respond with 'reason' in Portuguese."
        }
      });

      const text = response.text;
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
      const prompt = `Today is ${today}. Provide the CURRENT AND REAL-TIME exchange rates for US Dollar (USD), Euro (EUR), and British Pound (GBP) relative to the Brazilian Real (BRL).
      Use Google Finance or real-time currency sources.
      Return ONLY a JSON object with the exchange rates where 1 unit of foreign currency equals X Reais.
      Example: {"BRL": 1, "USD": 5.15, "EUR": 5.55, "GBP": 6.45}.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        tools: [{ googleSearch: {} }],
        config: {
          responseMimeType: "application/json",
          temperature: 0,
          systemInstruction: "You are a precise currency exchange assistant. Always use the Google Search tool to find the most recent exchange rates. Do not use your internal training data."
        }
      });

      const text = response.text;
      if (text) {
        try {
          const cleanedText = text.replace(/```json|```/g, '').trim();
          const data = JSON.parse(cleanedText);
          
          // Sanitização: garante que as taxas são números
          const sanitizedRates: Record<string, number> = {};
          Object.entries(data).forEach(([currency, rate]) => {
            if (typeof rate === 'string') {
              const num = parseFloat(rate.replace(/[^\d.,-]/g, '').replace(',', '.'));
              if (!isNaN(num)) sanitizedRates[currency] = num;
            } else if (typeof rate === 'number') {
              sanitizedRates[currency] = rate;
            }
          });

          setCachedData(CACHE_KEYS.EXCHANGE_RATES, sanitizedRates);
          return { rates: sanitizedRates, timestamp: Date.now() };
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
