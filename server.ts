import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import yahooFinance from "yahoo-finance2";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      const results: Record<string, number> = {};
      
      // Busca em lote (batch)
      const quotes = await yahooFinance.quote(tickerList) as any[];
      
      // Mapeia de volta para o ticker original (sem .SA)
      quotes.forEach((quote: any) => {
        const originalTicker = quote.symbol.replace(".SA", "");
        results[originalTicker] = quote.regularMarketPrice || quote.postMarketPrice || 0;
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
