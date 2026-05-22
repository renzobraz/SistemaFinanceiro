import express from "express";
import cors from "cors";
import path from "path";
import YahooFinance from "yahoo-finance2";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { rateLimit } from "express-rate-limit";
import crypto from "crypto";
import helmet from "helmet";

const yahoo = new YahooFinance();

// =========================================================================
// I5 — FUNÇÃO DE MASCARAMENTO DE E-MAIL PARA LGPD
// =========================================================================
function maskEmail(email: string): string {
  if (!email || typeof email !== "string") return "";
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const [local, domain] = parts;
  if (!local) return email;
  return `${local[0]}***@${domain}`;
}

// =========================================================================
// M4 — FUNÇÕES DE CRIPTOGRAFIA PARA SENHA SMTP (PROTEÇÃO DE CREDENCIAIS)
// =========================================================================
const encryptionAlgorithm = "aes-256-gcm";

function encrypt(text: string, keyString: string): string {
  let key = Buffer.from(keyString, "hex");
  if (key.length !== 32) {
    key = Buffer.from(keyString, "base64");
  }
  if (key.length !== 32) {
    key = Buffer.from(keyString, "utf-8");
  }
  if (key.length !== 32) {
    throw new Error("A chave SMTP_ENCRYPTION_KEY deve ter exatamente 32 bytes (64 caracteres hex ou 32 caracteres brutos)");
  }

  const iv = crypto.randomBytes(12); // GCM usa IV de 12 bytes
  const cipher = crypto.createCipheriv(encryptionAlgorithm, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  
  // Retorna com formato iv:tag:conteudo para fácil identificação e parsing posterior
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

function decrypt(encryptedText: string, keyString: string): string {
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    // Se o formato não for iv:tag:conteudo, consideramos compatibilidade reversa (texto puro)
    return encryptedText;
  }

  let key = Buffer.from(keyString, "hex");
  if (key.length !== 32) {
    key = Buffer.from(keyString, "base64");
  }
  if (key.length !== 32) {
    key = Buffer.from(keyString, "utf-8");
  }
  if (key.length !== 32) {
    throw new Error("A chave SMTP_ENCRYPTION_KEY deve ter exatamente 32 bytes (64 caracteres hex ou 32 caracteres brutos)");
  }

  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = crypto.createDecipheriv(encryptionAlgorithm, key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encrypted, undefined as any, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

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

async function robustChart(symbol: string, options: any) {
  try {
    return await yahoo.chart(symbol, options);
  } catch (e: any) {
    if (e.result) return e.result;
    throw sanitizeYahooError(e);
  }
}

const app = express();

// Helmet para cabeçalhos de segurança HTTP (I4)
if (process.env.NODE_ENV === "production") {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://*", "http://*"],
        connectSrc: [
          "'self'",
          "https://*.supabase.co",
          "https://*.supabase.in", 
          "wss://*.supabase.co",
          "wss://*.supabase.in",
          "https://api.exchangerate-api.com",
          "https://*",
          "wss://*"
        ],
        frameAncestors: ["'self'"]
      }
    },
    frameguard: {
      action: "sameorigin"
    }
  }));
} else {
  // Flexibilização em desenvolvimento para permitir o preview no AI Studio
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://*", "http://*"],
        connectSrc: [
          "'self'",
          "https://*.supabase.co",
          "https://*.supabase.in", 
          "wss://*.supabase.co",
          "wss://*.supabase.in",
          "https://api.exchangerate-api.com",
          "https://*",
          "wss://*",
          "http://localhost:*",
          "ws://localhost:*"
        ],
        frameAncestors: ["'self'", "https://*.google.com", "https://*.googleusercontent.com", "https://*.run.app"]
      }
    },
    frameguard: false
  }));
}

// Inicialização do Gemini no Servidor
const keysToTry = [
  process.env.GEMINI_API_KEY,
  process.env.VITE_GEMINI_API_KEY
].map(k => (k || "").trim());

const isValidGeminiKey = (key: string) => {
  if (!key) return false;
  if (key.startsWith("AIzaSy")) return true;
  if (key.length < 20) return false;
  if (key.includes(" ") || key.includes("•")) return false;
  return true;
};

const geminiApiKey = keysToTry.find(isValidGeminiKey) || "";

