import type { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from "yahoo-finance2";
import { GoogleGenAI } from "@google/genai";

const yahoo = new YahooFinance();

try {
  if (typeof (yahoo as any).setGlobalConfig === 'function') {
    (yahoo as any).setGlobalConfig({
      validation: { logErrors: false, logOptions: { width: 1 } }
    });
  }
} catch (e) {}

// Função utilitária para limpar erros pesados do Yahoo Finance
function sanitizeYahooError(e: any): any {
  if (!e) return { message: "Erro desconhecido no Yahoo Finance" };
  if (typeof e === 'object') {
    const clean: any = { message: e.message || "Erro de dados no Yahoo Finance" };
    if (e.code) clean.code = e.code;
    if (e.status) clean.status = e.status;
    if (typeof clean.message === 'string') {
      const cleanMsg = clean.message
        .split('\n')[0]
        .split('https://')[0]
        .split('validation failed')[0]
        .split('Failed validation')[0]
        .trim();
      clean.message = cleanMsg || "Erro de dados no Yahoo Finance";
    }
    return clean;
  }
  return { message: String(e) };
}

async function robustQuote(symbols: string | string[]) {
  try {
    return await yahoo.quote(symbols);
  } catch (e: any) {
    if (e.result) return e.result;
    throw sanitizeYahooError(e);
  }
}

async function robustSummary(symbol: string, modules: any[]) {
  try {
    return await yahoo.quoteSummary(symbol, { modules });
  } catch (e: any) {
    if (e.result) return e.result;
    throw sanitizeYahooError(e);
  }
}

const isValidGeminiKey = (key: string) => {
  if (!key) return false;
  if (key.startsWith("AIzaSy")) return true;
  if (key.length < 20) return false;
  if (key.includes(" ") || key.includes("•") || key.includes("Sistema") || key.includes("Financeiro")) return false;
  return true;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configuração correta de cabeçalhos CORS para Vercel Serverless
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { tickers } = req.query;
    if (!tickers || typeof tickers !== "string") {
      return res.status(400).json({ error: "Tickers são obrigatórios" });
    }

    const rawTickerList = tickers.split(",").map(t => t.trim()).filter(t => t.length > 0);
    const results: Record<string, { current: number | null; target: number | null; debugTicker?: string }> = {};
    const tickerMap = new Map<string, string>(); // original -> yahoo

    // Processamento robusto dos tickers exatamente igual ao backend local
    rawTickerList.forEach(t => {
      let cleanTicker = t.toUpperCase().trim();
      
      // Remove parênteses e colchetes e tudo dentro
      cleanTicker = cleanTicker.replace(/\s*\(.*?\)/g, "").replace(/\s*\[.*?\]/g, "").trim();

      // Extração ultra-robusta: padrão Bovespa (4 letras + dígitos)
      const ultraRobustMatch = cleanTicker.match(/([A-Z]{4}[0-9]{1,2})/);
      const finalBaseTicker = ultraRobustMatch ? ultraRobustMatch[1] : cleanTicker;

      let yahooSymbol = finalBaseTicker;
      if (!finalBaseTicker.includes(".") && /^[A-Z]{4}[0-9]{1,2}$/.test(finalBaseTicker)) {
        yahooSymbol = `${finalBaseTicker}.SA`;
      }
      
      tickerMap.set(t, yahooSymbol);
      results[t] = { current: null, target: null, debugTicker: yahooSymbol };
    });

    const yahooTickers = Array.from(new Set(tickerMap.values()));

    // Inicialização do Gemini no Servidor do Vercel
    const keysToTry = [
      process.env.GEMINI_API_KEY,
      process.env.VITE_GEMINI_API_KEY
    ].map(k => (k || "").trim());

    const geminiApiKey = keysToTry.find(isValidGeminiKey) || "";
    let genAI: GoogleGenAI | null = null;
    if (geminiApiKey) {
      try {
        genAI = new GoogleGenAI({
          apiKey: geminiApiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });
      } catch (err) {
        console.error("[Gemini Vercel] Erro crítico ao instanciar genAI:", err);
      }
    }

    try {
      // --- BUSCA 1: YAHOO FINANCE ---
      let quotesArray: any[] = [];
      try {
        const quotes = await robustQuote(yahooTickers);
        quotesArray = Array.isArray(quotes) ? quotes : [quotes];
        quotesArray = quotesArray.filter(q => q && q.symbol);
      } catch (batchError: any) {
        const cleanBatchErr = sanitizeYahooError(batchError);
        console.warn(`[Yahoo Vercel] Erro em lote: ${cleanBatchErr.message}. Tentando individualmente...`);
        for (const sym of yahooTickers) {
          try {
            const q = await robustQuote(sym);
            if (q && q.symbol) quotesArray.push(q);
          } catch (e) {}
        }
      }

      const priceMap = new Map<string, number>();
      quotesArray.forEach(q => {
        const p = q.regularMarketPrice || q.postMarketPrice || q.regularMarketPreviousClose || q.bid || q.ask || q.price || q.lastPrice;
        if (typeof p === 'number' && p > 0) {
          priceMap.set(q.symbol.toUpperCase(), p);
          if (q.symbol.toUpperCase().endsWith(".SA")) {
            priceMap.set(q.symbol.toUpperCase().replace(".SA", ""), p);
          }
        }
      });

      // Mapeia para os resultados
      rawTickerList.forEach(t => {
        const ySym = tickerMap.get(t)?.toUpperCase() || "";
        results[t].current = priceMap.get(ySym) || priceMap.get(ySym.replace(".SA", "")) || null;
      });

      // --- BUSCA 2: BRAPI (FALLBACK) ---
      const missingFromYahoo = rawTickerList.filter(t => results[t].current === null);
      if (missingFromYahoo.length > 0) {
        try {
          const bTickers = Array.from(new Set(missingFromYahoo.map(t => (tickerMap.get(t) || t).replace(".SA", "")))).join(",");
          const token = process.env.VITE_BRAPI_TOKEN || process.env.BRAPI_TOKEN;
          const url = `https://brapi.dev/api/quote/${bTickers}${token ? `?token=${token}` : ""}`;
          const response = await fetch(url);
          if (response.ok) {
            const dataValue: any = await response.json();
            dataValue.results?.forEach((r: any) => {
              if (r && typeof r.regularMarketPrice === 'number' && r.regularMarketPrice > 0) {
                const rSym = r.symbol.toUpperCase();
                missingFromYahoo.forEach(t => {
                  const mapped = (tickerMap.get(t) || "").toUpperCase();
                  if (mapped.includes(rSym) || rSym.includes(mapped.replace(".SA", ""))) {
                    results[t].current = r.regularMarketPrice;
                  }
                });
              }
            });
          }
        } catch (e) {}
      }

      // --- BUSCA 3: HG BRASIL (FALLBACK) ---
      const stillMissing = rawTickerList.filter(t => results[t].current === null);
      if (stillMissing.length > 0) {
        try {
          const hTickers = Array.from(new Set(stillMissing.map(t => (tickerMap.get(t) || t).replace(".SA", "")))).join(",");
          const key = process.env.HGBRASIL_API_KEY || "703816a7";
          const hgUrl = `https://api.hgbrasil.com/finance/stock_price?key=${key}&symbol=${hTickers}`;
          const hgResponse = await fetch(hgUrl);
          if (hgResponse.ok) {
            const dataValue: any = await hgResponse.json();
            if (dataValue && dataValue.results) {
              Object.keys(dataValue.results).forEach(sym => {
                const r = dataValue.results[sym];
                if (r && typeof r.price === 'number' && r.price > 0) {
                  const rSym = sym.toUpperCase();
                  stillMissing.forEach(t => {
                    if (t.toUpperCase().includes(rSym) || rSym.includes(t.toUpperCase().replace(/\s*\(.*?\)/, "").trim())) {
                      results[t].current = r.price;
                    }
                  });
                }
              });
            }
          }
        } catch (e) {}
      }

      // --- BUSCA 4: GEMINI AI (ULTIMATE FALLBACK) ---
      const persistentMissing = rawTickerList.filter(t => results[t].current === null);
      if (genAI && persistentMissing.length > 0) {
        try {
          const prompt = `Retorne o preço ATUAL de mercado (current price) e o preço alvo médio (target price) para os seguintes ativos financeiros. 
          Responda APENAS um JSON no formato: {"TICKER": {"current": number, "target": number | null}}.
          Ativos: ${persistentMissing.join(", ")}`;

          const aiResult = await genAI.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt
          });
          
          const aiText = aiResult.text;
          const aiJson = JSON.parse(aiText.replace(/```json|```/g, "").trim());
          
          Object.entries(aiJson).forEach(([ticker, data]: [string, any]) => {
            if (results[ticker] && data.current) {
              results[ticker].current = data.current;
              if (data.target && results[ticker].target === null) {
                results[ticker].target = data.target;
              }
            }
          });
        } catch (aiErr) {
          console.error("[Gemini Vercel] Erro no fallback de IA:", aiErr);
        }
      }

      // Busca Target Price (Preço Alvo) - Yahoo Finance
      const detailPromises = yahooTickers.map(async (symbol) => {
        try {
          const summary = await robustSummary(symbol, ["financialData"]);
          const target = (summary as any)?.financialData?.targetMeanPrice || null;
          return { symbol: symbol.toUpperCase(), target };
        } catch (e) {
          return { symbol: symbol.toUpperCase(), target: null };
        }
      });

      const details = await Promise.all(detailPromises);
      const targetMap = new Map(details.map(d => [d.symbol, d.target]));
      
      rawTickerList.forEach(originalTicker => {
        const yahooSymbol = tickerMap.get(originalTicker)?.toUpperCase() || "";
        let target = targetMap.get(yahooSymbol) || null;
        if (target === null) {
          for (const [receivedSymbol, t] of targetMap.entries()) {
            if (receivedSymbol.startsWith(yahooSymbol) || yahooSymbol.startsWith(receivedSymbol)) {
              target = t;
              break;
            }
          }
        }
        results[originalTicker].target = target;
      });

    } catch (error: any) {
      const cleanErr = sanitizeYahooError(error);
      console.error(`[Yahoo Vercel] Erro total no processamento: ${cleanErr.message}`);
      rawTickerList.forEach(originalTicker => {
        results[originalTicker] = { current: null, target: null };
      });
    }

    res.status(200).json(results);
  } catch (error: any) {
    const cleanErr = sanitizeYahooError(error);
    console.error(`Erro no handler de /api/prices Vercel: ${cleanErr.message}`);
    res.status(500).json({ error: "Falha ao processar cotações reais", details: cleanErr.message });
  }
}
