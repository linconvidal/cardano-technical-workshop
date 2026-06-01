# Passo a passo do Cardano Technical Workshop

## 1. Preparação

1. Instalar dependências:

```bash
npm install
```

2. Configurar Blockfrost preprod:

```bash
cp .env.example .env
# edite .env e carregue as variáveis no shell atual
set -a; source .env; set +a
```

3. Para o Caminho A, criar `.seedphrase` ou exportar `WALLET_MNEMONIC`.
4. Para o Caminho B, deixar a wallet CIP-30 em preprod.
5. Validar o projeto:

```bash
npm run build
```

## 2. Modelo mental

1. Toda ação em Cardano vira uma transação.
2. Construir uma transação não exige chave privada.
3. Assinar é a fronteira de custódia.
4. Submeter só entrega uma transação assinada para a rede.
5. A mesma biblioteca Cardano roda nos dois lados: Node.js no backend e TypeScript no navegador.

Pergunta central da aula:

```text
Onde está a chave?
```

## 3. Caminho A: chave no backend

Este caminho é para automação, scripts e demonstração controlada.

1. Mostrar `Client.make(preprod).withBlockfrost(...).withSeed(...)`.
2. Rodar:

```bash
npm run start -- address
```

3. Explicar `.seedphrase`, derivação de address e risco de custódia.
4. Enviar ADA pelo backend:

```bash
npm run start -- send-ada addr_test... 100000000
```

5. Abrir a transação no Cardanoscan.
6. Reforçar: é poderoso, mas não é o fluxo principal de uma dApp com usuário final.

## 4. Caminho B: chave no frontend

Este é o fluxo principal do workshop.

```text
frontend conecta wallet
frontend envia address para backend
backend constrói unsigned tx com withAddress(address)
frontend assina com withCip30(api)
frontend anexa witness set
backend submete via Blockfrost
```

Rodar a workbench:

```bash
npm run dev
```

Abrir:

```text
http://localhost:5173/
```

ou:

```text
http://127.0.0.1:5173/
```

A página é uma bancada de aula, não um app final. Ela torna visíveis os artefatos que normalmente ficariam escondidos no terminal: CBOR da transação, witness set, transação assinada, policy script, script address e tx hash.

## 5. Estrutura da workbench

Cada exercício segue a mesma sequência:

1. Preparar parâmetros.
2. Construir unsigned tx no backend.
3. Mostrar unsigned tx CBOR.
4. Assinar com a wallet CIP-30.
5. Mostrar witness set CBOR.
6. Anexar witness à transação.
7. Mostrar signed tx CBOR.
8. Submeter.
9. Mostrar tx hash.

Essa repetição é intencional. Ela mostra que o padrão é sempre o mesmo e que cada exercício só adiciona uma peça nova.

## 6. Exercício 1: pagamento simples

Objetivo: entender o ciclo mínimo.

1. Conectar a wallet.
2. Preencher destinatário e lovelace.
3. Clicar em `1. Construir unsigned tx`.
4. Observar `Build details` e `Unsigned tx CBOR`.
5. Clicar em `2. Assinar com wallet`.
6. Observar `Witness set CBOR`.
7. Clicar em `3. Anexar witness`.
8. Observar `Signed tx CBOR`.
9. Clicar em `4. Submeter`.
10. Conferir `Tx hash`.

Código principal no backend:

```ts
Client.make(preprod)
  .withBlockfrost(...)
  .withAddress(userAddress)
  .newTx()
  .payToAddress(...)
  .build()
```

Código principal no frontend:

```ts
walletClient.signTx(txCbor)
Transaction.addVKeyWitnessesHex(txCbor, witnessSetCbor)
```

## 7. Exercício 2: pagamento com metadata

Objetivo: mostrar um incremento pequeno em cima do pagamento simples.

Diferença conceitual:

```ts
const metadata = TransactionMetadatum.fromEntries([["msg", message]])

client
  .newTx()
  .payToAddress(...)
  .attachMetadata({ label: 674n, metadata })
```

Fluxo:

1. Preencher destinatário, lovelace e mensagem.
2. Construir a tx com metadata.
3. Comparar os details com o pagamento simples.
4. Assinar, anexar witness e submeter.
5. Conferir a metadata no explorador.

