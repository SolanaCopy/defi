require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      forking: process.env.FORK_ARBITRUM
        ? {
            url: process.env.ARBITRUM_RPC_HTTPS || "https://arb1.arbitrum.io/rpc",
            blockNumber: 443170000,
          }
        : undefined,
      chains: {
        42161: {
          hardforkHistory: {
            arrowGlacier: 0,
            grayGlacier: 0,
            merge: 0,
            shanghai: 0,
          },
        },
      },
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",
      accounts,
      chainId: 421614,
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_HTTPS || "https://arb1.arbitrum.io/rpc",
      accounts,
      chainId: 42161,
    },
  },
};
