require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.19",
  networks: {
    hardhat: {
      forking: process.env.FORK_ARBITRUM
        ? {
            url: process.env.ARBITRUM_RPC || "https://arb1.arbitrum.io/rpc",
            blockNumber: 441600000,
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
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 421614,
    },
  },
};
