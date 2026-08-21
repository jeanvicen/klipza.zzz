# Klipza — build e publicação

## Estado dos artefatos

O projeto Android foi gerado com Capacitor, identificador `ia.klipza.app`, nome de aplicativo `Klipza`, `minSdkVersion 23`, `targetSdkVersion 35` e `compileSdkVersion 35`.

| Artefato | Estado | Uso |
| --- | --- | --- |
| `app-debug.apk` | Compilado e validado | Instalação e testes internos; não usar como publicação final. |
| `app-release-unsigned.apk` | Compilado | Base para assinatura; ainda não é aceito como release final pela Play Store. |
| AAB assinado | Pendente da chave do proprietário | Formato recomendado para publicação na Google Play. |

## O que já foi validado

O APK de debug contém o nome Klipza, o identificador `ia.klipza.app`, o manifesto PWA, o service worker, a marca e os ícones 192/512. O build foi concluído com sucesso usando a plataforma Android 35.

O web.klip foi integrado ao pacote web e sincronizado com o projeto Android. Ele possui menu expansível, pacote diário em cache por data, rotação de pergunta a cada 25 segundos, categorias, tela de detalhes e ação “Codar com referência”.

## Assinatura necessária antes da publicação

Não foi criada uma keystore nova automaticamente, porque a chave de assinatura deve ficar sob controle do proprietário do aplicativo. Para publicar, gerar ou fornecer uma keystore protegida, configurar as variáveis de assinatura somente no ambiente de build e nunca commitá-las no repositório. Depois disso, gerar um AAB release assinado e fazer o upload pelo Play Console.

A Apple App Store exige um fluxo separado com projeto iOS, conta Apple Developer, certificados e provisioning profiles. O PWA continua sendo instalável no iPhone pelo Safari, mas isso não substitui um pacote nativo assinado para a App Store.

## Comandos principais

```bash
pnpm check:html
pnpm build:web
pnpm cap:sync
cd android
./gradlew assembleDebug
./gradlew assembleRelease
```

O módulo web.klip deve ser publicado junto do projeto para que a categoria Notícias use as fontes públicas disponíveis. Em ambientes de teste sem todas as fontes, o app usa projetos públicos do GitHub como fallback e informa a limitação na interface; ele não inventa manchetes.
