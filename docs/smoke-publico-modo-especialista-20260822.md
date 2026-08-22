# Smoke test público — Modo Especialista — 22/08/2026

## Resultado

A publicação em `https://klipza-zzz.vercel.app/` respondeu HTTP 200 e carregou a tela de login do Klipza.IA no navegador, sem autenticar nenhuma conta.

| Verificação | Resultado |
|---|---|
| Página raiz `/` | HTTP 200 |
| `POST /api/ai` sem bearer | HTTP 401 |
| `GET /api/expert-mode` sem bearer | HTTP 401 |
| Marcador `Modo Especialista` no HTML servido | Encontrado |
| Mensagem real à IA | Não enviada |
| Consumo de energia/cota | Não realizado |

O smoke test confirma disponibilidade da página e proteção básica dos endpoints. O funcionamento autenticado da cota depende da aplicação das migrações Supabase versionadas no repositório; essa aplicação não foi executada nesta sessão.

## Limite da verificação

A tela pública sem sessão não permite confirmar o plano, consumir cota ou iniciar um job real. Esses caminhos devem ser testados somente depois que as migrações forem aplicadas e com autorização explícita para usar uma conta de teste.

## Referência

- [Klipza.IA publicado](https://klipza-zzz.vercel.app/)
