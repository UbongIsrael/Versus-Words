const { expect } = require('chai')
const { ethers } = require('hardhat')

const ID = ethers.zeroPadValue('0x9cc5fd42284bd918', 32)
const STAKE = 2_500_000n // 2.5 USDT, 6 decimals — same as a custom room

async function deploy() {
  const [deployer, alice, bob, mallory] = await ethers.getSigners()
  const oracle = ethers.Wallet.createRandom().connect(ethers.provider)
  await deployer.sendTransaction({ to: oracle.address, value: ethers.parseEther('1') })

  const Mock = await ethers.getContractFactory('MockUSDT')
  const token = await Mock.deploy()
  const Escrow = await ethers.getContractFactory('VersusEscrow')
  const escrow = await Escrow.deploy(await token.getAddress(), oracle.address)

  await token.mint(alice.address, 10_000_000n)
  await token.mint(bob.address, 10_000_000n)
  await token.connect(alice).approve(await escrow.getAddress(), ethers.MaxUint256)
  await token.connect(bob).approve(await escrow.getAddress(), ethers.MaxUint256)

  return { token, escrow, oracle, alice, bob, mallory, deployer }
}

async function signSettle(escrow, oracle, id, winner) {
  const digest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32', 'uint8'],
      [await escrow.getAddress(), id, winner],
    ),
  )
  return oracle.signMessage(ethers.getBytes(digest))
}

