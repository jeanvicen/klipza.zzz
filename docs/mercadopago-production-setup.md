# Klipza.IA — ativação segura do Mercado Pago

> **Aviso de revisão:** este é um guia técnico de implantação, não aconselhamento jurídico, financeiro ou tributário. Antes de vender créditos, o responsável deve confirmar preços, regras de reembolso, tributos, identidade empresarial e requisitos do Mercado Pago.

## Estado do código

O código do Klipza já contém o endpoint server-side `api/mercadopago.js`, o webhook `api/mercadopago-webhook.js`, as migrações de billing e Prime-only, a interface de cobrança e o cartão do Klipza.Prime mensal. A cobrança permanece bloqueada enquanto o catálogo estiver inativo ou sem preço, o Access Token não estiver no ambiente server-side e a assinatura do webhook não estiver configurada.

## Segredos obrigatórios

Cadastrar exclusivamente como variáveis protegidas no ambiente **Production** do Vercel:

| Variável | Conteúdo | Onde é usada |
| --- | --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token de produção da aplicação Mercado Pago | Criação de preferência, assinatura e consulta server-side do pagamento |
| `MERCADOPAGO_WEBHOOK_SECRET` | Assinatura secreta gerada em Webhooks no painel Mercado Pago | Validação HMAC do header `x-signature` |
| `SUPABASE_URL` | URL pública do projeto Supabase | Cliente server-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role do Supabase | Operações server-side e funções protegidas |
| `PUBLIC_APP_URL` | `https://klipza-zzz.vercel.app` | URLs de retorno e webhook |

Nenhum desses valores deve entrar no `index.html`, no APK, em `www/`, no GitHub, em logs ou em mensagens. O texto `Authorization: Bearer <ENV_ACCESS_TOKEN>` não é uma credencial; é apenas um exemplo de documentação.

## Catálogo e preço

O único produto que deve ser ativado é `prime_monthly`, com 1.500 tokens por ciclo e valor de R$ 59,90, representado no banco por `5990` centavos. Os códigos de pacotes avulsos permanecem desativados e não podem gerar checkout, inclusive por chamada direta à API.

```sql
update public.billing_products
set is_active = false, amount_cents = null, updated_at = now()
where kind = 'token_pack' or code = 'prime_yearly';

update public.billing_products
set amount_cents = 5990, currency = 'BRL', interval_months = 1,
    token_amount = 1500, is_active = true, updated_at = now()
where code = 'prime_monthly';
```

Executar o segundo `update` somente depois de configurar e testar as credenciais do Mercado Pago. Assim, o catálogo não mostra uma compra funcional antes de o webhook estar pronto.

## Fluxo de compra

O usuário escolhe um item em **Configurações → Compras e saldo** ou no modal de **Mais do Klipza**. O servidor cria um pedido interno, fixa produto e preço usando o banco, cria Checkout Pro ou uma assinatura no Mercado Pago e devolve apenas a URL de pagamento. O navegador não decide a quantidade nem o valor.

A cobrança mensal do Prime também deve gerar eventos de pagamento e de assinatura. O Mercado Pago envia as notificações para:

```text
https://klipza-zzz.vercel.app/api/mercadopago-webhook
```

No webhook, o servidor valida `x-signature`, consulta `/v1/payments/{id}` ou `/preapproval/{id}`, localiza o pedido pelo `external_reference`, confirma valor e status e executa a função idempotente do Supabase. Um reenvio do mesmo evento não cria novos tokens.

## Teste antes de produção

Use credenciais e contas de teste do Mercado Pago. Crie pedidos pequenos, teste pagamento aprovado, pendente, recusado, webhook duplicado, retorno sem webhook e falha de assinatura. Em todos os casos, o saldo só deve aumentar no cenário aprovado e validado. Depois de cada teste, consulte `billing_orders`, `wallet_ledger` e `billing_provider_events` no Supabase.

## Ciclo de vida da conta

O saldo persistente fica no Supabase e não é apagado por limpar o navegador, trocar o celular ou reinstalar o APK. Cada cobrança aprovada do Prime adiciona 1.500 tokens ao saldo usando um evento idempotente. O job diário de ciclo de vida continua separado: após 24 meses sem atividade, há avisos em aproximadamente 90, 30 e 7 dias; a exclusão definitiva pode remover perfil, saldo, pedidos e Prime vinculados, mantendo apenas registros mínimos exigidos por lei e auditoria.

## Checklist de publicação

1. Aplicar as migrações 20260820000001, 20260820000002, 20260820000003 e 20260820000004 na ordem.
2. Confirmar o preço mensal de R$ 59,90, os 1.500 tokens por ciclo e os anexos/fotos ilimitados do Prime ativo.
3. Criar a aplicação Mercado Pago e configurar o evento de pagamento e os eventos de assinatura.
4. Cadastrar os três segredos e `PUBLIC_APP_URL` no Vercel Production.
5. Fazer redeploy e validar `/api/mercadopago` autenticado.
6. Executar testes com credenciais de teste.
7. Só então ativar `is_active=true` para produtos reais.
8. Ativar somente `prime_monthly` e conferir os documentos legais e o canal de suporte antes de anunciar vendas.
