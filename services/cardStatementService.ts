import { CardStatement, CardStatementItem, CardSection } from "../types";
import { parsePtBrFloat, parseDateToIso } from "./geminiService";

export const CARD_STATEMENT_PROMPT = `Você é um extrator de faturas de cartão de crédito. Analise o PDF da fatura e devolva
APENAS um objeto JSON válido (sem texto antes/depois, sem \`\`\`), nesta forma exata:
{
  "issuer": "<nome do emissor, ex. Itau>",
  "metadata": { "dueDate": "YYYY-MM-DD", "closingDate": "YYYY-MM-DD", "statementTotal": <numero> },
  "cards": [
    { "cardLast4": "1234", "holderName": "...", "printedTotal": <numero>,
      "items": [
        { "rawDescription": "...", "purchaseDate": "YYYY-MM-DD", "value": <positivo>,
          "isRefund": <bool>, "installmentNumber": <int|null>, "installmentTotal": <int|null> }
      ] }
  ]
}
ATENÇÃO SOBRE PARCELAS: installmentNumber 4 e installmentTotal 10 significa parcela 4 de 10.
Se você ver o mesmo merchant com installmentNumber 5 (próxima parcela), NÃO inclua — é projeção futura.

Regras OBRIGATÓRIAS:
1. EXCLUSÃO DE PARCELAS FUTURAS — Três critérios obrigatórios, aplique TODOS:

   a) STOP na linha "Total dos lançamentos atuais": tudo que aparece no documento
      DEPOIS da linha "Total dos lançamentos atuais XX.XXX,XX" é projeção futura.
      IGNORE completamente. Essa linha marca o fim dos lançamentos correntes.

   b) IGNORE a seção "Compras parceladas - próximas faturas": ao encontrar esse
      cabeçalho, pare de extrair itens daquela coluna ou bloco de texto.

   c) DESDUPLICAÇÃO por número de parcela: se o mesmo estabelecimento com o
      mesmo valor aparecer com números de parcela consecutivos (ex.: 4/10 e 5/10
      para o mesmo merchant), inclua APENAS o de número MENOR (4/10 = atual).
      O de número maior é a próxima fatura e deve ser ignorado.
2. Datas vêm como DD/MM (sem ano). Infira o ano pela data de fechamento: se o mês da compra
   for maior que o mês de fechamento, use o ano anterior; senão, o ano de fechamento.
3. "value" é SEMPRE positivo. Estornos/créditos (linhas com sinal negativo) → isRefund=true.
4. Parcelas aparecem como "NN/MM" coladas ao nome (ex. "PANDORA09/10" = parcela 9 de 10)
   ou como "ParcN". Extraia installmentNumber/installmentTotal e remova-os de rawDescription.
5. A fatura pode ter vários cartões (titulares adicionais), cada um com seu total impresso
   "Lançamentos no cartão (final XXXX)". Liste todos.
6. Não invente dados. Se um campo não existir, use null.
7. VALIDAÇÃO CRUZADA por cartão: a fatura contém linhas como
   "Lançamentos no cartão (final XXXX) R$ YY.YYY,YY" para cada subcartão.
   Use esses valores como âncoras de validação. Se a soma dos itens que você
   extraiu para um cartão divergir muito do valor impresso nessa linha,
   revise os itens daquele cartão e remova duplicatas ou itens futuros.`;

export interface StatementAnchors {
  cardTotals: Record<string, number>;
  statementTotal?: number;
  dueDate?: string;
  closingDate?: string;
}

/**
 * 3a. Extrai os totais confiáveis da fatura por regex a partir do texto completo do PDF.
 */
