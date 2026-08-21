# Klipza.IA — Integração de autenticação

## Resultado

A autenticação do Klipza.IA foi integrada ao fluxo nativo de contas e publicada no branch `main`. O app agora usa sessão persistente, sem login demo automático, e permanece na tela de autenticação quando não existe uma sessão válida.

A tela pública foi simplificada para mostrar somente **e-mail, senha, entrar, criar conta e recuperação de senha**. O cadastro exibe o campo de nome e a confirmação de senha apenas quando necessário. Google e link mágico não aparecem na interface atual, porque não foram configurados como métodos de entrada.

## Recuperação de senha

O fluxo `Esqueci minha senha` solicita somente o e-mail e apresenta uma orientação que não revela se a conta existe, reduzindo enumeração de usuários. A redefinição é feita por um link temporário enviado ao endereço da conta, retornando ao domínio de produção configurado no projeto.

O template `Reset password` foi personalizado em português com o assunto **“Recupere sua senha com segurança no Klipza.IA”**, botão para criar uma nova senha, aviso de expiração e assinatura **Equipe Klipza**.

## E-mails e SMTP

O envio de e-mails foi configurado no projeto `klipza.ia` com o remetente visual **Equipe Klipza**. Os campos persistidos no painel são o host Gmail `smtp.gmail.com`, porta `587`, usuário completo do remetente e o endereço remetente configurado pelo proprietário. A senha fica protegida pelo painel e não foi gravada no repositório.

O template `Confirm sign up` foi personalizado com o assunto **“Confirme seu e-mail para entrar no Klipza.IA”**, botão `{{ .ConfirmationURL }}`, aviso de segurança e assinatura **Equipe Klipza**.

Para a conta do Gmail, deve ser usada uma **senha de app**, nunca a senha normal da conta. Caso a senha normal tenha sido reutilizada em algum outro serviço, ela deve ser trocada imediatamente. Para produção com maior volume, um provedor transacional dedicado tende a oferecer melhor entregabilidade do que uma conta pessoal de Gmail.

## URLs e publicação

O endereço principal e o retorno permitido da autenticação apontam para:

```text
domínio público do Klipza.IA
```

O código foi publicado no GitHub com os commits:

| Commit | Conteúdo |
|---|---|
| `f42f696` | Integração de autenticação, recuperação, login simplificado, bundle e build |
| `0bd0f77` | Registro da validação pública em produção |

A publicação foi verificada no domínio público do Klipza.IA. A tela de login aparece corretamente e o modo de criação de conta e o fluxo de recuperação foram testados sem enviar e-mail real.

## Arquivos principais

| Arquivo | Função |
|---|---|
| `index.html` | Tela de login, cadastro, sessão e recuperação |
| `vendor/` | Bundles locais necessários para web, PWA e APK |
| `scripts/build-web.mjs` | Copia os bundles e recursos necessários para `www/` |
| `migrations/` | Estrutura versionada do projeto |
| `docs/browser-test-notes.md` | Histórico de validações visuais e públicas |

## Referências

[1]: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html "OWASP — Authentication Cheat Sheet"
