# Validação dos CDNs de artefatos

O teste temporário em `http://127.0.0.1:4174/artifact-test.html` confirmou que o UMD do jsPDF gerou um Blob PDF de 3136 bytes, o build oficial do SheetJS gerou uma planilha XLSX de 15944 bytes e o preview HTML em iframe sandbox foi carregado.

O arquivo `docx@9.7.1/dist/index.umd.cjs` respondeu, mas não criou `window.docx`, `window.Docx` nem `window.DOCX` no navegador. A integração não será publicada usando esse caminho sem corrigir a forma de carregamento; o adaptador deverá usar um build de navegador que realmente exponha a API `Document`, `Paragraph` e `Packer.toBlob`.
A recarga com o bundle IIFE exigiu uma nova abertura do teste porque a sessão do navegador voltou para `about:blank`; nenhum resultado dessa segunda tentativa foi considerado até a página ser carregada novamente.
Na segunda abertura do teste, PDF (3136 bytes), DOCX (8494 bytes), XLSX (15944 bytes) e preview HTML em iframe passaram. O HTML principal local do Klipza carregou a tela de login e a consulta do console não mostrou erros críticos.


## Verificação final do build local

Em 22/08/2026, o `index.html` reconstruído foi aberto em servidor local sem autenticação e sem enviar mensagens à IA. A página de login carregou normalmente; a inspeção do console não indicou erro crítico. O objeto público do app confirmou `window.K.openArtifactCanvas`, `window.K.downloadArtifact` e `window.K.createArtifactFromCode` como funções. A validação foi feita sem consumir energia ou alterar uma conta.
