import { CardStatement, CardStatementItem, CardSection } from "../types";
import { parsePtBrFloat } from "./geminiService";

// Verbos que marcam o INÍCIO da descrição de um lançamento. Usado para decidir se uma
// linha "solta" (sem data/valor) entre duas operações pertence à cauda da descrição
// anterior ou ao início da próxima — ver explicação detalhada em parseMercadoPagoExtratoPdf.
const NEW_ENTRY_PREFIX = /^(Pix\s|Pagamento|Transfer[êe]ncia|Rendimentos|Dep[óo]sito|Saque|Estorno|Resgate|Aplica[çc][ãa]o|Compra|Taxa|Tarifa|Cobran[çc]a)/i;

// Linhas de cabeçalho/rodapé/metadados que nunca fazem parte da descrição de um lançamento.
const JUNK_LINE = /^(EXTRATO DE CONTA|CPF\/CNPJ|Agência|Periodo:|Saldo inicial|Saldo final|Entradas:|Saidas:|DETALHE DOS MOVIMENTOS|Data de gera[çc][ãa]o|Voc[êe] tem alguma|Mercado Pago Institui|www\.mercadopago)/i;

function parseDashDateToIso(s: string): string {
  const m = s.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export interface BankStatementParseResult {
  statement: CardStatement;
  operationIds: string[]; // para detecção de duplicidade na importação
}

/**
 * Lê o texto já extraído (via /api/extract-pdf-text, mesmo endpoint da nota de corretagem
 * e da fatura) de um extrato de conta do Mercado Pago e devolve um CardStatement — o tipo
 * é reaproveitado porque, estruturalmente, um extrato de conta é uma "fatura" com um único
 * "cartão" sem parcelamento: mesma forma, mesmo motor de conciliação, sem precisar de um
 * tipo novo nem de um serviço de conciliação paralelo.
 *
 * Cada lançamento vira uma "linha-pivô" no texto extraído:
 *   DD-MM-YYYY [fragmento de descrição] <ID da operação> R$ <valor com sinal> R$ <saldo>
 * Quando a descrição é longa, ela quebra em linhas extras antes e/ou depois da linha-pivô
 * (sem data nem valor) — uma linha solta pertence à cauda do lançamento ANTERIOR, a menos
 * que comece com um verbo conhecido de início (NEW_ENTRY_PREFIX), caso em que é o início
 * do PRÓXIMO lançamento. Validado contra um extrato real, inclusive com quebras de página.
 */
export function parseMercadoPagoExtratoPdf(rawText: string): BankStatementParseResult {
  const entradasMatch = rawText.match(/Entradas:\s*R\$\s*([\d.,]+)/i);
  const entradas = entradasMatch ? parsePtBrFloat(entradasMatch[1]) : 0;

  const saidasMatch = rawText.match(/Saidas:\s*R\$\s*(-?[\d.,]+)/i);
  const saidas = saidasMatch ? parsePtBrFloat(saidasMatch[1]) : 0;

  const periodoMatch = rawText.match(/Periodo:\s*De\s*(\d{2}-\d{2}-\d{4})\s*a[l]?\s*(\d{2}-\d{2}-\d{4})/i);
  const closingDate = periodoMatch ? parseDashDateToIso(periodoMatch[2]) : "";

  const contaMatch = rawText.match(/Conta:\s*(\d+)/i);
  const accountLast4 = contaMatch ? contaMatch[1].slice(-4) : "";

  const titularMatch = rawText.match(/EXTRATO DE CONTA\s*\n\s*(.+)/i);
  const holderName = titularMatch ? titularMatch[1].trim() : "";

  // Tudo a partir de "Data de geração" é rodapé/disclaimer (SAC, ouvidoria, site) que
  // quebra em várias linhas sem um padrão fixo — mais seguro cortar o texto aqui do que
  // tentar reconhecer cada linha de rodapé individualmente.
  const bodyText = rawText.split(/Data de gera[çc][ãa]o/i)[0];

  const lines = bodyText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .filter(l => l !== "---PAGINA---")
    .filter(l => !/^\d{1,3}\/\d{1,3}$/.test(l))
    .filter(l => !/^Data\s+Descri[çc][ãa]o\s+ID\s+da\s+opera[çc][ãa]o\s+Valor\s+Saldo$/i.test(l))
    .filter(l => !JUNK_LINE.test(l));

  const pivotRe = /^(\d{2}-\d{2}-\d{4})\s*(.*?)\s*(\d{9,})\s+R\$\s*(-?[\d.,]+)\s+R\$\s*([\d.,]+)\s*$/;

  interface RawRecord { date: string; description: string; operationId: string; value: number; balance: number; }
  const records: RawRecord[] = [];
  let pendingNextDescription: string[] = [];

  for (const line of lines) {
    const m = line.match(pivotRe);
    if (m) {
      const middleFragment = m[2].trim();
      const description = [...pendingNextDescription, middleFragment].filter(Boolean).join(" ");
      records.push({
        date: m[1],
        description,
        operationId: m[3],
        value: parsePtBrFloat(m[4]),
        balance: parsePtBrFloat(m[5]),
      });
      pendingNextDescription = [];
      continue;
    }

    // Linha solta: início de um novo lançamento, ou cauda do lançamento anterior.
    if (pendingNextDescription.length > 0 || NEW_ENTRY_PREFIX.test(line)) {
      pendingNextDescription.push(line);
    } else if (records.length > 0) {
      const last = records[records.length - 1];
      last.description = `${last.description} ${line}`.trim();
    }
    // Se não há registro anterior nem indício de novo lançamento, é cabeçalho residual — ignora.
  }

  const items: CardStatementItem[] = records.map(r => ({
    rawDescription: r.description,
    purchaseDate: parseDashDateToIso(r.date),
    value: Math.abs(r.value),
    isRefund: r.value > 0, // reaproveitado como "é uma entrada/crédito" para extrato de conta
  }));

  const parsedTotal = Number(items.reduce((acc, i) => acc + (i.isRefund ? i.value : -i.value), 0).toFixed(2));
  const anchorTotal = Number((entradas + saidas).toFixed(2));

  const card: CardSection = {
    cardLast4: accountLast4,
    holderName,
    printedTotal: anchorTotal,
    anchorTotal,
    parsedTotal,
    totalsMatch: Math.abs(parsedTotal - anchorTotal) <= 0.02,
    items,
  };

  const statement: CardStatement = {
    issuer: "Mercado Pago",
    metadata: {
      dueDate: closingDate,
      closingDate,
      statementTotal: anchorTotal,
    },
    cards: [card],
    grandParsedTotal: parsedTotal,
    grandAnchorTotal: anchorTotal,
    grandTotalsMatch: card.totalsMatch,
  };

  return { statement, operationIds: records.map(r => r.operationId) };
}
