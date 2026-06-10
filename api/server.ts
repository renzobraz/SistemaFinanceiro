import express from "express";
import cors from "cors";
import YahooFinance from "yahoo-finance2";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { createRequire } from "module";
import { rateLimit } from "express-rate-limit";
import crypto from "crypto";
import helmet from "helmet";
// parseItauFaturaWithRegex definida inline abaixo (compatibilidade Vercel serverless)

const require = createRequire(import.meta.url);
const pdfParseRaw = require("pdf-parse");

// Adapter Pattern: compatibilidade universal com pdf-parse v1.x, v2.x e interop ESM/CJS
let pdfParse: (buffer: Buffer, options?: any) => Promise<{ text: string }>;

if (typeof pdfParseRaw === "function") {
  // Caso 1: pdf-parse v1.x — exporta função diretamente
  pdfParse = pdfParseRaw;
} else if (pdfParseRaw && typeof pdfParseRaw.default === "function") {
  // Caso 2: interoperabilidade ESM/CJS — função em .default
  pdfParse = pdfParseRaw.default;
} else if (pdfParseRaw && typeof pdfParseRaw.PDFParse === "function") {
  // Caso 3: pdf-parse v2.x — exporta classe PDFParse
  pdfParse = async (buffer: Buffer, options?: any) => {
    const parser = new pdfParseRaw.PDFParse({ data: buffer, ...options });
    const result = await parser.getText();
    return { text: result.text || "" };
  };
} else {
  // Fallback seguro: tentar chamar com qualquer formato disponível
  pdfParse = async (buffer: Buffer, options?: any) => {
    const fn = pdfParseRaw?.default?.default || pdfParseRaw?.default || pdfParseRaw;
    if (typeof fn !== "function") {
      throw new Error("pdf-parse: formato de exportação não reconhecido.");
    }
    return fn(buffer, options);
  };
}

// =========================================================================
// PARSER DE FATURA ITAÚ — INLINE (resolve ERR_MODULE_NOT_FOUND no Vercel)
// =========================================================================
export function parsePtBrFloat(str: string): number {
  if (!str) return 0;
  const clean = str.replace(/\./g, "").replace(",", ".");
  return parseFloat(clean) || 0;
}

