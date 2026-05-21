import axios from "axios";
import cheerio from "cheerio";
import fs from "fs";
import { gerarCatalogoPDF } from "./gerarCatalogo.js";
import { Produto } from "./types.js";
import { nomeArquivoSeguro } from "./utils.js";

const BASE = "https://camargoebarros.futurasistemas.com.br";
const CATEGORIA = `${BASE}/57-VARIEDADES/65-FERRAMENTAS`;

function limparTexto(texto: string) {
  return texto.replace(/\s+/g, " ").trim();
}

function montarUrl(url: string) {
  if (!url) return "";
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return BASE + url;
  return `${BASE}/${url.replace(/^\/+/, "")}`;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getComRetry(url: string, tentativas = 5) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      return await axios.get(url, {
        timeout: 60000,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Referer": BASE
        }
      });
    } catch {
      console.log(`Tentativa ${i} falhou: ${url}`);

      if (i === tentativas) throw new Error(`Falha ao acessar: ${url}`);

      await delay(3000);
    }
  }

  throw new Error(`Falha ao acessar: ${url}`);
}

async function buscarImagemNoProduto(link: string): Promise<string> {
  try {
    const { data } = await getComRetry(link, 3);
    const $ = cheerio.load(data);

    const img =
      $("meta[property='og:image']").attr("content") ||
      $(".thumbnails img").first().attr("src") ||
      $(".product-info img").first().attr("src") ||
      $("img")
        .filter((_, el) => {
          const src = $(el).attr("src") || "";
          return src.includes("cache") || src.includes("image");
        })
        .first()
        .attr("src") ||
      "";

    return montarUrl(img);
  } catch {
    return "";
  }
}

async function buscarPagina(pagina: number): Promise<Produto[]> {
  const url = `${CATEGORIA}?page=${pagina}`;

  const { data } = await getComRetry(url);
  const $ = cheerio.load(data);
  const produtos: Produto[] = [];

  $("a").each((_, el) => {
    const texto = limparTexto($(el).text());
    const href = $(el).attr("href") || "";

    if (!texto.includes("Cód.:")) return;
    if (!texto.includes("R$")) return;

    const codigoMatch = texto.match(/Cód\.:\s*([A-Z0-9-]+)/i);
    const precoMatch = texto.match(/R\$\s*[\d.,]+/i);

    if (!codigoMatch || !precoMatch) return;

    const codigo = codigoMatch[1];
    const preco = precoMatch[0];

    let nome = texto
      .replace(/Cód\.:\s*[A-Z0-9-]+/i, "")
      .replace(preco, "")
      .trim();

    const posicaoCodigoRepetido = nome.indexOf(codigo);

    if (posicaoCodigoRepetido > 0) {
      nome = nome.substring(0, posicaoCodigoRepetido).trim();
    }

    produtos.push({
      codigo,
      nome,
      preco,
      imagem: "",
      link: montarUrl(href)
    });
  });

  return produtos;
}

async function baixarImagemComRetry(url: string, tentativas = 5) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      return await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 60000,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Referer": BASE,
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        }
      });
    } catch {
      console.log(`Tentativa ${i} falhou ao baixar imagem: ${url}`);

      if (i === tentativas) throw new Error(`Falha ao baixar imagem: ${url}`);

      await delay(3000);
    }
  }

  throw new Error(`Falha ao baixar imagem: ${url}`);
}

async function baixarImagens(produtos: Produto[]) {
  fs.mkdirSync("imagens", { recursive: true });

  const erros: string[] = ["codigo;imagem;link"];

  for (const produto of produtos) {
    if (!produto.imagem) {
      erros.push(`"${produto.codigo}";"SEM_URL";"${produto.link}"`);
      continue;
    }

    try {
      const response = await baixarImagemComRetry(produto.imagem);
      const caminho = nomeArquivoSeguro(produto.codigo, produto.imagem);

      fs.writeFileSync(caminho, response.data);

      console.log(`Imagem baixada: ${produto.codigo}`);
    } catch {
      console.log(`Erro ao baixar imagem: ${produto.codigo}`);
      erros.push(`"${produto.codigo}";"${produto.imagem}";"${produto.link}"`);
    }

    await delay(500);
  }

  fs.writeFileSync("imagens-erros.csv", erros.join("\n"), "utf-8");
}


async function main() {   
  const mapa = new Map<string, Produto>();

  for (let pagina = 1; pagina <= 57; pagina++) {
    let produtos: Produto[] = [];

    try {
      produtos = await buscarPagina(pagina);
    } catch {
      console.log(`Erro ao buscar página ${pagina}, pulando...`);
      continue;
    }

    console.log(`Página ${pagina}: ${produtos.length} produtos`);

    if (produtos.length === 0) break;

    for (const produto of produtos) {
      mapa.set(produto.codigo, produto);
    }

    await delay(1000);
  }

  const todos = [...mapa.values()];

  console.log("Buscando imagens nas páginas dos produtos...");

  for (const produto of todos) {
    produto.imagem = await buscarImagemNoProduto(produto.link);

    console.log(`${produto.codigo}: ${produto.imagem || "sem imagem"}`);

    await delay(500);
  }

  fs.writeFileSync("produtos.json", JSON.stringify(todos, null, 2), "utf-8");

  const csv = [
    "codigo;nome;preco;imagem;link",
    ...todos.map(p =>
      `"${p.codigo}";"${p.nome}";"${p.preco}";"${p.imagem}";"${p.link}"`
    )
  ].join("\n");

  fs.writeFileSync("produtos.csv", csv, "utf-8");

  await baixarImagens(todos);

  console.log("FINALIZADO");
  console.log("Total:", todos.length);
  
  gerarCatalogoPDF(todos, 30); 
  console.log("Catálogo PDF gerado com 30% de ágio sobre o preço de atacado.");
}

main();