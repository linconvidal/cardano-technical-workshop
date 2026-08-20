# language: en
Feature: Participant-led execution of the Cardano Workbench
  As a CIMATEC workshop participant
  I want to follow the Workbench without first watching the facilitator complete it
  So that I can build, sign, submit, and verify transactions with explicit recovery

  Scenario: Understand prerequisites when opening the Workbench
    Given the Workbench was opened without a connected wallet
    When the environment check finishes
    Then the page should identify the Preprod network
    And it should show the backend, Blockfrost, CIP-30 extension, wallet network, and tADA balance separately
    And each missing prerequisite should explain how to fix it
    And no signing or submission action should be enabled

  Scenario: Open in Portuguese and switch language without losing state
    Given the Workbench was opened without a saved language preference
    Then the language selector should be visible and have an accessible name
    And Brazilian Portuguese should be the default even when the browser prefers English
    And the document lang attribute should be pt-BR
    When the participant fills an input and selects English
    Then the page should change to English without a reload
    And static copy, dynamic copy, accessible names, and announcements should be in English
    And the document lang attribute should be en
    But inputs, stage, artifacts, session state, and wallet authorization should not change
    And subsequent API requests should send Accept-Language en

  Scenario: Restore separate preferences after reloading
    Given the participant selected English and has transaction state preserved in the tab
    When the page is reloaded
    Then the English preference should be restored from localStorage
    And transaction state should remain separate in sessionStorage
    But the wallet should remain disconnected until a new CIP-30 authorization
    When the participant selects Brazilian Portuguese
    Then the document lang attribute should return to pt-BR without a reload
    And subsequent API requests should send Accept-Language pt-BR
    And transaction and session state should remain unchanged

  Scenario: Follow the payment in the correct order
    Given the backend, Blockfrost, Preprod wallet, and balance are ready
    When the participant fills in a valid payment
    Then build should be the next enabled action
    And sign, attach, and submit should remain blocked
    When each stage is completed
    Then the corresponding artifact should appear
    And only the next valid action should be enabled

  Scenario: Invalidate artifacts after changing an input
    Given a transaction was built and signed
    When the participant changes the recipient or value
    Then the previous unsigned CBOR, witnesses, signed CBOR, acknowledgement, and hash should be removed
    And the Workbench should instruct the participant to build again

  Scenario: Signal errors in the technical log
    Given the technical log dialog is closed
    When a stage records an error
    Then the floating debug button should show the unread error count
    And its accessible name should report the same count
    When the participant opens the technical log
    Then the dialog should show the error in chronological order
    And the attention indicator should be removed
    And closing the dialog should return focus to the debug button

  Scenario: Recover from a refused signature
    Given valid unsigned CBOR exists
    When the participant refuses the signing request in the wallet
    Then the unsigned CBOR should remain available
    And the Workbench should offer another attempt
    And it should not rebuild or submit the transaction automatically

  Scenario: Require acknowledgement before a network-affecting submission
    Given current signed CBOR exists
    When the participant has not confirmed the effect review
    Then submit should remain blocked
    When the participant confirms acknowledgement for that transaction
    Then submit should be enabled
    But changing an earlier input or artifact should remove the acknowledgement

  Scenario: Distinguish submission from inclusion
    Given Blockfrost accepted a transaction and returned a hash
    When the hash has not been indexed yet
    Then the Workbench should preserve the hash and state that the check neither confirms nor rejects submission
    When Blockfrost reports block, height, and time
    Then the Workbench should show the transaction as included
    And it should display a link to Cardanoscan Preprod

  Scenario: Restore a session without restoring the wallet
    Given the participant built a transaction in this tab
    When the page is reloaded
    Then the Workbench should offer to continue or discard the session
    When the participant continues
    Then fields, progress, and artifacts should be restored
    But the wallet should remain disconnected until a new CIP-30 authorization
    And the multisig setup should be generated and reviewed again

  Scenario: Prevent multisig with the same key twice
    Given two addresses have the same payment key
    When the participant tries to generate the 2-of-2 script
    Then the API should reject the configuration
    And the Workbench should request another wallet with a distinct payment key

  Scenario: Explicitly choose among multiple multisig UTxOs
    Given the script has multiple UTxOs
    When the participant lists the UTxOs
    Then none should be silently selected
    And each option should show its outRef and lovelace
    And unlock should remain blocked until an explicit selection

  Scenario: Signer B signs received CBOR
    Given signer A sent the unsigned unlock CBOR
    When signer B opens a new session, connects their wallet, and pastes the CBOR
    Then the Workbench should decode the CBOR and validate the script, two required signers, input, outputs, and absence of extra effects
    And before signing it should confirm on Preprod that the input belongs to the script
    And it should display the consumed UTxO, destination, value, change, and fee derived from the CBOR
    And signer B should only be able to sign after confirming that review
    And signer B should be able to copy the witness to return to signer A
    And replacing the unsigned CBOR should remove the previous witness

  Scenario: Require two valid witnesses for unlock
    Given signer A has only one witness
    When they try to attach the witnesses
    Then the Workbench should block the merge and identify the missing signature
    When both witnesses sign the same body and match the required signers
    Then the signed unlock CBOR should be created
    And the exercise should finish only after unlock inclusion

  Scenario: Recover from a lost submission response
    Given signed CBOR exists with a locally calculated hash
    When the submission request finishes without a conclusive response
    Then the Workbench should preserve the hash and mark the submission result as unknown
    And it should allow an inclusion check before suggesting another submission
    And another submission should require an explicit participant action

  Scenario: Invalidate multisig setup after changing a signer
    Given the script address and UTxOs were generated for two signers
    When signer A or signer B changes
    Then the previous script address, UTxOs, selections, and confirmation should be removed
    And lock should remain blocked until the new setup is generated and reviewed

  Scenario: Issue the EAC balance with raw metadata
    Given the participant opened exercise 4A
    When they build the issuance for the specified accounting address
    Then the asset name should be EAC-BRE-2025P01
    And the mint field and output should contain 12088322 units
    And private-use label 65536 should contain only version, unit, decimals, methodology_hash, assurance_hash, and evidence_root
    And asset name, action, and quantity should not be duplicated in metadata
    And the review should state that the policy checks the key but does not validate metadata or industrial facts

  Scenario: Retire part of the EAC balance
    Given the illustrative issuance of 12088322 units was included and indexed in the connected wallet
    When they build the retirement of 125000 units
    Then the mint field should contain -125000
    And the wallet output should contain the remaining 11963322 units
    And label 65536 should contain only version, declaration_hash, and delivery_reference_hash
    And quantity, action, and asset name should not be duplicated in metadata
    And the review should state that the network does not prove delivery or the declaration

  Scenario: Reject EAC metadata outside the schema
    Given the participant changed the raw EAC issuance JSON
    When the JSON is malformed, has extra fields, or has hashes outside the 64-character lowercase hexadecimal format
    Then the API should reject the build
    And the Workbench should preserve the fields for correction

  Scenario: Keep CIP-25 as a separate example
    Given exercise 4A uses raw metadata for the EAC case
    When the participant opens exercise 4B
    Then they should find the CIP-25 mint under label 721
    And the Workbench should state that CIP-25 standardizes presentation metadata
    And it should not present CIP-25 as EAC issuance or retirement metadata

  Scenario: Rebuild an expired CIP-25 mint
    Given the CIP-25 mint policy validity has ended
    When signing or submission fails
    Then the Workbench should preserve the technical error
    And it should instruct the participant to rebuild
    And the new build should display a new validity interval

  Scenario: Rebuild only the expired EAC transaction
    Given the EAC issuance validity window has ended
    When signing or submission fails
    Then the Workbench should state that the EAC policy remains the same
    And it should instruct the participant to build another transaction with a new validity interval
