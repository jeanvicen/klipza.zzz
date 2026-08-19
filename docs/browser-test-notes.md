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

## Verificação pública pós-push

A página pública `https://klipza-zzz.vercel.app/` carregou. A chamada pública `/api/webklip?q=open%20source%20javascript&country=BR&language=pt-BR` respondeu HTTP 200, mas o payload observado ainda tinha o formato antigo de feed (`dayKey`, itens de categorias e sem `query`), indicando que o deploy automático ainda não havia propagado o commit `05eff3e` ou que a resposta estava em cache. O endpoint local do commit novo foi validado separadamente com pesquisa real e retornou resultados de categoria `search`; é necessário confirmar a propagação antes de afirmar que a busca já está ativa em produção.

## Correção da aba interna — teste inicial

Após recuperar o repositório completo, o app local carregou e o login demo abriu a home normalmente. O botão Mais está presente na barra lateral e a conversa inicial continua intacta. A nova versão removeu o bloco HTML do modal web.klip legado; o próximo teste é clicar em Mais e depois em web.klip para validar a navegação interna.

## Aba interna funcionando

O submenu Mais abriu corretamente e exibiu web.klip. O clique agora mudou imediatamente o `main` para uma aba interna com barra superior, botão `Voltar ao chat`, região/idioma, campo de pesquisa, atalhos de IA, categorias e estado de carregamento. Não apareceu o modal antigo nem o botão X conflitante; a conversa continua preservada na lateral.

O feed agora renderiza 18 cards inicialmente e mostra `Carregar mais 18`, reduzindo o custo de DOM. O card abriu detalhe compacto com `Abrir dentro do Klipza`; o clique mudou para a tela `Navegação interna` com Voltar/Início e iframe, sem nova aba. A fonte GitHub exibiu o estado de bloqueio de incorporação do próprio site, enquanto o app permaneceu aberto e navegável.

O botão Voltar da página interna retornou ao feed na mesma aba. A pesquisa também permaneceu dentro de web.klip e mostrou o estado vazio sem travar; no servidor estático local, a rota API não existe, então o teste visual exibiu indisponibilidade. O endpoint server-side do projeto continua sendo a fonte usada no deploy e no APK.

## Deploy público

Após o login no Vercel, o projeto `klipza-zzz` foi localizado. O deployment do commit `cb31433` falhou antes do build porque a validação do Vercel informou: ``vercel.json schema validation failed: `version` should be <= 2``. A correção necessária é trocar a versão do arquivo de configuração para 2 e reenviar o commit.

## Teste público — rodada atual

A home pública `https://klipza-zzz.vercel.app/` carregou com o aviso de instalação PWA e o botão Continuar com Google. O modo demo abriu a conversa normalmente, mantendo o compositor, o prompt do momento e os controles principais. Houve um snapshot inicial obsoleto durante o carregamento, mas uma nova navegação e o modo demo resolveram o estado sem erro persistente.

Na versão pública, a barra lateral abriu e o submenu Mais expandiu sem erro. O botão `web.klip` ficou visível como item interativo do menu, confirmando que o problema de abertura não ocorre mais nessa etapa.

A busca pública por `open source javascript` completou dentro do web.klip e retornou 1 resultado de pesquisa em um card, com o limite de 50 indicado na interface. O loading desapareceu normalmente, a URL permaneceu na mesma página do Klipza e os atalhos de IA continuaram disponíveis.

O card de pesquisa abriu o detalhe com os botões `Codar com referência` e `Abrir dentro do Klipza`. Ao abrir a fonte, a tela mudou para `Navegação interna`, exibindo Voltar/Início e mantendo a URL na mesma página pública. A área interna ficou em branco porque a fonte bloqueia incorporação, mas o app não abriu nova aba nem travou; o aviso de limitação aparece corretamente.

Após voltar da fonte, o estado da busca foi preservado. Ao limpar a pesquisa, o feed retornou com 48 itens disponíveis, mas apenas 18 exibidos inicialmente. O botão `Carregar mais 18` funcionou e aumentou a lista para 36 itens, deixando 12 restantes, confirmando o carregamento progressivo.

Por fim, o botão Voltar ao chat restaurou a home da conversa pública com compositor, microfone, envio, prompt do momento e sidebar intactos. O fluxo completo terminou sem abrir nova aba do navegador e sem deixar o app preso na tela interna.
