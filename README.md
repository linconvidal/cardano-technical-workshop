# cardano-technical-workshop

Workshop técnico em TypeScript para construir transações Cardano com backend Node.js e assinatura por wallet CIP-30 no frontend.

A tese do projeto é separar a fronteira de custódia:

- Backend Node.js constrói transações e submete via Blockfrost.
- Frontend Vite conecta a wallet CIP-30 e assina sem expor a chave.

## Requisitos

- Node.js 20 ou superior.
- Projeto Blockfrost em Cardano preprod.
- Wallet CIP-30 em preprod para os exercícios da workbench.
- Mnemonic local apenas para os comandos CLI com seed.

## Setup

```bash
npm install
cp .env.example .env
# edite .env e carregue as variáveis no shell atual
set -a; source .env; set +a
```

Para o fluxo A, com chave no backend, crie `.seedphrase` localmente com a mnemonic usada nos exercícios, ou exporte `WALLET_MNEMONIC`. `.seedphrase`, `.env`, `dist/` e `node_modules/` são arquivos locais e não devem ser commitados.

## Workbench web

```bash
npm run dev
```

- Frontend: <http://localhost:5173> ou <http://127.0.0.1:5173>
- Backend: <http://localhost:8787/api/health> ou <http://127.0.0.1:8787/api/health>

A UI não é um app final. Ela é a bancada da aula: renderiza CBOR, witness sets, signed tx, policy scripts, script addresses e tx hashes.

Rotas principais:

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

Fluxo padrão:

```text
frontend conecta a wallet
frontend envia address para backend
backend constrói tx unsigned com withAddress(address)
frontend assina com withCip30(api)
frontend anexa witness set à tx
backend submete via Blockfrost
```

## CLI de apoio

```bash
npm run start -- address
npm run start -- send-ada addr_test... 100000000
npm run start -- build-cbor addr_test... 100000000
npm run start -- build-cbor-metadata addr_test... 100000000 "Hello, Cardano!"
npm run start -- multisig-info second_signer_addr_test...
npm run start -- lock-multisig second_signer_addr_test... 10000000
npm run start -- build-multisig-partial second_signer_addr_test... destination_addr_test... 2000000 txhash#index
npm run start -- mint-cip25 recipient_addr_test... MyLittleToken 10 "My Little Token" ipfs://QmRhTTbUrPYEw3mJGGhQqQST9k86v1DPBiTTWJGKDJsVFw "This is a test token minted with a Cardano native script"
npm run start -- sign-cbor <unsigned_tx_cbor>
```

## Notas dos exercícios

- O exercício 3 usa CIP-25 version 2: policy id e asset name entram como byte strings no metadata 721, com `version: 2`.
- `image` e `description` do CIP-25 são quebrados automaticamente em arrays quando passam de 64 bytes. `name` continua limitado a 64 bytes.
- No exercício 4, o troco do unlock volta para o script address. Só o valor escolhido sai para o destino.
- O witness recebido no unlock multisig vem do outro signer. Ele pode assinar o mesmo unsigned CBOR pela workbench ou pelo comando `npm run start -- sign-cbor <unsigned_tx_cbor>`.
- `build-multisig-partial` é um comando de apoio para construir uma unlock tx e já incluir o witness da seed local. Na workbench, o fluxo didático recomendado é construir o unsigned CBOR na UI e usar `sign-cbor` para o outro signer.

## Roteiro

O roteiro incremental do workshop está em [`passoapasso.md`](passoapasso.md).

## Licença

MIT.
