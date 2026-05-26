import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import cron from "node-cron";

import { Produto } from "./types.js";
import { executarScraper } from "./scraper.js";
import { gerarCatalogoPDF } from "./gerarCatalogo.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors({
  origin: "*"
}));
app.use(express.json());


let agioPercentual = 30;
let ultimoCatalogoGerado = "";
let scraperRodando = false;

function carregarProdutosSalvos(): Produto[] {
  const produtosPath = path.resolve(process.cwd(), "produtos.json");

  if (!fs.existsSync(produtosPath)) {
    throw new Error("Arquivo produtos.json não encontrado.");
  }

  return JSON.parse(fs.readFileSync(produtosPath, "utf-8"));
}

async function executarScraperAutomatico() {
  if (scraperRodando) {
    console.log("Scraper já está em execução. Ignorando nova chamada.");
    return;
  }

  scraperRodando = true;

  try {
    console.log("Iniciando scraper automático...");

    const produtos = await executarScraper();

    console.log(`Scraper finalizado. Total: ${produtos.length}`);

    const pdf = await gerarCatalogoPDF(produtos, agioPercentual);

    ultimoCatalogoGerado = pdf.nomeArquivo;
    limparCatalogosAntigos();

    console.log(`Catálogo automático gerado: ${pdf.nomeArquivo}`);
  } catch (error) {
    console.error("Erro no scraper automático:", error);
  } finally {
    scraperRodando = false;
  }
}

app.get("/agio", (req, res) => {
  res.json({ agioPercentual });
});

app.post("/agio", (req, res) => {
  const novoAgio = Number(req.body.agioPercentual);

  if (Number.isNaN(novoAgio) || novoAgio < 0) {
    return res.status(400).json({
      erro: "Informe um ágio válido."
    });
  }

  agioPercentual = novoAgio;

  res.json({
    mensagem: "Ágio atualizado com sucesso.",
    agioPercentual
  });
});

app.post("/scraper", async (req, res) => {
  if (scraperRodando) {
    return res.status(409).json({
      erro: "Scraper já está em execução."
    });
  }

  try {
    scraperRodando = true;

    const produtos = await executarScraper();

    res.json({
      mensagem: "Scraper executado com sucesso.",
      total: produtos.length
    });
  } catch {
    res.status(500).json({
      erro: "Erro ao executar scraper."
    });
  } finally {
    scraperRodando = false;
  }
});

app.post("/catalogo", async (req, res) => {
  try {
    const agio = agioPercentual;
    const mostrarPrecos = req.body.mostrarPrecos !== false;
    if (Number.isNaN(agio) || agio < 0) {
      return res.status(400).json({
        erro: "Ágio inválido."
      });
    }

    const produtos = carregarProdutosSalvos();

    if (!produtos.length) {
      return res.status(400).json({
        erro: "Nenhum produto encontrado em produtos.json."
      });
    }

    const pdf = await gerarCatalogoPDF(produtos, agio, mostrarPrecos);

    ultimoCatalogoGerado = pdf.nomeArquivo;
    limparCatalogosAntigos();

    res.json({
      mensagem: "Catálogo gerado com sucesso.",
      agioPercentual: agio,
      arquivo: pdf.nomeArquivo,
      download: `/catalogo/download/${pdf.nomeArquivo}`
    });
  } catch {
    res.status(500).json({
      erro: "Erro ao gerar catálogo. Verifique se produtos.json existe."
    });
  }
});

app.post("/scraper/catalogo", async (req, res) => {
  if (scraperRodando) {
    return res.status(409).json({
      erro: "Scraper já está em execução."
    });
  }

  try {
    scraperRodando = true;

    const agio = agioPercentual;

    if (Number.isNaN(agio) || agio < 0) {
      return res.status(400).json({
        erro: "Ágio inválido."
      });
    }

    const produtos = await executarScraper();
    const pdf = await gerarCatalogoPDF(produtos, agio);

    ultimoCatalogoGerado = pdf.nomeArquivo;
    limparCatalogosAntigos();

    res.json({
      mensagem: "Scraper executado e catálogo gerado com sucesso.",
      total: produtos.length,
      agioPercentual: agio,
      arquivo: pdf.nomeArquivo,
      download: `/catalogo/download/${pdf.nomeArquivo}`
    });
  } catch {
    res.status(500).json({
      erro: "Erro ao executar scraper e gerar catálogo."
    });
  } finally {
    scraperRodando = false;
  }
});

app.get("/catalogo/download", (req, res) => {
  if (!ultimoCatalogoGerado) {
    return res.status(404).json({
      erro: "Nenhum catálogo foi gerado ainda."
    });
  }

  const caminhoPDF = path.resolve(process.cwd(), ultimoCatalogoGerado);

  if (!fs.existsSync(caminhoPDF)) {
    return res.status(404).json({
      erro: "Arquivo do último catálogo não encontrado."
    });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${ultimoCatalogoGerado}"`);

  return res.sendFile(caminhoPDF);
});

app.get("/catalogo/download/:arquivo", (req, res) => {
  const arquivo = req.params.arquivo;

  if (!arquivo.endsWith(".pdf")) {
    return res.status(400).json({
      erro: "Arquivo inválido."
    });
  }

  const caminhoPDF = path.resolve(process.cwd(), arquivo);

  if (!fs.existsSync(caminhoPDF)) {
    return res.status(404).json({
      erro: "Arquivo não encontrado."
    });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${arquivo}"`);

  return res.sendFile(caminhoPDF);
});

// Executa todos os dias às 06:00
cron.schedule("0 6 * * *", async () => {
  console.log("Executando scraper agendado das 06:00");
  await executarScraperAutomatico();
});

// Executa todos os dias às 18:00
cron.schedule("0 18 * * *", async () => {
  console.log("Executando scraper agendado das 18:00");
  await executarScraperAutomatico();
});

function limparCatalogosAntigos() {
  try {
    const arquivos = fs
      .readdirSync(process.cwd())
      .filter(nome =>
        nome.startsWith("catalogo-") &&
        nome.endsWith(".pdf")
      )
      .map(nome => {
        const caminho = path.resolve(process.cwd(), nome);

        return {
          nome,
          caminho,
          criadoEm: fs.statSync(caminho).mtime.getTime()
        };
      })
      .sort((a, b) => b.criadoEm - a.criadoEm);

    if (arquivos.length <= 3) {
      return;
    }

    console.log(`Encontrados ${arquivos.length} catálogos. Limpando arquivos antigos...`);

    const arquivosParaExcluir = arquivos.slice(3);

    for (const arquivo of arquivosParaExcluir) {
      try {
        fs.unlinkSync(arquivo.caminho);
        console.log(`Catálogo removido: ${arquivo.nome}`);
      } catch (error) {
        console.error(`Erro ao remover ${arquivo.nome}:`, error);
      }
    }

  } catch (error) {
    console.error("Erro ao limpar catálogos antigos:", error);
  }
}

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "API Scraper CEB funcionando"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});;