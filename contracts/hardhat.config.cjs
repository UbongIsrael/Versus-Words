require('@nomicfoundation/hardhat-toolbox')
const { subtask } = require('hardhat/config')
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names')
const path = require('node:path')

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _hre, runSuper) => {
  if (solcVersion === '0.8.20') {
    return {
      compilerPath: path.join(path.dirname(require.resolve('solc/package.json')), 'soljson.js'),
      isSolcJs: true,
      version: solcVersion,
      longVersion: '0.8.20+commit.a1b79de6',
    }
  }
  return runSuper()
})

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.20',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
}
