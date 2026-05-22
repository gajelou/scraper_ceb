import { gerarCatalogoPDF } from "./gerarCatalogo.js";
import { executarScraper } from "./scraper.js";

async function main() {
  const agioPercentual = Number(process.argv[2] ?? 30);

  if (Number.isNaN(agioPercentual)) {
    console.error("Informe um ágio válido. Exemplo: npx tsx ./src/index.ts 30");
    process.exit(1);
  }

  const produtos = await executarScraper();

  gerarCatalogoPDF(produtos, agioPercentual);

  console.log("FINALIZADO");
  console.log("Total:", produtos.length);
  console.log(`Catálogo PDF gerado com ${agioPercentual}% de ágio.`);
}

main();