export function extractStatementAnchors(rawText: string): StatementAnchors {
  const anchors: StatementAnchors = { cardTotals: {} };

  if (!rawText) return anchors;

  // Regex por cartão: Lançamentos no cartão (final <4>) e valor
  // Exemplo: "Lançamentos no cartão (final 2933) 13.339,37" ou "Lançamentos no cartão (final 1073) 12.231,85"
  const cardRegex = /Lançamentos\s+no\s+cartão\s+\(final\s+(\d{4})\)\s+([-\d.,]+)/gi;
  let match;
  while ((match = cardRegex.exec(rawText)) !== null) {
    const last4 = match[1];
    const valueStr = match[2];
    anchors.cardTotals[last4] = parsePtBrFloat(valueStr);
  }

  // Regex para total geral da fatura
  const totalRegex1 = /Total\s+dos\s+lançamentos\s+atuais\s+([-\d.,]+)/i;
  const totalRegex2 = /Total\s+desta\s+fatura\s+([-\d.,]+)/i;

  const matchT1 = rawText.match(totalRegex1);
  if (matchT1) {
    anchors.statementTotal = parsePtBrFloat(matchT1[1]);
  } else {
    const matchT2 = rawText.match(totalRegex2);
    if (matchT2) {
      anchors.statementTotal = parsePtBrFloat(matchT2[1]);
    }
  }

  // Vencimento se disponível
  const dueDateRegex = /Vencimento\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i;
  const matchDueDate = rawText.match(dueDateRegex);
  if (matchDueDate) {
    anchors.dueDate = parseDateToIso(matchDueDate[1]);
  }

  // Fechamento ou Emissão se disponível
  const closingDateRegex = /(?:Fechamento|Emissão)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i;
  const matchClosingDate = rawText.match(closingDateRegex);
  if (matchClosingDate) {
    anchors.closingDate = parseDateToIso(matchClosingDate[1]);
  }

  return anchors;
}

/**
 * 3b. Envia o PDF em base64 com mimeType e prompt para extração via IA (Claude)
 */
export async function extractStatementWithAI(base64: string, mimeType: string): Promise<CardStatement> {
  const response = await fetch("/api/parse-pdf-claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      base64,
      mimeType,
      prompt: CARD_STATEMENT_PROMPT,
      maxTokens: 16384
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Falha ao processar fatura com IA");
  }

  const result = await response.json();
  return result as CardStatement;
}

/**
 * 3b-2. Envia o PDF em base64 para extração via Gemini (fallback quando Claude falha)
 */
export async function extractStatementWithGemini(base64: string, mimeType: string): Promise<CardStatement> {
  const response = await fetch("/api/parse-fatura-pdf-gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mimeType }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Falha ao processar fatura com Gemini");
  }

  const result = await response.json();
  return result as CardStatement;
}

/**
 * 3c. Reconcilia as informações extraídas pela IA (Claude) com os totais âncoras locais (Regex)
 */
export function reconcileStatement(aiData: any, anchors: StatementAnchors): CardStatement {
  const issuer = aiData.issuer || "Desconhecido";
  const aiMetadata = aiData.metadata || {};

  const metadata = {
    dueDate: aiMetadata.dueDate || anchors.dueDate || "",
    closingDate: aiMetadata.closingDate || anchors.closingDate || "",
    // Correção 2: fallback para 0 em vez de BigInt(0)
    statementTotal: aiMetadata.statementTotal || anchors.statementTotal || 0
  };

  let grandParsedTotal = 0;

  const cards = (aiData.cards || []).map((card: any) => {
    const cardLast4 = card.cardLast4 || "";
    const holderName = card.holderName || "";
    const printedTotal = Number(card.printedTotal) || 0;
    const anchorTotal = anchors.cardTotals[cardLast4] !== undefined ? anchors.cardTotals[cardLast4] : undefined;

    // Correção 4: Proteger contra items indefinidos e computar parsedTotal
    const computedParsedTotal = (card.items || []).reduce((acc: number, item: any) => {
      const val = Number(item.value) || 0;
      return item.isRefund ? acc - val : acc + val;
    }, 0);

    const parsedTotal = Math.round(computedParsedTotal * 100) / 100;

    const referenceTotal = anchorTotal !== undefined ? anchorTotal : printedTotal;
    const totalsMatch = Math.abs(parsedTotal - referenceTotal) <= 0.02;

    grandParsedTotal += parsedTotal;

    const items = (card.items || []).map((item: any) => ({
      rawDescription: item.rawDescription || "",
      purchaseDate: item.purchaseDate || "",
      value: Number(item.value) || 0,
      isRefund: !!item.isRefund,
      installmentNumber: item.installmentNumber !== null && item.installmentNumber !== undefined ? Number(item.installmentNumber) : undefined,
      installmentTotal: item.installmentTotal !== null && item.installmentTotal !== undefined ? Number(item.installmentTotal) : undefined
    }));

    return {
      cardLast4,
      holderName,
      printedTotal,
      anchorTotal,
      parsedTotal,
      totalsMatch,
      items
    };
  });

  grandParsedTotal = Math.round(grandParsedTotal * 100) / 100;

  const grandAnchorTotal = anchors.statementTotal !== undefined ? anchors.statementTotal : metadata.statementTotal;
  const grandTotalsMatch = Math.abs(grandParsedTotal - grandAnchorTotal) <= 0.02;

  // Removido cast 'as any' para seguir conformidade exata de tipo com CardStatement
  return {
    issuer,
    metadata,
    cards,
    grandParsedTotal,
    grandAnchorTotal,
    grandTotalsMatch
  };
}

