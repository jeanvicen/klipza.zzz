# Relatório — custo e isolamento de artefatos

## Regra implementada

Cada artefato realmente criado pelo Klipza.IA consome **15 pontos de energia**. A cobrança ocorre separadamente do custo da mensagem e do custo adicional do Pensamento profundo. Se uma resposta gerar dois artefatos, são reservados 30 pontos; se a reserva parcial falhar, os pontos já reservados são estornados por eventos idempotentes.

A regra é aplicada em duas camadas. No cliente, `ARTIFACT_ENERGY_COST` mantém a interface e o fluxo de criação coerentes. No endpoint autenticado `api/quota.js`, a ação `consume_artifact` ignora qualquer valor enviado pelo navegador e chama `consume_user_energy` com `p_amount: 15`. O estorno correspondente usa `refund_artifact` e o mesmo namespace de evento. Assim, a interface não consegue reduzir ou aumentar o custo por manipulação do payload.

## Idempotência e falhas

Cada reserva usa uma chave de evento derivada do ID da mensagem, do job profundo ou do artefato manual. Repetições da mesma operação são tratadas como `alreadyProcessed` e não geram um segundo débito. Se a rede falhar depois de o servidor processar o consumo, o fluxo tenta estornar também a chave da tentativa que ficou ambígua; se nada foi debitado, o estorno não altera o saldo.

Quando a energia não é suficiente, o artefato não é persistido nem aberto no canvas. A resposta textual continua disponível, e o usuário recebe uma mensagem de estado. Downloads e previews não cobram energia novamente: o custo acontece somente na criação do registro do artefato.

## Isolamento por usuário

O endpoint de quota autentica o bearer token com `requireUser`, deriva `user.id` da sessão e não aceita um identificador de conta no corpo da requisição. A RPC de energia é chamada pelo cliente autenticado, mantendo a associação com a conta no Supabase. A sincronização de conversas e artefatos continua usando `sync_app_user_state`, que recebe o estado da sessão atual.

Também foi corrigida a troca de contas no cache local. O navegador guarda `localOwnerId`; quando uma sessão diferente entra, conversas, artefatos, memória e jobs locais sem escopo são limpos antes da hidratação remota. A sincronização fica suspensa até a conta ser carregada. Uma conta nova sem linha remota é inicializada vazia e sincronizada; falhas de rede continuam sem liberar uma gravação potencialmente misturada.

## Verificações realizadas

| Verificação | Resultado |
|---|---|
| `node --check api/quota.js` | Passou antes da validação final desta alteração. |
| `node --check api/deep-jobs.js` e `api/ai.js` | Mantidos válidos durante a alteração. |
| Controle fixo de 15 no endpoint | Confirmado por inspeção do código: `consume_artifact` chama a RPC com valor literal 15. |
| Repetição de evento | Coberta pelo tratamento `alreadyProcessed` já usado pelo sistema de quota. |
| Isolamento público de `app_user_state` | Consulta sem bearer respondeu HTTP 401 com permissão negada. |
| RPC pública `get_user_quota` sem sessão | Respondeu HTTP 401 com permissão negada. |
| Mensagem real à IA | Não enviada nesta alteração, para não consumir energia de uma conta sem autorização explícita. |

A geração client-side de PDF, DOCX e XLSX permanece sem alteração de custo durante download ou recarregamento: os Blobs continuam sendo recriados localmente a partir do artefato persistido.


O build local atualizado também foi aberto sem autenticação. A tela de login carregou normalmente e `window.K` expôs `createArtifactFromCode`, `openArtifactCanvas` e `downloadArtifact` como funções. Esse teste não consumiu energia nem alterou uma conta.


Após o push do commit `1b83d0e`, a produção `https://klipza-zzz.vercel.app/` respondeu HTTP 200 e serviu os marcadores do custo de 15 pontos, da ação `consume_artifact`, do isolamento por `localOwnerId` e do canvas. O endpoint `/api/quota` sem bearer respondeu HTTP 401, como esperado.
