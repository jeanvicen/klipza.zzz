# Notas do teste visual — 19/08/2026

O app local carregou em `http://127.0.0.1:4173/` com a tela de login, aviso de instalação PWA e identidade visual Klipza. O botão de login demo abriu o aplicativo principal corretamente. A home exibiu saudação por horário, prompt rotativo, compositor e botão de microfone. Os controles do menu lateral aparecem no DOM; o próximo passo do teste é abrir `Mais` e validar o modal web.klip, pesquisa, links externos, tema e confirmações.

O navegador indicou que o conteúdo visual está em viewport de aproximadamente 893 × 805 px e não apresentou erro de carregamento na navegação inicial.

## Web.klip

O menu `Mais` expandiu e exibiu `web.klip`. O clique abriu um modal sobre a conversa, sem substituir a home. O modal carregou o feed diário, o país/idioma (`Brasil · pt-BR`), as categorias, o campo `Pesquisar na web`, os botões para ChatGPT, Claude, Gemini, Perplexity e Microsoft Copilot, e fontes do fallback GitHub quando o RSS local não responde. O layout apareceu responsivo e os cards ficaram em duas colunas no viewport do teste.

## Pesquisa em ambiente local

A barra de pesquisa abriu a aba de resultados, preservou o texto e exibiu `Ver feed diário`, limite de 50 e estado vazio. Como o teste usou um ambiente local simples, a fonte de pesquisa não estava disponível nessa execução; por isso a interface mostrou indisponibilidade pública. A integração foi validada separadamente com Node e retornou `status=200`, 10 resultados para `open source javascript` e URLs HTTP(S) válidas.

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

A página pública carregou. A chamada pública de pesquisa respondeu HTTP 200, mas o payload observado ainda tinha o formato antigo de feed (`dayKey`, itens de categorias e sem `query`), indicando que a versão publicada ainda não havia sido atualizada ou que a resposta estava em cache. A versão local foi validada separadamente com pesquisa real e retornou resultados de categoria `search`; é necessário confirmar a atualização antes de afirmar que a busca já está ativa em produção.

## Correção da aba interna — teste inicial

Após recuperar o repositório completo, o app local carregou e o login demo abriu a home normalmente. O botão Mais está presente na barra lateral e a conversa inicial continua intacta. A nova versão removeu o bloco HTML do modal web.klip legado; o próximo teste é clicar em Mais e depois em web.klip para validar a navegação interna.

## Aba interna funcionando

O submenu Mais abriu corretamente e exibiu web.klip. O clique agora mudou imediatamente o `main` para uma aba interna com barra superior, botão `Voltar ao chat`, região/idioma, campo de pesquisa, atalhos de IA, categorias e estado de carregamento. Não apareceu o modal antigo nem o botão X conflitante; a conversa continua preservada na lateral.

O feed agora renderiza 18 cards inicialmente e mostra `Carregar mais 18`, reduzindo o custo de DOM. O card abriu detalhe compacto com `Abrir dentro do Klipza`; o clique mudou para a tela `Navegação interna` com Voltar/Início e iframe, sem nova aba. A fonte GitHub exibiu o estado de bloqueio de incorporação do próprio site, enquanto o app permaneceu aberto e navegável.

O botão Voltar da página interna retornou ao feed na mesma aba. A pesquisa também permaneceu dentro de web.klip e mostrou o estado vazio sem travar; em um ambiente local limitado, a fonte de pesquisa não estava disponível, então o teste visual exibiu indisponibilidade. A versão integrada do projeto continua sendo a fonte usada na publicação web e no APK.

## Deploy público

Durante a publicação, o projeto `klipza-zzz` foi localizado. A versão do commit `cb31433` falhou antes do build porque a validação do arquivo de configuração informou que o campo `version` deveria ser menor ou igual a 2. A correção necessária foi ajustar a versão do arquivo de configuração e reenviar o commit.

## Teste público — rodada atual

A home pública carregou com o aviso de instalação PWA e o botão Continuar com Google. O modo demo abriu a conversa normalmente, mantendo o compositor, o prompt do momento e os controles principais. Houve um snapshot inicial obsoleto durante o carregamento, mas uma nova navegação e o modo demo resolveram o estado sem erro persistente.

Na versão pública, a barra lateral abriu e o submenu Mais expandiu sem erro. O botão `web.klip` ficou visível como item interativo do menu, confirmando que o problema de abertura não ocorre mais nessa etapa.

A busca pública por `open source javascript` completou dentro do web.klip e retornou 1 resultado de pesquisa em um card, com o limite de 50 indicado na interface. O loading desapareceu normalmente, a URL permaneceu na mesma página do Klipza e os atalhos de IA continuaram disponíveis.

O card de pesquisa abriu o detalhe com os botões `Codar com referência` e `Abrir dentro do Klipza`. Ao abrir a fonte, a tela mudou para `Navegação interna`, exibindo Voltar/Início e mantendo a URL na mesma página pública. A área interna ficou em branco porque a fonte bloqueia incorporação, mas o app não abriu nova aba nem travou; o aviso de limitação aparece corretamente.

