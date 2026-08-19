# Auditoria de instalação e interface

Data do teste: 2026-08-19.

## Fase inicial

`vercel.json` estava ausente no repositório. Foi criado com cabeçalhos para service worker sem cache, manifesto PWA com MIME correto e assets imutáveis. O arquivo passou no parse JSON.

O teste `scripts/test-webklip-api.mjs` passou com 50 itens e todas as fontes públicas como `ok`: notícias, código, jogos e design.

No navegador local, o manifesto foi encontrado em `/manifest.webmanifest`, o service worker ficou em estado `activated`, o contexto foi considerado seguro, e a interface apresentou o botão de instalação, o prompt rotativo e o botão do menu web.klip.

## Falha encontrada

No servidor estático local, o cache diário contém projetos do GitHub, mas não notícias. Ao abrir a aba Notícias, a interface exibiu zero itens. Isso é uma regressão de experiência: mesmo quando a fonte jornalística estiver indisponível, a aba deve mostrar um cartão transparente informando a indisponibilidade, em vez de parecer quebrada. O endpoint server-side em produção continua retornando notícias quando o RSS responde.

## Correção validada

Após a correção, o build local mostrou 42 itens: 41 projetos e um cartão de Notícias transparente informando que a fonte jornalística não respondeu. A aba não ficou vazia e o restante do feed permaneceu intacto.

## Interface auditada

A home mostrou prompt único rotativo e o clique preencheu a mensagem sem enviar. Artefatos abriu normalmente. O menu Mais expandiu abaixo de Artefatos, web.klip abriu, as categorias apareceram, a tela de detalhes abriu e o botão Codar com referência voltou ao chat preenchendo título, categoria, resumo e fonte; o contador de mensagens permaneceu em zero, confirmando que não houve envio automático.

## Instalação auditada

O manifesto e o service worker foram confirmados no navegador, com service worker `activated`, contexto seguro e botão de instalação visível. O botão Instalar foi acionado sem exceções no console. O navegador de sandbox não confirma a instalação nativa na interface automatizada, então a validação final em aparelho físico precisa ser feita no Chrome Android ou Safari iOS; o código agora esconde o aviso em `finally` quando o prompt é fechado ou falha.

## Produção no Vercel

O domínio `https://klipza-zzz.vercel.app/` respondeu publicamente com a tela de autenticação. Em produção, o manifesto foi carregado em `/manifest.webmanifest`, o service worker ficou `activated`, o contexto foi HTTPS e o botão de instalação apareceu. O fluxo do Google não foi acionado durante a auditoria para não iniciar login do proprietário sem confirmação.

## Endpoint em produção

A consulta `https://klipza-zzz.vercel.app/api/webklip?date=2026-08-19` respondeu com status 200, 50 itens e todas as fontes `ok`. A distribuição foi Notícias 20, Código 10, Jogos 10 e Design 10. A verificação automática encontrou zero ocorrências de celebridade, fofoca, malware, crack, pirataria, ativação ou fraude nos campos retornados.

## Cabeçalhos do Vercel

`sw.js` e `manifest.webmanifest` responderam 200 em produção. O manifesto veio com `Content-Type: application/manifest+json`, o service worker veio como JavaScript e ambos tiveram `cache-control: public, max-age=0, must-revalidate`, adequado para revalidação. A requisição HEAD ao endpoint retornou 405 porque a função aceita GET; a consulta GET já foi validada com status 200 e 50 itens.

## Regressão do chat

O menu de anexos abriu e mostrou Câmera, Fotos, Arquivos e recursos futuros. O modo Mensagens anônimas ativou a tela específica com aviso de que a conversa não será salva; o botão Sair voltou à conta normal. O histórico lateral abriu sem quebrar a home e manteve Conversas, Artefatos e Mais disponíveis.

## Configurações auditadas

O perfil abriu as configurações sem erro. A seção Instalação mostrou o status Disponível, o botão Instalar agora e a mensagem de segurança do pacote como Ativo, com HTTPS, manifesto e service worker.

A seção Notificações abriu corretamente e o botão Ativar foi acionado sem erro visível no navegador de teste. A preferência continua dependente da permissão real do navegador/dispositivo.

A seção Personalização abriu. O tema preto foi ativado e exibido em alto contraste; o tema claro foi restaurado em seguida, sem perda de navegação.

## Categorias auditadas

Depois de retornar ao web.klip, a categoria Código mostrou 14 itens exclusivamente de código e a categoria Design mostrou 14 itens exclusivamente de design. Os cards continuaram clicáveis e o layout em grade permaneceu estável.

## Deploy final após correção

Após o push do commit `5e47376`, o domínio público continuou respondendo pela tela de autenticação e confirmou HTTPS, manifesto em `/manifest.webmanifest`, service worker `activated` e botão Instalar. O commit não é exposto no HTML, mas o deploy público respondeu corretamente após a publicação.

## Filtro final em produção

Depois do deploy do commit `509a783`, o endpoint público respondeu com 50 itens, distribuídos em Notícias 20, Código 10, Jogos 10 e Design 10. A verificação por limite de palavra retornou `badCount: 0`, portanto a pauta de entretenimento detectada anteriormente não está mais no pacote novo.
