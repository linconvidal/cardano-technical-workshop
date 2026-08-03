# Roteiro de facilitação do Cardano Technical Workshop

A Workbench web contém as instruções operacionais, o estado, a recuperação e a condição de conclusão de cada exercício. Este roteiro orienta a facilitação e evita antecipar a solução antes da primeira tentativa dos participantes.

## 1. Preparação

Antes da aula:

```bash
npm install
cp .env.example .env
set -a; source .env; set +a
npm test
npm run build
npm run dev
```

Confirme no navegador:

- backend local disponível;
- Blockfrost Preprod configurado e saudável;
- wallet CIP-30 detectada;
- wallet explicitamente configurada em Preprod;
- ao menos um UTxO com tADA;
- duas wallets com chaves de pagamento distintas para o multisig.

Use wallets descartáveis de testnet. Não use seed ou chave de produção.

Deixe o [CBOR Nemo](https://cbor.nemo157.com/) disponível para inspeção manual dos artefatos. É uma ferramenta de terceiros. Não cole seed phrase, chave privada ou credencial Blockfrost. Prefira o unsigned CBOR; quem obtiver um signed CBOR válido poderá submetê-lo à rede.

## 2. Abertura participante-led

A introdução deve ser curta:

1. A Workbench usa Cardano Preprod e movimenta tADA real de testnet.
2. O backend constrói a transação sem receber a chave privada.
3. A wallet assina o corpo exato e devolve um witness.
4. O navegador valida e anexa o witness.
5. O backend submete a transação assinada.
6. Um hash submetido ainda pode estar pendente; conclusão exige inclusão em bloco.

Depois dessa moldura, os participantes iniciam o exercício diretamente. O facilitador observa o primeiro contato e responde dúvidas sem executar todo o caminho antes deles.

## 3. Modelo mental

Pergunta central:

```text
Onde está a chave?
```

Distinções que devem aparecer durante a prática:

- construir não autoriza gasto;
- witness é uma assinatura para um corpo específico;
- signed CBOR contém corpo e witnesses;
- submeter entrega bytes assinados ao provedor;
- transaction hash identifica a transação;
- inclusão em bloco é diferente de aceitação para submissão;
- a blockchain prova a transação e seus artefatos, não a verdade de uma afirmação externa.

## 4. Caminho CLI com chave no backend

Este caminho é uma demonstração controlada de automação, não o fluxo principal de uma dApp com usuário final.

```bash
npm run start -- address
npm run start -- send-ada addr_test... 100000000
```

Mostre:

- `Client.make(preprod).withBlockfrost(...).withSeed(...)`;
- derivação de endereço;
- custódia da seed pelo processo;
- diferença em relação à assinatura CIP-30.

## 5. Workbench web

Abra:

```text
http://127.0.0.1:5173/
```

A interface é a fonte de verdade para:

- pré-requisitos;
- objetivo e resultado esperado;
- próximo passo habilitado;
- artefatos intermediários;
- efeitos da submissão;
- retry, reset e restauração;
- transaction hash, estado pendente e inclusão.

Não explique todos os artefatos antecipadamente. Peça que o participante diga o que mudou após cada etapa.

## 6. Exercício 1: pagamento simples

Foco conceitual:

- inputs e outputs;
- fee e troco;
- unsigned transaction;
- witness;
- signed transaction;
- submissão e inclusão.

Perguntas após a tentativa:

- O backend precisou da chave privada para construir?
- Qual artefato mudou quando a wallet assinou?
- O que impede usar esse witness em outro corpo?
- Onde aparecem valor, taxa e troco na confirmação da wallet e nos detalhes?

Falhas úteis para discussão:

- endereço mainnet ou inválido;
- valor zero;
- saldo insuficiente;
- wallet recusada;
- backend desligado;
- submissão aceita, mas ainda não indexada.

## 7. Exercício 2: pagamento com metadata

A mudança em relação ao exercício 1 é pequena:

```ts
const metadata = TransactionMetadatum.fromEntries([["msg", message]])

client
  .newTx()
  .payToAddress(...)
  .attachMetadata({ label: 674n, metadata })
```

Perguntas:

- O que permaneceu igual no pipeline?
- Onde a mensagem aparece no corpo e no explorador?
- Por que não devemos publicar dados pessoais ou sigilosos?
- A metadata prova que a mensagem é verdadeira ou apenas que foi publicada por uma transação?

## 8. Exercício 3: multisig 2-de-2

O exercício começa com o script e termina com um unlock incluído.

### 8.1 Script e signers

- Signer A é a wallet conectada.
- Signer B fornece outro endereço.
- A API rejeita duas addresses apoiadas pela mesma payment key.
- Os dois participantes conferem `requiredSigners` e `scriptAddress` antes do lock.

### 8.2 Lock

O lock move tADA para o script. A confirmação precisa deixar claro que uma configuração incorreta pode tornar o saldo inacessível.

Depois da inclusão:

1. liste UTxOs do script;
2. aguarde e tente novamente se o Blockfrost ainda não tiver indexado o lock;
3. escolha explicitamente o outRef quando houver mais de um.

### 8.3 Handoff e unlock

O unsigned CBOR é o objeto compartilhado:

1. Signer A constrói e assina.
2. Signer A envia o unsigned CBOR ao signer B.
3. Signer B cola o CBOR em outra Workbench, confere o resumo derivado do próprio CBOR, conecta a própria wallet, confirma a revisão e assina.
4. Signer B devolve somente o witness.
5. Signer A cola o witness recebido.
6. A Workbench verifica as assinaturas, os hashes exigidos e o corpo assinado.
7. Signer A revisa e submete.

Alternativa de apoio:

```bash
npm run start -- sign-cbor <unsigned_tx_cbor>
```

O unlock envia o valor escolhido ao destino e devolve o troco ao script. A rodada termina somente após inclusão do unlock, mas isso não recupera automaticamente todo o saldo bloqueado. Para mover mais tADA, reinicie somente o unlock, liste o novo UTxO do script e repita com as duas wallets.

## 9. Exercício 4: dois modelos de Native Asset

### 9.1 Exercício 4A: emissão EAC com metadata raw

Este exercício implementa a emissão inicial descrita na ADR-002:

- asset name fixo `EAC-BRE-2025P01`;
- quantidade on-chain `12088322`;
- exibição da aplicação `12.088,322 EAC`, com três casas decimais;
- endereço contábil que mantém o saldo disponível;
- policy estável baseada na chave da wallet;
- validade aproximada de três horas somente para a transação atual;
- metadata no label `65536`, reservado pela CIP-10 para private use.

O JSON raw contém exatamente:

```json
{
  "version": 1,
  "unit": "EAC",
  "decimals": 3,
  "methodology_hash": "...",
  "assurance_hash": "...",
  "evidence_root": "..."
}
```

A API exige os seis campos e hashes hexadecimais minúsculos de 64 caracteres. Essa validação pertence à aplicação. A native policy verifica somente a chave autorizada; ela não lê transaction metadata, não limita a oferta e não prova os fatos industriais externos.

Os valores padrão dos hashes são fixtures sintéticas. Não os descreva como evidências da Heidelberg Materials ou da DNV. O label private use evita colisão com `674` e `721`, mas não torna o conteúdo privado ou confidencial.

Perguntas:

- Onde a quantidade aparece e por que ela não é repetida na metadata?
- Por que `decimals: 3` não altera a quantidade que o ledger registra?
- O que a chave autorizada prova?
- O que os hashes conectam sem provar?
- Por que a policy id permanece igual quando a validade da transação muda?

Este recorte cobre somente emissão. A aposentadoria exige uma transação separada com quantidade negativa no campo mint, saldo remanescente e referências de declaração e entrega.

### 9.2 Exercício 4B: media token com CIP-25

A Workbench mostra:

- policy id;
- asset name em hex;
- native script em CBOR e JSON;
- required signer;
- metadata no label 721, version 2;
- validade da policy e da transação em aproximadamente três horas;
- output com ao menos 5 tADA;
- unsigned, witness, signed CBOR e transaction hash.

Perguntas:

- Qual regra autoriza o mint?
- O que acontece se a policy expirar antes da submissão?
- Qual é a diferença entre o asset e a metadata que o apresenta?
- Por que `name`, `image` e `description` possuem limites ou chunking?
- Por que CIP-25 não é usado para emissão e aposentadoria EAC?

Se a validade expirar, o participante deve reconstruir. Não reutilize o CBOR antigo.

## 10. Recuperação e estado

A Workbench mantém o último checkpoint válido quando uma ação falha. Alterar um input remove os artefatos derivados para impedir submissão de uma transação antiga.

Regras de facilitação:

- retry repete apenas a etapa que falhou;
- reset limpa somente o exercício local;
- reset não desfaz uma transação já submetida;
- restauração usa `sessionStorage`, exige reconectar a wallet e regenerar o setup multisig;
- se a resposta da submissão se perder, o hash calculado localmente permanece em estado desconhecido para consulta antes de uma nova tentativa;
- `404` na consulta ao Blockfrost significa apenas que o hash ainda não foi indexado; não prova rejeição;
- signed CBOR, witnesses e endereços não contêm a chave privada, mas ainda são dados operacionais que devem ser descartados após a aula;
- erros técnicos permanecem disponíveis em detalhes expansíveis.

## 11. Fechamento

Peça aos participantes para descreverem um dos fluxos sem usar os nomes dos botões. A resposta deve separar:

1. intenção e dados de entrada;
2. construção do corpo;
3. autorização pela chave;
4. composição da transação assinada;
5. submissão;
6. inclusão e verificação do resultado.

O fechamento deve preservar a fronteira principal: o backend pode construir e transmitir, enquanto a wallet mantém a custódia e decide se assina.
