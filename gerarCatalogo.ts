import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { Produto } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PASTA_IMAGENS = path.resolve(process.cwd(), "imagens");

const formatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

// Índice das imagens carregado apenas uma vez
const mapaImagens = new Map<string, string>();

if (fs.existsSync(PASTA_IMAGENS)) {
  for (const nome of fs.readdirSync(PASTA_IMAGENS)) {
    const ext = path.extname(nome).toLowerCase();

    if (![".jpg", ".jpeg", ".png"].includes(ext))
      continue;

    const codigo = path.basename(nome, ext).toLowerCase();

    mapaImagens.set(codigo, path.join(PASTA_IMAGENS, nome));
  }
}

function buscarImagemPorCodigo(codigo: string) {
  return (
    mapaImagens.get(
      codigo.replace(/[\\/:*?"<>|]/g, "-").toLowerCase()
    ) || ""
  );
}

function precoParaNumero(preco: string) {
  return Number(
    preco
      .replace("R$", "")
      .replace(/[^\d,.-]/g, "")
      .replace(".", "")
      .replace(",", ".")
      .trim()
  );
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

export function gerarCatalogoPDF(
  produtos: Produto[],
  agioPercentual: number,
  mostrarPrecos = true
): Promise<{
  nomeArquivo: string;
  caminhoPDF: string;
}> {

  return new Promise((resolve, reject) => {

    const nomeArquivo = `catalogo-${Date.now()}.pdf`;
    const caminhoPDF = path.resolve(process.cwd(), nomeArquivo);

    const doc = new PDFDocument({
      size: "A4",
      margin: 30,
      bufferPages: false,
    });

    const stream = fs.createWriteStream(caminhoPDF);

    doc.pipe(stream);

    stream.on("finish", () => {
      resolve({
        nomeArquivo,
        caminhoPDF,
      });
    });

    stream.on("error", reject);
    doc.on("error", reject);

    const larguraCard = 250;
    const alturaCard = 230;
    const produtosPorPagina = 6;

    let index = 0;

    for (const produto of produtos) {

      if (
        `${produto.nome} ${produto.preco}`
          .toLowerCase()
          .includes("produto esgotado")
      ) {
        continue;
      }

      const nomeLimpo = limparNomeProduto(produto.nome);

      if (!nomeLimpo.length)
        continue;

      if (index > 0 && index % produtosPorPagina === 0)
        doc.addPage();

      const pos = index % produtosPorPagina;
      const coluna = pos % 2;
      const linha = Math.floor(pos / 2);

      const x = 30 + coluna * 280;
      const y = 40 + linha * 250;

      const precoVenda =
        precoParaNumero(produto.preco) *
        (1 + agioPercentual / 100);

      doc.roundedRect(
        x,
        y,
        larguraCard,
        alturaCard,
        8
      ).stroke();

      const imagem = buscarImagemPorCodigo(produto.codigo);

      if (imagem) {
        try {

          doc.image(imagem, x + 25, y + 10, {
            fit: [200, 115],
            align: "center",
            valign: "center",
          });

          // libera o cache interno do PDFKit
          const registry = (doc as any)._imageRegistry;
          if (registry && registry[imagem]) {
            delete registry[imagem];
          }

        } catch {

          doc
            .fontSize(8)
            .fillColor("gray")
            .text(
              "Imagem inválida",
              x + 10,
              y + 55,
              {
                width: larguraCard - 20,
                align: "center",
              }
            );

          doc.fillColor("black");
        }

      } else {

        doc
          .fontSize(8)
          .fillColor("gray")
          .text(
            "Imagem não encontrada",
            x + 10,
            y + 55,
            {
              width: larguraCard - 20,
              align: "center",
            }
          );

        doc.fillColor("black");
      }

      doc
        .fontSize(9)
        .fillColor("black")
        .text(
          `Cód.: ${produto.codigo}`,
          x + 10,
          y + 132,
          {
            width: larguraCard - 20,
            align: "center",
          }
        );

      doc
        .fontSize(10)
        .fillColor("black")
        .text(
          nomeLimpo,
          x + 10,
          y + 150,
          {
            width: larguraCard - 20,
            height: 42,
            align: "center",
          }
        );

      if (mostrarPrecos) {
        doc
          .fontSize(18)
          .fillColor("green")
          .text(
            formatter.format(precoVenda),
            x + 10,
            y + 198,
            {
              width: larguraCard - 20,
              align: "center",
            }
          );
      }

      doc.fillColor("black");

      index++;
    }

    doc.end();
  });
}