export function parseDateToIso(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.trim().split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

export interface FaturaLancamento {
  data: string;           // "dd/mm" conforme consta na fatura
  estabelecimento: string; // nome limpo do estabelecimento
  valor: number;          // em reais, negativo para estornos
  parcela_atual?: number; // ex: 10 (de "10/18")
  total_parcelas?: number; // ex: 18 (de "10/18")
  e_parcelado: boolean;
  e_estorno: boolean;     // true se valor negativo
  cartao_final: string;   // qual cartão gerou este lançamento
}

export interface CartaoInfo {
  titular: string;
  final: string;
  total: number;  // valor total dos lançamentos deste cartão
}

export interface FaturaParseResult {
  titular: string;
  cartao_final: string;   // ex: "2933"
  cartoes: CartaoInfo[];  // todos os cartões encontrados
  vencimento: string;     // "dd/mm/yyyy"
  total_fatura: number;
  lancamentos: FaturaLancamento[];
  erros_parse: string[];  // linhas que não foram reconhecidas
}

export function parseItauFaturaWithRegex(pdfText: string): FaturaParseResult {
  const lines = pdfText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let vencimento = "";
  let total_fatura = 0;
  let titular = "Não identificado";
  let cartao_final = "";

  // Extrair metadados: vencimento e total
  for (const line of lines) {
    const vencMatch = line.match(/Vencimento:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (vencMatch) vencimento = vencMatch[1];
    const totalMatch = line.match(/Total desta fatura\s*([\d.]+,\d{2})/i);
    if (totalMatch) total_fatura = parsePtBrFloat(totalMatch[1]);
  }

  // Extrair totais âncora por cartão: "Lançamentos no cartão (final XXXX) YY.YYY,YY"
  const anchorMap: Record<string, number> = {};
  const anchorRe = /Lan[çc]amentos\s+no\s+cart[ãa]o\s+\(final\s+(\d{4})\)\s+([\d.]+,\d{2})/gi;
  let am;
  while ((am = anchorRe.exec(pdfText)) !== null) {
    anchorMap[am[1]] = parsePtBrFloat(am[2]);
  }

  // Extrair ordem dos cartões pela ordem de aparição dos headers
  const cardOrderMap: Array<{ final: string; titular: string }> = [];
  const headerRe = /([A-ZÁÀÃÂÉÊÍÓÔÕÚÇa-záàãâéêíóôõúç\s]+)\(final\s+(\d{4})\)/gi;
  let hm;
  while ((hm = headerRe.exec(pdfText)) !== null) {
    const cardFinal = hm[2].trim();
    if (!cardOrderMap.some(c => c.final === cardFinal)) {
      cardOrderMap.push({ final: cardFinal, titular: hm[1].trim() });
    }
  }

  if (cardOrderMap.length > 0) {
    titular = cardOrderMap[0].titular;
    cartao_final = cardOrderMap[0].final;
  }

  // Capturar TODOS os lançamentos antes da âncora de parada
  const LAUNCH_RE = /^[@⊕⊞\W]*(\d{2}\/\d{2})\s+(.+?)\s+(?:(\d{2})\/(\d{2})\s+)?(-?\s*[\d.]+,\d{2})$/;
  const CAT_RE = /^[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ\s]+\s+\.[A-Z\s]+$/i;

  const rawItems: Array<{
    data: string; estabelecimento: string; valor: number;
    parcela_atual?: number; total_parcelas?: number;
    e_parcelado: boolean; e_estorno: boolean;
  }> = [];

  const erros_parse: string[] = [];

  for (const line of lines) {
    const lu = line.toUpperCase();
    // Parar ao encontrar fim dos lançamentos atuais
    if (lu.includes("TOTAL DOS LAN") || lu.includes("COMPRAS PARCELADAS - PR") ||
        (lu.includes("COMPRAS PARCELADAS") && lu.includes("XIMAS"))) {
      break;
    }
    // Ignorar categorias e cabeçalhos
    if (CAT_RE.test(line)) continue;
    if (lu.includes("DATA") && lu.includes("ESTABELECIMENTO")) continue;
    if (lu.includes("VALOR EM R$")) continue;

    if (/^[@⊕⊞\W]*\d{2}\/\d{2}/.test(line)) {
      const m = line.match(LAUNCH_RE);
      if (m) {
        let valStr = m[5].replace(/\s+/g, "");
        let isNeg = false;
        if (valStr.startsWith("-")) { isNeg = true; valStr = valStr.substring(1); }
        const valor = isNeg ? -parsePtBrFloat(valStr) : parsePtBrFloat(valStr);
        const partCurrent = m[3] ? parseInt(m[3], 10) : undefined;
        const partTotal = m[4] ? parseInt(m[4], 10) : undefined;
        rawItems.push({
          data: m[1],
          estabelecimento: m[2].trim().replace(/\s+/g, " "),
          valor,
          ...(partCurrent !== undefined ? { parcela_atual: partCurrent } : {}),
          ...(partTotal !== undefined ? { total_parcelas: partTotal } : {}),
          e_parcelado: partCurrent !== undefined && partTotal !== undefined,
          e_estorno: valor < 0,
        });
      } else {
        erros_parse.push(line);
      }
    }
  }

  // Distribuir lançamentos pelos cartões usando âncoras como limite
  // Algoritmo: para cada item, tentar colocar no primeiro cartão que ainda tem espaço
  // Itens que não cabem em nenhum cartão são parcelas futuras — ignorados
  const TOLERANCE = 5.0; // tolerância de R$5,00 para arredondamentos acumulados
  const cardAcc: Record<string, number> = {};
  const cardExhausted = new Set<string>();
  const lancamentos: FaturaLancamento[] = [];

  for (const item of rawItems) {
    let placed = false;
    for (const card of cardOrderMap) {
      if (cardExhausted.has(card.final)) continue;
      const anchor = anchorMap[card.final];
      if (anchor === undefined) {
        // Cartão sem âncora: aceitar tudo
        if (!cardAcc[card.final]) cardAcc[card.final] = 0;
        cardAcc[card.final] += Math.abs(item.valor);
        lancamentos.push({ ...item, cartao_final: card.final });
        placed = true;
        break;
      }
      const newAcc = (cardAcc[card.final] || 0) + Math.abs(item.valor);
      if (newAcc <= anchor + TOLERANCE) {
        cardAcc[card.final] = newAcc;
        if (newAcc >= anchor - TOLERANCE) cardExhausted.add(card.final);
        lancamentos.push({ ...item, cartao_final: card.final });
        placed = true;
        break;
      }
    }
    // Se não coube em nenhum cartão: é parcela futura, ignorar
    if (!placed) {
      // não adicionar em erros_parse — são parcelas futuras esperadas
    }
  }

  // Construir CartaoInfo
  const cartaoMap = new Map<string, CartaoInfo>();
  for (const card of cardOrderMap) {
    cartaoMap.set(card.final, { titular: card.titular, final: card.final, total: 0 });
  }
  for (const l of lancamentos) {
    if (cartaoMap.has(l.cartao_final)) {
      cartaoMap.get(l.cartao_final)!.total += l.valor;
    }
  }
  const cartoes = Array.from(cartaoMap.values());

  return {
    titular,
    cartao_final,
    cartoes,
    vencimento,
    total_fatura,
    lancamentos,
    erros_parse
  };
}
// =========================================================================


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

function getEncryptionKey(keyString?: string): Buffer {
  const rawKey = keyString || process.env.SMTP_ENCRYPTION_KEY || process.env.VITE_SUPABASE_KEY || "fincontrol_pro_fallback_encryption_key_default";
  
  // Se for uma string de 64 caracteres hexadecimais, converte para 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    try {
      const b = Buffer.from(rawKey, "hex");
      if (b.length === 32) return b;
    } catch (e) {}
  }
  
  // Se puder ser decodificado para exatamente 32 bytes, usa direto
  try {
    const bHex = Buffer.from(rawKey, "hex");
    if (bHex.length === 32) return bHex;
  } catch (e) {}

  try {
    const bB64 = Buffer.from(rawKey, "base64");
    if (bB64.length === 32) return bB64;
  } catch (e) {}
  
  try {
    const bUtf = Buffer.from(rawKey, "utf-8");
    if (bUtf.length === 32) return bUtf;
  } catch (e) {}

  // Caso contrário, fazemos o hashing determinístico SHA-256 para obter exactamente 32 bytes
  return crypto.createHash("sha256").update(rawKey).digest();
}