/**
 * 4a. Converte um valor no formato "americano" usado na exportação XLSX do app
 * Itaú (vírgula = milhar, ponto = decimal), ex.: "R$ 40,080.04" -> 40080.04,
 * "R$ -43,731.45" -> -43731.45.
 */
export function parseUsStyleReais(str: string): number {
  if (!str) return 0;
  const cleaned = String(str).replace(/[^\d.,-]/g, "").replace(/,/g, "");
  return parseFloat(cleaned) || 0;
}

/**
 * 4b. Constrói um CardStatement a partir das linhas já lidas de uma fatura
 * exportada em XLSX pelo app Itaú (funciona tanto para "Fatura Paga" quanto
 * "Fatura Aberta" — o layout de colunas é o mesmo, só muda o texto do banner).
 * Diferente do PDF/CSV, os dados já vêm estruturados por coluna, então não há
 * necessidade de regex de texto livre nem de fallback por IA.
 */
export function parseFaturaXlsxRows(rows: any[][]): CardStatement {
  const norm = (v: any) => (v === undefined || v === null ? "" : String(v).trim());

  let dueDate = "";
  let statementTotal = 0;

  const cardHeaderIndex = rows.findIndex(r => norm(r[1]) === "Cartão");
  if (cardHeaderIndex !== -1) {
    const dataRow = rows.slice(cardHeaderIndex + 1).find(r => norm(r[1]) !== "");
    if (dataRow) {
      statementTotal = parseUsStyleReais(norm(dataRow[6]));
      dueDate = parseDateToIso(norm(dataRow[8]));
    }
  }

  const tableHeaderIndex = rows.findIndex(r => norm(r[1]) === "Data" && norm(r[2]) === "Lançamento");
  const cardMap = new Map<string, CardStatementItem[]>();
  const holderNames = new Map<string, string>();

  if (tableHeaderIndex !== -1) {
    for (let i = tableHeaderIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const dataStr = norm(row[1]);
      if (!dataStr || dataStr.toLowerCase() === "subtotal") break;

      const rawDescription = norm(row[2]);
      // "Pagamento Efetuado" é a quitação da fatura ANTERIOR, não uma cobrança
      // desta fatura — o próprio total impresso pelo Itaú já exclui essa linha
      // (confirmado batendo o total contra duas faturas reais).
      if (rawDescription.toLowerCase() === "pagamento efetuado") continue;

      const valor = parseUsStyleReais(norm(row[4]));
      const cardLast4 = norm(row[9]).replace(/\D/g, "");
      const holderName = norm(row[7]);

      const installmentMatch = norm(row[3]).match(/Parcela\s+(\d+)\s+de\s+(\d+)/i);

      const item: CardStatementItem = {
        rawDescription,
        purchaseDate: parseDateToIso(dataStr),
        value: Math.abs(valor),
        isRefund: valor < 0,
        installmentNumber: installmentMatch ? Number(installmentMatch[1]) : undefined,
        installmentTotal: installmentMatch ? Number(installmentMatch[2]) : undefined,
      };

      if (!cardMap.has(cardLast4)) cardMap.set(cardLast4, []);
      cardMap.get(cardLast4)!.push(item);
      if (holderName) holderNames.set(cardLast4, holderName);
    }
  }

  const cards: CardSection[] = Array.from(cardMap.entries()).map(([cardLast4, items]) => {
    const parsedTotal = Math.round(
      items.reduce((acc, i) => (i.isRefund ? acc - i.value : acc + i.value), 0) * 100
    ) / 100;
    return {
      cardLast4,
      holderName: holderNames.get(cardLast4) || "",
      printedTotal: parsedTotal,
      anchorTotal: undefined,
      parsedTotal,
      totalsMatch: true,
      items,
    };
  });

  const grandParsedTotal = Math.round(cards.reduce((acc, c) => acc + c.parsedTotal, 0) * 100) / 100;
  const grandAnchorTotal = statementTotal || grandParsedTotal;

  return {
    issuer: "Itau",
    metadata: { dueDate, closingDate: "", statementTotal: grandAnchorTotal },
    cards,
    grandParsedTotal,
    grandAnchorTotal,
    grandTotalsMatch: Math.abs(grandParsedTotal - grandAnchorTotal) <= 0.02,
  };
}
