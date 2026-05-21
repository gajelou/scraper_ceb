export function nomeArquivoSeguro(codigo: string, url: string) {
  const codigoLimpo = codigo.replace(/[\\/:*?"<>|]/g, "-");

  const extensao =
    url.includes(".png") ? ".png" :
    url.includes(".webp") ? ".webp" :
    url.includes(".jpeg") ? ".jpeg" :
    ".jpg";

  return `imagens/${codigoLimpo}${extensao}`;
}