function encrypt(text: string, keyString?: string): string {
  const key = getEncryptionKey(keyString);
  const iv = crypto.randomBytes(12); // GCM usa IV de 12 bytes
  const cipher = crypto.createCipheriv(encryptionAlgorithm, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  
  // Retorna com formato iv:tag:conteudo para fácil identificação e parsing posterior
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

function decrypt(encryptedText: string, keyString?: string): string {
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    // Se o formato não for iv:tag:conteudo, consideramos compatibilidade reversa (texto puro)
    return encryptedText;
  }

  const key = getEncryptionKey(keyString);
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
app.set("trust proxy", 1);

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

app.use(express.json({ limit: "50mb" }));

// =========================================================================
// M1 — CONFIGURAÇÃO DE RATE LIMITING
// =========================================================================
const inviteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Muitos convites enviados de forma recente. Aguarde alguns minutos." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

const emailTestRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: "Muitos testes efetuados. Aguarde alguns minutos." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

const pdfLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { error: "Muitas requisições de leitura de PDF. Aguarde alguns minutos." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
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
app.post("/api/send-invite", requireAuth, inviteRateLimiter, async (req: any, res: any) => {
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
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${req.token}`
        }
      }
    });
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
    
    // Gerar link de convite real do Supabase Admin
    let actionLink = appUrl;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });

        // Extrai o email real antes do +wperms
        const realEmail = email.includes('+wperms_') 
          ? email.replace(/\+wperms_[^@]+/, '') 
          : email;

        // Tenta invite primeiro (novo usuário)
        let { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'invite',
          email: realEmail,
          options: { redirectTo: `${appUrl}/aceitar-convite` }
        });

        // Se usuário já existe, usa recovery (reset de senha)
        if (linkError?.message?.includes('already been registered')) {
          console.log('[INVITE] Usuário já existe — usando recovery link.');
          const recovery = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: realEmail,
            options: { redirectTo: `${appUrl}/aceitar-convite` }
          });
          linkData = recovery.data;
          linkError = recovery.error;
        }

        if (linkError) {
          console.error('[INVITE] Erro ao gerar link:', linkError.message);
        } else if (linkData?.properties?.action_link) {
          actionLink = linkData.properties.action_link;
          console.log('[INVITE] Link gerado com sucesso:', actionLink.substring(0, 60) + '...');
        }
      } catch (adminErr: any) {
        console.error('[INVITE] Falha no Supabase Admin:', adminErr.message);
      }
    } else {
      console.warn("[SMTP] SUPABASE_SERVICE_ROLE_KEY ausente. Usando link padrão.");
    }
    
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
             <a href="${actionLink}" style="background-color: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
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

app.post("/api/accept-invitation", requireAuth, async (req: any, res: any) => {
  try {
    const { invitationId, email } = req.body;
    const userId = req.user.id;

    if (!invitationId && !email) {
      return res.status(400).json({ error: "invitationId ou email obrigatório" });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) return res.status(500).json({ error: "Configuração ausente" });

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Busca o convite
    let invitation;
    if (invitationId) {
      const { data } = await admin.from('user_permissions').select('*').eq('id', invitationId).maybeSingle();
      invitation = data;
    } else if (email) {
      const [localPart, domain] = email.toLowerCase().trim().split('@');
      const { data } = await admin.from('user_permissions').select('*')
        .ilike('invited_email', `${localPart}%@${domain}`)
        .eq('status', 'pending')
        .maybeSingle();
      invitation = data;
    }

    if (!invitation) return res.status(404).json({ error: "Convite não encontrado" });

    // 2. Resolve organization_id
    let orgId = invitation.organization_id;
    if (!orgId) {
      const { data: org } = await admin
        .from('organizations')
        .select('id')
        .eq('owner_id', invitation.owner_id)
        .maybeSingle();
      orgId = org?.id;
    }
    if (!orgId) return res.status(400).json({ error: "Organização não encontrada" });

    // 3. Atualiza status usando o id do convite encontrado
    await admin.from('user_permissions').update({ status: 'active' }).eq('id', invitation.id);

    // 4. Insere em organization_members
    const { data: existing } = await admin
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      const baseRole = (invitation.role || 'viewer').split(':')[0];
      await admin.from('organization_members').insert({
        organization_id: orgId,
        user_id: userId,
        role: baseRole,
        invited_by: invitation.owner_id
      });
    }

    // 5. Insere user_wallet_permissions
    const roleStr = invitation.role || '';
    const colonIdx = roleStr.indexOf(':');
    if (colonIdx > -1) {
      const walletMap = JSON.parse(roleStr.substring(colonIdx + 1));
      const inserts = Object.entries(walletMap)
        .filter(([k]) => !k.startsWith('_'))
        .map(([walletId, profileId]) => ({
          organization_id: orgId,
          user_id: userId,
          wallet_id: walletId,
          profile_id: profileId as string
        }));

      if (inserts.length > 0) {
        await admin.from('user_wallet_permissions').delete()
          .eq('organization_id', orgId).eq('user_id', userId);
        await admin.from('user_wallet_permissions').insert(inserts);
      }
    }

    return res.json({ success: true, organizationId: orgId });
  } catch (err: any) {
    console.error('[ACCEPT-INVITATION] Erro:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/update-user-permissions", requireAuth, async (req: any, res: any) => {
  try {
    const { invitedEmail, role, walletProfiles, orgId } = req.body;

    if (!invitedEmail || !role || !walletProfiles || !orgId) {
      return res.status(400).json({ error: "Parâmetros invitedEmail, role, walletProfiles e orgId são obrigatórios" });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) return res.status(500).json({ error: "Configuração ausente" });

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Busca o convite/permissão
    const [localPart, domain] = invitedEmail.toLowerCase().trim().split('@');
    const { data: invitation, error: fetchErr } = await admin
      .from('user_permissions')
      .select('*')
      .eq('organization_id', orgId)
      .ilike('invited_email', `${localPart}%@${domain}`)
      .maybeSingle();

    if (fetchErr || !invitation) {
      return res.status(404).json({ error: "Permissão não encontrada para o e-mail informado." });
    }

    // 2. Atualiza a role na tabela user_permissions
    const { error: permError } = await admin
      .from('user_permissions')
      .update({ role })
      .eq('id', invitation.id);

    if (permError) throw permError;

    // 3. Se estiver ativa, atualiza user_wallet_permissions
    if (invitation.status === 'active') {
      // Extrai o email real antes do +wperms
      const realEmail = invitedEmail.includes('+wperms_') 
        ? invitedEmail.replace(/\+wperms_[^@]+/, '') 
        : invitedEmail;

      let userId = null;
      try {
        const roleStr = invitation.role || '';
        const colonIdx = roleStr.indexOf(':');
        if (colonIdx > -1) {
          const jsonStr = roleStr.substring(colonIdx + 1);
          const walletMap = JSON.parse(jsonStr);
          userId = walletMap._user_id || null;
        }
      } catch (e) {
        console.warn('[UPDATE-PERMISSIONS] Falha ao obter userId do JSON do convite:', e);
      }

      if (!userId) {
        try {
          const { data } = await admin.auth.admin.listUsers();
          const users = data?.users || [];
          const found = users.find((u: any) => u.email?.toLowerCase() === realEmail.toLowerCase());
          userId = found?.id || null;
        } catch (e) {
          console.log('[UPDATE-PERMISSIONS] Falha ao obter usuário pelo listUsers auth:', e);
        }
      }

      if (!userId) {
        // Fallback: tenta obter através de registros existentes em user_wallet_permissions
        const walletIdsToCheck = Object.keys(walletProfiles).filter(k => !k.startsWith('_'));
        if (walletIdsToCheck.length > 0) {
          const { data: wps } = await admin
            .from('user_wallet_permissions')
            .select('user_id')
            .eq('organization_id', orgId)
            .in('wallet_id', walletIdsToCheck)
            .limit(1);
          if (wps && wps.length > 0) {
            userId = wps[0].user_id;
          }
        }
      }

      if (userId) {
        // Remove permissões antigas
        const { error: deleteError } = await admin
          .from('user_wallet_permissions')
          .delete()
          .eq('organization_id', orgId)
          .eq('user_id', userId);

        if (deleteError) throw deleteError;

        // Insere novas
        const inserts = Object.entries(walletProfiles)
          .filter(([k]) => !k.startsWith('_'))
          .map(([walletId, profileId]) => ({
            organization_id: orgId,
            user_id: userId,
            wallet_id: walletId,
            profile_id: profileId as string
          }));

        if (inserts.length > 0) {
          const { error: insertError } = await admin
            .from('user_wallet_permissions')
            .insert(inserts);

          if (insertError) throw insertError;
        }
      }
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[UPDATE-PERMISSIONS] Erro:', err);
    return res.status(500).json({ error: err.message });
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

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${req.token}`
        }
      }
    });
    const { data, error } = await supabase
      .from('smtp_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      if (data.pass) {
        try {
          data.pass = decrypt(data.pass, process.env.SMTP_ENCRYPTION_KEY);
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

    let encryptedPass = pass;
    try {
      encryptedPass = encrypt(pass, process.env.SMTP_ENCRYPTION_KEY);
    } catch (encError: any) {
      return res.status(500).json({ error: "Falha ao criptografar dados.", details: encError.message });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Configuração do banco ausente" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${req.token}`
        }
      }
    });

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

    // Fluxo inteligente para evitar problemas de RLS com "upsert" ou ausência de UNIQUE constraint em user_id:
    console.log('[SMTP-SAVE] Iniciando persistência inteligente para o usuário:', userId);
    
    let saveError = null;
    let existingRecords: any[] | null = null;
    
    try {
      const { data, error: fetchError } = await supabase
        .from('smtp_settings')
        .select('id')
        .eq('user_id', userId);
        
      if (fetchError) {
        console.warn("[SMTP-SAVE-Fetch] Falha ao ler registros existentes, usaremos o upsert como fallback direto:", fetchError.message);
        throw fetchError;
      }
      existingRecords = data;
    } catch (err) {
      existingRecords = null;
    }

    if (existingRecords && existingRecords.length > 0) {
      const firstId = existingRecords[0].id;
      console.log(`[SMTP-SAVE] Registros SMTP encontrados: ${existingRecords.length}. Atualizando registro ID: ${firstId}...`);
      
      const { error: updateError } = await supabase
        .from('smtp_settings')
        .update({
          host,
          port: parsedPort,
          user,
          pass: encryptedPass,
          from_name,
          from_email: from_email.toLowerCase().trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', firstId);
        
      saveError = updateError;
      
      // Limpeza opcional de registros duplicados adicionais se houver mais de um, para manter a tabela redundante limpa
      if (!updateError && existingRecords.length > 1) {
        const extraIds = existingRecords.slice(1).map(r => r.id);
        console.log('[SMTP-SAVE] Removendo registros SMTP duplicados redundantes extras:', extraIds);
        await supabase
          .from('smtp_settings')
          .delete()
          .in('id', extraIds);
      }
    } else {
      console.log("[SMTP-SAVE] Nenhum registro SMTP encontrado. Inserindo novo registro...");
      const { error: insertError } = await supabase
        .from('smtp_settings')
        .insert({
          host,
          port: parsedPort,
          user,
          pass: encryptedPass,
          from_name,
          from_email: from_email.toLowerCase().trim(),
          user_id: userId,
          updated_at: new Date().toISOString()
        });
        
      saveError = insertError;
    }

    // Fallback caso a operação individual de insert/update falhe (p. ex., políticas de RLS parciais ou triggers)
    if (saveError) {
      console.warn("[SMTP-SAVE] A gravação via SELECT+INSERT/UPDATE falhou (ou faltam políticas individuais no Supabase). Erro:", saveError.message);
      console.log("[SMTP-SAVE] Executando segunda tentativa usando o upsert original...");
      
      const { error: upsertError } = await supabase
        .from('smtp_settings')
        .upsert(payload, { onConflict: 'user_id' });
        
      if (upsertError) {
        console.error("[SMTP-SAVE-Fatal] Ambas as tentativas de gravação falharam no Supabase:", upsertError);
        throw upsertError;
      } else {
        console.log("[SMTP-SAVE] Sucesso na persistência usando fallback de upsert.");
      }
    } else {
      console.log("[SMTP-SAVE] 🎉 Persistência de SMTP concluída com sucesso usando fluxo de SELECT+INSERT/UPDATE!");
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

// API PDF Text Extractor for Programmatic Parsing
app.post("/api/extract-pdf-text", pdfLimiter, async (req: any, res: any) => {
  try {
    const { base64 } = req.body;
    if (!base64) {
      return res.status(400).json({ error: "O parâmetro 'base64' é obrigatório." });
    }

    // Limite de tamanho: 10MB em base64
    if (base64.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: "Arquivo muito grande. O tamanho máximo permitido é 10MB." });
    }

    const buffer = Buffer.from(base64, "base64");
    let pdfData;
    try {
      pdfData = await pdfParse(buffer, { version: 'default' });
    } catch (parseError: any) {
      if (parseError.message?.toLowerCase().includes("password") || parseError.name === "PasswordException") {
        return res.status(400).json({ error: "Este PDF está protegido por senha. Remova a proteção antes de importar." });
      }
      console.error("[extract-pdf-text] Erro no pdfParse:", parseError?.message, parseError?.name);
      return res.status(500).json({ error: `Erro ao processar PDF: ${parseError?.message || "erro desconhecido"}` });
    }

    const extractedText = pdfData?.text || "";

    // PDF baseado em imagem (escaneado) não tem texto selecionável
    if (extractedText.trim().length < 50) {
      return res.status(422).json({ error: "O arquivo parece ser uma imagem digitalizada sem texto selecionável. Por favor, envie o PDF digital disponibilizado pelo aplicativo do banco." });
    }

    return res.json({ text: extractedText });
  } catch (error: any) {
    console.error("[extract-pdf-text] Erro geral:", error?.message, typeof pdfParse);
    return res.status(500).json({ error: error.message || "Erro ao extrair texto do PDF" });
  }
});

// API Itaú Credit Card Statement Parser via Regex
app.post("/api/parse-fatura-cartao", pdfLimiter, async (req: any, res: any) => {
  try {
    const { pdfBase64, accountId } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "O parâmetro 'pdfBase64' é obrigatório." });
    }

    // Limite de tamanho: 10MB em base64
    if (pdfBase64.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: "Arquivo muito grande. O tamanho máximo permitido é 10MB." });
    }

    const buffer = Buffer.from(pdfBase64, "base64");
    let pdfData;
    try {
      pdfData = await pdfParse(buffer, { version: 'default' });
    } catch (parseError: any) {
      if (parseError.message?.toLowerCase().includes("password") || parseError.name === "PasswordException") {
        return res.status(400).json({ error: "Este PDF está protegido por senha. Remova a proteção antes de importar." });
      }
      throw parseError;
    }

    const extractedText = pdfData.text || "";

    // PDF baseado em imagem (escaneado) não tem texto selecionável
    if (!extractedText || extractedText.trim().length < 50) {
      return res.status(422).json({ error: "O arquivo parece ser uma imagem digitalizada sem texto selecionável. Por favor, envie o PDF digital disponibilizado pelo aplicativo do banco." });
    }

    console.log("[debug] primeiros 500 chars:", extractedText.substring(0, 500));
    console.log("[debug] tem 'final':", extractedText.includes('final'));
    console.log("[debug] tem 'Lancamentos':", extractedText.includes('Lancamentos'));
    console.log("[debug] tem 'cartao':", extractedText.includes('cartao'));
    console.log("[debug] total length:", extractedText.length);

    const parseResult = parseItauFaturaWithRegex(extractedText);

    if (!parseResult.lancamentos || parseResult.lancamentos.length === 0) {
      const textSample = extractedText.substring(0, 200).replace(/\n/g, '|');
      const hasLancamentos = extractedText.includes('amentos no cart');
      const hasFinal = extractedText.includes('final');
      return res.status(422).json({
        error: "Parser 0 lancamentos. hasLancamentos=" + hasLancamentos + " hasFinal=" + hasFinal + " textLen=" + extractedText.length + " sample=" + textSample,
        parseResult
      });
    }

    return res.json(parseResult);
  } catch (error: any) {
    console.error("Erro no parser determinístico de fatura:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar a fatura" });
  }
});

