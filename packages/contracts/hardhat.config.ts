import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import { defineConfig } from "hardhat/config";

// Local only. No HTTP network is configured, so no task in this package can
// reach a live chain by accident or by a missing flag.
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
