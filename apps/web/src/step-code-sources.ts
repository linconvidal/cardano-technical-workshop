import serverSource from "../../api/src/server.ts?raw"
import blockfrostSource from "../../../packages/cardano/src/internal/blockfrost-client.ts?raw"
import paymentSource from "../../../packages/cardano/src/workshop/01-payment.ts?raw"
import metadataSource from "../../../packages/cardano/src/workshop/02-metadata.ts?raw"
import mintSource from "../../../packages/cardano/src/workshop/03-mint-cip25.ts?raw"
import eacSource from "../../../packages/cardano/src/workshop/04a-mint-eac.ts?raw"
import multisigSource from "../../../packages/cardano/src/workshop/04-multisig.ts?raw"
import flowControllerSource from "./flow-controller.ts?raw"
import walletSource from "./wallet.ts?raw"
import workbenchUiSource from "./workbench-ui.ts?raw"

import type { StepCodeSources } from "./step-code-catalog.js"

export const stepCodeSources = {
  payment: paymentSource,
  metadata: metadataSource,
  multisig: multisigSource,
  eac: eacSource,
  mint: mintSource,
  wallet: walletSource,
  workbenchUi: workbenchUiSource,
  flowController: flowControllerSource,
  server: serverSource,
  blockfrost: blockfrostSource,
} as const satisfies StepCodeSources
