# Especificação futura — módulo de suporte Klipza.IA

## Escopo

O módulo de suporte ficará dentro de **Configurações** e será implementado somente em uma etapa posterior. O usuário autenticado poderá enviar uma mensagem de até **3.000 caracteres** e, opcionalmente, anexar uma foto. O pedido será criado como um chamado privado, associado ao usuário autenticado, e encaminhado ao proprietário por um canal configurado no servidor. Esta especificação não altera o app atual nem cria tabelas, buckets ou endpoints nesta etapa.

## Experiência no aplicativo

A tela deverá mostrar o título **Suporte**, um campo de mensagem com contador `0/3000`, seletor de foto da galeria e, quando suportado pelo dispositivo, captura pela câmera. O app deve aceitar apenas imagens, mostrar miniatura antes do envio, permitir remover o anexo e exibir estados claros de envio, sucesso e falha. O botão de envio ficará desabilitado quando não houver mensagem nem foto, quando a mensagem exceder o limite ou enquanto uma solicitação estiver em andamento.

Depois do envio, o usuário receberá um número de protocolo e verá uma confirmação informando que o suporte foi recebido. O app não deve exibir o endereço particular do proprietário nem depender de um link de WhatsApp ou Telegram no cliente. A entrega ao proprietário será feita exclusivamente pelo backend.

## Arquitetura recomendada

A solução principal será composta por **Supabase Storage**, uma tabela `support_tickets`, uma tabela opcional `support_attachments` e uma função/endpoint server-side. A foto será enviada para um bucket privado com caminho particionado por usuário e protocolo. O cliente usará somente a chave publicável do Supabase; a criação do chamado deverá ser protegida por RLS e a emissão de URL assinada ficará restrita ao servidor ou ao próprio usuário para seu chamado.

| Componente | Responsabilidade | Regra de segurança |
| --- | --- | --- |
| `support_tickets` | Protocolo, usuário, mensagem, status, timestamps e erro de entrega | RLS permite inserir e consultar somente o próprio chamado; ações administrativas ficam no servidor |
| `support_attachments` | Nome interno, MIME, tamanho, hash e caminho privado do arquivo | Nunca salvar URL pública; validar tipo, tamanho e extensão no servidor |
| Bucket privado | Armazenar as fotos | Sem acesso anônimo; URLs assinadas com expiração curta |
| Endpoint server-side | Validar sessão, limite, arquivo e encaminhamento | Sem `service_role` no app; aplicar rate limit e idempotência |
| Worker de entrega | Enviar e-mail ou notificação ao proprietário | Não bloquear a resposta do usuário; registrar sucesso/falha e permitir retry controlado |

## Validações

O endpoint deverá confirmar o JWT do usuário, limitar a mensagem a 3.000 caracteres Unicode, rejeitar HTML e scripts na mensagem, aceitar somente MIME `image/jpeg`, `image/png` e `image/webp`, limitar o arquivo a uma dimensão e tamanho definidos no momento da implementação e remover metadados EXIF desnecessários quando possível. O nome original não será usado como caminho de armazenamento. O servidor deverá gerar um nome aleatório, verificar o conteúdo real do arquivo e impedir extensões executáveis.

Deverá existir limite por usuário e por IP, por exemplo, um chamado em andamento e poucos chamados por janela de tempo. O endpoint deverá aceitar uma chave de idempotência para impedir duplicação quando o celular repetir a requisição por perda de conexão. Logs não devem registrar o texto completo nem a foto; devem conter apenas protocolo, usuário, tamanho, MIME, status e timestamps.

## Entrega ao proprietário

A primeira opção recomendada é **e-mail transacional**, usando o SMTP já configurado como `Equipe Klipza`. O e-mail terá protocolo, remetente interno, resumo seguro da mensagem e um link assinado de curta duração para visualizar a foto. O conteúdo completo permanecerá no banco; o e-mail não deve incluir a imagem como anexo permanente nem dados sensíveis desnecessários.

Como alternativa, poderá ser usado um webhook privado para Telegram ou outro canal que o proprietário realmente controle. WhatsApp só deverá ser usado se houver uma API oficial e credenciais configuradas no servidor; não será feito envio automatizado para uma conta pessoal por link não oficial. A escolha do canal será feita antes da implementação porque muda a configuração de secrets, os retries e a auditoria.

## Estados e administração

Os chamados terão estados `open`, `in_progress`, `resolved`, `closed` e `delivery_failed`. O painel administrativo existente poderá ganhar uma aba de suporte, com consulta paginada, filtros por status, abertura de foto por URL assinada, resposta interna e registro de auditoria. Exclusões e alterações críticas deverão usar confirmação explícita e registrar administrador, motivo e horário.

Uma rotina de limpeza poderá apagar anexos e conteúdo após um período de retenção definido pelo proprietário, preservando apenas metadados mínimos para auditoria. A exclusão da conta deverá remover ou anonimizar os chamados do usuário conforme a política de retenção que for aprovada, sem deixar fotos órfãs no Storage.

## Ordem de implementação futura

A implementação deverá ocorrer em etapas: primeiro criar a migração versionada e as policies; depois criar o bucket privado e as validações server-side; em seguida implementar a tela móvel e o upload resumível; então integrar o canal do proprietário, retries e auditoria; por fim executar testes de tamanho, MIME, RLS, expiração de URL, rate limit, duplicidade, offline e exclusão de conta. O módulo somente deverá ser liberado quando os testes confirmarem que uma conta não consegue ler chamados, anexos ou protocolos de outro usuário.

> **Decisão atual:** o módulo está especificado, mas deliberadamente não foi implementado, conforme solicitado.

