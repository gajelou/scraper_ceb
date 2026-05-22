import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

import { Produto } from "./types.js";
import { executarScraper } from "./scraper.js";
import { gerarCatalogoPDF } from "./gerarCatalogo.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

let agioPercentual = 30;

function carregarProdutosSalvos(): Produto[] {
  const produtosPath = path.resolve(process.cwd(), "produtos.json");

  if (!fs.existsSync(produtosPath)) {
    throw new Error("Arquivo produtos.json não encontrado.");
  }

  return JSON.parse(fs.readFileSync(produtosPath, "utf-8"));
}

app.get("/agio", (req, res) => {
  res.json({ agioPercentual });
});

app.post("/agio", (req, res) => {
  const novoAgio = Number(req.body.agioPercentual);

  if (Number.isNaN(novoAgio) || novoAgio < 0) {
    return res.status(400).json({
      erro: "Informe um ágio válido. Exemplo: { \"agioPercentual\": 30 }"
    });
  }

  agioPercentual = novoAgio;

  res.json({
    mensagem: "Ágio atualizado com sucesso.",
    agioPercentual
  });
});

app.post("/scraper", async (req, res) => {
  try {
    const produtos = await executarScraper();

    res.json({
      mensagem: "Scraper executado com sucesso.",
      total: produtos.length
    });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao executar scraper."
    });
  }
});

app.post("/scraper/catalogo", async (req, res) => {
  try {
    const agio = req.body.agioPercentual !== undefined
      ? Number(req.body.agioPercentual)
      : agioPercentual;

    if (Number.isNaN(agio) || agio < 0) {
      return res.status(400).json({
        erro: "Ágio inválido."
      });
    }

    const produtos = await executarScraper();

    gerarCatalogoPDF(produtos, agio);

    res.json({
      mensagem: "Scraper executado e catálogo gerado com sucesso.",
      total: produtos.length,
      agioPercentual: agio,
      arquivo: "catalogo.pdf"
    });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao executar scraper e gerar catálogo."
    });
  }
});

app.post("/catalogo", (req, res) => {
  try {
    const agio = req.body.agioPercentual !== undefined
      ? Number(req.body.agioPercentual)
      : agioPercentual;

    if (Number.isNaN(agio) || agio < 0) {
      return res.status(400).json({
        erro: "Ágio inválido."
      });
    }

    const produtos = carregarProdutosSalvos();

    gerarCatalogoPDF(produtos, agio);

    res.json({
      mensagem: "Catálogo gerado com sucesso.",
      agioPercentual: agio,
      arquivo: "catalogo.pdf"
    });
  } catch {
    res.status(500).json({
      erro: "Erro ao gerar catálogo. Verifique se produtos.json existe."
    });
  }
});

app.get("/catalogo/download", (req, res) => {
  try {
    const caminhoPDF = path.resolve(process.cwd(), "catalogo.pdf");

    if (!fs.existsSync(caminhoPDF)) {
      return res.status(404).json({
        erro: "Arquivo catalogo.pdf não encontrado."
      });
    }

    res.download(caminhoPDF, "catalogo.pdf");
  } catch {
    res.status(500).json({
      erro: "Erro ao baixar catálogo."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});