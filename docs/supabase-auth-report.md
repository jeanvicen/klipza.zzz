# Klipza.IA — Integração Supabase Auth

## Resultado

A autenticação do Klipza.IA foi integrada ao **Supabase Auth nativo** e publicada no branch `main`. O app agora usa sessão persistente do Supabase, sem login demo automático, e permanece na tela de autenticação quando não existe uma sessão válida.

A tela pública foi simplificada para mostrar somente **e-mail, senha, entrar, criar conta e recuperação de senha**. O cadastro exibe o campo de nome e a confirmação de senha apenas quando necessário. Google e link mágico não aparecem na interface atual, porque não foram configurados como métodos de entrada.

## Recuperação de senha

O fluxo `Esqueci minha senha` solicita somente o e-mail e apresenta uma orientação que não revela se a conta existe, reduzindo enumeração de usuários. A redefinição é feita pelo link temporário enviado pelo Supabase Auth, retornando ao domínio de produção configurado no projeto.

O template `Reset password` foi personalizado em português com o assunto **“Recupere sua senha com segurança no Klipza.IA”**, botão para criar uma nova senha, aviso de expiração e assinatura **Equipe Klipza**.

## E-mails e SMTP

O SMTP customizado foi ativado no projeto `klipza.ia` com o remetente visual **Equipe Klipza**. Os campos persistidos no painel são o host Gmail `smtp.gmail.com`, porta `587`, usuário completo do remetente e o endereço remetente configurado pelo proprietário. A senha fica protegida pelo painel e não foi gravada no repositório.

O template `Confirm sign up` foi personalizado com o assunto **“Confirme seu e-mail para entrar no Klipza.IA”**, botão `{{ .ConfirmationURL }}`, aviso de segurança e assinatura **Equipe Klipza**.

Para a conta do Gmail, deve ser usada uma **senha de app**, nunca a senha normal da conta. Caso a senha normal tenha sido reutilizada em algum outro serviço, ela deve ser trocada imediatamente. Para produção com maior volume, um provedor transacional dedicado tende a oferecer melhor entregabilidade do que uma conta pessoal de Gmail.

## URLs e publicação

O Site URL e o redirect permitido do Supabase Auth apontam para:

```text
https://klipza-zzz.vercel.app/
```

O código foi publicado no GitHub com os commits:

| Commit | Conteúdo |
|---|---|
| `f42f696` | Integração Supabase Auth, recuperação, login simplificado, bundle e build |
| `0bd0f77` | Registro da validação pública em produção |

O deploy público foi verificado em `https://klipza-zzz.vercel.app/`. O HTML carrega `vendor/supabase.js`, a tela de login aparece corretamente e o modo de criação de conta e o fluxo de recuperação foram testados sem enviar e-mail real.

## Arquivos principais

| Arquivo | Função |
|---|---|
| `index.html` | Tela de login, cadastro, sessão e recuperação |
| `vendor/supabase.js` | Bundle local do cliente Supabase para web, PWA e APK |
| `scripts/build-web.mjs` | Copia Supabase, Capacitor e InAppBrowser para `www/` |
| `supabase/migrations/20260820000000_klipza_core.sql` | Schema versionado do projeto |
| `docs/browser-test-notes.md` | Histórico de validações visuais e públicas |

## Referências

[1]: https://supabase.com/docs/guides/auth/passwords "Supabase — Password-based Auth"

[2]: https://supabase.com/docs/guides/auth/auth-email-templates "Supabase — Auth Email Templates"

[3]: https://supabase.com/docs/guides/auth/redirect-urls "Supabase — Redirect URLs"
