import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import YahooFinance from "yahoo-finance2";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { createServer as createViteServer } from "vite";

const yahoo = new YahooFinance();

// Configuração simplificada para reduzir logs de validação
try {
  if (typeof (yahoo as any).setGlobalConfig === 'function') {
    (yahoo as any).setGlobalConfig({
      validation: { logErrors: false, logOptions: { width: 1 } }
    });
  }
} catch (e) {}

// --- SILENCIADOR DE LOGS DO YAHOO-FINANCE2 (ROBUSTO) ---
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

const STRINGS_FILTRO = [
  'Failed Yahoo Schema validation',
  'help is always appreciated',
  'subErrors',
  'QuoteResponseArray',
  'QuoteSummaryResult'
];

const deveSilenciar = (args: any[]) => {
  return args.some(arg => {
    try {
      if (!arg) return false;
      const str = typeof arg === 'string' ? arg : JSON.stringify(arg);
      return str && STRINGS_FILTRO.some(s => str.includes(s));
    } catch (e) {
      return STRINGS_FILTRO.some(s => String(arg).includes(s));
    }
  });
};

console.log = (...args: any[]) => {
  if (deveSilenciar(args)) return;
  originalLog.apply(console, args);
};

console.warn = (...args: any[]) => {
  if (deveSilenciar(args)) return;
  originalWarn.apply(console, args);
};

console.error = (...args: any[]) => {
  if (deveSilenciar(args)) return;
  originalError.apply(console, args);
};
// -----------------------------------------------------------

