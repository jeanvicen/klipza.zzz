# Fontes externas usadas no sistema de artefatos

- SheetJS standalone browser scripts: https://docs.sheetjs.com/docs/getting-started/installation/standalone/
  - A documentação informa que a versão atual consultada é 0.20.3 e que o build completo pode ser carregado por https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js, expondo `window.XLSX`.
- jsPDF documentation: https://artskydj.github.io/jsPDF/docs/index.html
  - A documentação confirma geração PDF client-side e carregamento via script CDN. O projeto usa o UMD pinado em https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js.
- docx Packer API: https://docx.js.org/api/classes/Packer.html
  - A API oficial confirma `Packer.toBlob(doc)` para exportação no navegador. O pacote consultado é `docx@9.7.1`, e o Klipza usa o bundle IIFE em https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js, que expõe `docx` no escopo da página.

Durante a validação, `dist/index.umd.cjs` carregou sem expor `window.docx` no navegador. Por isso, ele não foi publicado; o bundle IIFE foi testado e passou.
