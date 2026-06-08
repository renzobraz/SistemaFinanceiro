import fs from "fs";
import path from "path";

// Define helpers so we can test the exact code
function parsePtBrFloat(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/\./g, "").replace(",", "."));
}

const sinacorMap = new Map<string, string>();
const tickerMap = new Map<string, string>();

async function parseItauNoteWithRegex(text: string): Promise<any> {
  const todayIso = new Date().toISOString().split("T")[0];
  let noteNumber = "";
  let datePregão = "";
  let liquidValue = 0;
  let isCredit = true;
  
  // Resumo de custos
  let totalSales = 0;
  let totalPurchases = 0;
  let clearingFees = 0;
  let exchangeFees = 0;
  let brokerage = 0;
  let taxes = 0;
  let otherCosts = 0;
  let settlementDate = "";

  const noteMatch = text.match(/Nr\.\s*Nota[\s\S]+?(\d+)\s+\d+\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (noteMatch) {
    noteNumber = noteMatch[1];
    datePregão = noteMatch[2];
  }

  const liquidMatch = text.match(/Líquido para\s+\d{2}\/\d{2}\/\d{4}[\s\S]+?([\d.]+,\d{2})\s+([DC])/i);
  if (liquidMatch) {
    liquidValue = parsePtBrFloat(liquidMatch[1]);
    isCredit = liquidMatch[2].toUpperCase() === "C";
  }

  const dateMatch = text.match(/Líquido para\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (dateMatch) {
    // simple dd/mm/yyyy to yyyy-mm-dd
    const parts = dateMatch[1].split("/");
    if (parts.length === 3) {
      settlementDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }

  if (!settlementDate) settlementDate = todayIso;

  const lines = text.split(/\r?\n/);
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+/g, " ");
    if (line.includes("Negócios Realizados") || line.includes("Negocios Realizados") || (line.includes("Q Negociação") && line.includes("Especificação"))) {
      startIndex = i;
    }
    if (startIndex !== -1 && (line.includes("Resumo de negócios") || line.includes("Resumo dos negócios") || line.includes("Resumo financeiro"))) {
      endIndex = i;
      break;
    }
  }

  console.log(`startIndex: ${startIndex}, endIndex: ${endIndex}`);

  const targetLines = (startIndex !== -1)
    ? lines.slice(startIndex, endIndex !== -1 ? endIndex : undefined)
    : lines;

  console.log(`targetLines count: ${targetLines.length}`);

  const individualTrades = [];
  for (const line of targetLines) {
    const lineClean = line.trim();
    if (!lineClean) continue;

    const match = lineClean.match(/B3\s+RV\s+LISTADO([CV])\s+(FRACIONARIO|VISTA)\s+(.+?)\s+(?:[@#D*][@ #D*]*)?\s*(\d+)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([DC])/i);
    if (match) {
      const dcFlag = match[7].toUpperCase();
      const action = dcFlag === "D" ? "buy" : "sell";
      const marketType = match[2].toUpperCase();
      let specRaw = match[3].trim();
      const qty = parseInt(match[4], 10);
      const price = parsePtBrFloat(match[5]);
      const total = parsePtBrFloat(match[6]);

      specRaw = specRaw.replace(/\s*[@#*D]+\s*$/, "").trim();

      individualTrades.push({
        type: action,
        market: marketType,
        spec: specRaw,
        quantity: qty,
        price: price,
        totalValue: total,
        dc: dcFlag
      });
    } else {
      if (lineClean.includes("B3") && lineClean.includes("LISTADO")) {
        console.log("[Parser] Linha não capturada pela regex:", lineClean);
      }
    }
  }
  console.log("[Parser] Total linhas capturadas:", individualTrades.length);
  return individualTrades;
}

const fileContent = fs.readFileSync("extracted-pdf-debug.txt", "utf8");
const fullTextIndex = fileContent.indexOf("=== TEXTO COMPLETO DO PDF ===");
if (fullTextIndex !== -1) {
  const actualText = fileContent.substring(fullTextIndex + "=== TEXTO COMPLETO DO PDF ===".length).trim();
  parseItauNoteWithRegex(actualText).then(trades => {
    console.log(`Successfully finished parsing. Found ${trades ? trades.length : 0} trades.`);
  });
} else {
  console.log("Could not find start of full text in dump.");
}
