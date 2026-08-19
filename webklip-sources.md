# Fontes do web.klip

## Fontes avaliadas

A documentação do GDELT confirma que a API DOC 2.0 oferece busca de cobertura jornalística global, suporte a múltiplos idiomas, formatos JSON/JSONP e cabeçalho CORS aberto, o que permite consulta direta pelo navegador. Fonte: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/

A documentação da API de busca do GitHub confirma que é possível pesquisar repositórios públicos com parâmetros de consulta, ordenação e paginação. A própria documentação mostra consultas ordenadas por estrelas, o que serve para selecionar novidades técnicas e projetos públicos. Fonte: https://docs.github.com/en/rest/search/search

## Decisão técnica provisória

O primeiro corte será client-side: o app consulta as fontes públicas quando o usuário abre o web.klip, grava um pacote diário por data no armazenamento local e mantém esse pacote até mudar o dia. A rotação de 25 segundos será apenas da pergunta exibida na home; ela não fará novas chamadas de rede. A tela de feed poderá atualizar manualmente e ao trocar a data.

Para não expor chaves, o código não usará tokens privados. Itens de notícias serão filtrados por termos de celebridades, fofoca e entretenimento; projetos serão classificados em notícias, jogos, código e design usando termos e tópicos públicos. Se uma fonte falhar ou limitar requisições, o app usará um conjunto de fallback local claramente marcado como demonstração, sem simular que é notícia real do dia.

## Verificação da primeira integração

A home local agora exibe a saudação contextual de acordo com o horário e um único botão “Pergunta do momento” com rotação indicada de 25 segundos. Os cards fixos Ideias, Explique, Escreva e Analise não aparecem mais. O menu lateral mostra “Mais” imediatamente abaixo de Artefatos, pronto para revelar web.klip.

O submenu web.klip abriu abaixo de Mais e a tela mostrou as categorias Tudo, Notícias, Jogos, Código e Design, além do botão Atualizar agora. A busca de fontes iniciou e exibiu o estado de carregamento sem travar o chat ou o menu.

## Problemas encontrados no primeiro pacote

O GitHub retornou 48 itens, distribuídos entre Jogos, Código e Design, mas a chamada direta do GDELT falhou com `TypeError: Failed to fetch` no navegador, indicando que a fonte de notícias não está acessível neste ambiente via CORS ou rede. Portanto, a arquitetura precisa aceitar uma fonte intermediária/proxy para notícias se quisermos garantir conteúdo jornalístico real no PWA.

Também apareceram resultados inadequados para um feed editorial: executores de Roblox, ferramentas de ativação de software e projetos potencialmente associados a fraude/contorno de licença. Eles devem ser filtrados por termos de risco antes de aparecerem no web.klip. A seleção atual não deve ser considerada pronta para publicação ainda.

## Fonte de notícias corrigida

A consulta direta do GDELT não funcionou a partir do servidor deste ambiente. Foi verificado que o RSS público do Google News responde e entrega itens recentes com título, fonte, data e link original. O endpoint foi atualizado para usar esse RSS no lado server-side e manter filtros de celebridades, fofoca e entretenimento.

O teste `scripts/test-webklip-api.mjs` passou com `status: 200`, `count: 50` e todas as fontes como `ok`: notícias, código, jogos e design. O teste também confirmou que termos bloqueados como celebrity, executor, activator, malware, piracy e cheat não aparecem nos itens retornados.

Fonte externa usada para o RSS: https://news.google.com/rss/search?q=world+OR+science+OR+technology+OR+climate+OR+business+when%3A1d&hl=en-US&gl=US&ceid=US%3Aen

## Validação após os filtros

No build atualizado, a home segue sem os quatro cards fixos, a pergunta alterna a cada 25 segundos e o menu Mais permanece abaixo de Artefatos. A expansão revelou web.klip sem erros visíveis.

No navegador local, o web.klip exibiu 41 projetos após os filtros, sem os executores e ativadores que apareceram na primeira rodada. A interface também informou de forma transparente que as notícias diárias dependem do endpoint server-side, que não existe no servidor estático local. Em produção no Vercel, o endpoint `api/webklip.js` retorna o pacote completo de 50 itens no teste direto.

A abertura de um item mostrou a tela de detalhes com resumo, fonte original e os botões “Codar com referência” e “Abrir fonte”. O detalhe funciona, mas o fallback local mostra `\\n\\n` literalmente no metadado de estrelas, então esse separador deve ser corrigido para uma quebra de linha real antes da entrega.

## Regressão observada no reload

Após um reload limpo no servidor estático local, a tela web.klip chegou a exibir 0 itens sem erro no console. Isso precisa ser diagnosticado antes da entrega. O endpoint server-side continua passando o teste direto com 50 itens; o problema está restrito ao fallback/localStorage ou à chamada do servidor estático local.

A correção do cache foi validada: depois de recarregar a aplicação e abrir web.klip, os 41 itens salvos apareceram normalmente no DOM. A tela não permanece mais vazia quando o pacote do dia já existe no armazenamento local.

O fluxo de referência foi validado: ao clicar em “Codar com referência”, o web.klip voltou para Conversas e preencheu o campo de mensagem com título, categoria, resumo e fonte, sem enviar automaticamente. A pessoa pode complementar e enviar depois, como solicitado.

## Última rodada automatizada

`pnpm check:html`, `node --check api/webklip.js`, `node --check sw.js`, `node scripts/test-webklip-api.mjs` e `git diff --check` passaram. Nesta execução, o RSS de notícias respondeu e o GitHub apresentou indisponibilidade temporária, então o endpoint retornou 20 notícias; em uma execução anterior com todas as fontes disponíveis, retornou 50 itens. O limite do endpoint continua sendo 50 e o teste aceita variação real de disponibilidade, sem inventar conteúdo para preencher o pacote.
