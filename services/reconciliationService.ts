import { 
  Transaction, 
  MerchantAlias, 
  CardStatement, 
  CardStatementItem, 
  CandidateMatch, 
  ReconciliationItem, 
  ReconciliationResult, 
  MatchConfidence 
} from "../types";

function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[*.\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForSimilarity(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 2a. Resolve o nome cru da fatura para o nome canônico usando merchant_aliases.
 */
export function resolveCanonicalName(
  rawDescription: string,
  aliases: MerchantAlias[]
): string {
  const normRaw = normalizeText(rawDescription);

  for (const alias of aliases) {
    if (!alias.rawPattern) continue;
    const normPattern = normalizeText(alias.rawPattern);
    if (!normPattern) continue;

    if (normRaw.includes(normPattern) || normPattern.includes(normRaw)) {
      return alias.canonicalName;
    }
  }

  return normRaw;
}

/**
 * 2b. Retorna um score de 0.0 a 1.0 entre dois textos normalizados.
 */
export function descriptionSimilarity(a: string, b: string): number {
  const normA = normalizeForSimilarity(a);
  const normB = normalizeForSimilarity(b);

  if (!normA || !normB) return 0.0;
  if (normA === normB) return 1.0;

  if (normA.includes(normB) || normB.includes(normA)) {
    return 0.9;
  }

  const tokensA = normA.split(" ").filter(Boolean);
  const tokensB = normB.split(" ").filter(Boolean);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return 0.0;
  }

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let commonCount = 0;
  for (const t of setA) {
    if (setB.has(t)) {
      commonCount++;
    }
  }

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  const jaccard = unionSize > 0 ? commonCount / unionSize : 0;

  if (jaccard > 0) {
    return jaccard;
  }

  const charSetA = new Set(normA.replace(/\s/g, "").split(""));
  const charSetB = new Set(normB.replace(/\s/g, "").split(""));
  let commonChars = 0;
  for (const char of charSetA) {
    if (charSetB.has(char)) {
      commonChars++;
    }
  }

  if (commonChars === 0) {
    return 0.0;
  }

  return 0.0;
}

/**
 * 2c. Busca candidatos de conciliação para um item da fatura nas transações PENDING.
 */
export function findCandidates(
  item: CardStatementItem,
  pendingTxs: Transaction[],
  aliases: MerchantAlias[],
  dueDate?: string
): CandidateMatch[] {
  const canonicalName = resolveCanonicalName(item.rawDescription, aliases);
  const debits = pendingTxs.filter(tx => tx.type === "DEBIT" && tx.status === "PENDING");

  const candidates: CandidateMatch[] = [];

  for (const tx of debits) {
    const diff = Math.abs(tx.value - item.value);
    if (diff <= 0.01) {
      const similarity = descriptionSimilarity(canonicalName, tx.description);

      let confidence: MatchConfidence = "NONE";
      let reason = "";

      if (similarity >= 0.5) {
        confidence = "HIGH";
        reason = `Valor exato + nome similar (${tx.description})`;
      } else if (similarity >= 0.2) {
        confidence = "LOW";
        reason = `Valor exato + nome parcialmente similar (${tx.description})`;
      } else {
        confidence = "LOW";
        reason = `Apenas valor exato (${tx.description})`;
      }

      candidates.push({
        transaction: tx,
        confidence,
        reason,
        similarityScore: similarity
      });
    }
  }

  return candidates.sort((a, b) => {
    if (b.similarityScore !== a.similarityScore) {
      return b.similarityScore - a.similarityScore;
    }
    if (dueDate) {
      const dueDateMs = new Date(dueDate).getTime();
      const diffA = Math.abs(new Date(a.transaction.date).getTime() - dueDateMs);
      const diffB = Math.abs(new Date(b.transaction.date).getTime() - dueDateMs);
      return diffA - diffB;
    }
    return 0;
  });
}

/**
 * 2d. Orquestra a conciliação de toda a fatura com o Contas a Pagar.
 */
export async function reconcileStatementWithPayables(
  statement: CardStatement,
  bankId: string,
  aliases: MerchantAlias[],
  fetchPendingTxs: (bankId: string) => Promise<Transaction[]>
): Promise<ReconciliationResult> {
  const pendingTxs = await fetchPendingTxs(bankId);
  const items: ReconciliationItem[] = [];

  let matchedCount = 0;
  let uncertainCount = 0;
  let newCount = 0;

  for (const card of statement.cards) {
    const cardLast4 = card.cardLast4;
    for (const statementItem of card.items) {
      const candidates = findCandidates(statementItem, pendingTxs, aliases, statement.metadata.dueDate);

      let status: "MATCHED" | "UNCERTAIN" | "NEW" = "NEW";
      if (candidates.some(c => c.confidence === "HIGH")) {
        status = "MATCHED";
        matchedCount++;
      } else if (candidates.some(c => c.confidence === "LOW")) {
        status = "UNCERTAIN";
        uncertainCount++;
      } else {
        status = "NEW";
        newCount++;
      }

      items.push({
        statementItem,
        cardLast4,
        candidates,
        status
      });
    }
  }

  return {
    items,
    matchedCount,
    uncertainCount,
    newCount
  };
}