// API Claude PDF Parser
app.post("/api/parse-pdf-claude", async (req: any, res: any) => {
  try {
    const { base64, mimeType, prompt, maxTokens } = req.body;
    if (!base64 || !mimeType || !prompt) {
      return res.status(400).json({ error: "Parâmetros 'base64', 'mimeType' e 'prompt' são obrigatórios." });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "Chave ANTHROPIC_API_KEY não configurada no servidor." });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: Math.min(Math.max(Number(maxTokens) || 4096, 1024), 32768),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: base64
                }
              },
              {
                type: "text",
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Erro na API do Claude: ${errText}` });
    }

    const data: any = await response.json();
    const rawText = data.content?.[0]?.text || "";
    
    // Clean and parse JSON
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
      const parsed = JSON.parse(cleanedText);
      return res.json(parsed);
    } catch (parseError) {
      console.error("Erro ao analisar resposta JSON do Claude, tentando limpeza agressiva:", parseError);
      // Tenta limpeza agressiva de possíveis comentários e vírgulas pendentes
      const aggressiveClean = cleanedText
        .replace(/,\s*([\]}])/g, "$1")
        .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, "");
      const parsed = JSON.parse(aggressiveClean);
      return res.json(parsed);
    }
  } catch (error: any) {
    console.error("Erro interno no parse Claude:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao chamar Claude" });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Rota da API não encontrada" });
});

app.use("/api", (err: any, req: any, res: any, next: any) => {
  res.status(500).json({ error: "Erro interno na API" });
});

export default app;