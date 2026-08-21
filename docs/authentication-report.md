# Klipza.IA — Integração de autenticação

## Resultado

A autenticação do Klipza.IA foi integrada ao fluxo de contas e permanece disponível para a experiência oficial do aplicativo. O app usa sessão persistente, sem login demo automático, e permanece na tela de autenticação quando não existe uma sessão válida.

A tela pública foi simplificada para mostrar somente **e-mail, senha, entrar, criar conta e recuperação de senha**. O cadastro exibe o campo de nome e a confirmação de senha apenas quando necessário. Google e link mágico não aparecem na interface atual, porque não foram configurados como métodos de entrada.

## Recuperação de senha

O fluxo **Esqueci minha senha** solicita somente o e-mail e apresenta uma orientação que não revela se a conta existe. A redefinição é feita por um link temporário enviado ao endereço da conta e retorna ao Klipza para criação de uma nova senha.

O template `Reset password` foi personalizado em português com o assunto **“Recupere sua senha com segurança no Klipza.IA”**, botão para criar uma nova senha, aviso de expiração e assinatura **Equipe Klipza**.

## Mensagens de acesso

As mensagens de entrada, cadastro e recuperação foram revisadas em português, com instruções curtas, aviso de segurança e orientação para criação de uma nova senha.

O aplicativo não exibe senhas, códigos secretos ou informações administrativas. Esses dados nunca devem ser enviados por mensagens, capturas de tela ou canais não solicitados.

## Estado atual

A experiência de entrada, cadastro e recuperação foi conferida visualmente. A tela de login aparece corretamente, o modo de criação de conta apresenta os campos necessários e o fluxo de recuperação mantém uma comunicação clara sem revelar informações da conta.

## Princípios da experiência

A autenticação deve ser simples, clara e segura. O usuário deve conseguir entrar, criar a conta, recuperar o acesso e encerrar a sessão sem precisar conhecer detalhes de operação do produto.
