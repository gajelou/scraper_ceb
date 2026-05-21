import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { Produto } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PASTA_IMAGENS = path.resolve(__dirname, "imagens");

export function gerarCatalogoPDF(produtos: Produto[], agioPercentual: number) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 30
  });

  doc.pipe(fs.createWriteStream("catalogo.pdf"));

  const produtosPorPagina = 6;
  const larguraCard = 250;
  const alturaCard = 230;

  function precoParaNumero(preco: string) {
    const limpo = preco
      .replace("R$", "")
      .replace(/[^\d,.-]/g, "")
      .replace(".", "")
      .replace(",", ".")
      .trim();

    return Number(limpo);
  }

  function formatarPreco(valor: number) {
    return valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function limparNomeProduto(nome: string) {
    return nome
      .replace(/camargo\s*e\s*barros/gi, "")
      .replace(/camargo\s*&\s*barros/gi, "")
      .replace(/entregamos.*?transportadora/gi, "")
      .replace(/entregamos na região do brás próximo a loja/gi, "")
      .replace(/ou solicitamos coleta via transportadora/gi, "")
      .replace(/produto esgotado/gi, "")
      .replace(/logo/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function produtoEstaEsgotado(produto: Produto) {
    const texto = `${produto.codigo} ${produto.nome} ${produto.preco}`.toLowerCase();
    return texto.includes("produto esgotado");
  }

  function codigoSeguro(codigo: string) {
    return codigo.replace(/[\\/:*?"<>|]/g, "-");
  }

  function buscarImagemPorCodigo(produto: Produto) {
    if (!fs.existsSync(PASTA_IMAGENS)) return "";

    const codigo = codigoSeguro(produto.codigo).toLowerCase();

    const arquivos = fs.readdirSync(PASTA_IMAGENS);

    const imagem = arquivos.find(arquivo => {
      const nomeArquivo = arquivo.toLowerCase();

      const extensaoValida =
        nomeArquivo.endsWith(".jpg") ||
        nomeArquivo.endsWith(".jpeg") ||
        nomeArquivo.endsWith(".png");

      if (!extensaoValida) return false;

      return nomeArquivo.startsWith(codigo);
    });

    if (!imagem) return "";

    return path.resolve(PASTA_IMAGENS, imagem);
  }

  const produtosDisponiveis = produtos
    .filter(produto => !produtoEstaEsgotado(produto))
    .map(produto => ({
      ...produto,
      nome: limparNomeProduto(produto.nome)
    }))
    .filter(produto => produto.nome.length > 0);

  produtosDisponiveis.forEach((produto, index) => {
    if (index > 0 && index % produtosPorPagina === 0) {
      doc.addPage();
    }

    const posicaoNaPagina = index % produtosPorPagina;
    const coluna = posicaoNaPagina % 2;
    const linha = Math.floor(posicaoNaPagina / 2);

    const x = 30 + coluna * 280;
    const y = 40 + linha * 250;

    const precoAtacado = precoParaNumero(produto.preco);
    const precoVenda = precoAtacado + (precoAtacado * agioPercentual / 100);

    doc.roundedRect(x, y, larguraCard, alturaCard, 8).stroke();

    const caminhoImagem = buscarImagemPorCodigo(produto);

    if (caminhoImagem && fs.existsSync(caminhoImagem)) {
      try {
        doc.image(caminhoImagem, x + 25, y + 10, {
          fit: [200, 115],
          align: "center",
          valign: "center"
        });
      } catch {
        doc
          .fontSize(8)
          .fillColor("gray")
          .text("Imagem inválida", x + 10, y + 55, {
            width: larguraCard - 20,
            align: "center"
          });

        doc.fillColor("black");
      }
    } else {
      doc
        .fontSize(8)
        .fillColor("gray")
        .text("Imagem não encontrada", x + 10, y + 55, {
          width: larguraCard - 20,
          align: "center"
        });

      doc.fillColor("black");
    }

    doc
      .fontSize(9)
      .fillColor("black")
      .text(`Cód.: ${produto.codigo}`, x + 10, y + 132, {
        width: larguraCard - 20,
        align: "center"
      });

    doc
      .fontSize(10)
      .fillColor("black")
      .text(produto.nome, x + 10, y + 150, {
        width: larguraCard - 20,
        height: 42,
        align: "center"
      });

    doc
      .fontSize(18)
      .fillColor("green")
      .text(formatarPreco(precoVenda), x + 10, y + 198, {
        width: larguraCard - 20,
        align: "center"
      });

    doc.fillColor("black");
  });

  doc.end();

  console.log(`Catálogo PDF gerado com ${agioPercentual}% de ágio.`);
  console.log(`Pasta de imagens usada: ${PASTA_IMAGENS}`);
  console.log(`Produtos no catálogo: ${produtosDisponiveis.length}`);
  console.log(`Produtos removidos por esgotado: ${produtos.length - produtosDisponiveis.length}`);
}

function isMainModule() {
  const entryFile = process.argv[1];
  if (!entryFile) return false;

  return import.meta.url === pathToFileURL(path.resolve(entryFile)).href;
}

if (isMainModule()) {
  const produtosPath = path.resolve(process.cwd(), "produtos.json");

  if (!fs.existsSync(produtosPath)) {
    console.error("Arquivo produtos.json não encontrado.");
    process.exit(1);
  }

  const produtos: Produto[] = JSON.parse(
    fs.readFileSync(produtosPath, "utf-8")
  );

  const agioPercentual = Number(process.argv[2] ?? "30");

  if (Number.isNaN(agioPercentual)) {
    console.error("Informe um ágio válido. Exemplo: npx tsx ./src/gerarCatalogo.ts 30");
    process.exit(1);
  }

  gerarCatalogoPDF(produtos, agioPercentual);
}