let genAI: GoogleGenAI | null = null;
if (geminiApiKey) {
  try {
    genAI = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
    console.log("[Gemini] IA configurada no servidor para fallback de preços.");
  } catch (err) {
    console.error("[Gemini] Erro ao instanciar genAI:", err);
  }
}

// CONFIGURAÇÃO CORS (C3)
const allowedOrigins: string[] = [];
if (process.env.VITE_APP_URL) {
  allowedOrigins.push(process.env.VITE_APP_URL.trim().replace(/\/$/, ""));
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    
    const parsedOrigin = origin.trim().replace(/\/$/, "");
    
    if (
      /^https?:\/\/localhost(:\d+)?$/.test(parsedOrigin) || 
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(parsedOrigin)
    ) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(parsedOrigin)) {
      return callback(null, true);
    }
    
    if (parsedOrigin.endsWith("-renzobraz.vercel.app")) {
      return callback(null, true);
    }

    if (
      parsedOrigin.endsWith(".run.app") ||
      parsedOrigin.endsWith(".googleusercontent.com") ||
      parsedOrigin.endsWith(".google.com")
    ) {
      return callback(null, true);
    }
    
    console.warn(`[CORS] Origem não autorizada: ${origin}`);
    return callback(new Error("CORS: Origem não permitida"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// =========================================================================
// M1 — CONFIGURAÇÃO DE RATE LIMITING
// =========================================================================
const inviteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Muitos convites enviados de forma recente. Aguarde alguns minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

const emailTestRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: "Muitos testes efetuados. Aguarde alguns minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// MIDDLEWARE DE AUTENTICAÇÃO VIA JWT DO SUPABASE (C2)
const requireAuth = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('[RequireAuth] Header presente:', !!authHeader);
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log('[RequireAuth] Token ausente ou inválido');
      return res.status(401).json({ error: "Acesso negado: Bearer token ausente" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      console.log('[RequireAuth] Token vazio extraído do Bearer');
      return res.status(401).json({ error: "Acesso negado: Token ausente" });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_KEY;

    console.log('[RequireAuth] Supabase URL presente:', !!supabaseUrl);
    console.log('[RequireAuth] Supabase Key presente:', !!supabaseKey);

    if (!supabaseUrl || !supabaseKey) {
      console.error('[RequireAuth] Variáveis de ambiente ausentes!');
      return res.status(500).json({ error: "Configuração do banco ausente no servidor" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    console.log('[RequireAuth] User encontrado:', !!user, 'Erro:', error?.message);

    if (error || !user) {
      return res.status(401).json({ error: "Não autorizado: Token inválido" });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err: any) {
    console.error("[RequireAuth] Erro crítico:", err.message);
    return res.status(500).json({ error: "Erro de autenticação" });
  }
};

// API Send-Invite
app.post("/api/send-invite", requireAuth, inviteRateLimiter, async (req, res) => {
  try {
    const { email, invitedBy, ownerId, role } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || typeof email !== "string" || !emailRegex.test(email.toLowerCase().trim())) {
      return res.status(400).json({ error: "E-mail de destino inválido." });
    }

    if (!role || typeof role !== "string" || !["viewer", "editor", "admin"].includes(role)) {
      return res.status(400).json({ error: "Nível de acesso inválido." });
    }

    if (!invitedBy || typeof invitedBy !== "string" || !emailRegex.test(invitedBy.toLowerCase().trim())) {
      return res.status(400).json({ error: "E-mail do remetente inválido." });
    }

    if (!ownerId || typeof ownerId !== "string" || ownerId.trim().length === 0) {
      return res.status(400).json({ error: "ID do proprietário obrigatório." });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Configuração do banco de dados ausente." });
    }
    
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
        const encryptionKey = process.env.SMTP_ENCRYPTION_KEY;
        if (encryptionKey && smtpConfig.pass) {
          try {
            smtpConfig.pass = decrypt(smtpConfig.pass, encryptionKey);
          } catch (decError: any) {
            console.error("[SMTP] Erro ao decriptografar a senha:", decError.message);
          }
        }
      }
    }

    const transporter = nodemailer.createTransport({
      host: smtpConfig?.host || "smtp.gmail.com",
      port: parseInt(String(smtpConfig?.port || "465")),
      secure: String(smtpConfig?.port || "465") === "465", 
      auth: {
        user: smtpConfig?.user || "",
        pass: smtpConfig?.pass || "",
      },
    });

    const appUrl = (process.env.VITE_APP_URL || "").replace(/\/$/, "");
    
    const mailOptions = {
      from: smtpConfig ? `"${smtpConfig.from_name}" <${smtpConfig.from_email}>` : `"FinControl" <no-reply@fincontrol.com>`,
      to: email.toLowerCase().trim(),
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
             <a href="${appUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
               Acessar e Aceitar Convite
             </a>
          </div>
          <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
             <strong>Instruções:</strong> Se você ainda não tem conta, cadastre-se usando o e-mail <strong>${email}</strong>. 
             Após o login, acesse <strong>"Gerenciar Equipe"</strong> para aceitar o convite.
          </p>
        </div>
      `,
    };

    console.log(`[SMTP] Enviando convite para ${maskEmail(email)}...`);
    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (error: any) {
    console.error("[SMTP] Erro ao enviar convite:", error);
    res.status(500).json({ error: "Falha ao enviar e-mail", details: error.message });
  }
});

// API Test-Email
app.post("/api/test-email", requireAuth, emailTestRateLimiter, async (req, res) => {
  try {
    const { settings, testEmail } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!testEmail || typeof testEmail !== "string" || !emailRegex.test(testEmail.toLowerCase().trim())) {
      return res.status(400).json({ error: "E-mail de teste inválido." });
    }

    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "Configurações SMTP ausentes." });
    }

    const { host, port, user, pass, from_name, from_email } = settings;

    if (!host || typeof host !== "string" || host.trim().length === 0) {
      return res.status(400).json({ error: "Host SMTP obrigatório." });
    }

    const parsedPort = parseInt(port);
    if (isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
      return res.status(400).json({ error: "Porta SMTP inválida." });
    }

    if (!user || typeof user !== "string" || user.trim().length === 0) {
      return res.status(400).json({ error: "Usuário SMTP obrigatório." });
    }

    if (!pass || typeof pass !== "string" || pass.trim().length === 0) {
      return res.status(400).json({ error: "Senha SMTP obrigatória." });
    }

    if (!from_name || typeof from_name !== "string" || from_name.trim().length === 0) {
      return res.status(400).json({ error: "Nome do remetente obrigatório." });
    }

    if (!from_email || typeof from_email !== "string" || !emailRegex.test(from_email.toLowerCase().trim())) {
      return res.status(400).json({ error: "E-mail do remetente inválido." });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parsedPort,
      secure: parsedPort === 465,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    const mailOptions = {
      from: `"${from_name}" <${from_email}>`,
      to: testEmail.toLowerCase().trim(),
      subject: "FinControl - Teste de Configuração SMTP",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 2px solid #2563eb; border-radius: 20px; background-color: #ffffff;">
          <h1 style="color: #2563eb; margin-bottom: 20px;">Teste Bem Sucedido! 🎉</h1>
          <p style="font-size: 16px; color: #1e293b;">Esta é uma mensagem de teste para confirmar o SMTP no <strong>FinControl</strong>.</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 10px; margin: 20px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 14px; color: #64748b;"><strong>Horário:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;"><strong>Servidor:</strong> ${host}:${parsedPort}</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (error: any) {
    console.error("[SMTP-TEST] Erro no teste:", error);
    res.status(500).json({ error: "Falha no teste de e-mail", details: error.message });
  }
});

// API SMTP Settings - GET
app.get("/api/smtp-settings", requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Configuração do banco ausente" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('smtp_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      const encryptionKey = process.env.SMTP_ENCRYPTION_KEY;
      if (encryptionKey && data.pass) {
        try {
          data.pass = decrypt(data.pass, encryptionKey);
        } catch (decError: any) {
          console.error("[SMTP-GET] Falha na descriptografia:", decError.message);
        }
      }
      return res.json(data);
    }

    return res.json(null);
  } catch (err: any) {
    console.error("[SMTP-GET] Erro:", err);
    return res.status(500).json({ error: "Falha ao obter configurações", details: err.message });
  }
});

// API SMTP Settings - POST
app.post("/api/smtp-settings", requireAuth, async (req: any, res: any) => {
  console.log('[SMTP-POST] Requisição recebida');
  console.log('[SMTP-POST] Body:', JSON.stringify(req.body));
  console.log('[SMTP-POST] SMTP_ENCRYPTION_KEY presente:', !!process.env.SMTP_ENCRYPTION_KEY);
  console.log('[SMTP-POST] User:', req.user?.id);
  try {
    const userId = req.user.id;
    const settings = req.body;

    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "Entrada inválida" });
    }

    const { host, port, user, pass, from_name, from_email } = settings;

    if (!host || !port || !user || !pass || !from_name || !from_email) {
      return res.status(400).json({ error: "Todos os campos do SMTP são obrigatórios." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(from_email.toLowerCase().trim())) {
      return res.status(400).json({ error: "E-mail de remetente inválido." });
    }

    const parsedPort = parseInt(port);
    if (isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
      return res.status(400).json({ error: "Porta SMTP inválida." });
    }

    const encryptionKey = process.env.SMTP_ENCRYPTION_KEY;
    if (!encryptionKey) {
      return res.status(500).json({ error: "SMTP_ENCRYPTION_KEY não configurada no servidor." });
    }

    let encryptedPass = pass;
    try {
      encryptedPass = encrypt(pass, encryptionKey);
    } catch (encError: any) {
      return res.status(500).json({ error: "Falha ao criptografar dados.", details: encError.message });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Configuração do banco ausente" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = {
      host,
      port: parsedPort,
      user,
      pass: encryptedPass,
      from_name,
      from_email: from_email.toLowerCase().trim(),
      user_id: userId,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('smtp_settings')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      console.error("[SMTP-SAVE] Erro de banco no Supabase:", error);
      throw error;
    }

    return res.json({ success: true, message: "SMTP salvo com sucesso." });
  } catch (err: any) {
    console.error("[SMTP-SAVE] Exception capturada completa:", err);
    if (err && err.stack) {
      console.error("[SMTP-SAVE] Stack trace:", err.stack);
    }
    return res.status(500).json({ error: "Falha ao salvar configurações", details: err ? err.message || String(err) : "Erro desconhecido" });
  }
});

// Middleware de Logs
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// API Prices
app.get("/api/prices", async (req, res) => {
  try {
    const { tickers } = req.query;
    if (!tickers || typeof tickers !== "string") {
      return res.status(400).json({ error: "Tickers são obrigatórios" });
    }

    const rawTickerList = tickers.split(",").map(t => t.trim()).filter(t => t.length > 0);
    const results: Record<string, { current: number | null; target: number | null; debugTicker?: string }> = {};
    const tickerMap = new Map<string, string>();
    
    rawTickerList.forEach(t => {
      let cleanTicker = t.toUpperCase().trim();
      cleanTicker = cleanTicker.replace(/\s*\(.*?\)/g, "").replace(/\s*\[.*?\]/g, "").trim();

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

    try {
      let quotesArray: any[] = [];
      try {
        const quotes = await robustQuote(yahooTickers);
        quotesArray = Array.isArray(quotes) ? quotes : [quotes];
        quotesArray = quotesArray.filter(q => q && q.symbol);
      } catch (batchError: any) {
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

      rawTickerList.forEach(t => {
        const ySym = tickerMap.get(t)?.toUpperCase() || "";
        results[t].current = priceMap.get(ySym) || priceMap.get(ySym.replace(".SA", "")) || null;
      });

      // Brapi Fallback
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

      // HG Brasil Fallback
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

      // Gemini Fallback
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
        } catch (aiErr) {}
      }

      // Target Price mean
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
      rawTickerList.forEach(originalTicker => {
        results[originalTicker] = { current: null, target: null };
      });
    }

    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao processar cotações" });
  }
});

// API History
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
      return res.json([]); 
    }

    const history = (result.quotes as any[]).map(q => ({
      date: q.date instanceof Date ? q.date.toISOString().split('T')[0] : q.date,
      close: q.close
    })).filter(q => q.close !== null && q.close !== undefined);

    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: "Falha ao buscar histórico" });
  }
});

// API Rates
app.get("/api/rates", async (req, res) => {
  try {
    const response = await fetch("https://api.exchangerate-api.com/v4/latest/BRL");
    if (!response.ok) throw new Error(`Falha na API: ${response.status}`);
    
    const data: any = await response.json();
    res.json(data);
  } catch (error: any) {
    res.json({
      rates: { BRL: 1, USD: 0.19, EUR: 0.17, GBP: 0.15 },
      base: "BRL"
    });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Rota da API não encontrada" });
});

app.use("/api", (err: any, req: any, res: any, next: any) => {
  res.status(500).json({ error: "Erro interno na API" });
});

export default app;
