# Notas de referência da API do Mercado Pago

Data da verificação: 2026-08-21.

A referência oficial identifica a operação solicitada como **API Payments (legacy) → Pagamentos → Criar pagamento**. O endpoint é `POST https://api.mercadopago.com/v1/payments`, com `Authorization: Bearer <ACCESS_TOKEN>`, `Content-Type: application/json` e `X-Idempotency-Key`.

A documentação atual informa que, para novas integrações de Checkout Transparente, o Mercado Pago recomenda a **Orders API**; a API Payments existente continua funcionando, recebendo apenas correções de segurança e estabilidade. O projeto Klipza já possui integração baseada em Checkout Pro para compras e usa `/v1/payments/{id}` para consulta no webhook, portanto a implementação deve preservar compatibilidade e não substituir o fluxo existente sem decisão explícita.

A página oficial lista as operações de criação, consulta, atualização, cancelamento e reembolso da API Payments, além de clientes, cartões, endereços, meios de pagamento e tipos de documento. A URL enviada originalmente com `V1` maiúsculo não corresponde ao recurso; a forma documentada é `v1` minúsculo.

Fonte principal: https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api-payments/create-payment/post
Fonte de contexto: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/overview
