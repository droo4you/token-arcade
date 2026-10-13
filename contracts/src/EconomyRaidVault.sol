// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice One MiniCoin's WMON-funded, free-entry Economy Raids.
/// @dev WMON may be transferred directly to this vault by an EconomyManager. The owner is
///      the trusted offchain score-verification and settlement authority for v0. A
///      settlement can award only the WMON already locked for its specific raid.
contract EconomyRaidVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_PRIZE_BPS = 2_500;

    enum Status { None, Open, Settled, Claimed, Cancelled, TimedOut, Expired }

    struct Config {
        uint256 threshold;
        uint256 maxPrize;
        uint16 prizeBps;
        uint64 cooldown;
        uint64 duration;
        uint64 settlementTimeout;
        uint64 claimWindow;
        bytes32 rulesHash;
    }

    struct Raid {
        bytes32 rulesHash;
        bytes32 resultHash;
        uint256 prize;
        uint256 startsAt;
        uint256 endsAt;
        uint256 settleBy;
        uint256 claimWindow;
        uint256 claimDeadline;
        address winner;
        Status status;
    }

    IERC20 public immutable wmon;
    address public immutable minicoin;
    bytes32 public immutable gameId;

    Config public config;
    mapping(bytes32 => Raid) public raids;
    bytes32 public activeRaidId;
    uint256 public nextRaidNonce;
    uint256 public nextOpenAt;
    uint256 public lockedBalance;

    event ConfigUpdated(
        uint256 threshold,
        uint256 maxPrize,
        uint16 prizeBps,
        uint64 cooldown,
        uint64 duration,
        uint64 settlementTimeout,
        uint64 claimWindow,
        bytes32 rulesHash
    );
    event RaidOpened(
        bytes32 indexed raidId,
        bytes32 indexed gameId,
        address indexed minicoin,
        uint256 prize,
        uint256 startsAt,
        uint256 endsAt,
        uint256 settleBy,
        bytes32 rulesHash
    );
    event RaidSettled(bytes32 indexed raidId, address indexed winner, uint256 prize, bytes32 resultHash, uint256 claimDeadline);
    event PrizeClaimed(bytes32 indexed raidId, address indexed winner, address indexed to, uint256 amount);
    event RaidCancelled(bytes32 indexed raidId, uint256 returnedToFree);
    event RaidTimedOut(bytes32 indexed raidId, uint256 returnedToFree);
    event PrizeExpired(bytes32 indexed raidId, uint256 returnedToFree);

    error InvalidVault();
    error InvalidConfig();
    error InvalidRaid();
    error InvalidStatus();
    error InsufficientFreeBalance();
    error Insolvent();
    error NotWinner();
    error OwnershipRenouncementDisabled();

    constructor(address initialOwner, address wmon_, address minicoin_, bytes32 gameId_, Config memory initialConfig)
        Ownable(initialOwner)
    {
        if (
            wmon_ == address(0) || minicoin_ == address(0) || wmon_ == minicoin_ ||
            wmon_.code.length == 0 || minicoin_.code.length == 0 || gameId_ == bytes32(0)
        ) revert InvalidVault();
        wmon = IERC20(wmon_);
        minicoin = minicoin_;
        gameId = gameId_;
        _setConfig(initialConfig);
    }

    function renounceOwnership() public override onlyOwner {
        revert OwnershipRenouncementDisabled();
    }

    /// @notice Updates only future raids; open raids retain their rule and time snapshots.
    function setConfig(Config calldata nextConfig) external onlyOwner {
        _setConfig(nextConfig);
    }

    function _setConfig(Config memory nextConfig) private {
        if (
            nextConfig.threshold == 0 || nextConfig.maxPrize == 0 ||
            nextConfig.prizeBps == 0 || nextConfig.prizeBps > MAX_PRIZE_BPS ||
            nextConfig.duration == 0 || nextConfig.settlementTimeout == 0 ||
            nextConfig.claimWindow == 0 || nextConfig.rulesHash == bytes32(0)
        ) revert InvalidConfig();
        config = nextConfig;
        emit ConfigUpdated(
            nextConfig.threshold,
            nextConfig.maxPrize,
            nextConfig.prizeBps,
            nextConfig.cooldown,
            nextConfig.duration,
            nextConfig.settlementTimeout,
            nextConfig.claimWindow,
            nextConfig.rulesHash
        );
    }

    /// @notice All WMON not reserved for an existing raid is available, including direct deposits.
    function freeBalance() public view returns (uint256) {
        uint256 balance = wmon.balanceOf(address(this));
        if (balance < lockedBalance) revert Insolvent();
        return balance - lockedBalance;
    }

    /// @notice Permissionless VaultThreshold trigger. Entry never requires a payment.
    function openEconomyRaid() external returns (bytes32 raidId) {
        if (activeRaidId != bytes32(0) || block.timestamp < nextOpenAt) revert InvalidStatus();
        uint256 free = freeBalance();
        Config memory c = config;
        if (free < c.threshold) revert InsufficientFreeBalance();

        uint256 prize = Math.min(Math.mulDiv(free, c.prizeBps, 10_000), c.maxPrize);
        if (prize == 0) revert InsufficientFreeBalance();

        uint256 nonce = ++nextRaidNonce;
        raidId = keccak256(abi.encode(block.chainid, address(this), gameId, nonce));
        uint256 startsAt = block.timestamp;
        uint256 endsAt = startsAt + c.duration;
        uint256 settleBy = endsAt + c.settlementTimeout;

        raids[raidId] = Raid({
            rulesHash: c.rulesHash,
            resultHash: bytes32(0),
            prize: prize,
            startsAt: startsAt,
            endsAt: endsAt,
            settleBy: settleBy,
            claimWindow: c.claimWindow,
            claimDeadline: 0,
            winner: address(0),
            status: Status.Open
        });
        activeRaidId = raidId;
        nextOpenAt = endsAt + c.cooldown;
        lockedBalance += prize;

        emit RaidOpened(raidId, gameId, minicoin, prize, startsAt, endsAt, settleBy, c.rulesHash);
    }

    /// @notice Owner attests to an offchain verified winner and result artifact after the raid.
    function settleRaid(bytes32 raidId, address winner, bytes32 resultHash) external onlyOwner {
        Raid storage raid = raids[raidId];
        if (raid.status != Status.Open || block.timestamp < raid.endsAt || block.timestamp >= raid.settleBy) {
            revert InvalidStatus();
        }
        if (winner == address(0) || resultHash == bytes32(0)) revert InvalidRaid();

        raid.winner = winner;
        raid.resultHash = resultHash;
        raid.claimDeadline = block.timestamp + raid.claimWindow;
        raid.status = Status.Settled;
        activeRaidId = bytes32(0);
        emit RaidSettled(raidId, winner, raid.prize, resultHash, raid.claimDeadline);
    }

    /// @notice Winner claims the reserved WMON to a wallet of their choice before expiry.
    function claimPrize(bytes32 raidId, address to) external nonReentrant {
        Raid storage raid = raids[raidId];
        if (raid.status != Status.Settled || block.timestamp >= raid.claimDeadline) revert InvalidStatus();
        if (msg.sender != raid.winner) revert NotWinner();
        if (to == address(0)) revert InvalidRaid();

        uint256 amount = raid.prize;
        raid.status = Status.Claimed;
        lockedBalance -= amount;
        wmon.safeTransfer(to, amount);
        emit PrizeClaimed(raidId, msg.sender, to, amount);
    }

    /// @notice Owner can cancel an unsettled raid when verification or game rules fail.
    function cancelRaid(bytes32 raidId) external onlyOwner {
        Raid storage raid = raids[raidId];
        if (raid.status != Status.Open) revert InvalidStatus();
        raid.status = Status.Cancelled;
        activeRaidId = bytes32(0);
        lockedBalance -= raid.prize;
        emit RaidCancelled(raidId, raid.prize);
    }

    /// @notice Anyone can release a raid's WMON if no settlement arrives by its deadline.
    function timeoutRaid(bytes32 raidId) external {
        Raid storage raid = raids[raidId];
        if (raid.status != Status.Open || block.timestamp < raid.settleBy) revert InvalidStatus();
        raid.status = Status.TimedOut;
        activeRaidId = bytes32(0);
        lockedBalance -= raid.prize;
        emit RaidTimedOut(raidId, raid.prize);
    }

    /// @notice Anyone can return an unclaimed prize to free vault funds after its claim window.
    function expirePrize(bytes32 raidId) external {
        Raid storage raid = raids[raidId];
        if (raid.status != Status.Settled || block.timestamp < raid.claimDeadline) revert InvalidStatus();
        raid.status = Status.Expired;
        lockedBalance -= raid.prize;
        emit PrizeExpired(raidId, raid.prize);
    }
}
