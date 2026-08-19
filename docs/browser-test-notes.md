# Notas do teste visual — 19/08/2026

O app local carregou em `http://127.0.0.1:4173/` com a tela de login, aviso de instalação PWA e identidade visual Klipza. O botão de login demo abriu o aplicativo principal corretamente. A home exibiu saudação por horário, prompt rotativo, compositor e botão de microfone. Os controles do menu lateral aparecem no DOM; o próximo passo do teste é abrir `Mais` e validar o modal web.klip, pesquisa, links externos, tema e confirmações.

O navegador indicou que o conteúdo visual está em viewport de aproximadamente 893 × 805 px e não apresentou erro de carregamento na navegação inicial.

## Web.klip

O menu `Mais` expandiu e exibiu `web.klip`. O clique abriu um modal sobre a conversa, sem substituir a home. O modal carregou o feed diário, o país/idioma (`Brasil · pt-BR`), as categorias, o campo `Pesquisar na web`, os botões para ChatGPT, Claude, Gemini, Perplexity e Microsoft Copilot, e fontes do fallback GitHub quando o RSS local não responde. O layout apareceu responsivo e os cards ficaram em duas colunas no viewport do teste.

## Pesquisa no servidor estático

A barra de pesquisa abriu a aba de resultados, preservou o texto e exibiu `Ver feed diário`, limite de 50 e estado vazio. Como o teste usou `python -m http.server`, a rota `/api/webklip` não existe nesse servidor estático; por isso a UI mostrou indisponibilidade pública. O endpoint server-side foi testado separadamente com Node e retornou `status=200`, 10 resultados para `open source javascript` e URLs HTTP(S) válidas.

## Configurações

O fechamento do web.klip retornou à conversa. O perfil abriu o painel de configurações em modal lateral. A seção Geral mostrou o seletor `País e idioma do web.klip` com dez opções, incluindo Brasil, Portugal, Estados Unidos, Reino Unido, Espanha, México, França, Alemanha, Japão e Índia.

A seleção de Portugal alterou visualmente o select e manteve o painel funcionando. A seção Controles de dados mostrou o botão `Apagar histórico` e o contador de conversas sem afetar artefatos.

## Confirmação de exclusão

`Apagar histórico` abriu um modal visual com título, explicação, botão `Cancelar` e botão `Sim, apagar`, com fundo desfocado. O cancelamento fechou o modal e manteve a conversa salva, confirmando que o fluxo não usa confirmação nativa nem apaga dados por engano.

## Tema

A troca para o modo escuro funcionou visualmente e o painel permaneceu legível, mas revelou que o rótulo da configuração ainda diz `Preto · trocar`. A paleta aplicada precisa ser ajustada para o nome `Cinza · trocar` e a cor de fundo deve ser revisada no código para ficar coerente com o requisito de cinza confortável.

A leitura computada confirmou fundo `rgb(42, 42, 42)` para o tema escuro, coerente com `#2a2a2a`. Após recarregar o app, a home continuou carregando no modo escuro com prompt, compositor e aviso de instalação preservados.

## Microfone

No Chromium de sandbox, o clique no microfone não exibiu texto de transcrição nem painel de escuta, provavelmente porque o ambiente de teste não disponibiliza o reconhecimento de voz. A home permaneceu estável, sem erros visuais. A lógica implementada mantém o painel e a sessão protegida para navegadores que expõem `SpeechRecognition`; a disponibilidade real de áudio deve ser confirmada em um celular com permissão de microfone.
