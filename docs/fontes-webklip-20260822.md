# Fontes públicas consideradas para o web.klip

## Openverse

A documentação pública do Openverse descreve uma API para mídia aberta e informa que usuários anônimos podem fazer requisições, mas com limites de taxa e paginação; a própria documentação alerta que respostas 429 podem ocorrer e que scraping do catálogo é proibido. Por isso, a integração deve consultar uma página pequena e tratar indisponibilidade silenciosamente.

Fonte: [Openverse API](https://api.openverse.org/)

## Wikipedia / MediaWiki

A documentação oficial do MediaWiki define o módulo `list=search` da Action API, com `srsearch`, `srlimit`, `srprop` e formato JSON. A consulta pode ser feita sem autenticação para resultados de leitura.

Fonte: [MediaWiki API: Search](https://www.mediawiki.org/wiki/API:Search)

## Open-Meteo

A documentação pública do Open-Meteo descreve o endpoint de geocoding e o endpoint de previsão com parâmetros `current`, `timezone` e coordenadas. O serviço informa acesso sem chave para uso não comercial; a interface deve tratar falhas e não prometer disponibilidade ilimitada.

Fonte: [Open-Meteo Weather Forecast API](https://open-meteo.com/en/docs)

## YouTube

A pesquisa pública do YouTube entrega uma página com dados embutidos de resultados, mas esse formato é dinâmico e pode mudar ou ser bloqueado. A integração deve ser opcional, com parser defensivo e fallback silencioso; os cards devem abrir o vídeo original no YouTube.

Fonte: [YouTube search results](https://www.youtube.com/results?search_query=web+development)

## Notícias e busca geral

O web.klip mantém o DuckDuckGo HTML e Google News RSS como fontes públicas sem chave no servidor. Como ambas podem sofrer variações de HTML, bloqueios ou indisponibilidade, as consultas são isoladas com `Promise.allSettled`, cache curto e status por fonte, sem interromper as outras abas.