## 8. Exercício 3: native token CIP-25

Objetivo: mostrar mint com policy nativa controlada pela wallet conectada.

A workbench recebe:

1. Recipient address que receberá o token.
2. Asset name usado no token nativo.
3. Quantidade.
4. Metadata name exibido no CIP-25.
5. Image URI.
6. Description.

A workbench mostra:

1. Policy id.
2. Asset name em hex.
3. Native script em CBOR e JSON.
4. Metadata CIP-25 no label 721, com name, image e description.
5. Required signer da wallet.
6. Unsigned mint tx CBOR.
7. Witness set.
8. Signed tx.
9. Tx hash.

Ideia central:

```text
backend constrói a policy e a mint tx
wallet do usuário assina a autorização exigida pelo native script
```

A metadata usa CIP-25 version 2. No label 721, a chave do policy id e a chave do asset name são byte strings, e o mapa inclui `version: 2`. `image` e `description` são quebrados em arrays quando passam de 64 bytes. `name` deve caber em 64 bytes.

## 9. Exercício 4: multisig 2-de-2

Objetivo: usar a página como bancada para transportar artefatos entre signatários.

### 4.0. Preparar script address

1. Conectar a wallet do signer A.
2. Informar o address do signer B.
3. Clicar em `0. Gerar script address`.
4. Observar:
   - native script JSON;
   - native script CBOR;
   - script address;
   - script hash;
   - required signers.

### 4A. Lock ADA no script

1. Informar valor para lock.
2. Construir lock tx.
3. Assinar com a wallet atual.
4. Anexar witness.
5. Submeter.
6. Guardar o tx hash do lock.

### 4B. Unlock com duas assinaturas

1. Signer A clica em `Listar UTxOs do script`.
2. Signer A escolhe o outRef correto, no formato `txhash#index`.
3. Signer A cola esse outRef em `Script UTxO para unlock`.
4. Signer A constrói a unlock tx.
5. A workbench mostra o unsigned unlock tx CBOR e o UTxO selecionado.
6. Signer A assina e copia o próprio witness.
7. Signer A envia o unsigned tx CBOR para o signer B.
8. Signer B cola o unsigned tx CBOR no campo `Unsigned unlock tx CBOR` da própria workbench.
9. Signer B assina o CBOR colado com a wallet dele e devolve o witness.
10. Alternativa para o Signer B: rodar `npm run start -- sign-cbor <unsigned_tx_cbor>` com a `.seedphrase` local e devolver o witness impresso.
11. Signer A cola o witness recebido.
12. Signer A anexa os dois witnesses.
13. Signer A submete a signed tx.

Regra didática: o unsigned tx é o objeto compartilhado. Cada signer produz apenas o seu witness. O UTxO do script deve ser escolhido explicitamente quando houver mais de um, para não gastar a saída errada. O troco do unlock volta para o script address.

## 10. Arquivos importantes

Backend API:

```text
apps/api/src/server.ts
apps/api/src/request-validation.ts
```

Frontend web:

```text
apps/web/index.html
apps/web/src/main.ts
apps/web/src/workbench-ui.ts
apps/web/src/global.d.ts
apps/web/src/css.d.ts
apps/web/src/http.ts
apps/web/src/styles.css
```

CLI de apoio:

```text
apps/cli/src/main.ts
```

Pacote Cardano:

```text
packages/cardano/src/workshop/01-payment.ts
packages/cardano/src/workshop/02-metadata.ts
packages/cardano/src/workshop/03-mint-cip25.ts
packages/cardano/src/workshop/04-multisig.ts
packages/cardano/src/workshop/types.ts
packages/cardano/src/internal/blockfrost-client.ts
packages/cardano/src/internal/serialization.ts
packages/cardano/src/internal/addresses.ts
packages/cardano/src/cli/seed-workflows.ts
```

## 11. Rotas da workbench

```text
POST /api/workshop/01-payment
POST /api/workshop/02-metadata
POST /api/workshop/03-mint-cip25
POST /api/workshop/04-multisig/describe
POST /api/workshop/04-multisig/lock
POST /api/workshop/04-multisig/utxos
POST /api/workshop/04-multisig/unlock
POST /api/submit-tx
```
