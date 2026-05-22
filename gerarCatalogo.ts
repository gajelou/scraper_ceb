import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { Produto } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PASTA_IMAGENS = path.resolve(__dirname, "imagens");

export function gerarCatalogoPDF(produtos: Produto[], agioPercentual: number) {
  const doc = new PDFDocument({ size: "A4", margin: 30 });
  doc.pipe(fs.createWriteStream("catalogo.pdf"));

  const larguraCard = 250;
  const alturaCard = 230;
  const produtosPorPagina = 6;

  function precoParaNumero(preco: string) {
    return Number(
      preco.replace("R$", "").replace(/[^\d,.-]/g, "").replace(".", "").replace(",", ".").trim()
    );
  }

  function formatarPreco(valor: number) {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function limparNomeProduto(nome: string) {
    return nome
      .replace(/camargo\s*e\s*barros/gi, "")
      .replace(/entregamos.*?transportadora/gi, "")
      .replace(/produto esgotado/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buscarImagemPorCodigo(codigo: string) {
    if (!fs.existsSync(PASTA_IMAGENS)) return "";

    const codigoLimpo = codigo.replace(/[\\/:*?"<>|]/g, "-").toLowerCase();

    const arquivo = fs.readdirSync(PASTA_IMAGENS).find(nome => {
      const ext = path.extname(nome).toLowerCase();
      const base = path.basename(nome, ext).toLowerCase();

      return base === codigoLimpo && [".jpg", ".jpeg", ".png"].includes(ext);
    });

    return arquivo ? path.resolve(PASTA_IMAGENS, arquivo) : "";
  }

  const produtosDisponiveis = produtos
    .filter(p => !`${p.nome} ${p.preco}`.toLowerCase().includes("produto esgotado"))
    .map(p => ({ ...p, nome: limparNomeProduto(p.nome) }))
    .filter(p => p.nome.length > 0);

  produtosDisponiveis.forEach((produto, index) => {
    if (index > 0 && index % produtosPorPagina === 0) doc.addPage();

    const pos = index % produtosPorPagina;
    const coluna = pos % 2;
    const linha = Math.floor(pos / 2);

    const x = 30 + coluna * 280;
    const y = 40 + linha * 250;

    const precoVenda = precoParaNumero(produto.preco) * (1 + agioPercentual / 100);

    doc.roundedRect(x, y, larguraCard, alturaCard, 8).stroke();

    const imagem = buscarImagemPorCodigo(produto.codigo);

    if (imagem) {
      doc.image(imagem, x + 25, y + 10, {
        fit: [200, 115],
        align: "center",
        valign: "center"
      });
    } else {
      doc.fontSize(8).fillColor("gray").text("Imagem não encontrada", x + 10, y + 55, {
        width: larguraCard - 20,
        align: "center"
      });
      doc.fillColor("black");
    }

    doc.fontSize(9).fillColor("black").text(`Cód.: ${produto.codigo}`, x + 10, y + 132, {
      width: larguraCard - 20,
      align: "center"
    });

    doc.fontSize(10).text(produto.nome, x + 10, y + 150, {
      width: larguraCard - 20,
      height: 42,
      align: "center"
    });

    doc.fontSize(18).fillColor("green").text(formatarPreco(precoVenda), x + 10, y + 198, {
      width: larguraCard - 20,
      align: "center"
    });

    doc.fillColor("black");
  });

  doc.end();
}