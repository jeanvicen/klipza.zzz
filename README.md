# Klipza.IA

O **Klipza.IA** é uma experiência de conversa, criação e pesquisa projetada para ajudar pessoas a organizar ideias, trabalhar com arquivos e transformar referências em resultados práticos.

## O que o Klipza oferece

O aplicativo reúne conversas, histórico, artefatos, anexos, voz e uma área de pesquisa chamada **web.klip**. A interface foi desenhada para manter o fluxo simples: a pessoa inicia uma conversa, [...]

O web.klip apresenta informações públicas organizadas por categorias como notícias, jogos, código e design. Os resultados são filtrados para reduzir conteúdo inadequado, evitar temas de risc[...]

## Conta e segurança

O acesso é feito por e-mail e senha. O cadastro, a recuperação de senha, o encerramento de sessão e os controles de privacidade foram organizados para que a pessoa tenha clareza sobre sua cont[...]

O Klipza não solicita senhas, códigos de segurança ou dados completos de cartão por mensagens não solicitadas. Informações importantes devem ser conferidas nos documentos oficiais exibidos [...]

## Instalação

O Klipza.IA pode ser usado no navegador e instalado como aplicativo quando o dispositivo oferecer esse recurso. Também existe uma versão para Android, distribuída separadamente conforme a dispo[...]

## Recursos em desenvolvimento

O Klipza.Prime, créditos adicionais, integrações externas, suporte avançado e outros recursos identificados como **Em desenvolvimento** ainda não representam uma oferta ativa. Preços, limite[...]

## Documentos oficiais

O aplicativo disponibiliza o Guia de Uso, os Termos de Uso, a Política de Privacidade, as informações sobre recursos pagos e a Política de Retenção e Inatividade. Esses documentos explicam o[...]

## Identidade

A marca Klipza é monocromática, minimalista e orientada à leitura. O objetivo visual é oferecer uma experiência discreta, consistente e confortável em telas grandes e pequenas.

## Contato

Dúvidas sobre conta, privacidade, segurança ou recursos em desenvolvimento podem ser enviadas para **klipzastudio@gmail.com**. Nunca inclua senhas, códigos de segurança ou dados completos de c[...]

---

## Integração: Geração de Imagens (Klipza.IA)

Adicionamos um módulo de geração de imagens integrado ao repositório que permite criar imagens a partir de trechos nas respostas da IA. Não removemos nem alteramos o conteúdo existente do README; esta seção foi acrescentada.

Arquivos adicionados
- `klipza_image.py` — módulo principal para geração de imagens, aplicação de marca d'água e controle de cota.
- `data/image_quotas.json` — arquivo JSON que persiste o consumo de cota por usuário (inicializado como `{}`).
- `images/` — diretório onde as imagens geradas (já com watermark) são salvas.
- `requirements.txt` — contém `requests` e `pillow`.

Como ativar a geração de imagens
- Marque o trecho da resposta da IA com as tags:

  [CRIAR_IMAGEM]seu prompt aqui[/CRIAR_IMAGEM]

  Exemplo de uso no código:

  from klipza_image import process_ai_response
  response = "Texto... [CRIAR_IMAGEM]uma cena bonita de cidade futurista[/CRIAR_IMAGEM] fim"
  out = process_ai_response(response, user_id="usuario123")
  if out["ok"]:
      html = out["text"]  # HTML com animação e imagem pronta

Comportamento e restrições
- O prompt é automaticamente melhorado adicionando: ", alta qualidade, 4k, detalhado, profissional".
- O serviço de geração usado é o Pollinations (endpoint público): https://image.pollinations.ai
- Todas as imagens recebem automaticamente a marca d'água `klipza.ia` no canto inferior direito.
- As imagens geradas são salvas em `images/` com nomes únicos (user + timestamp).
- Há um botão de download no HTML gerado que baixa a imagem já com a marca d'água.

Cotas
- Limite por usuário: 3 imagens por janela de 24 horas.
- A cota é persistida em `data/image_quotas.json` no formato `{ "user_id": {"count": N, "reset": unix_ts} }`.
- Quando a cota for atingida, o texto substituto exibido é APENAS:

  "você atingiu o limite de cota de imagens por hoje"

Testes locais e validação rápida
1) Instale dependências:
   pip install -r requirements.txt
2) Teste rápido (script de exemplo incluso):
   python klipza_image.py
   - O script gera uma imagem de exemplo (usuário `testuser`) e imprime parte do HTML no console.
   - Verifique `images/` para o arquivo PNG gerado (com watermark).
   - Verifique `data/image_quotas.json` para a entrada de teste.
3) Para simular na sua aplicação, gere o HTML com `process_ai_response` e salve-o em `.html` para abrir no navegador: verá a animação (2.8s) e a imagem final com botão de download.

Observações técnicas
- O módulo foi adicionado sem remover ou alterar outros arquivos do projeto.
- `klipza_image.py` contém comentários explicativos no topo e nas funções principais.
- Se o seu sistema usa múltiplos processos concorrentes para gerar imagens, considere migrar `data/image_quotas.json` para um banco (ex.: SQLite) para evitar condições de corrida.
- Se preferir, podemos mover essa integração para uma branch separada e abrir um PR para revisão.

Se precisar, eu atualizo o README com instruções mais detalhadas, exemplos de integração específicos ao seu backend (Flask, FastAPI, etc.) ou adapto a persistência de cota para SQLite — diga qual opção prefere.
