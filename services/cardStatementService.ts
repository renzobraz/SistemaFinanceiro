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
