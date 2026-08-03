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

  Cenário: Reconstruir um mint expirado
    Dado que a validade da policy do mint terminou
    Quando a assinatura ou submissão falhar
    Então a Workbench deve preservar o erro técnico
    E deve instruir o participante a reconstruir
    E a nova construção deve exibir uma nova validade