describe('VersusEscrow — app path', () => {
  it('first lock opens the pot; second lock of the same amount seats the opponent', async () => {
    const { escrow, token, alice, bob } = await deploy()
    await escrow.connect(alice).lock(ID, STAKE)
    await escrow.connect(bob).lock(ID, STAKE)

    const pot = await escrow.pots(ID)
    expect(pot.playerA).to.equal(alice.address)
    expect(pot.playerB).to.equal(bob.address)
    expect(pot.amount).to.equal(STAKE)
    expect(pot.deposits).to.equal(3n)
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(STAKE * 2n)
  })

  it('rejects a second lock from the same player, a wrong amount, and a third player', async () => {
    const { escrow, alice, bob, mallory, token } = await deploy()
    await escrow.connect(alice).lock(ID, STAKE)
    await expect(escrow.connect(alice).lock(ID, STAKE)).to.be.revertedWith('already')
    await expect(escrow.connect(bob).lock(ID, STAKE + 1n)).to.be.revertedWith('mismatch')
    await token.mint(mallory.address, STAKE)
    await token.connect(mallory).approve(await escrow.getAddress(), STAKE)
    await escrow.connect(bob).lock(ID, STAKE)
    await expect(escrow.connect(mallory).lock(ID, STAKE)).to.be.revertedWith('full')
  })

  it('pays player A when the oracle signs winner = 1 (unique-words / most-words host win)', async () => {
    const { escrow, token, oracle, alice, bob } = await deploy()
    await escrow.connect(alice).lock(ID, STAKE)
    await escrow.connect(bob).lock(ID, STAKE)

    const sig = await signSettle(escrow, oracle, ID, 1)
    await escrow.connect(alice).settle(ID, 1, sig)

    expect(await token.balanceOf(alice.address)).to.equal(10_000_000n + STAKE)
    expect(await token.balanceOf(bob.address)).to.equal(10_000_000n - STAKE)
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n)
    expect((await escrow.pots(ID)).settled).to.equal(true)
  })

  it('pays player B when the oracle signs winner = 2', async () => {
    const { escrow, token, oracle, alice, bob } = await deploy()
    await escrow.connect(alice).lock(ID, STAKE)
    await escrow.connect(bob).lock(ID, STAKE)
    await escrow.connect(bob).settle(ID, 2, await signSettle(escrow, oracle, ID, 2))
    expect(await token.balanceOf(bob.address)).to.equal(10_000_000n + STAKE)
  })

  it('refunds both when the oracle signs winner = 0 (tie)', async () => {
    const { escrow, token, oracle, alice, bob } = await deploy()
    await escrow.connect(alice).lock(ID, STAKE)
    await escrow.connect(bob).lock(ID, STAKE)
    await escrow.connect(alice).settle(ID, 0, await signSettle(escrow, oracle, ID, 0))
    expect(await token.balanceOf(alice.address)).to.equal(10_000_000n)
    expect(await token.balanceOf(bob.address)).to.equal(10_000_000n)
  })

  it('rejects a forged or mismatched settle signature', async () => {
    const { escrow, oracle, alice, bob, mallory } = await deploy()
    await escrow.connect(alice).lock(ID, STAKE)
    await escrow.connect(bob).lock(ID, STAKE)

    const wrongKey = ethers.Wallet.createRandom()
    const bad = await signSettle(escrow, wrongKey, ID, 1)
    await expect(escrow.connect(alice).settle(ID, 1, bad)).to.be.revertedWith('sig')

    const forA = await signSettle(escrow, oracle, ID, 1)
    await expect(escrow.connect(alice).settle(ID, 2, forA)).to.be.revertedWith('sig')
    await expect(escrow.connect(mallory).settle(ID, 3, forA)).to.be.revertedWith('winner')
  })

  it('cannot pay a third address — only A, B, or refund', async () => {
    const { escrow, oracle, alice, bob } = await deploy()
    await escrow.connect(alice).lock(ID, STAKE)
    await escrow.connect(bob).lock(ID, STAKE)
    await expect(escrow.settle(ID, 4, await signSettle(escrow, oracle, ID, 4))).to.be.reverted
  })

  it('refunds a lone depositor on timeout, and refuses timeout before expiry', async () => {
    const { escrow, token, alice } = await deploy()
    await escrow.connect(alice).lock(ID, STAKE)
    await expect(escrow.timeoutRefund(ID)).to.be.revertedWith('early')

    await ethers.provider.send('evm_increaseTime', [24 * 60 * 60 + 1])
    await ethers.provider.send('evm_mine', [])
    await escrow.timeoutRefund(ID)

    expect(await token.balanceOf(alice.address)).to.equal(10_000_000n)
    expect((await escrow.pots(ID)).settled).to.equal(true)
  })

  it('blocks lock after settle', async () => {
    const { escrow, oracle, alice, bob } = await deploy()
    await escrow.connect(alice).lock(ID, STAKE)
    await escrow.connect(bob).lock(ID, STAKE)
    await escrow.settle(ID, 1, await signSettle(escrow, oracle, ID, 1))
    await expect(escrow.connect(alice).lock(ID, STAKE)).to.be.revertedWith('settled')
  })

  it('follows the app sequence: approve → lock → lock → signed settle', async () => {
    const { escrow, token, oracle, alice, bob } = await deploy()
    const escrowAddr = await escrow.getAddress()

    // Same two txs the Mini App sends: approve, then lock(matchId, stakeUnits)
    await token.connect(alice).approve(escrowAddr, STAKE)
    await escrow.connect(alice).lock(ID, STAKE)
    await token.connect(bob).approve(escrowAddr, STAKE)
    await escrow.connect(bob).lock(ID, STAKE)

    // Server verifies the game off-chain, then signs. Winner submits settle.
    const sig = await signSettle(escrow, oracle, ID, 1)
    const tx = await escrow.connect(alice).settle(ID, 1, sig)
    await tx.wait()

    expect(await token.balanceOf(alice.address)).to.equal(10_000_000n + STAKE)
    expect(await token.balanceOf(escrowAddr)).to.equal(0n)
  })

  it('accepts the exact lock calldata the web app builds', async () => {
    const { encodeLock } = await import('../../apps/api/src/abi.ts')
    const { escrow, alice } = await deploy()
    const data = encodeLock('9cc5fd42284bd918', STAKE)
    await alice.sendTransaction({ to: await escrow.getAddress(), data })
    const pot = await escrow.pots(ID)
    expect(pot.playerA).to.equal(alice.address)
    expect(pot.amount).to.equal(STAKE)
    expect(pot.deposits).to.equal(1n)
  })
})
