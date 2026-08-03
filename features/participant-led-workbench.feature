# language: pt
Funcionalidade: Execução participante-led da Workbench Cardano
  Como participante do workshop CIMATEC
  Quero seguir a Workbench sem assistir antes à execução completa do facilitador
  Para construir, assinar, submeter e verificar transações com recuperação explícita

  Cenário: Entender os pré-requisitos ao abrir a Workbench
    Dado que a Workbench foi aberta sem wallet conectada
    Quando a verificação do ambiente terminar
    Então a página deve identificar a rede Preprod
    E deve mostrar separadamente backend, Blockfrost, extensão CIP-30, rede da wallet e saldo de tADA
    E cada pré-requisito ausente deve informar como ser corrigido
    E nenhuma ação de assinatura ou submissão deve estar habilitada

  Cenário: Seguir o pagamento na ordem correta
    Dado que backend, Blockfrost, wallet Preprod e saldo estão prontos
    Quando o participante preencher um pagamento válido
    Então construir deve ser a próxima ação habilitada
    E assinar, anexar e submeter devem permanecer bloqueados
    Quando cada etapa for concluída
    Então o artefato correspondente deve aparecer
    E somente a próxima ação válida deve ficar habilitada

  Cenário: Invalidar artefatos depois de alterar um input
    Dado que uma transação foi construída e assinada
    Quando o participante alterar destinatário ou valor
    Então unsigned CBOR, witnesses, signed CBOR, ciência e hash anteriores devem ser removidos
    E a Workbench deve instruir o participante a construir novamente

  Cenário: Sinalizar erros no log técnico
    Dado que o modal do log técnico está fechado
    Quando uma etapa registrar um erro
    Então o botão flutuante de debug deve mostrar a quantidade de erros não lidos
    E seu nome acessível deve informar a mesma quantidade
    Quando o participante abrir o log técnico
    Então o modal deve mostrar o erro em ordem cronológica
    E o marcador de atenção deve ser removido
    E fechar o modal deve devolver o foco ao botão de debug

  Cenário: Recuperar uma assinatura recusada
    Dado que existe um unsigned CBOR válido
    Quando o participante recusar a solicitação de assinatura na wallet
    Então o unsigned CBOR deve permanecer disponível
    E a Workbench deve oferecer uma nova tentativa
    E não deve reconstruir nem submeter a transação automaticamente

  Cenário: Exigir ciência antes de uma submissão com efeito na rede
    Dado que existe um signed CBOR atual
    Quando o participante ainda não confirmou a revisão do efeito
    Então submeter deve permanecer bloqueado
    Quando o participante confirmar a ciência para essa transação
    Então submeter deve ser habilitado
    Mas alterar um input ou artefato anterior deve remover a ciência

  Cenário: Distinguir submissão de inclusão
    Dado que o Blockfrost aceitou uma transação e devolveu um hash
    Quando o hash ainda não estiver indexado
    Então a Workbench deve preservar o hash e informar que a consulta não confirma nem rejeita a submissão
    Quando o Blockfrost informar bloco, altura e horário
    Então a Workbench deve mostrar a transação como incluída
    E deve exibir um link para o Cardanoscan Preprod

  Cenário: Restaurar uma sessão sem restaurar a wallet
    Dado que o participante construiu uma transação nesta aba
    Quando a página for recarregada
    Então a Workbench deve oferecer continuar ou descartar a sessão
    Quando o participante continuar
    Então campos, progresso e artefatos devem ser restaurados
    Mas a wallet deve continuar desconectada até nova autorização CIP-30
    E o setup multisig deve ser gerado e revisado novamente

  Cenário: Impedir multisig com a mesma chave duas vezes
    Dado que dois endereços possuem a mesma payment key
    Quando o participante tentar gerar o script 2-de-2
    Então a API deve rejeitar a configuração
    E a Workbench deve pedir outra wallet com chave de pagamento distinta

  Cenário: Escolher explicitamente entre vários UTxOs multisig
    Dado que o script possui vários UTxOs
    Quando o participante listar os UTxOs
    Então nenhum deles deve ser escolhido silenciosamente
    E cada opção deve mostrar outRef e lovelace
    E o unlock deve permanecer bloqueado até uma escolha explícita

  Cenário: Signer B assinar um CBOR recebido
    Dado que signer A enviou o unsigned unlock CBOR
    Quando signer B abrir uma sessão nova, conectar sua wallet e colar o CBOR
    Então a Workbench deve decodificar o CBOR e validar script, dois required signers, input, outputs e ausência de efeitos extras
    E antes de assinar deve confirmar na Preprod que o input pertence ao script
    E deve exibir UTxO consumido, destino, valor, troco e taxa derivados do CBOR
    E signer B só deve conseguir assinar depois de confirmar essa revisão
    E deve conseguir copiar o witness para devolver ao signer A
    E trocar o unsigned CBOR deve remover o witness anterior

  Cenário: Exigir dois witnesses válidos no unlock
    Dado que signer A possui apenas um witness
    Quando tentar anexar os witnesses
    Então a Workbench deve bloquear o merge e informar a assinatura ausente
    Quando os dois witnesses assinarem o mesmo corpo e corresponderem aos required signers
    Então o signed unlock CBOR deve ser criado
    E o exercício só deve terminar depois da inclusão do unlock

  Cenário: Recuperar uma resposta de submissão perdida
    Dado que existe um signed CBOR com hash calculado localmente
    Quando a requisição de submissão terminar sem resposta conclusiva
    Então a Workbench deve preservar o hash e marcar o resultado da submissão como desconhecido
    E deve permitir consultar inclusão antes de sugerir uma nova submissão
    E uma nova submissão deve exigir uma ação explícita do participante

  Cenário: Invalidar setup multisig depois de trocar um signer
    Dado que script address e UTxOs foram gerados para dois signers
    Quando signer A ou signer B mudar
    Então script address, UTxOs, escolhas e confirmação anteriores devem ser removidos
    E o lock deve permanecer bloqueado até o novo setup ser gerado e revisado

  Cenário: Emitir o saldo EAC com metadata raw
    Dado que o participante abriu o exercício 4A
    Quando construir a emissão para o endereço contábil informado
    Então o asset name deve ser EAC-BRE-2025P01
    E o campo mint e o output devem conter 12088322 unidades
    E o label 65536 da faixa private use deve conter somente version, unit, decimals, methodology_hash, assurance_hash e evidence_root
    E asset name, ação e quantidade não devem ser duplicados na metadata
    E a revisão deve informar que a policy verifica a chave, mas não valida a metadata nem os fatos industriais

  Cenário: Aposentar parte do saldo EAC
    Dado que a emissão ilustrativa de 12088322 unidades foi incluída e indexada na wallet conectada
    Quando construir a aposentadoria de 125000 unidades
    Então o campo mint deve conter -125000
    E o output da wallet deve conter 11963322 unidades restantes
    E o label 65536 deve conter somente version, declaration_hash e delivery_reference_hash
    E quantidade, ação e asset name não devem ser duplicados na metadata
    E a revisão deve informar que a rede não prova a entrega nem a declaração

  Cenário: Rejeitar metadata EAC fora do schema
    Dado que o participante alterou o JSON raw da emissão EAC
    Quando o JSON estiver malformado, tiver campos extras ou hashes fora do formato de 64 caracteres hexadecimais minúsculos
    Então a API deve rejeitar a construção
    E a Workbench deve preservar os campos para correção

  Cenário: Manter CIP-25 como exemplo separado
    Dado que o exercício 4A usa metadata raw do caso EAC
    Quando o participante abrir o exercício 4B
    Então deve encontrar o mint CIP-25 no label 721
    E a Workbench deve informar que CIP-25 padroniza metadata de apresentação
    E não deve apresentar CIP-25 como metadata de emissão ou aposentadoria EAC

  Cenário: Reconstruir um mint CIP-25 expirado
    Dado que a validade da policy do mint CIP-25 terminou
    Quando a assinatura ou submissão falhar
    Então a Workbench deve preservar o erro técnico
    E deve instruir o participante a reconstruir
    E a nova construção deve exibir uma nova validade

  Cenário: Reconstruir somente a transação EAC expirada
    Dado que a janela de validade da emissão EAC terminou
    Quando a assinatura ou submissão falhar
    Então a Workbench deve informar que a policy EAC permanece a mesma
    E deve instruir o participante a construir outra transação com nova validade
