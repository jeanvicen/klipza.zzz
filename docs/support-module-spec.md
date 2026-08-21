# Especificação futura — suporte Klipza.IA

## Escopo

O módulo de suporte ficará dentro de **Configurações** e será implementado somente em uma etapa posterior. A pessoa poderá enviar uma mensagem de até 3.000 caracteres e, opcionalmente, anexar uma foto. O pedido será tratado como um chamado privado e encaminhado à equipe responsável por um fluxo protegido.

Esta especificação não altera o aplicativo atual nem libera o recurso antes da conclusão das validações necessárias.

## Experiência no aplicativo

A tela deverá mostrar o título **Suporte**, um campo de mensagem com contador, seleção de foto e, quando disponível no dispositivo, captura pela câmera. O app deve aceitar apenas imagens, mostrar uma miniatura antes do envio, permitir remover o anexo e exibir estados claros de envio, sucesso e falha.

Depois do envio, a pessoa receberá um número de protocolo e uma confirmação informando que o pedido foi recebido. O app não deve exibir endereço particular da equipe nem depender de links pessoais de mensageria.

## Privacidade e proteção

Cada chamado deve ficar associado somente à conta que o criou. A pessoa deve conseguir consultar o próprio pedido, enquanto ações administrativas ficam restritas à equipe autorizada.

Fotos e mensagens devem ser tratadas como conteúdo privado. O sistema deve validar tipo e tamanho, impedir acesso público indevido, evitar nomes perigosos e remover informações desnecessárias quando possível.

O suporte não deve solicitar senhas, códigos de segurança ou dados completos de cartão. Registros de segurança devem conter apenas as informações necessárias para acompanhar o chamado, resolver falhas e cumprir obrigações legais.

## Estados do atendimento

Os chamados poderão usar estados como **aberto**, **em atendimento**, **resolvido**, **encerrado** e **falha no recebimento**. O painel autorizado poderá oferecer consulta paginada, filtros, resposta interna, visualização controlada de anexos e registro de auditoria.

Alterações críticas e exclusões deverão exigir confirmação explícita e registrar responsável, motivo e momento da ação.

## Retenção

Anexos e mensagens poderão ser removidos após o período de retenção definido nos documentos oficiais. A exclusão da conta deverá remover ou anonimizar os chamados da pessoa conforme a Política de Privacidade, sem deixar arquivos acessíveis fora do prazo permitido.

## Ordem de implementação futura

A implementação deverá ocorrer em etapas: definir o fluxo de atendimento, validar mensagens e anexos, criar a experiência móvel, integrar o canal oficial de contato, adicionar acompanhamento e auditoria e, por fim, executar testes de segurança, privacidade, duplicidade, indisponibilidade e exclusão de conta.

O módulo somente deverá ser liberado quando os testes confirmarem que uma pessoa não consegue ler chamados, anexos ou protocolos de outra pessoa.

> **Decisão atual:** o módulo está especificado, mas deliberadamente não foi implementado.
