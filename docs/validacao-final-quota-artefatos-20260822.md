# Validação final de quota e artefatos

**Data:** 22 de agosto de 2026  
**Commit de código validado:** `652b0b1`  
**Repositório:** `jeanvicen/klipza.zzz`  
**Autor:** Manus AI

## Escopo

A validação cobriu a correção do saldo visual de energia, tokens e anexos durante abertura, troca de conversa, navegação entre áreas, retorno ao aplicativo e alterações concorrentes de sessão. Também cobriu o fluxo de artefatos código, PDF e ZIP com preview, download e identificação BETA.

## Matriz de testes

| Área | Teste | Resultado |
|---|---|---|
| Quota visual | Estado sintético com `synced:false` | Passou: exibe `—`, `…` e mensagem de sincronização; não exibe 100 antigo como saldo confirmado |
| Quota visual | Revalidação em foco, `pageshow`, troca de tela e troca de conversa | Passou no contrato estático e no código do cliente |
| Quota em conta | Realtime por linha de `profiles` com fallback periódico de 5 segundos | Implementado; o efeito autenticado depende das migrações e da publicação Realtime do Supabase |
| Sessão | Resposta antiga após mudança de usuário | Passou no contrato: a resposta só é aplicada se o usuário ainda for o mesmo |
| Código | Card BETA, preview e canvas | Passou no estado sintético |
| PDF | Viewer incorporado após materialização | Passou; o alias `pdf` → `jsPDF` foi corrigido durante o teste |
| ZIP | Manifesto, listagem de arquivos e download local | Passou com `README.txt` sintético e retorno de download verdadeiro |
| Backend | Sintaxe dos endpoints e contrato de quota/Expert | Passou |
| HTML/build | `pnpm check:html` e `pnpm build:web` | Passou |
| Produção pública | `/` | HTTP 200 |
| Produção pública | `/api/ai` sem bearer | HTTP 401 |
| Produção pública | `/api/quota` sem bearer | HTTP 401 |
| Produção pública | `/api/expert-mode` sem bearer | HTTP 401 |

## Segurança do teste

Nenhuma conta real foi usada no teste visual. Nenhuma mensagem foi enviada à IA, nenhum token foi consumido, nenhuma energia foi debitada e nenhuma RPC autenticada foi executada a partir do estado sintético. O download do ZIP foi criado somente no navegador local com conteúdo de teste.

## Limitação de produção

As migrações de quota, anexos, Especialista e fonte de verdade continuam precisando ser aplicadas ao Supabase de produção por uma via administrativa autorizada. O smoke público confirma roteamento, autenticação e entrega do código, mas não comprova o comportamento autenticado do banco. Após aplicar o SQL, deve ser feito um teste controlado com uma conta de teste, verificando leitura, saldo insuficiente e idempotência.
