import axios from "axios";
import cheerio from "cheerio";
import fs from "fs";

import { Produto } from "./types.js";
import { nomeArquivoSeguro } from "./utils.js";

const BASE = "https://camargoebarros.futurasistemas.com.br";
const CATEGORIAS = [
  `${BASE}/57-VARIEDADES/66-ACESSORIOS-ELETRICOS`,
  `${BASE}/57-VARIEDADES/65-FERRAMENTAS`,
  `${BASE}/57-VARIEDADES/64-UTILIDADES-DOMESTICAS`,
  `${BASE}/57-VARIEDADES/61-RELOGIOS-E-DESPERTADORES`,
  `${BASE}/57-VARIEDADES/60-CABOS-E-CARREGADORES`,
  `${BASE}/57-VARIEDADES/59-EXTENCOES-FILTRO-E-LINHAS`,
  `${BASE}/57-VARIEDADES/58-VARIEDADES`,
  `${BASE}/55-PILHAS-E-BATERIAS/56-PILHAS-E-BATERIAS`
];

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
          "Accept": "text/html",
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
      $("img#main-image").attr("data-src") ||
      $("img#main-image").attr("src") ||
      $("#main-image").attr("data-src") ||
      $("#main-image").attr("src") ||
      "";

    return montarUrl(img);
  } catch {
    return "";
  }
}

function limparNomeProduto(nome: string) {
  return nome
    .replace(/camargo\s*e\s*barros/gi, "")
    .replace(/camargo\s*&\s*barros/gi, "")
    .replace(/entregamos.*?transportadora/gi, "")
    .replace(/entregamos na região do brás próximo a loja/gi, "")
    .replace(/ou solicitamos coleta via transportadora/gi, "")
    .replace(/produto esgotado/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function buscarPagina(categoria: string, pagina: number): Promise<Produto[]> {
  const url = `${categoria}?page=${pagina}`;

  const { data } = await getComRetry(url);
  const $ = cheerio.load(data);
  const produtos: Produto[] = [];

  $("a").each((_, el) => {
    const textoOriginal = limparTexto($(el).text());
    const texto = limparNomeProduto(textoOriginal);
    const href = $(el).attr("href") || "";

    if (!textoOriginal.includes("Cód.:")) return;
    if (!textoOriginal.includes("R$")) return;

    const codigoMatch = textoOriginal.match(/Cód\.:\s*([A-Z0-9-]+)/i);
    const precoMatch = textoOriginal.match(/R\$\s*[\d.,]+/i);

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
          "Accept": "image/*,*/*"
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

function salvarArquivosProdutos(produtos: Produto[]) {
  fs.writeFileSync("produtos.json", JSON.stringify(produtos, null, 2), "utf-8");

  const csv = [
    "codigo;nome;preco;imagem;link",
    ...produtos.map(p =>
      `"${p.codigo}";"${p.nome}";"${p.preco}";"${p.imagem}";"${p.link}"`
    )
  ].join("\n");

  fs.writeFileSync("produtos.csv", csv, "utf-8");
}

export async function executarScraper() {
  const mapa = new Map<string, Produto>();

  for (const categoria of CATEGORIAS) {
    console.log(`Buscando categoria: ${categoria}`);

    for (let pagina = 1; pagina <= 57; pagina++) {
      let produtos: Produto[] = [];

      try {
        produtos = await buscarPagina(categoria, pagina);
      } catch {
        console.log(`Erro na categoria ${categoria}, página ${pagina}`);
        continue;
      }

      console.log(`Categoria: ${categoria} | Página ${pagina}: ${produtos.length} produtos`);

      if (produtos.length === 0) break;

      for (const produto of produtos) {
        mapa.set(produto.codigo, produto);
      }

      await delay(1000);
    }
  }

  const todos = [...mapa.values()];

  console.log("Buscando imagens reais dos produtos...");

  for (const produto of todos) {
    produto.imagem = await buscarImagemNoProduto(produto.link);
    console.log(`${produto.codigo}: ${produto.imagem || "sem imagem"}`);
    await delay(500);
  }

  salvarArquivosProdutos(todos);
  await baixarImagens(todos);

  return todos;
}