# cardano-technical-workshop

[Versão em português](README.md)

Technical workshop in TypeScript for building Cardano transactions with a Node.js backend and CIP-30 wallet signing in the frontend.

The custody boundary is explicit:

- the Node.js backend queries Cardano Preprod, builds transactions, and submits them through Blockfrost;
- the CIP-30 extension signs in the browser without exposing the private key;
- the Workbench validates and displays unsigned CBOR, witnesses, signed CBOR, transaction hash, and block inclusion.

## Requirements

- Node.js 20 or newer;
- a Blockfrost project on Cardano Preprod;
- a CIP-30 wallet configured for Preprod;
- tADA in at least one UTxO of the wallet used to build transactions;
- a second wallet with a different payment key for the multisig exercise.

The CIP-30 network identifier distinguishes mainnet from testnet, but does not distinguish Preprod from Preview. You must confirm the Preprod selection in the extension.

## Setup

```bash
npm install
cp .env.example .env
# edit .env and load the variables into the current shell
set -a; source .env; set +a
npm run dev
```

By default, the services listen only on `127.0.0.1` so the Blockfrost credential is not exposed to the local network. To use a different bind address, set `HOST` in the backend and pass an explicit `--host` to Vite only when you understand the shared quota usage.

Open:

- Workbench: <http://127.0.0.1:5173>
- backend: <http://127.0.0.1:8787/api/health>
- readiness: <http://127.0.0.1:8787/api/readiness>
- external CBOR inspection: [CBOR Nemo](https://cbor.nemo157.com/)

CBOR Nemo is a third-party tool. Do not send a seed phrase, private key, or Blockfrost credential. Prefer inspecting unsigned CBOR. Anyone who obtains valid signed CBOR may submit it to the network.

For the CLI flow with a backend-held key, create `.seedphrase` locally or export `WALLET_MNEMONIC`. `.seedphrase`, `.env`, `dist/`, and `node_modules/` are local files and must not be committed.

## Participant-led format

The Workbench is the authoritative operational guide. After a short introduction, participants should be able to:

1. verify the backend, Blockfrost, wallet, network, and balance;
2. understand the objective, inputs, expected output, and effect of each exercise;
3. follow only the next enabled action;
4. recognize build, signature, merge, submission, and inclusion;
5. correct an error and retry without losing the last valid checkpoint;
6. reset only the current exercise;
7. restore fields and preserved artifacts in the same tab.

The session uses `sessionStorage`. It preserves addresses, CBOR, and witnesses in the current tab, but never stores the private key or CIP-30 object. After a page reload, the wallet must be connected again. The script address and multisig setup UTxO list are not persisted. Generate, review, and select this data again before a new lock or unlock.

## Language

The in-product `Language` selector switches the Workbench between Brazilian Portuguese and English without reloading the page. Brazilian Portuguese (`pt-BR`) is the default, regardless of the browser language. The explicit preference is stored separately in `localStorage` under `cardano-technical-workshop.locale.v1`, while transaction inputs, progress, and artifacts remain in `sessionStorage` under `cardano-technical-workshop.session.v1`.

Changing the language updates visible copy, accessible names, announcements, locale-sensitive formatting, `html.lang`, and the `Accept-Language` header sent by subsequent API requests. The Workbench sends the selected locale, `pt-BR` or `en`. The backend uses this header to localize the readiness note and structured problems, responds with `Content-Language`, and includes `Accept-Language` in `Vary`. A missing header or one without a supported locale falls back to `pt-BR`.

The switch does not rebuild, sign, merge, submit, reset, or otherwise alter transaction state, session state, input values, artifacts, or wallet authorization. A reload restores the language preference and preserved transaction session independently, but the CIP-30 wallet remains disconnected until the participant authorizes it again.

## Exercises

1. Simple payment.
2. Payment with metadata under label 674.
3. 2-of-2 multisig, with lock, UTxO selection, CBOR handoff, and unlock.
4. Native Asset in two examples:
   - 4A: illustrative issuance of `EAC-BRE-2025P01`, partial retirement by burn, and raw metadata under private-use label `65536`;
   - 4B: media token with CIP-25 presentation metadata under label `721`.

Each pipeline follows the same contract:

```text
backend builds unsigned tx
CIP-30 wallet produces witness
browser validates and attaches witness
participant reviews the effect
backend submits signed tx
Workbench verifies inclusion on Preprod
```

The hash is deterministic and can be calculated locally before submission. A successful backend response confirms that Blockfrost accepted the submission. If the response is lost, the Workbench preserves the hash as `unknown result`, allows an inclusion check, and only repeats submission through an explicit action. A `404` from the check means only that Blockfrost has not indexed the hash yet. It confirms neither rejection nor acceptance. The exercise shows completion only after Blockfrost reports inclusion in a block. This inclusion must not be described as irreversible finality.

## Effects on Preprod

- Payment transfers tADA and pays a fee.
- Metadata transfers tADA and publishes content visible on the blockchain.
- Multisig lock moves tADA to a script that requires two distinct keys. An incorrect configuration may make the balance inaccessible.
- Multisig unlock consumes the selected UTxO, sends the specified value to the destination, and returns change to the script. Inclusion completes one round, not recovery of the entire balance. To move the remainder, reset the unlock, list the new UTxO, and repeat with both wallets.
- The EAC example creates `12088322` illustrative units of `EAC-BRE-2025P01`, displayed as `12,088.322 EAC`. This number does not represent the allocable supply published by Heidelberg Materials. The balance remains in the connected wallet.
- Issuance attaches `methodology_hash`, `assurance_hash`, and `evidence_root` under label `65536`. Retirement burns `125000` units, keeps `11963322` in the output, and attaches `declaration_hash` and `delivery_reference_hash` under the same label. A private-use label does not make the data confidential.
- The EAC policy is stable and requires the wallet key. It does not validate metadata, limit supply, or prove industrial facts. The approximately three-hour validity belongs to each built transaction, not to the policy.
- The CIP-25 example creates units of a media token, uses at least 5 tADA in the output, and has a policy valid for approximately three hours.

Use disposable wallets and testnet values during validation.

## Main routes

```text
GET  /api/health
GET  /api/readiness
GET  /api/readiness?address=addr_test...
GET  /api/transactions/:txHash/status
POST /api/workshop/01-payment
POST /api/workshop/02-metadata
POST /api/workshop/03-multisig/describe
POST /api/workshop/03-multisig/lock
POST /api/workshop/03-multisig/utxos
POST /api/workshop/03-multisig/verify-input
POST /api/workshop/03-multisig/unlock
POST /api/workshop/04a-mint-eac
POST /api/workshop/04a-retire-eac
POST /api/workshop/04b-mint-cip25
POST /api/submit-tx
```

The previous routes `/api/workshop/03-mint-cip25`, `/api/workshop/04-mint-cip25`, and `/api/workshop/04-multisig/*` remain as compatibility aliases.

## Supporting CLI

```bash
npm run start -- address
npm run start -- send-ada addr_test... 100000000
npm run start -- build-cbor addr_test... 100000000
npm run start -- build-cbor-metadata addr_test... 100000000 "Hello, Cardano!"
npm run start -- multisig-info second_signer_addr_test...
npm run start -- lock-multisig second_signer_addr_test... 10000000
npm run start -- build-multisig-partial second_signer_addr_test... destination_addr_test... 2000000 txhash#index
npm run start -- mint-cip25 recipient_addr_test... MyLittleToken 10 "My Little Token" ipfs://... "Description"
npm run start -- sign-cbor <unsigned_tx_cbor>
```

The `sign-cbor` CLI can produce the second unlock witness. Unsigned CBOR is the shared object. Each signer returns only their witness.

## Validation

```bash
npm test
npm run build
# with npm run dev active in another terminal
npm run test:browser
```

Tests cover request validation, the raw EAC issuance schema, stable EAC policy, network and values, distinct multisig signers, imported CBOR inspection, Blockfrost readiness, inclusion checks, ambiguous submission, divergent hashes, transaction-derived summaries, mint validity, HTTP errors, pipeline progression, artifact invalidation, retry, session restoration, localization, and visual input alignment.

Behavioral scenarios are in [`features/participant-led-workbench.feature`](features/participant-led-workbench.feature), with an English counterpart in [`features/participant-led-workbench.en.feature`](features/participant-led-workbench.en.feature).

## Facilitation guide

[`passoapasso.en.md`](passoapasso.en.md) contains the mental model, discussion questions, and facilitator notes. It does not duplicate the interface button sequence. The [Portuguese guide](passoapasso.md) remains available.

## License

MIT.
