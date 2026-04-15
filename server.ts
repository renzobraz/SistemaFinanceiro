import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import YahooFinance from "yahoo-finance2";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const yahooFinance = new (YahooFinance as any)();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API para buscar preços reais do Yahoo Finance
  app.get("/api/prices", async (req, res) => {
    const { tickers } = req.query;
    if (!tickers || typeof tickers !== "string") {
      return res.status(400).json({ error: "Tickers são obrigatórios" });
    }

    const tickerList = tickers.split(",").map(t => {
      const clean = t.trim().toUpperCase();
      // Lógica para ativos brasileiros: se tem 4 letras e termina com número, adiciona .SA
      if (/^[A-Z]{4}[0-9]{1,2}$/.test(clean)) {
        return `${clean}.SA`;
      }
      return clean;
    });

    try {
      const results: Record<string, { current: number; target: number | null }> = {};
      
      // Busca em lote para os preços atuais (mais rápido)
      const quotes = await yahooFinance.quote(tickerList) as any[];
      
      // Busca detalhes individuais para o preço alvo (Yahoo não permite batch para targetPrice em quote simples)
      // Limitamos a concorrência para não sermos bloqueados
      const detailPromises = tickerList.map(async (symbol) => {
        try {
          // quoteSummary traz dados de analistas (financialData)
          const summary = await yahooFinance.quoteSummary(symbol, { modules: ["financialData"] });
          return { symbol, target: summary?.financialData?.targetMeanPrice || null };
        } catch (e) {
          return { symbol, target: null };
        }
      });

      const details = await Promise.all(detailPromises);
      const targetMap = Object.fromEntries(details.map(d => [d.symbol, d.target]));
      
      // Mapeia de volta para o ticker original (sem .SA)
      quotes.forEach((quote: any) => {
        const originalTicker = quote.symbol.replace(".SA", "");
        results[originalTicker] = {
          current: quote.regularMarketPrice || quote.postMarketPrice || 0,
          target: targetMap[quote.symbol] || null
        };
      });

      res.json(results);
    } catch (error) {
      console.error("Erro ao buscar Yahoo Finance:", error);
      res.status(500).json({ error: "Falha ao buscar cotações reais" });
    }
  });

  // Configuração do Vite (Middleware para desenvolvimento / Static para produção)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
