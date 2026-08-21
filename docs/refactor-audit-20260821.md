# Auditoria para refatoração — 2026-08-21

## Objetivo recebido

Remover referências visíveis e ativas ao provedor de pagamentos por enquanto, marcar cobrança e Prime como em desenvolvimento, eliminar repetições nas configurações, mover web.klip para abaixo de Conversas e Artefatos no menu, simplificar web.klip para uma busca interna e consolidar documentação oficial dentro das configurações.

## Estado encontrado

O `index.html` é monolítico e reúne o menu lateral, autenticação, configurações, modal do Prime, estado de carteira e web.klip. O menu mostrava Conversas e Artefatos e um grupo Mais com web.klip. O web.klip já possuía pesquisa, feed diário, filtros, detalhes, envio de referência ao chat e navegação interna/fallback externo.

A implementação anterior do Prime continha textos de checkout e cobrança. O cliente chamava um fluxo específico de pagamentos para catálogo, saldo, consumo e checkout. Também havia guias de implantação e integrações específicas que foram retiradas da interface.

As configurações possuíam seções duplicadas para saldo, compras e Prime, além de ramificações legadas. Alguns temas se repetiam entre Geral, Conta, Saldo e cobrança e Prime, especialmente tokens, benefícios, status e dados de conta.

## Preservado

Permanecem a autenticação por e-mail, recuperação de senha, ciclo de vida de conta, histórico, artefatos, chat, anexos, voz, PWA, APK, proteção contra requisições inseguras e fallback de abertura externa. O módulo web.klip continua podendo enviar uma referência selecionada para o chat e abrir uma fonte dentro do app quando permitido.

## Alterado

A interface do Prime mostra apenas o status `Em desenvolvimento`, sem checkout funcional, sem promessa de ativação e sem menção a provedor. O estado de carteira não libera tokens por retorno visual ou por armazenamento local.

O web.klip abre com uma experiência de busca: campo de pesquisa em destaque, estado vazio limpo, resultados somente após uma consulta e ação `Usar no chat`/`Criar com esta referência`. O feed diário, categorias e carregamento automático deixaram de ser a tela inicial para reduzir peso e repetição.

O menu lateral contém Conversas, Artefatos e logo abaixo web.klip, sem o agrupador Mais.

As configurações possuem uma única seção de Recursos pagos, além de Geral, Conta, Dados e privacidade, Termos e documentos, Notificações e Segurança e login. A documentação explica funcionamento, dados, segurança, conta, inatividade, exclusão e recursos em desenvolvimento sem afirmar que pagamentos estão ativos.
