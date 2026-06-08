import { GoogleGenAI, Type } from "@google/genai";
import { financeService } from "./financeService";
import { Participant } from "../types";

let aiInstance: any = null;

function getAi() {
  try {
    // Busca a chave de várias formas possíveis para garantir compatibilidade
    // @ts-ignore
    const keysToTry = [
      import.meta.env?.VITE_GEMINI_API_KEY,
      process.env.GEMINI_API_KEY,
      process.env.VITE_GEMINI_API_KEY
    ].map(k => (k || "").trim());

    const isValidKey = (key: string) => {
      if (!key) return false;
      if (key.startsWith("AIzaSy")) return true;
      if (key.length < 20) return false;
      if (key.includes(" ") || key.includes("•") || key.includes("Sistema") || key.includes("Financeiro")) return false;
      return true;
    };

    const apiKey = keysToTry.find(isValidKey) || "";
    
    if (!apiKey) {
      // @ts-ignore
      if (!window._geminiWarned) {
        console.warn("GEMINI_API_KEY válida não definida no navegador. Alguns recursos (sugestões e parsing) podem falhar localmente.");
        // @ts-ignore
        window._geminiWarned = true;
      }
      return null;
    }
    
    if (!aiInstance) {
      const masked = apiKey.length > 8 ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : "***";
      console.log(`[Gemini] Inicializando no cliente com chave válida ${masked}`);
      aiInstance = new GoogleGenAI({ 
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
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
  if (!error) return "Erro desconhecido (vazio)";
  let msg = typeof error === 'string' ? error : (error?.message || String(error));
  if (msg === 'null' || msg === 'undefined' || !msg) return "Erro desconhecido ou sem mensagem";
  
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

function parsePtBrFloat(str: string): number {
  if (!str) return 0;
  const clean = str.replace(/\./g, "").replace(",", ".");
  return parseFloat(clean) || 0;
}

function parseDateToIso(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.trim().split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

function getCategoryFromTicker(ticker: string): string {
  const upper = ticker.trim().toUpperCase();
  if (upper.endsWith('11')) {
    if (upper.startsWith('FII') || upper.includes('MALL') || upper.includes('RECT') || upper.includes('HGLG') || upper.includes('XPML') || upper.includes('BTLG') || upper.includes('KNIP') || upper.includes('KNCR')) {
      return 'FII';
    }
    return 'FII';
  }
  if (upper.includes('DR3') || upper.includes('DRN') || upper.endsWith('33') || upper.endsWith('34') || upper.endsWith('35')) {
    return 'BDR';
  }
  return 'Ação';
}

function inferAssetType(category?: string): 'stock' | 'fii' | 'bdr' {
  if (!category) return 'stock';
  const upper = category.toUpperCase();
  if (upper === 'FII' || upper === 'FUNDO IMOBILIÁRIO' || upper === 'FUNDO IMOBILIARIO') return 'fii';
  if (upper === 'BDR') return 'bdr';
  return 'stock';
}

function findParticipant(
  spec: string,
  sinacorMap: Map<string, Participant>,
  tickerMap: Map<string, Participant>
): Participant | null {
  const key = spec.trim().toUpperCase();
  
  if (tickerMap.has(key)) return tickerMap.get(key)!;
  if (sinacorMap.has(key)) return sinacorMap.get(key)!;
  
  for (const [sinacor, p] of sinacorMap) {
    if (key.startsWith(sinacor) || sinacor.startsWith(key)) return p;
  }
  
  return null;
}

async function parseItauNoteWithRegex(text: string): Promise<any> {
  const participants = await financeService.getRegistry<Participant>('participants').catch(() => []);
  const sinacorMap = new Map<string, Participant>();
  const tickerMap = new Map<string, Participant>();

  for (const p of participants) {
    if (p.ticker && p.active !== false) {
      const tKey = p.ticker.trim().toUpperCase();
      tickerMap.set(tKey, p);
      if (p.sinacorName) {
        sinacorMap.set(p.sinacorName.trim().toUpperCase(), p);
      }
    }
  }

  let noteNumber = "";
  let tradeDate = "";
  let settlementDate = "";
  let liquidValue = 0;
  let isCredit = false;

  const normText = text.replace(/[ \t]+/g, " ");

  const noteRegex = /Nr\.?\s*Nota\s+Folha\s+Data\s+Preg[ãa]o\s*\n\s*(\d+)\s+(\d+)\s+(\d{2}\/\d{2}\/\d{4})/i;
  const noteMatch = normText.match(noteRegex);
  if (noteMatch) {
    noteNumber = noteMatch[1];
    tradeDate = parseDateToIso(noteMatch[3]);
  } else {
    const fallbackNote = normText.match(/Nr\.?\s*Nota\s*:?\s*(\d+)/i) || 
                         normText.match(/Nota\s+de\s+Corretagem\s+n?[ºo]?\s*:?\s*(\d+)/i) || 
                         normText.match(/Nota\s*:?\s*(\d+)/i);
    if (fallbackNote) noteNumber = fallbackNote[1];

    const fallbackDate = normText.match(/Data\s+Preg[ãa]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i) || 
                         normText.match(/Data\s+do\s+Preg[ãa]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i) || 
                         normText.match(/Preg[ãa]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (fallbackDate) tradeDate = parseDateToIso(fallbackDate[1]);
  }

  const todayIso = new Date().toISOString().split('T')[0];
  if (!tradeDate) tradeDate = todayIso;

  const liquidRegex = /L[íi]quido\s+para\s+(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2}:\d{2})?\s+([\d.]+,\d{2})\s+([DC])/i;
  const liquidMatch = normText.match(liquidRegex);
  if (liquidMatch) {
    settlementDate = parseDateToIso(liquidMatch[1]);
    liquidValue = parsePtBrFloat(liquidMatch[2]);
    isCredit = liquidMatch[3].toUpperCase() === "C";
  } else {
    const valueMatch = normText.match(/Total\s+L[íi]quido\s+da\s+Nota\s*:?\s*([\d.]+,\d{2})\s+([DC])/i) || 
                       normText.match(/L[íi]quido\s+da\s+Nota\s*:?\s*([\d.]+,\d{2})\s+([DC])/i);
    if (valueMatch) {
      liquidValue = parsePtBrFloat(valueMatch[1]);
      isCredit = valueMatch[2].toUpperCase() === "C";
    }
    const dateMatch = normText.match(/Liquida[çc][ãa]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i) || 
                      normText.match(/Data\s+Liquida[çc][ãa]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dateMatch) settlementDate = parseDateToIso(dateMatch[1]);
  }

  if (!settlementDate) settlementDate = todayIso;

  const lines = text.split(/\r?\n/);
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+/g, " ");
    if (line.includes("Negócios Realizados") || line.includes("Negocios Realizados") || (line.includes("Q Negociação") && line.includes("Especificação"))) {
      startIndex = i;
    }
    if (startIndex !== -1 && (line.includes("Resumo de negócios") || line.includes("Resumo dos negócios") || line.includes("Resumo financeiro"))) {
      endIndex = i;
      break;
    }
  }

  const targetLines = (startIndex !== -1)
    ? lines.slice(startIndex, endIndex !== -1 ? endIndex : undefined)
    : lines;

  const individualTrades = [];
  for (const line of targetLines) {
    const lineClean = line.trim();
    if (!lineClean) continue;

    const match = lineClean.match(/B3\s+RV\s+LISTADO([CV])\s+(FRACIONARIO|VISTA)\s+(.+?)\s+(?:[@#D*][@ #D*]*)?\s*(\d+)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([DC])/i);
    if (match) {
      const cvFlag = match[1].toUpperCase(); // 'C' = LISTADOC, 'V' = LISTADOV
      const dcFlag = match[7].toUpperCase(); // 'D' = débito/compra, 'C' = crédito/venda

      // LISTADOC + D = compra, LISTADOV + C = venda
      // Em caso de discordância, dcFlag é o desempate
      const action = (cvFlag === "C" && dcFlag === "D") ? "buy" :
                     (cvFlag === "V" && dcFlag === "C") ? "sell" :
                     dcFlag === "D" ? "buy" : "sell";

      const marketType = match[2].toUpperCase();
      let specRaw = match[3].trim();
      const qty = parseInt(match[4], 10);
      const price = parsePtBrFloat(match[5]);
      const total = parsePtBrFloat(match[6]);

      specRaw = specRaw.replace(/\s*[@#*D]+\s*$/, "").trim();

      individualTrades.push({
        type: action,
        market: marketType,
        spec: specRaw,
        quantity: qty,
        price: price,
        totalValue: total,
        dc: dcFlag
      });
    } else {
      if (lineClean.includes("B3") && lineClean.includes("LISTADO")) {
        console.log("[Parser] Linha não capturada pela regex:", lineClean);
      }
    }
  }
  console.log("[Parser] Total linhas capturadas:", individualTrades.length);

  if (individualTrades.length === 0) return null;

  const mappedTrades = individualTrades.map(trade => {
    const p = findParticipant(trade.spec, sinacorMap, tickerMap);
    if (p) {
      return {
        ...trade,
        ticker: p.ticker!,
        assetName: p.name,
        unmapped: false
      };
    } else {
      return {
        ...trade,
        ticker: trade.spec,
        assetName: trade.spec,
        unmapped: true,
        sinacorNameRaw: trade.spec
      };
    }
  });

  const groupMap = new Map<string, {
    ticker: string;
    type: 'buy' | 'sell';
    quantity: number;
    totalValue: number;
    assetName: string;
    unmapped?: boolean;
    sinacorNameRaw?: string;
  }>();

  for (const trade of mappedTrades) {
    const key = trade.unmapped
      ? `UNMAPPED:${trade.sinacorNameRaw?.toUpperCase()}|${trade.type}`
      : `${trade.ticker.toUpperCase()}|${trade.type}`;

    if (groupMap.has(key)) {
      const existing = groupMap.get(key)!;
      existing.quantity += trade.quantity;
      existing.totalValue += trade.totalValue;
    } else {
      groupMap.set(key, {
        ticker: trade.ticker,
        type: trade.type,
        quantity: trade.quantity,
        totalValue: trade.totalValue,
        assetName: trade.assetName,
        unmapped: trade.unmapped,
        sinacorNameRaw: trade.sinacorNameRaw
      });
    }
  }

  let totalSales = 0;
  let totalPurchases = 0;

  const consolidatedTrades = Array.from(groupMap.values()).map(g => {
    const avgPrice = g.quantity > 0 ? Number((g.totalValue / g.quantity).toFixed(4)) : 0;
    let category = 'stock';
    if (!g.unmapped) {
      const part = findParticipant(g.ticker, sinacorMap, tickerMap);
      category = part?.category || getCategoryFromTicker(g.ticker);
    } else if (g.sinacorNameRaw) {
      category = getCategoryFromTicker(g.sinacorNameRaw);
    }

    const tValueFormatted = Number(g.totalValue.toFixed(2));
    if (g.type === 'buy') {
      totalPurchases += tValueFormatted;
    } else {
      totalSales += tValueFormatted;
    }

    const res: any = {
      ticker: g.ticker,
      type: g.type.toUpperCase() as "BUY" | "SELL",
      quantity: g.quantity,
      price: avgPrice,
      total: tValueFormatted,
      assetName: g.assetName,
      assetType: inferAssetType(category)
    };

    if (g.unmapped) {
      res.unmapped = true;
      res.sinacorNameRaw = g.sinacorNameRaw;
    }

    return res;
  });

  let calculatedCosts = 0;
  if (isCredit) {
    calculatedCosts = (totalSales - totalPurchases) - liquidValue;
  } else {
    calculatedCosts = liquidValue - (totalPurchases - totalSales);
  }

  if (calculatedCosts < 0) calculatedCosts = 0;
  calculatedCosts = Number(calculatedCosts.toFixed(2));

  return {
    metadata: {
      date: tradeDate,
      noteNumber: noteNumber,
      liquidValue: liquidValue,
      settlementDate: settlementDate,
      isCredit: isCredit,
      expectedTradesCount: consolidatedTrades.length
    },
    summary: {
      totalSales: Number(totalSales.toFixed(2)),
      totalPurchases: Number(totalPurchases.toFixed(2)),
      clearingFees: 0,
      exchangeFees: 0,
      brokerage: 0,
      taxes: 0,
      otherCosts: calculatedCosts
    },
    trades: consolidatedTrades,
    costs: {
      total: calculatedCosts,
      details: "Emolumentos e taxas de liquidação calculados por balanceamento de saldo"
    }
  };
}

export const geminiService = {
  async fetchAssetPrices(tickers: string[], force: boolean = false): Promise<{prices: Record<string, { current: number; target: number | null }>, timestamp: number, error?: string}> {
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
        
        if (!sanitizedData || typeof sanitizedData !== 'object') {
          throw new Error("Resposta da API de preços é inválida ou nula");
        }
        
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
      console.log("[Prices] Tentando recuperar dados do cache expirado como fallback.");
      try { 
        const parsed = JSON.parse(stale);
        return { prices: parsed.data, timestamp: parsed.timestamp }; 
      } catch(e) {}
    }

    // Se nem cache tiver, pelo menos tenta retornar um objeto que não quebre a UI
    return { prices: {}, timestamp: Date.now(), error: cleanErrorMessage(lastError) };
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
        model: "gemini-3.5-flash",
        contents: [{ parts: [{ text: prompt }] }],
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
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        console.warn("[Gemini] Limite de cota diária excedido (429/RESOURCE_EXHAUSTED). Retornando sugestões offline...");
      } else {
        console.error("Erro ao buscar sugestões via Gemini:", error);
      }
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
      // BUSCA REAL: Usa o nosso proxy no servidor para evitar bloqueios de CORS no cliente
      const response = await fetch(`/api/rates?_t=${Date.now()}`);
      
      const contentType = response.headers.get("content-type");
      
      // Validação de segurança: se a resposta falhar ou não retornar um JSON (por exemplo, retornar o HTML do Vite)
      if (!response.ok || !contentType || !contentType.includes("application/json")) {
        const text = (await response.text()).substring(0, 300);
        
        // Se identificarmos HTML, é um sinal de que o servidor está ligando ou caiu em rota SPA
        if (text.includes("<!DOCTYPE html>") || text.includes("<!doctype html>")) {
          console.warn("[Rates] O servidor respondeu com formato de página (SPA) em vez de dados JSON. Ativando fallbacks de segurança.");
        } else {
          console.warn(`[Rates] Resposta inesperada com status ${response.status} e tipo ${contentType}.`);
        }
        throw new Error("O servidor respondeu com dados que não estão em formato JSON válido.");
      }
      
      const data = await response.json();
      const rates = data.rates;
      
      if (!rates || !rates.USD) throw new Error("Dados de câmbio inválidos recebidos");

      // A API externa retorna quanto 1 Real vale em moedas estrangeiras (EX: USD: 0.19)
      // Precisamos inverter esses valores para expressar a rota de conversão: quanto 1 Moeda Estrangeira vale em Reais
      const sanitizedRates: Record<string, number> = {
        BRL: 1,
        USD: Number((1 / rates.USD).toFixed(4)),
        EUR: Number((1 / rates.EUR).toFixed(4)),
        GBP: Number((1 / rates.GBP).toFixed(4))
      };

      setCachedData(CACHE_KEYS.EXCHANGE_RATES, sanitizedRates);
      return { rates: sanitizedRates, timestamp: Date.now() };
    } catch (error: any) {
      // Registrar um aviso amigável no log do console em vez de estourar exceções críticas
      console.warn("Aviso ao obter taxas de câmbio online (usando cache local ou taxas fixas de segurança):", error.message || error);
      
      // Tentar resgatar dados antigos do cache de localStorage como redundância
      const stale = localStorage.getItem(CACHE_KEYS.EXCHANGE_RATES);
      if (stale) {
        try { 
          const parsed = JSON.parse(stale);
          if (parsed && parsed.data) {
            return { rates: parsed.data, timestamp: parsed.timestamp || Date.now() }; 
          }
        } catch(e) {}
      }
    }

    // Se tudo falhar, retorna taxas fixas e estáveis como última solução preventiva
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
        model: "gemini-3.5-flash",
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });
      return JSON.parse(response.text.replace(/```json|```/g, '').trim());
    } catch (e) {
      return null;
    }
  },

  async parseBrokerageNote(fileBase64: string, mimeType: string, onProgress?: (api: 'gemini' | 'claude') => void): Promise<any> {
    // 1. Tentar extrair o texto limpo do PDF via backend
    let extractedText = "";
    try {
      console.log("[Parser Regex] Extraindo texto do PDF...");
      const response = await fetch("/api/extract-pdf-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: fileBase64 })
      });
      if (response.ok) {
        const data = await response.json();
        extractedText = data.text || "";
      } else {
        console.warn("[Parser Regex] Falha na extração de texto do PDF via API:", response.statusText);
      }
    } catch (e) {
      console.warn("[Parser Regex] Erro ao chamar endpoint de extração de texto:", e);
    }

    // 2. Se conseguimos o texto, rodar parser regex específico do Itaú
    if (extractedText) {
      try {
        const regexResult = await parseItauNoteWithRegex(extractedText);
        if (regexResult && regexResult.trades && regexResult.trades.length > 0) {
          console.log(`[Parser Regex] Sucesso! ${regexResult.trades.length} trades consolidados extraídos.`);
          return regexResult;
        }
        console.warn("[Parser Regex] Nenhum trade encontrado na nota via regex. Caindo para processamento inteligente...");
      } catch (regexErr) {
        console.error("[Parser Regex] Erro durante o parsing por regex:", regexErr);
      }
    }

    const ai = getAi();
    
    const prompt = `Analise esta Nota de Corretagem (Padrão SINACOR) e extraia os dados de forma estruturada em JSON.
    
    ESTRUTURA DESEJADA:
    {
      "metadata": { 
        "date": "YYYY-MM-DD", 
        "noteNumber": "string", 
        "liquidValue": number, 
        "settlementDate": "YYYY-MM-DD",
        "isCredit": boolean (true se o valor líquido for C, false se for D),
        "expectedTradesCount": number
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

    INSTRUÇÕES EXTRAÇÃO DE TICKERS (CRÍTICO):
    - No campo "ticker", retorne SEMPRE e OBRIGATORIAMENTE o código de negociação oficial da B3 (geralmente composto por 4 letras maiúsculas seguidas por um ou dois números, ex: RBRP11, GZIT11, PETR4, WEGE3).
    - NUNCA retorne o nome descritivo ou a razão social do ativo no campo "ticker".
    - Exemplos de mapeamento para guiar a extração e conversão de nomes descritivos para códigos B3 reais:
      * "FII RBRP PAX CI" ou "FII RBRP" ou "RBRP CI" ou variações -> "RBRP11"
      * "FII RBRR PAX CI" ou "RBRR" ou "FII RBRR" -> "RBRR11"
      * "FII GAZIT CI ER" ou "GAZIT" ou "GZIT" -> "GZIT11"
      * "XP LOG FII" ou "XPLG" -> "XPLG11"
      * Se encontrar termos descritivos de corretora/nota contendo o ativo, extraia apenas o ticker de negociação de 5 ou 6 caracteres da B3 correspondentes!

    INSTRUÇÕES CRÍTICAS PARA NOTAS LONGAS E COMPLETUDE:
    - CONSOLIDAÇÃO OBRIGATÓRIA: Agrupe TODAS as execuções do mesmo ativo com o mesmo tipo (BUY ou SELL) em um ÚNICO trade. Some as quantidades e some os valores totais. O preço deve ser o preço médio ponderado (total / quantidade). NÃO liste cada linha de execução separadamente.
    - Exemplo: se PETR4 aparece comprado em 50 linhas com quantidades e preços diferentes, retorne UM ÚNICO objeto { ticker: "PETR4", type: "BUY", quantity: soma_total, price: preco_medio, total: valor_total }.
    - O campo "expectedTradesCount" em "metadata" DEVE ser o número de trades CONSOLIDADOS (ativos distintos por tipo), NÃO o número de linhas físicas da nota.
    - Se um mesmo ativo aparecer como BUY e SELL na mesma nota, crie dois trades separados (um BUY e um SELL).
    - O "liquidValue" deve ser o valor exato encontrado no campo "Líquido para [Data]" ou "Total Líquido da Nota".
    - "totalSales" é a soma de todos os itens com 'V' (Venda) ou 'C' (Crédito).
    - "totalPurchases" é a soma de todos os itens com 'C' (Compra) ou 'D' (Débito) referentes a compras de ativos.
    - "costs.total" deve ser a soma de TODAS as taxas (Liquidação, Registro, Emolumentos, Corretagem, ISS, IRRF).
    - No campo "assetName", use o nome descritivo completo lido na nota (ex: "FII RBRP PAX CI").
    
    REGRAS DE VALINAÇÂO:
    - O valor de cada linha deve ser (quantidade * preço).
    - O valor líquido final deve ser (Vendas - Compras - Taxas). Se vendas > compras+taxas, é Crédito (C). Caso contrário, Débito (D).
    
    Responda APENAS o JSON puro.`;

    const attempts = [];

    if (ai) {
      attempts.push({
        name: 'gemini' as const,
        fn: async () => {
          console.log("[Gemini] Tentando processar nota de corretagem com Gemini...");
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [{
              parts: [
                { inlineData: { data: fileBase64, mimeType } },
                { text: prompt }
              ]
            }],
            config: { 
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  metadata: {
                    type: Type.OBJECT,
                    properties: {
                      date: { type: Type.STRING },
                      noteNumber: { type: Type.STRING },
                      liquidValue: { type: Type.NUMBER },
                      settlementDate: { type: Type.STRING },
                      isCredit: { type: Type.BOOLEAN },
                      expectedTradesCount: { type: Type.INTEGER }
                    },
                    required: ["date", "noteNumber", "liquidValue", "settlementDate", "isCredit", "expectedTradesCount"]
                  },
                  summary: {
                    type: Type.OBJECT,
                    properties: {
                      totalSales: { type: Type.NUMBER },
                      totalPurchases: { type: Type.NUMBER },
                      clearingFees: { type: Type.NUMBER },
                      exchangeFees: { type: Type.NUMBER },
                      brokerage: { type: Type.NUMBER },
                      taxes: { type: Type.NUMBER },
                      otherCosts: { type: Type.NUMBER }
                    },
                    required: ["totalSales", "totalPurchases", "clearingFees", "exchangeFees", "brokerage", "taxes", "otherCosts"]
                  },
                  trades: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        ticker: { type: Type.STRING },
                        type: { type: Type.STRING },
                        quantity: { type: Type.NUMBER },
                        price: { type: Type.NUMBER },
                        total: { type: Type.NUMBER },
                        assetName: { type: Type.STRING }
                      },
                      required: ["ticker", "type", "quantity", "price", "total", "assetName"]
                    }
                  },
                  costs: {
                    type: Type.OBJECT,
                    properties: {
                      total: { type: Type.NUMBER },
                      details: { type: Type.STRING }
                    },
                    required: ["total", "details"]
                  }
                },
                required: ["metadata", "summary", "trades", "costs"]
              },
              temperature: 0.1,
              maxOutputTokens: 8192
            }
          });

          const rawText = response.text || "";
          let cleanedText = rawText.trim();
          if (cleanedText.includes("```")) {
            cleanedText = cleanedText.replace(/```json|```/g, "").trim();
          }

          const firstBrace = cleanedText.indexOf("{");
          const lastBrace = cleanedText.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
          }

          try {
            return JSON.parse(cleanedText);
          } catch (parseError) {
            console.warn("Erro de parse inicial com Gemini, tentando limpeza agressiva:", parseError);
            
            // 0. Remover comentários primeiro para evitar interferência nas regras de vírgula
            let cleaned = cleanedText
              .replace(/\/\*[\s\S]*?\*\//g, "")
              .replace(/([^\\:]|^)\/\/.*$/gm, "$1");

            // 1. Corrigir aspas internas não escapadas em cada linha de propriedade tipo string
            const lines = cleaned.split("\n");
            const repairedLines = lines.map(line => {
              const match = line.match(/^(\s*"[a-zA-Z0-9_]+"\s*:\s*")(.*)("\s*,?\s*)$/);
              if (match) {
                const prefix = match[1];
                const content = match[2];
                const suffix = match[3];
                const escapedContent = content.replace(/(?<!\\)"/g, '\\"');
                return prefix + escapedContent + suffix;
              }
              return line;
            });

            // 2. Adicionar vírgulas ausentes de forma inteligente line-by-line
            for (let i = 0; i < repairedLines.length - 1; i++) {
              const currentLine = repairedLines[i].trim();
              const nextLine = repairedLines[i + 1].trim();
              
              if (!currentLine || !nextLine) continue;
              
              const lacksComma = !currentLine.endsWith(",") && 
                                 !currentLine.endsWith("{") && 
                                 !currentLine.endsWith("[") && 
                                 !currentLine.endsWith(":");
                                 
              if (lacksComma) {
                // Caso A: Propriedade para propriedade
                const isProp = /"[a-zA-Z0-9_]+"\s*:\s*/.test(currentLine);
                const nextIsProp = /^"[a-zA-Z0-9_]+"\s*:/.test(nextLine);
                if (isProp && nextIsProp) {
                  repairedLines[i] = repairedLines[i] + ",";
                  continue;
                }
                
                // Caso B: Fechamento de objeto para abertura de objeto (ex: no array trades)
                if (currentLine.endsWith("}") && nextLine.startsWith("{")) {
                  repairedLines[i] = repairedLines[i] + ",";
                  continue;
                }
                
                // Caso C: Fechamento de objeto para propriedade (ex: fim de metadata ou fim de trade)
                if (currentLine.endsWith("}") && /^"[a-zA-Z0-9_]+"\s*:/.test(nextLine)) {
                  repairedLines[i] = repairedLines[i] + ",";
                  continue;
                }
                
                // Caso D: Fechamento de array para propriedade
                if (currentLine.endsWith("]") && /^"[a-zA-Z0-9_]+"\s*:/.test(nextLine)) {
                  repairedLines[i] = repairedLines[i] + ",";
                  continue;
                }
              }
            }
            
            let repairedText = repairedLines.join("\n");

            // 3. Adicionar vírgulas ausentes entre objetos consecutivos (ex: } { ou }\n  {)
            repairedText = repairedText.replace(/}(\s*){/g, "},$1{");

            // 4. Limpar vírgulas extras no final de arrays/objetos
            repairedText = repairedText.replace(/,\s*([\]}])/g, "$1"); 

            return JSON.parse(repairedText);
          }
        }
      });
    }

    attempts.push({
      name: 'claude' as const,
      fn: async () => {
        console.log("[Claude] Tentando processar nota de corretagem com Claude...");
        const response = await fetch("/api/parse-pdf-claude", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            base64: fileBase64,
            mimeType,
            prompt
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Erro HTTP ${response.status} na API do Claude`);
        }

        return await response.json();
      }
    });

    const attemptErrors: string[] = [];

    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      try {
        if (onProgress) onProgress(attempt.name);
        const result = await attempt.fn();

        // Validação de completude unificada
        const expectedCount = Number(result?.metadata?.expectedTradesCount || result?.metadata?.expected_trades_count || 0);
        const actualCount = Array.isArray(result?.trades) ? result.trades.length : 0;

        console.log(`[Diagnostic - ${attempt.name.toUpperCase()}] Ativos extraídos (${actualCount}):`, result?.trades?.map((t: any) => t.ticker || t.assetName));
        console.log(`[Diagnostic - ${attempt.name.toUpperCase()}] Quantidade esperada de negócios consolidada: ${expectedCount}`);

        if (expectedCount > 0 && actualCount === 0) {
          const errorMsg = `A nota possui ${expectedCount} negócios consolidados indicados, mas nenhuma transação foi identificada pelo modelo.`;
          throw new Error(errorMsg);
        }

        // Se houver uma discrepância significativa na consolidação, registramos mas permitimos continuar conforme desejo do usuário
        if (expectedCount > 0 && Math.abs(actualCount - expectedCount) > 0) {
          console.warn(`[Diagnostic - ${attempt.name.toUpperCase()}] Discrepância na contagem de negócios consolidados por ativo/operação: o documento sinaliza ${expectedCount}, mas foram identificados ${actualCount}. Continuando o fluxo para permitir auditoria e edição pelo usuário.`);
        }

        return result;
      } catch (err: any) {
        const errorDetail = err.message || String(err);
        console.warn(`[${attempt.name.toUpperCase()}] Falha ou incompletude detectada:`, errorDetail);
        attemptErrors.push(`${attempt.name.toUpperCase()}: ${errorDetail}`);
      }
    }

    // Se saiu do loop, significa que todas as tentativas falharam
    const formattedErrors = attemptErrors.map(err => `- ${err}`).join("\n");
    throw new Error(`Falha no processamento inteligente. Relatório de erros por IA:\n${formattedErrors}\n\nTente enviar o arquivo novamente ou use a digitação manual de notas.`);
  }
};