// O Yahoo Finance 3.x silencia erros de validação via configuração ou catch
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeYahooError(e: any): any {
  if (e && typeof e === 'object') {
    // Remove propriedades verbosas e pesadas do yahoo-finance2
    const propsParaRemover = ['errors', 'subErrors', 'raw', 'validation', 'stack', 'help'];
    propsParaRemover.forEach(p => {
      try {
        if (p in e) delete (e as any)[p];
      } catch (err) {}
    });
    
    // Força limpeza se ainda houver rastro de erros (como subErrors)
    if (e.errors) try { delete e.errors; } catch(err) {}
    if (e.subErrors) try { delete e.subErrors; } catch(err) {}
    
    if (e.message && typeof e.message === 'string') {
      const cleanMsg = e.message
        .split('\n')[0]
        .split('https://')[0]
        .split('validation failed')[0]
        .split('Failed validation')[0]
        .trim();
      
      e.message = cleanMsg || "Erro de dados no Yahoo Finance";
    }
  }
  return e;
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

async function robustChart(symbol: string, options: any) {
  try {
    return await yahoo.chart(symbol, options);
  } catch (e: any) {
    if (e.result) return e.result;
    throw sanitizeYahooError(e);
  }
}

async function startServer() {
  const PORT = 3000;
  const app = express();

  app.use(cors());
  app.use(express.json());

  // API para enviar convite por e-mail
  app.post("/api/send-invite", async (req, res) => {
    try {
      const { email, invitedBy, ownerId, role } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "E-mail é obrigatório" });
      }

      // Conecta ao Supabase para buscar configurações de SMTP do dono da conta
      // Usaremos as chaves padrão se não houver no ambiente
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://uiekbavvgvrcsmbvoqtt.supabase.co";
      const supabaseKey = process.env.VITE_SUPABASE_KEY || "sb_publishable_L3w_v81e9H5oz9fWt-DW2Q_bMtQjQsx";
      const supabase = createClient(supabaseUrl, supabaseKey);

      let smtpConfig: any = null;

      if (ownerId) {
        const { data, error } = await supabase
          .from('smtp_settings')
          .select('*')
          .eq('user_id', ownerId)
          .single();
        
        if (!error && data) {
          smtpConfig = data;
          console.log(`[SMTP] Usando configurações personalizadas encontradas para o usuário ${ownerId}`);
        }
      }

      // Configuração do transportador SMTP
      const transporter = nodemailer.createTransport({
        host: smtpConfig?.host || process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(String(smtpConfig?.port || process.env.SMTP_PORT || "465")),
        secure: String(smtpConfig?.port || process.env.SMTP_PORT || "465") === "465", 
        auth: {
          user: smtpConfig?.user || process.env.SMTP_USER,
          pass: smtpConfig?.pass || process.env.SMTP_PASS,
        },
      });

      const appUrl = process.env.VITE_APP_URL || "http://localhost:3000";
      
      const mailOptions = {
        from: smtpConfig ? `"${smtpConfig.from_name}" <${smtpConfig.from_email}>` : (process.env.SMTP_FROM || `"FinControl" <no-reply@fincontrol.com>`),
        to: email,
        subject: `Você foi convidado para a equipe do FinControl`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #2563eb; margin: 0; font-size: 24px; font-weight: 800;">FinControl</h1>
            </div>
            
            <h2 style="color: #1e293b; font-size: 20px; font-weight: 700; margin-bottom: 16px;">Olá!</h2>
            
            <p style="font-size: 16px; line-height: 1.6; color: #475569; margin-bottom: 20px;">
              O usuário <strong>${invitedBy}</strong> acaba de convidar você para colaborar no controle financeiro dele através do <strong>FinControl</strong>.
            </p>
            
            <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
               <p style="margin: 0; font-size: 14px; color: #64748b;">Nível de acesso concedido:</p>
               <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 800; color: #2563eb; text-transform: uppercase;">
                 ${role === 'admin' ? 'Administrador' : role === 'editor' ? 'Editor' : 'Visualizador'}
               </p>
            </div>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${appUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
                Acessar e Aceitar Convite
              </a>
            </div>
            
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
              <strong>Instruções:</strong> Se você ainda não tem conta, cadastre-se no sistema usando o e-mail <strong>${email}</strong>. 
              Após o login, vá na aba <strong>"Gerenciar Equipe"</strong> para aceitar este convite.
            </p>
          </div>
        `,
      };

      console.log(`[SMTP] Tentando enviar e-mail para ${email}...`);
      await transporter.sendMail(mailOptions);
      console.log(`[SMTP] E-mail enviado com sucesso para ${email}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SMTP] Erro ao enviar e-mail:", error);
      res.status(500).json({ error: "Falha ao enviar e-mail", details: error.message });
    }
  });

  // API para testar SMTP
  app.post("/api/test-email", async (req, res) => {
    try {
      const { settings, testEmail } = req.body;
      
      if (!testEmail) {
        return res.status(400).json({ error: "E-mail de teste é obrigatório" });
      }

      const transporter = nodemailer.createTransport({
        host: settings.host,
        port: parseInt(settings.port),
        secure: String(settings.port) === "465",
        auth: {
          user: settings.user,
          pass: settings.pass,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
      });

      const mailOptions = {
        from: `"${settings.from_name}" <${settings.from_email}>`,
        to: testEmail,
        subject: "FinControl - Teste de Configuração SMTP",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 2px solid #2563eb; border-radius: 20px; background-color: #ffffff;">
            <h1 style="color: #2563eb; margin-bottom: 20px;">Teste Bem Sucedido! 🎉</h1>
            <p style="font-size: 16px; color: #1e293b;">Esta é uma mensagem automática para confirmar que suas configurações de SMTP no <strong>FinControl</strong> estão corretas.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 10px; margin: 20px 0; border: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 14px; color: #64748b;"><strong>Horário do teste:</strong> ${new Date().toLocaleString('pt-BR')}</p>
              <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;"><strong>Servidor:</strong> ${settings.host}:${settings.port}</p>
            </div>
            <p style="font-size: 14px; color: #94a3b8;">Agora você pode convidar sua equipe com tranquilidade.</p>
          </div>
        `,
      };

      console.log(`[SMTP-TEST] Tentando enviar e-mail de teste para ${testEmail}...`);
      await transporter.sendMail(mailOptions);
      console.log(`[SMTP-TEST] E-mail de teste enviado com sucesso!`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SMTP-TEST] Erro no teste:", error);
      res.status(500).json({ error: "Falha no teste de e-mail", details: error.message });
    }
  });

  // Middleware de log simples para debug
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // API para buscar preços reais do Yahoo Finance
  console.log("Registrando rotas da API...");
  app.get("/api/prices", async (req, res) => {
    try {
      const { tickers } = req.query;
      if (!tickers || typeof tickers !== "string") {
        return res.status(400).json({ error: "Tickers são obrigatórios" });
      }

      const rawTickerList = tickers.split(",").map(t => t.trim()).filter(t => t.length > 0);
      const results: Record<string, { current: number | null; target: number | null; debugTicker?: string }> = {};
      const tickerMap = new Map<string, string>(); // original -> yahoo
      
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

      console.log(`[Backend] Tickers processados: ${Array.from(tickerMap.entries()).map(([k, v]) => `${k}->${v}`).join(" | ")}`);
      
      const yahooTickers = Array.from(new Set(tickerMap.values()));

      try {
        // --- BUSCA 1: YAHOO FINANCE ---
        let quotesArray: any[] = [];
        try {
          console.log(`[Yahoo] Buscando: ${yahooTickers.join(", ")}`);
          const quotes = await robustQuote(yahooTickers);
          quotesArray = Array.isArray(quotes) ? quotes : [quotes];
          quotesArray = quotesArray.filter(q => q && q.symbol);
        } catch (batchError: any) {
          console.warn(`[Yahoo] Erro em lote: ${batchError.message}. Tentando individualmente...`);
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
            // Também tenta salvar sem o .SA se existir
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
          console.log(`[Brapi] Fallback para: ${missingFromYahoo.join(", ")}`);
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
                      console.log(`[Brapi] Encontrado: ${t} -> ${r.regularMarketPrice}`);
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
          console.log(`[HG Brasil] Fallback para: ${stillMissing.join(", ")}`);
          try {
            const hTickers = Array.from(new Set(stillMissing.map(t => (tickerMap.get(t) || t).replace(".SA", "")))).join(",");
            const key = process.env.HGBRASIL_API_KEY || "703816a7";
            const response = await fetch(`https://api.hgbrasil.com/finance/stock_price?key=${key}&symbol=${hTickers}`);
            if (response.ok) {
              const dataValue: any = await response.json();
              if (dataValue && dataValue.results) {
                Object.keys(dataValue.results).forEach(sym => {
                  const r = dataValue.results[sym];
                  if (r && typeof r.price === 'number' && r.price > 0) {
                    const rSym = sym.toUpperCase();
                    stillMissing.forEach(t => {
                      if (t.toUpperCase().includes(rSym) || rSym.includes(t.toUpperCase().replace(/\s*\(.*?\)/, "").trim())) {
                        results[t].current = r.price;
                        console.log(`[HG Brasil] Encontrado: ${t} -> ${r.price}`);
                      }
                    });
                  }
                });
              }
            }
          } catch (e) {}
        }
        // --------------------------------------------------

        // Busca Target Price (Preço Alvo) - Apenas Yahoo continua fazendo isso
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

        console.log(`[Backend] Preços processados (Yahoo + Brapi + HG Fallbacks) para ${Object.keys(results).length} ativos.`);

      } catch (error: any) {
        const cleanErr = sanitizeYahooError(error);
        console.error(`[Yahoo] Erro total no processamento: ${cleanErr.message}`);
        rawTickerList.forEach(originalTicker => {
          results[originalTicker] = { current: null, target: null };
        });
      }

      res.json(results);
    } catch (error: any) {
      const cleanErr = sanitizeYahooError(error);
      console.error(`Erro no endpoint /api/prices: ${cleanErr.message}`);
      res.status(500).json({ error: "Falha ao processar cotações reais", details: cleanErr.message });
    }
  });

  // API para buscar histórico de preços (1 ano)
  app.get("/api/history", async (req, res) => {
    try {
      const { ticker } = req.query;
      if (!ticker || typeof ticker !== "string") {
        return res.status(400).json({ error: "Ticker é obrigatório" });
      }

      let symbol = ticker.trim().toUpperCase();
      if (/^[A-Z]{4}[0-9]{1,2}$/.test(symbol)) {
        symbol = `${symbol}.SA`;
      }

      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 1);

      let result: any;
      try {
        result = await robustChart(symbol, {
          period1: startDate,
          period2: endDate,
          interval: "1d"
        });
      } catch (chartError: any) {
        const cleanErr = sanitizeYahooError(chartError);
        console.error(`[Yahoo] Erro no histórico para ${symbol}: ${cleanErr.message}`);
        return res.json([]); 
      }

      const history = (result.quotes as any[]).map(q => ({
        // Formatar como string YYYY-MM-DD para evitar shifts de timezone no JSON.stringify
        date: q.date instanceof Date ? q.date.toISOString().split('T')[0] : q.date,
        close: q.close
      })).filter(q => q.close !== null && q.close !== undefined);

      res.json(history);
    } catch (error: any) {
      const cleanErr = sanitizeYahooError(error);
      console.error(`Erro no endpoint /api/history: ${cleanErr.message}`);
      res.status(500).json({ error: "Falha ao buscar histórico", details: cleanErr.message });
    }
  });

  // Middleware para garantir que rotas /api que não existem retornem 404 JSON 
  // e não caiam no fallback do Vite (que retorna index.html com status 200)
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Rota da API não encontrada" });
  });

  // Middleware de erro para API
  app.use("/api", (err: any, req: any, res: any, next: any) => {
    const cleanErr = sanitizeYahooError(err);
    console.error("API Error:", cleanErr.message);
    res.status(500).json({ error: "Erro interno na API", details: cleanErr.message });
  });

  // Configuração do Vite/Static
  if (process.env.NODE_ENV !== "production") {
    console.log("Configurando Vite...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite pronto.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Inicia o servidor apenas após todas as rotas serem registradas
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`>>> Servidor ouvindo na porta ${PORT}. Pronto para receber requisições.`);
  });

  server.on('error', (err: any) => {
    console.error('Erro crítico no servidor:', err);
  });
}

startServer();
