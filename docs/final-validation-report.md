# Relatório final de validação — Klipza.IA

**Data da validação:** 20 de agosto de 2026.  
**Repositório:** [jeanvicen/klipza.zzz](https://github.com/jeanvicen/klipza.zzz)  
**Publicação:** domínio público do Klipza.IA
**Último commit do `main`:** `cfd39b5`  
**Commit da implementação publicada:** `77689e4`

## Resultado executivo

O Klipza.IA foi transformado em um app instalável com PWA, pacote Android via Capacitor, autenticação por e-mail e senha, recuperação de senha, módulo web.klip, painel administrativo protegido e ciclo de vida de contas por inatividade. O job diário de manutenção foi criado e confirmado no painel de operação. O código foi validado localmente, publicado no GitHub e a versão de produção ficou com status **Ready**.

As credenciais administrativas foram mantidas somente em configurações protegidas. Elas não foram adicionadas ao código, ao APK, ao GitHub, aos relatórios ou às mensagens. O cliente não recebe credenciais privadas.

> **Estado importante:** o projeto Auth ainda não possui usuários. Por isso, a conta proprietária ainda não foi marcada como `is_admin=true`; essa etapa só pode ser executada com o UUID real da primeira conta criada pelo proprietário.

## Entregas implementadas

| Área | Resultado validado |
| --- | --- |
| Instalação web | `manifest.webmanifest`, service worker, ícones 192/512 px e aviso de instalação no navegador |
| Android | Capacitor 7, pacote `ia.klipza.app`, `minSdk 26`, `targetSdk 35` e APKs recompilados |
| Identidade visual | Marca própria Klipza com símbolo e asset `klipza-mark.png` |
| web.klip | Feed diário de 50 itens, cache por data, filtros, pesquisa relevante e fontes em português conforme país/idioma |
| Preview | Tentativa interna com timeout e fallback para navegador externo somente quando necessário |
| Segurança web.klip | Validação de protocolo, host, DNS, IP privado, localhost, metadata endpoint, porta e redirects limitados |
| Auth | Cadastro com nome, e-mail e senha; login; recuperação; redefinição por link seguro; templates SMTP com remetente Equipe Klipza |
| Atividade | `touch_user_activity()` em intervalos de 15 minutos e registro de `last_activity_at` |
| Restrição | Perfis restritos exibem aviso e não podem enviar mensagens enquanto a restrição estiver ativa |
| Administração | `/admin.html` e `/api/admin-users` com autenticação por token, verificação de `is_admin`, bloqueio, desbloqueio, restrição, exclusão, troca de senha, cancelamento de exclusão e auditoria |
| Ciclo de vida | Avisos de 90/30/7 dias e exclusão definitiva após 24 meses sem atividade, com funções versionadas e job diário |
| Governança | Migrações versionadas, relatório de auditoria e especificação futura do suporte no GitHub |

## Estado operacional da conta

As atualizações de segurança e ciclo de vida foram executadas com sucesso no ambiente de operação. Elas ajustam permissões, colunas de atividade, estados administrativos, chaves relacionais, auditoria e funções de ciclo de vida. Em seguida, o agendamento diário foi configurado e confirmado.

O painel Cron confirmou um job ativo com a seguinte configuração:

| Campo | Valor |
| --- | --- |
| Nome | `klipza-account-lifecycle-daily` |
| Agenda | `15 3 * * *` |
| Próximo disparo observado | 21 Aug 2026 03:15:00 (+0000) |
| Comando | `select public.process_account_lifecycle(); select public.purge_due_accounts();` |
| Última execução | Ainda não executado no momento da validação, pois o primeiro horário futuro ainda não havia chegado |

O requisito de contas está, portanto, automatizado no banco. A primeira conta do proprietário deverá ser criada no app e depois marcada com o UUID correspondente, por exemplo:

```sql
update public.profiles
set is_admin = true
where id = 'UUID_REAL_DA_CONTA_DO_PROPRIETARIO';
```

Esse comando não foi executado automaticamente porque a consulta Auth confirmou **nenhum usuário no projeto**. Não é seguro escolher ou inventar um UUID.

## Estado da publicação

A publicação correta foi localizada no projeto `klipza-zzz`. As configurações protegidas necessárias foram adicionadas ao ambiente de produção e uma nova publicação foi criada. A versão do código foi observada com status **Ready**, referente ao commit `77689e4`.

A validação externa confirmou que `/admin.html` responde `200` e que `/api/admin-users`, sem token, responde `401 Não autenticado.`. Isso demonstra simultaneamente que a função foi publicada e que não está aberta ao público.

## Testes executados

| Teste | Resultado |
| --- | --- |
| `pnpm check:html` | **OK** — PWA, web.klip, Auth, ciclo de vida, endpoint seguro e ícones encontrados |
| `node scripts/test-webklip-frame-check.mjs` | **OK** — Google não incorporável, example.com incorporável e destinos privados bloqueados |
| Produção: `check=https://example.com` | `embeddable=true`, HTTP 200 |
| Produção: `check=https://www.google.com` | `embeddable=false`, motivo `x-frame-options` |
| Produção: `check=http://127.0.0.1` | Bloqueado com `reason=check-unavailable` |
| Produção: `check=http://169.254.169.254` | Bloqueado com `reason=check-unavailable` |
| Produção: `check=http://localhost:8080` | Bloqueado com `reason=check-unavailable` |
| Produção: `/api/admin-users` sem Bearer token | `401`, conforme esperado |
| Produção: `/admin.html` | `200`, com marcador do painel presente |
| Build web | **OK** — `www/` gerado com `admin.html` e assets |
| Build Android | **OK** — Gradle `assembleDebug assembleRelease` concluído |
| Package Android | `ia.klipza.app`, SDK mínimo 26, target SDK 35 |
| Repositório | Working tree limpo após o último push |

## APKs entregues

Os APKs foram recompilados depois da sincronização Capacitor. O debug é indicado para testes diretos; o release ainda é **unsigned** e precisa ser assinado com um keystore próprio antes de distribuição em loja.

| Arquivo | Uso |
| --- | --- |
| `dist/klipza-debug.apk` | Instalação de teste em aparelho Android; 14 MB |
| `dist/klipza-release-unsigned.apk` | Base para assinatura e publicação; 12 MB |

A PWA pode ser instalada diretamente pelo aviso exibido no navegador compatível.

## Módulo de suporte — especificado, não implementado

A especificação completa está em [`docs/support-module-spec.md`](https://github.com/jeanvicen/klipza.zzz/blob/main/docs/support-module-spec.md). A proposta usa armazenamento privado para fotos, tabela de chamados com controle de acesso, mensagens de até 3.000 caracteres, URLs assinadas de curta duração, limite de requisições, idempotência, auditoria e entrega protegida por e-mail ou por webhook oficial escolhido posteriormente.

O módulo não foi adicionado ao aplicativo, não foram criados bucket, tabela ou endpoint de suporte e nenhuma notificação foi enviada. Isso respeita o pedido de apenas especificar essa parte nesta etapa.

## Próxima ação necessária do proprietário

O produto já está publicado e protegido para o estado atual. A única configuração operacional pendente para liberar o painel administrativo é o cadastro da primeira conta do proprietário no app e a marcação dessa conta como `is_admin=true` usando seu UUID real. Depois disso, o proprietário poderá abrir `/admin.html` e administrar as contas; o endpoint continuará exigindo sessão Auth válida e perfil administrativo.

## Documentos técnicos

O relatório detalhado de auditoria está em [`docs/security-audit-findings.md`](https://github.com/jeanvicen/klipza.zzz/blob/main/docs/security-audit-findings.md). A especificação de suporte está em [`docs/support-module-spec.md`](https://github.com/jeanvicen/klipza.zzz/blob/main/docs/support-module-spec.md).

## Referências

[1]: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html — OWASP, SSRF Prevention Cheat Sheet.
