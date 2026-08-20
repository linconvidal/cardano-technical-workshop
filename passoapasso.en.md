# Cardano Technical Workshop facilitation guide

[Versão em português](passoapasso.md)

The web Workbench contains the operational instructions, state, recovery, and completion condition for each exercise. This guide supports facilitation and avoids revealing the solution before the participants' first attempt.

## 1. Preparation

Before the class:

```bash
npm install
cp .env.example .env
set -a; source .env; set +a
npm test
npm run build
npm run dev
```

Confirm in the browser:

- local backend available;
- Blockfrost Preprod configured and healthy;
- CIP-30 wallet detected;
- wallet explicitly configured for Preprod;
- at least one UTxO with tADA;
- two wallets with distinct payment keys for multisig.

Use disposable testnet wallets. Do not use a production seed or key.

Keep [CBOR Nemo](https://cbor.nemo157.com/) available for manual artifact inspection. It is a third-party tool. Do not paste a seed phrase, private key, or Blockfrost credential. Prefer unsigned CBOR. Anyone who obtains valid signed CBOR may submit it to the network.

## 2. Participant-led opening

Keep the introduction short:

1. The Workbench uses Cardano Preprod and moves real testnet tADA.
2. The backend builds the transaction without receiving the private key.
3. The wallet signs the exact body and returns a witness.
4. The browser validates and attaches the witness.
5. The backend submits the signed transaction.
6. A submitted hash may still be pending. Completion requires block inclusion.

After this framing, participants start the exercise directly. The facilitator observes their first contact and answers questions without performing the entire path beforehand.

## 3. Mental model

Central question:

```text
Where is the key?
```

Distinctions that should emerge during practice:

- building does not authorize spending;
- a witness is a signature for a specific body;
- signed CBOR contains the body and witnesses;
- submitting sends signed bytes to the provider;
- the transaction hash identifies the transaction;
- block inclusion differs from acceptance for submission;
- the blockchain proves the transaction and its artifacts, not the truth of an external claim.

## 4. CLI path with a backend-held key

This path is a controlled automation demonstration, not the primary flow of an end-user dApp.

```bash
npm run start -- address
npm run start -- send-ada addr_test... 100000000
```

Show:

- `Client.make(preprod).withBlockfrost(...).withSeed(...)`;
- address derivation;
- seed custody by the process;
- the difference from CIP-30 signing.

## 5. Web Workbench

Open:

```text
http://127.0.0.1:5173/
```

The interface is the source of truth for:

- prerequisites;
- objective and expected result;
- next enabled step;
- intermediate artifacts;
- submission effects;
- retry, reset, and restoration;
- transaction hash, pending state, and inclusion.

Do not explain every artifact in advance. Ask the participant to describe what changed after each step.

### 5.1 Language selection

The selector in the hero is visible and named `Language` in English and `Idioma` in Portuguese. Brazilian Portuguese (`pt-BR`) is the initial default, regardless of the browser language. Participants can switch to English without reloading the page.

The explicit preference is stored in `localStorage` under `cardano-technical-workshop.locale.v1`. It is separate from the transaction session stored in `sessionStorage` under `cardano-technical-workshop.session.v1`. A language change updates visible instructions, accessible names, status announcements, locale-sensitive formatting, `html.lang`, and the `Accept-Language` header on subsequent API requests. The backend localizes the readiness note and structured problems, responds with `Content-Language`, and includes `Accept-Language` in `Vary`; a missing or unsupported header falls back to `pt-BR`. The switch does not alter input values, pipeline stages, CBOR, witnesses, transaction hashes, session state, or wallet authorization.

After a reload, the selected language remains active and preserved transaction state can still be offered for restoration. The CIP-30 wallet remains disconnected until the participant connects it again. Treat language switching as presentation only. Do not ask participants to rebuild or reset an exercise after switching.

## 6. Exercise 1: simple payment

Conceptual focus:

- inputs and outputs;
- fee and change;
- unsigned transaction;
- witness;
- signed transaction;
- submission and inclusion.

Questions after the attempt:

- Did the backend need the private key to build?
- Which artifact changed when the wallet signed?
- What prevents using this witness with another body?
- Where do value, fee, and change appear in the wallet confirmation and details?

Useful failures for discussion:

- mainnet or invalid address;
- zero value;
- insufficient balance;
- wallet refusal;
- backend stopped;
- submission accepted but not yet indexed.

## 7. Exercise 2: payment with metadata

The change from exercise 1 is small:

```ts
const metadata = TransactionMetadatum.fromEntries([["msg", message]])

client
  .newTx()
  .payToAddress(...)
  .attachMetadata({ label: 674n, metadata })
```

Questions:

- What remained the same in the pipeline?
- Where does the message appear in the body and explorer?
- Why should personal or confidential data not be published?
- Does the metadata prove that the message is true, or only that a transaction published it?

## 8. Exercise 3: 2-of-2 multisig

The exercise begins with the script and ends with an included unlock.

### 8.1 Script and signers

- Signer A is the connected wallet.
- Signer B provides another address.
- The API rejects two addresses backed by the same payment key.
- Both participants review `requiredSigners` and `scriptAddress` before the lock.

### 8.2 Lock

The lock moves tADA to the script. The confirmation must clearly state that an incorrect configuration can make the balance inaccessible.

After inclusion:

1. list the script UTxOs;
2. wait and retry if Blockfrost has not indexed the lock yet;
3. explicitly choose the outRef when more than one exists.

### 8.3 Handoff and unlock

Unsigned CBOR is the shared object:

1. Signer A builds and signs.
2. Signer A sends the unsigned CBOR to signer B.
3. Signer B pastes the CBOR into another Workbench, checks the summary derived from the CBOR itself, connects their wallet, confirms the review, and signs.
4. Signer B returns only the witness.
5. Signer A pastes the received witness.
6. The Workbench verifies signatures, required hashes, and the signed body.
7. Signer A reviews and submits.

Supporting alternative:

```bash
npm run start -- sign-cbor <unsigned_tx_cbor>
```

The unlock sends the selected value to the destination and returns change to the script. The round ends only after unlock inclusion, but this does not automatically recover the entire locked balance. To move more tADA, reset only the unlock, list the new script UTxO, and repeat with both wallets.

## 9. Exercise 4: two Native Asset models

### 9.1 Exercise 4A: EAC issuance and retirement

This exercise implements an illustrative accounting cycle inspired by ADR-002. The numbers do not represent the allocable supply published by Heidelberg Materials:

- fixed asset name `EAC-BRE-2025P01`;
- illustrative on-chain quantity `12088322`;
- application display `12,088.322 EAC`, with three decimal places;
- connected wallet as the accounting address that keeps the balance available;
- stable policy based on the wallet key;
- approximately three-hour validity only for the current transaction;
- metadata under label `65536`, reserved by CIP-10 for private use.

The raw JSON contains exactly:

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

The API requires all six fields and 64-character lowercase hexadecimal hashes. This validation belongs to the application. The native policy checks only the authorized key. It does not read transaction metadata, limit supply, or prove external industrial facts.

The default hash values are synthetic fixtures. Do not describe them as evidence from Heidelberg Materials or DNV. The private-use label avoids collisions with `674` and `721`, but does not make the content private or confidential.

After issuance inclusion and indexing, retirement creates `-125000` in the mint field and returns `11963322` units to the wallet. Its metadata contains only:

```json
{
  "version": 1,
  "declaration_hash": "...",
  "delivery_reference_hash": "..."
}
```

Questions:

- Where does the quantity appear, and why is it not repeated in the metadata?
- Why does `decimals: 3` not change the quantity recorded by the ledger?
- What does the authorized key prove?
- What do the hashes connect without proving?
- Why does the policy ID remain the same when transaction validity changes?

### 9.2 Exercise 4B: media token with CIP-25

The Workbench shows:

- policy ID;
- asset name in hex;
- native script in CBOR and JSON;
- required signer;
- metadata under label 721, version 2;
- policy and transaction validity of approximately three hours;
- output with at least 5 tADA;
- unsigned CBOR, witness, signed CBOR, and transaction hash.

Questions:

- Which rule authorizes the mint?
- What happens if the policy expires before submission?
- What is the difference between the asset and its presentation metadata?
- Why do `name`, `image`, and `description` have limits or chunking?
- Why is CIP-25 not used for EAC issuance and retirement?

If validity expires, the participant must rebuild. Do not reuse the old CBOR.

## 10. Recovery and state

The Workbench keeps the last valid checkpoint when an action fails. Changing an input removes derived artifacts to prevent submission of an old transaction.

Facilitation rules:

- retry repeats only the failed step;
- reset clears only the local exercise;
- reset does not undo an already submitted transaction;
- restoration uses `sessionStorage`, requires reconnecting the wallet, and requires regenerating the multisig setup;
- if the submission response is lost, the locally calculated hash remains in an unknown state for checking before another attempt;
- a `404` from the Blockfrost check means only that the hash has not been indexed. It does not prove rejection;
- signed CBOR, witnesses, and addresses do not contain the private key, but remain operational data that should be discarded after the class;
- technical errors remain available in expandable details.

Language preference is independent of these rules. Switching locale must not clear, migrate, or rewrite transaction state. Reloading can restore the locale from `localStorage` and offer transaction state from `sessionStorage`, while the wallet remains disconnected.

## 11. Closing

Ask participants to describe one flow without using button names. The answer should separate:

1. intent and input data;
2. body construction;
3. authorization by the key;
4. signed transaction composition;
5. submission;
6. inclusion and result verification.

The closing should preserve the main boundary: the backend can build and transmit, while the wallet maintains custody and decides whether to sign.
