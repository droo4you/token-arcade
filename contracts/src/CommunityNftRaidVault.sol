// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @notice Anyone can sponsor a free NFT raid using an operator-approved Cabinet template.
/// @dev An operator-purchased NFT uses the same deposit path as a community member's NFT.
/// Scores remain offchain; the snapshotted signer may award only the deposited NFT.
contract CommunityNftRaidVault is Ownable2Step, ReentrancyGuard, IERC721Receiver {
    enum Status { None, Open, Awarded, Claimed, Refundable, Refunded }
    struct Template {
        address collection;
        address signer;
        bytes32 rulesHash;
        uint64 duration;
        uint64 settlementTimeout;
        uint64 claimWindow;
        bool enabled;
    }
    struct Raid {
        bytes32 gameId;
        address collection;
        uint256 tokenId;
        address depositor;
        address signer;
        address winner;
        bytes32 rulesHash;
        bytes32 resultHash;
        uint256 endsAt;
        uint256 settleBy;
        uint256 claimWindow;
        uint256 claimDeadline;
        Status status;
    }
    mapping(bytes32 => Template) public templates;
    mapping(bytes32 => Raid) public raids;
    mapping(bytes32 => bytes32) public activeRaid;
    uint256 public nonce;
    bytes32 private receivingRaid;

    event TemplateSet(bytes32 indexed gameId, address indexed collection, address signer, bytes32 rulesHash, bool enabled);
    event RaidOpened(bytes32 indexed raidId, bytes32 indexed gameId, address indexed depositor,
        address collection, uint256 tokenId, uint256 startsAt, uint256 endsAt, bytes32 rulesHash);
    event Awarded(bytes32 indexed raidId, address indexed winner, bytes32 resultHash, uint256 claimDeadline);
    event Claimed(bytes32 indexed raidId, address indexed to);
    event RefundAvailable(bytes32 indexed raidId);
    event Refunded(bytes32 indexed raidId, address indexed to);
    error InvalidConfiguration();
    error InvalidStatus();
    error Unauthorized();
    error UnexpectedNFT();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function renounceOwnership() public override onlyOwner { revert Unauthorized(); }

    function setTemplate(bytes32 gameId, Template calldata t) external onlyOwner {
        if (gameId == bytes32(0) || t.collection.code.length == 0 || t.signer == address(0)
            || t.rulesHash == bytes32(0) || t.duration == 0 || t.settlementTimeout == 0
            || t.claimWindow == 0) revert InvalidConfiguration();
        templates[gameId] = t;
        emit TemplateSet(gameId, t.collection, t.signer, t.rulesHash, t.enabled);
    }

    /// @notice Approve this vault for the NFT first. Deposit and opening are atomic.
    function createRaid(bytes32 gameId, uint256 tokenId) external nonReentrant returns (bytes32 raidId) {
        Template memory t = templates[gameId];
        if (!t.enabled || activeRaid[gameId] != bytes32(0)) revert InvalidStatus();
        raidId = keccak256(abi.encode(block.chainid, address(this), gameId, ++nonce));
        uint256 endsAt = block.timestamp + t.duration;
        raids[raidId] = Raid(gameId, t.collection, tokenId, msg.sender, t.signer, address(0),
            t.rulesHash, bytes32(0), endsAt, endsAt + t.settlementTimeout, t.claimWindow, 0, Status.Open);
        activeRaid[gameId] = raidId;
        receivingRaid = raidId;
        IERC721(t.collection).safeTransferFrom(msg.sender, address(this), tokenId);
        if (IERC721(t.collection).ownerOf(tokenId) != address(this)) revert UnexpectedNFT();
        receivingRaid = bytes32(0);
        emit RaidOpened(raidId, gameId, msg.sender, t.collection, tokenId, block.timestamp, endsAt, t.rulesHash);
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata)
        external view returns (bytes4)
    {
        Raid storage r = raids[receivingRaid];
        if (receivingRaid == bytes32(0) || msg.sender != r.collection || operator != address(this)
            || from != r.depositor || tokenId != r.tokenId) revert UnexpectedNFT();
        return IERC721Receiver.onERC721Received.selector;
    }

    function settleRaid(bytes32 raidId, address winner, bytes32 resultHash) external {
        Raid storage r = raids[raidId];
        if (msg.sender != r.signer) revert Unauthorized();
        if (r.status != Status.Open || block.timestamp < r.endsAt || block.timestamp >= r.settleBy) revert InvalidStatus();
        if (winner == address(0) || resultHash == bytes32(0)) revert InvalidConfiguration();
        r.winner = winner;
        r.resultHash = resultHash;
        r.claimDeadline = block.timestamp + r.claimWindow;
        r.status = Status.Awarded;
        activeRaid[r.gameId] = bytes32(0);
        emit Awarded(raidId, winner, resultHash, r.claimDeadline);
    }

    function claimPrize(bytes32 raidId, address to) external nonReentrant {
        Raid storage r = raids[raidId];
        if (r.status != Status.Awarded || block.timestamp >= r.claimDeadline) revert InvalidStatus();
        if (msg.sender != r.winner || to == address(0)) revert Unauthorized();
        r.status = Status.Claimed;
        IERC721(r.collection).safeTransferFrom(address(this), to, r.tokenId);
        emit Claimed(raidId, to);
    }

    function cancelRaid(bytes32 raidId) external onlyOwner {
        Raid storage r = raids[raidId];
        if (r.status != Status.Open) revert InvalidStatus();
        _refund(raidId, r);
    }

    function timeoutRaid(bytes32 raidId) external {
        Raid storage r = raids[raidId];
        if (r.status != Status.Open || block.timestamp < r.settleBy) revert InvalidStatus();
        _refund(raidId, r);
    }

    function expirePrize(bytes32 raidId) external {
        Raid storage r = raids[raidId];
        if (r.status != Status.Awarded || block.timestamp < r.claimDeadline) revert InvalidStatus();
        // Another raid may already be active after this one settled.
        r.status = Status.Refundable;
        emit RefundAvailable(raidId);
    }

    function _refund(bytes32 raidId, Raid storage r) private {
        r.status = Status.Refundable;
        activeRaid[r.gameId] = bytes32(0);
        emit RefundAvailable(raidId);
    }

    function claimRefund(bytes32 raidId, address to) external nonReentrant {
        Raid storage r = raids[raidId];
        if (r.status != Status.Refundable) revert InvalidStatus();
        if (msg.sender != r.depositor || to == address(0)) revert Unauthorized();
        r.status = Status.Refunded;
        IERC721(r.collection).safeTransferFrom(address(this), to, r.tokenId);
        emit Refunded(raidId, to);
    }
}
