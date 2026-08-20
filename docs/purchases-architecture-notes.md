# Klipza.IA — notas de arquitetura de compras

## Auditoria inicial

O app atual é um frontend monolítico em `index.html`, publicado na Vercel, com Supabase Auth e migrações SQL versionadas. A energia diária atual (`state.quota.energy`) é local ao navegador e reinicia a cada ciclo de 24 horas. O modal `Klipza.Prime` existe visualmente, mas os botões ainda exibem “em breve”; não há ainda ledger de créditos, pedidos, assinaturas, webhook de pagamento ou endpoint de checkout. A tabela `public.purchases` já é referenciada pela migração de segurança existente, mas o repositório não contém a migração que cria seu esquema de negócio.

A correção precisa separar **energia diária gratuita** de **tokens comprados**. Tokens comprados devem ficar em saldo persistente no Supabase, com lançamentos imutáveis de crédito/débito, idempotência por evento externo e vinculação ao usuário autenticado. A entrega de tokens deve ocorrer apenas no servidor após confirmação assinada do provedor, nunca porque o cliente informou que voltou de uma página de sucesso.

## Opções de checkout

| Abordagem | Tradeoffs | Custo | Complexidade de configuração |
| --- | --- | --- | --- |
| Stripe Checkout com endpoint de sessão e webhook assinado | Adequado para bens digitais e assinatura; requer conta Stripe, chaves, preços e configuração de webhook; exige esclarecer moeda, impostos e regras comerciais | Tarifas do provedor por transação; sem custo de infraestrutura adicional relevante no desenho atual | Média |
| Shopify headless com checkout e webhooks de pedidos/assinaturas | Segue um modelo completo de loja, checkout e catálogo; acrescenta uma plataforma de comércio e configuração de loja; a entrega de tokens ainda precisa de webhook e idempotência no Supabase | Plano e tarifas do Shopify, além de processamento de pagamento | Alta |
| Links de pagamento manuais ou botão “simulado” | Mais simples, mas não confirma pagamento de forma confiável nem atende produção; não deve ser usado para liberar tokens reais | Baixo no início, alto risco operacional | Baixa |

## Fatos confirmados nas fontes oficiais

A documentação do Stripe descreve o fluxo de Checkout para bens digitais como: app solicita uma sessão ao servidor, servidor cria a sessão, cliente abre a URL hospedada, e o servidor cumpre o pedido após receber `checkout.session.completed`. A própria documentação também modela pacotes de créditos como Products/Prices e planos como preços recorrentes [1].

A documentação do Supabase apresenta o tratamento de webhooks assinados do Stripe em Edge Functions [2]. A documentação do Shopify confirma que webhooks entregam eventos próximos do tempo real, exigem verificação HMAC, podem ser duplicados e não devem ser a única fonte de reconciliação [3].

## Decisões que dependem do proprietário

O provedor escolhido pelo proprietário é o Mercado Pago. A política final definida é um único Klipza.Prime mensal de R$ 59,90, com 1.500 tokens por cobrança aprovada e anexos/fotos ilimitados enquanto ativo. Antes de ativar cobrança real, ainda é necessário cadastrar a aplicação e fornecer o Access Token e a assinatura secreta do webhook somente no ambiente de produção. O app pode ser publicado com a interface e o backend bloqueados até essas configurações; não deve inventar preços nem liberar tokens por retorno visual do checkout.

## Referências

[1]: https://docs.stripe.com/mobile/digital-goods/checkout "Stripe — Accept payments for digital goods on iOS with a prebuilt payment page"
[2]: https://supabase.com/docs/guides/functions/examples/stripe-webhooks "Supabase — Handling Stripe Webhooks"
[3]: https://shopify.dev/docs/apps/build/webhooks "Shopify — About webhooks"


## Mercado Pago — validação oficial

A documentação oficial do Checkout Pro descreve que o comprador é encaminhado ao ambiente do Mercado Pago, escolhe o meio de pagamento e retorna ao site depois da conclusão [4]. A documentação de Webhooks informa que as notificações podem ser configuradas por aplicação ou por pagamento, que a notificação de pagamento inclui `type: payment` e `data.id`, e que o Mercado Pago envia o cabeçalho `x-signature` com `ts` e `v1` para validação de autenticidade [5].

O texto enviado pelo proprietário contém `Authorization: Bearer <ENV_ACCESS_TOKEN>`, que é apenas um marcador de ambiente e não uma credencial utilizável. O valor real não deve ser colocado no código, no APK, no navegador, em logs ou nesta conversa.

[4]: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview "Mercado Pago — Checkout Pro (via Preferences API), visão geral"
[5]: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/notifications/webhooks "Mercado Pago — Webhooks do Checkout Pro"

## API de pagamentos — precisão do endpoint

A referência oficial do Mercado Pago confirma que o endpoint de criação de pagamento é `POST https://api.mercadopago.com/v1/payments` — com `v1` em minúsculas — e exige o cabeçalho `X-Idempotency-Key` para evitar a criação duplicada de um pagamento [6]. Esse endpoint é para pagamentos diretos, como Checkout Transparente/Bricks, e exige dados específicos do meio de pagamento. Para a tela pronta solicitada no app, o caminho mais simples é usar Checkout Pro via preferência e liberar tokens somente depois da notificação `payment` verificada e da consulta server-side do pagamento.

A própria referência documenta `external_reference`, que será usado para vincular o pagamento ao pedido interno do Klipza, sem confiar em dados enviados pelo navegador [6].

[6]: https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post "Mercado Pago — Criar pagamento, referência oficial"

## Klipza.Prime — assinaturas recorrentes

A documentação oficial do Mercado Pago informa que a solução de Assinaturas cria cobranças recorrentes por API, com frequência personalizável, e que a integração exige conta de vendedor, aplicação e credenciais próprias [7]. Portanto, o Prime mensal deve ser tratado como assinatura, não como simples pagamento único. A ativação e a manutenção do benefício devem acompanhar eventos de assinatura e pagamentos autorizados; cancelamento, falha de cobrança e estorno precisam revogar ou suspender benefícios conforme a política do produto.

[7]: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview "Mercado Pago — Assinaturas, visão geral"

A referência de API atual lista a criação de assinatura em `POST /preapproval` e a criação de planos em `POST /preapproval_plan`, dentro da seção de assinaturas online [8]. A implementação do Prime usará esses endpoints somente no servidor e ficará bloqueada enquanto o catálogo e os valores não estiverem configurados.

[8]: https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post "Mercado Pago — Criar assinatura, referência API"
