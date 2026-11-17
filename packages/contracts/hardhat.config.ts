import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import { defineConfig } from "hardhat/config";

// Local only. No HTTP network is configured, so no task in this package can
// reach a live chain by accident or by a missing flag.
// The committed default is osaka. The override exists only so the Phase 3b
// compatibility table can be reproduced for the other targets.
const evmVersion = process.env.LOANSHARK_EVM_VERSION ?? "osaka";

export default defineConfig({
  plugins: [hardhatViem, hardhatNetworkHelpers, hardhatNodeTestRunner],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          // Highest target whose creation simulation succeeded on Diana.
          evmVersion,
        },
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },
  },
});
