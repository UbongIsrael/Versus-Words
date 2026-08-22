// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Two-player USDT pot on Polygon.
/// The contract holds tokens. The server (oracle) only *signs* a winner; it
/// cannot withdraw to itself. After expiry anyone can refund remaining deposits.
interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

contract VersusEscrow {
    IERC20 public immutable token;
    address public immutable oracle;

    struct Pot {
        address playerA;
        address playerB;
        uint96 amount;
        uint64 expiresAt;
        uint8 deposits; // bit0 = A, bit1 = B
        bool settled;
    }

    mapping(bytes32 => Pot) public pots;

    event Locked(bytes32 indexed id, address indexed player, uint96 amount);
    event Settled(bytes32 indexed id, uint8 winner);
    event Refunded(bytes32 indexed id);

    constructor(address token_, address oracle_) {
        require(token_ != address(0) && oracle_ != address(0), "zero");
        token = IERC20(token_);
        oracle = oracle_;
    }

    /// First caller opens the pot. Second caller must lock the same amount.
    function lock(bytes32 id, uint96 amount) external {
        Pot storage p = pots[id];
        require(!p.settled, "settled");
        require(amount > 0, "amount");

        if (p.playerA == address(0)) {
            p.playerA = msg.sender;
            p.amount = amount;
            p.expiresAt = uint64(block.timestamp + 1 days);
            p.deposits = 1;
        } else {
            require(p.playerB == address(0), "full");
            require(msg.sender != p.playerA, "already");
            require(amount == p.amount, "mismatch");
            p.playerB = msg.sender;
            p.deposits = 3;
        }

        require(token.transferFrom(msg.sender, address(this), amount), "xfer");
        emit Locked(id, msg.sender, amount);
    }

    /// winner: 0 = refund both, 1 = pay A, 2 = pay B.
    /// `sig` is the oracle's eth_sign of keccak256(this, id, winner).
    function settle(bytes32 id, uint8 winner, bytes calldata sig) external {
        Pot storage p = pots[id];
        require(!p.settled && p.playerA != address(0), "no");
        require(winner <= 2, "winner");
        bytes32 digest = keccak256(abi.encode(address(this), id, winner));
        require(_recover(digest, sig) == oracle, "sig");
        _payout(p, winner);
        emit Settled(id, winner);
    }

    function timeoutRefund(bytes32 id) external {
        Pot storage p = pots[id];
        require(!p.settled && p.playerA != address(0), "no");
        require(block.timestamp >= p.expiresAt, "early");
        _payout(p, 0);
        emit Refunded(id);
    }

    function _payout(Pot storage p, uint8 winner) internal {
        p.settled = true;
        uint256 amt = uint256(p.amount);
        if (winner == 1 && p.deposits == 3) {
            require(token.transfer(p.playerA, amt * 2), "pay");
        } else if (winner == 2 && p.deposits == 3) {
            require(token.transfer(p.playerB, amt * 2), "pay");
        } else {
            if (p.deposits & 1 != 0) require(token.transfer(p.playerA, amt), "ra");
            if (p.deposits & 2 != 0) require(token.transfer(p.playerB, amt), "rb");
        }
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "siglen");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        bytes32 eth = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        address signer = ecrecover(eth, v, r, s);
        require(signer != address(0), "bad-sig");
        return signer;
    }
}
