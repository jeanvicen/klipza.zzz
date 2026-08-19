# Klipza.IA

Klipza.IA é uma interface web de conversa com suporte a instalação como PWA e empacotamento Android via Capacitor. O projeto mantém a experiência de chat existente e adiciona o **web.klip**, uma área diária de pesquisa com notícias globais, jogos, código e design.

## O que foi implementado

A home agora usa uma saudação contextual de acordo com o horário e um único botão de pergunta que alterna a cada 25 segundos. Os cards fixos de Ideias, Explique, Escreva e Analise foram removidos.

No menu lateral, abaixo de Artefatos, existe o agrupador **Mais**. Ao expandi-lo, a pessoa encontra o botão **web.klip**. Essa tela possui categorias, pacote diário por data, botão de atualização, cards com resumo, abertura da fonte e a ação **Codar com referência**, que volta ao chat com o contexto preenchido para a pessoa complementar antes de enviar.

O endpoint `api/webklip.js` coleta até 50 itens por dia, usa RSS público de notícias e consultas públicas do GitHub, filtra celebridades, fofoca, fraude, malware, cracks, ativadores e contorno de licenças, e retorna um pacote marcado pela data. O frontend armazena o resultado do dia no `localStorage` e não mistura automaticamente pacotes de datas diferentes.

## PWA e Android

O projeto contém `manifest.webmanifest`, `sw.js`, ícones instaláveis e o fluxo de instalação já presente na interface. O projeto Android fica em `android/` e é gerado pelo Capacitor com identificador `ia.klipza.app`, nome `Klipza`, SDK de compilação 35, SDK mínimo 23 e target 35.

Os comandos principais são:

```bash
pnpm install
pnpm check:html
pnpm build:web
pnpm cap:sync
cd android
./gradlew assembleDebug
./gradlew assembleRelease
```

O APK de debug serve para testes internos. O release gerado localmente é não assinado. Antes de publicar na Google Play, o proprietário precisa configurar uma keystore própria e gerar um AAB release assinado. A App Store exige um projeto iOS separado, certificados Apple e provisioning profiles; o PWA continua sendo a alternativa instalável no iPhone pelo Safari.

## Testes

O validador `scripts/check-html.mjs` verifica o JavaScript inline, manifesto, service worker, ícones, menu web.klip, rotação, cache, endpoint e marcadores de filtro. O teste `scripts/test-webklip-api.mjs` valida o endpoint, limite de 50 itens, fontes disponíveis e ausência de termos bloqueados.

```bash
pnpm check:html
node --check api/webklip.js
node scripts/test-webklip-api.mjs
git diff --check
```

## Publicação web

O repositório foi preparado para o Vercel: o conteúdo estático continua na raiz e `api/webklip.js` é uma função server-side. Em um servidor estático local sem a pasta `api` executável, a interface usa projetos públicos do GitHub como fallback e informa que a categoria Notícias precisa do endpoint server-side publicado. Essa decisão evita fingir que uma manchete foi obtida quando a fonte não respondeu.

## Identidade visual

A marca é monocromática e usa o ativo próprio em `assets/klipza-mark.png`, com versões de ícone para PWA. A forma final é uma variação geométrica inédita inspirada apenas na compactação visual da referência fornecida; o caractere Unicode 𖣂 não é usado literalmente como logotipo.