Após voltar da fonte, o estado da busca foi preservado. Ao limpar a pesquisa, o feed retornou com 48 itens disponíveis, mas apenas 18 exibidos inicialmente. O botão `Carregar mais 18` funcionou e aumentou a lista para 36 itens, deixando 12 restantes, confirmando o carregamento progressivo.

Por fim, o botão Voltar ao chat restaurou a home da conversa pública com compositor, microfone, envio, prompt do momento e sidebar intactos. O fluxo completo terminou sem abrir nova aba do navegador e sem deixar o app preso na tela interna.

## Correção da relevância — teste público

Após o deploy `d105f05`, a busca pública `python game` passou a retornar 28 projetos relacionados do GitHub, exibindo 18 inicialmente e deixando 10 para carregamento progressivo. Os primeiros itens foram `grantjenks/free-python-games`, `kitao/pyxel` e `wangshub/wechat_jump_game`, todos contendo relação textual com Python/jogos. A resposta do endpoint indicou fallback `github` quando as fontes de pesquisa geral não retornaram itens.

A consulta pública `klipzaqzxv-resultado-impossivel-92741` terminou com `0 resultado(s)` e exibiu `Nenhum resultado público encontrado para esta busca.` tanto no resumo quanto no card vazio. Nenhum item aleatório foi inserido.

## Preview interno e fallback de navegador

O build local atualizado carregou o web.klip e abriu o detalhe de um projeto do GitHub. A fonte produziu uma área vazia no iframe, cenário reproduzido na imagem enviada. Após o timeout controlado, o web.klip mudou para o estado `Fonte aberta no navegador`, em vez de permanecer bloqueado, e exibiu as ações `Abrir novamente` e `Voltar ao web.klip`. O retorno restaurou o feed diário sem perder o contexto.

Também foi validada a checagem de segurança de políticas: `https://www.google.com/` foi identificado como não incorporável e `https://example.com/` como incorporável. No APK, o fallback usa o plugin InAppBrowser; no navegador web, usa a abertura externa compatível como último recurso.

## Validação da publicação b5a547d

A publicação carregou a aba web.klip, exibiu `50 item(ns) disponíveis`, filtros e pesquisa. O primeiro card abriu o detalhe corretamente, com os botões `Codar com referência` e `Abrir dentro do Klipza`. A consulta pública confirmou `www.google.com` como `embeddable: false` por `x-frame-options` e `example.com` como `embeddable: true`.

## Autenticação por e-mail no app — validação visual local

O build local passou a mostrar entrada por e-mail e senha, criação de conta com confirmação de senha, recuperação de senha e a tela simplificada sem Google ou link mágico. A alternância para `Criar conta` exibiu os campos adicionais corretamente. O botão `Esqueci minha senha` mostrou o estado de orientação sem revelar se o e-mail existe, compatível com prevenção de enumeração de contas. O app permaneceu na tela de login quando não havia sessão ativa, sem usar mais o login demo automático.

## Identidade dos e-mails

O painel autenticado permitiu configurar SMTP customizado. O endereço público do projeto foi definido como Site URL e redirect permitido, e os e-mails foram configurados para usar o nome visual `Equipe Klipza`.

A versão local final da autenticação foi validada visualmente. No modo de entrada aparecem apenas e-mail, senha, entrar, criar conta e esqueci minha senha. Ao tocar em `Criar conta`, o campo `Nome`, a confirmação de senha e o botão `Criar conta` aparecem.

Os campos não sensíveis foram corrigidos para remetente `klipzastudio@gmail.com`, nome `Equipe Klipza`, host `smtp.gmail.com`, porta `587` e usuário SMTP completo. Após recarregar o painel, os campos de remetente, nome, host, porta e usuário permaneceram preenchidos, enquanto a senha ficou protegida e não visualizável. O botão de salvar ficou desabilitado, confirmando que a configuração de envio foi salva corretamente.

O template `Confirm sign up` foi salvo com assunto `Confirme seu e-mail para entrar no Klipza.IA`, corpo em português, botão `{{ .ConfirmationURL }}`, aviso de segurança e assinatura `Equipe Klipza`. O template `Reset password` também foi salvo com assunto `Recupere sua senha com segurança no Klipza.IA`, botão de redefinição, aviso de expiração e assinatura `Equipe Klipza`. Em ambos os casos, o botão `Save changes` ficou desabilitado após a publicação, indicando ausência de alterações pendentes.

A publicação `f42f696` carregou a tela de entrada com apenas e-mail, senha, Entrar, Criar conta e Esqueci minha senha. O modo Criar conta exibiu somente Nome, E-mail, senha, confirmação de senha e os botões apropriados; Google e link mágico não aparecem.

A publicação também abriu o fluxo `Esqueci minha senha`: o app manteve a estrutura simples e exibiu a orientação `Digite seu e-mail para receber a recuperação.` sem revelar se o endereço existe. O teste não submeteu o formulário, portanto nenhum e-mail foi enviado durante a validação.

