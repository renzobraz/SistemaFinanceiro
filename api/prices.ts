import type { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from "yahoo-finance2";

const yahooFinance = new (YahooFinance as any)();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Habilita CORS
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

  const { tickers } = req.query;
  if (!tickers || typeof tickers !== "string") {
    return res.status(400).json({ error: "Tickers são obrigatórios" });
  }

  const tickerList = tickers.split(",").map(t => {
    const clean = t.trim().toUpperCase();
    if (/^[A-Z]{4}[0-9]{1,2}$/.test(clean)) {
      return `${clean}.SA`;
    }
    return clean;
  });

  try {
    const results: Record<string, { current: number; target: number | null }> = {};
    
    // Busca em lote para os preços atuais
    const quotes = await yahooFinance.quote(tickerList) as any[];
    
    // Busca detalhes individuais para o preço alvo
    const detailPromises = tickerList.map(async (symbol) => {
      try {
        const summary = await yahooFinance.quoteSummary(symbol, { modules: ["financialData"] });
        return { symbol, target: summary?.financialData?.targetMeanPrice || null };
      } catch (e) {
        return { symbol, target: null };
      }
    });

    const details = await Promise.all(detailPromises);
    const targetMap = Object.fromEntries(details.map(d => [d.symbol, d.target]));
    
    quotes.forEach((quote: any) => {
      const originalTicker = quote.symbol.replace(".SA", "");
      results[originalTicker] = {
        current: quote.regularMarketPrice || quote.postMarketPrice || 0,
        target: targetMap[quote.symbol] || null
      };
    });

    res.status(200).json(results);
  } catch (error) {
    console.error("Erro ao buscar Yahoo Finance:", error);
    res.status(500).json({ error: "Falha ao buscar cotações reais" });
  }
}
