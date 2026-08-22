# Relatório — quota por conta no Klipza.IA

**Data:** 22 de agosto de 2026
**Repositório:** `jeanvicen/klipza.zzz`
**Escopo:** energia, tokens, reset de 24 horas e limite diário de anexos.

## Objetivo

A quota do Klipza.IA passou a pertencer à conta autenticada. O navegador continua podendo manter um cache visual para abrir a interface rapidamente, mas esse cache não decide se uma operação pode ser realizada. Ao entrar em outro dispositivo, a conta recebe o mesmo saldo e a mesma data de reset armazenados no servidor.

## O que foi implementado

| Recurso | Fonte autoritativa | Regra aplicada |
|---|---|---|
| Energia | `profiles.energy_balance` e `user_energy_ledger` | 100 pontos por ciclo individual de 24 horas; mensagem normal consome 2 e Pensamento profundo consome 7. |
| Data do ciclo | `profiles.energy_reset_at` | O próximo reset é agendado 24 horas após a abertura do ciclo; trocar de dispositivo não inicia outro ciclo. |
| Tokens | `profiles.token_balance` e `wallet_ledger` | O consumo usa a carteira existente, com débito atômico e chave idempotente; saldo não pode ficar negativo. |
| Anexos | `profiles.attachment_used` e `user_attachment_ledger` | Conta gratuita pode usar até 3 anexos por ciclo de 24 horas, somando câmera, imagens e arquivos. |
| Plano ilimitado | `profiles.prime_status` | Quando o plano está ativo, o limite de anexos não é aplicado; a decisão é feita no servidor. |

## Segurança e consistência

As operações de energia e anexos são RPCs protegidas que obtêm o usuário pela sessão autenticada. O cliente não envia um identificador de usuário para escolher outra conta. O endpoint privado valida o bearer token antes de chamar o banco e as funções de consumo usam bloqueio de linha para atualizar o saldo de forma atômica.

Cada consumo recebe uma chave de evento. Se a mesma requisição for repetida, a função retorna o resultado já processado em vez de descontar novamente. As migrações de endurecimento também rejeitam colisões em que uma chave já pertence a outra conta. O ledger de cada recurso tem RLS para leitura apenas do próprio usuário; a aplicação não exibe dados de outras contas.

Quando uma resposta não consegue ser iniciada depois do débito de energia, o cliente solicita um estorno idempotente. O endpoint consulta novamente o quota completo após o estorno para manter energia, reset, tokens e anexos coerentes na interface.

## Migrações aplicadas

| Migração | Finalidade | Situação |
|---|---|---|
| `20260821000010_account_quota.sql` | Criar saldo de energia, reset individual, ledger e RPCs de energia/estorno. | Aplicada no Supabase. |
| `20260821000011_quota_idempotency_hardening.sql` | Isolar chaves idempotentes entre contas e endurecer energia, estorno e tokens. | Aplicada no Supabase. |
| `20260821000012_account_attachment_quota.sql` | Criar contador/ledger de anexos, importar o contador antigo e adicionar consumo atômico por conta. | Aplicada no Supabase. |

A verificação somente de leitura confirmou a existência das colunas de energia, reset e anexos, dos dois ledgers, das RPCs de energia, anexos e tokens, além da validade dos saldos existentes dentro das faixas esperadas.

## Comportamento no aplicativo

Depois do login, o Klipza sincroniza o quota pelo endpoint privado. A sincronização também ocorre quando a página recupera foco, volta a ficar visível e periodicamente enquanto a sessão está aberta. Antes de enviar uma mensagem ou aceitar anexos, o cliente faz uma leitura atualizada do servidor. Assim, um uso feito em outro dispositivo aparece no dispositivo atual sem depender de limpar ou manter o cache.

Na seleção de arquivos, a conta autenticada primeiro reserva no servidor a quantidade escolhida. Se o limite já foi atingido, nenhum arquivo é aceito e a interface informa que os três anexos do ciclo foram utilizados. Para visitantes não autenticados, o contador continua sendo apenas local e não representa uma conta persistente; o fluxo autenticado é o que protege contra troca de navegador, aparelho ou cache.

## Validações realizadas

Foram executados com sucesso os checks de sintaxe dos endpoints, a verificação HTML do projeto, a geração de `www/index.html`, a checagem de whitespace do Git e consultas de verificação no Supabase. Os endpoints privados continuam exigindo autenticação; chamadas sem bearer não devem receber quota nem executar consumo.

## Arquivos principais

- `api/quota.js`: autenticação, leitura, consumo e estorno do quota.
- `supabase/migrations/20260821000010_account_quota.sql`: energia e reset por conta.
- `supabase/migrations/20260821000011_quota_idempotency_hardening.sql`: isolamento das chaves e proteção contra repetição entre contas.
- `supabase/migrations/20260821000012_account_attachment_quota.sql`: limite de anexos por conta.
- `index.html`: sincronização e cobrança no cliente.
- `www/index.html`: versão estática gerada para publicação.

> **Resumo:** limpar o cache, trocar de aparelho ou abrir a mesma conta em outro navegador não devolve energia, tokens nem anexos já consumidos. O ciclo continua individual e só é renovado 24 horas depois do seu próprio reset.

## Observação de teste

A verificação feita nesta sessão confirmou a estrutura, as RPCs, as faixas de saldo e a aplicação das migrações no banco. Um teste completo com duas sessões autenticadas simultâneas depende de abrir uma segunda sessão real; a proteção principal, porém, é executada no servidor e não no armazenamento local do navegador.

— **Manus AI**
