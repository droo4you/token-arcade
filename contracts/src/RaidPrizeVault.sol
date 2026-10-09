// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @notice Pre-funded ERC-721 prizes for raids whose results are adjudicated offchain.
/// @dev The owner is a trusted settlement authority. Awarding a winner cannot be undone.
contract RaidPrizeVault is Ownable2Step, ReentrancyGuard, IERC721Receiver {
    enum Status { None, Registered, Deposited, Awarded, Claimed, Cancelled, Refunded }

    struct Prize {
        bytes32 gameId;
        address communityAsset;
        address collection;
        uint256 tokenId;
        address depositor;
        address winner;
        Status status;
    }

    mapping(bytes32 => Prize) public prizes;

    address private expectedCollection;
    address private expectedDepositor;
    uint256 private expectedTokenId;

    event RaidRegistered(bytes32 indexed raidId, bytes32 indexed gameId, address indexed collection, address communityAsset);
    event PrizeDeposited(bytes32 indexed raidId, address indexed depositor, address indexed collection, uint256 tokenId);
    event PrizeAwarded(bytes32 indexed raidId, address indexed winner);
    event PrizeClaimed(bytes32 indexed raidId, address indexed winner, address indexed to);
    event RaidCancelled(bytes32 indexed raidId);
    event PrizeRefunded(bytes32 indexed raidId, address indexed depositor, address indexed to);

    error InvalidRaid();
    error InvalidStatus();
    error NotWinner();
    error NotDepositor();
    error UnexpectedNFT();
    error OwnershipRenouncementDisabled();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @dev Renouncing would strand deposited prizes that have not been awarded or cancelled.
    function renounceOwnership() public override onlyOwner {
        revert OwnershipRenouncementDisabled();
    }

    function registerRaid(bytes32 raidId, bytes32 gameId, address communityAsset, address collection)
        external onlyOwner
    {
        if (
            raidId == bytes32(0) || gameId == bytes32(0) || communityAsset == address(0) ||
            collection == address(0) || prizes[raidId].status != Status.None
        ) revert InvalidRaid();
        prizes[raidId] = Prize(gameId, communityAsset, collection, 0, address(0), address(0), Status.Registered);
        emit RaidRegistered(raidId, gameId, collection, communityAsset);
    }

    /// @notice The NFT holder calls this after approving the vault for this token.
    function depositPrize(bytes32 raidId, uint256 tokenId) external nonReentrant {
        Prize storage prize = prizes[raidId];
        if (prize.status != Status.Registered) revert InvalidStatus();
        expectedCollection = prize.collection;
        expectedDepositor = msg.sender;
        expectedTokenId = tokenId;

        IERC721(prize.collection).safeTransferFrom(msg.sender, address(this), tokenId);
        if (IERC721(prize.collection).ownerOf(tokenId) != address(this)) revert UnexpectedNFT();

        expectedCollection = address(0);
        expectedDepositor = address(0);
        expectedTokenId = 0;
        prize.tokenId = tokenId;
        prize.depositor = msg.sender;
        prize.status = Status.Deposited;
        emit PrizeDeposited(raidId, msg.sender, prize.collection, tokenId);
    }

    /// @dev Reject safe transfers that did not originate from depositPrize.
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata)
        external view override returns (bytes4)
    {
        if (
            msg.sender != expectedCollection || operator != address(this) ||
            from != expectedDepositor || tokenId != expectedTokenId
        ) revert UnexpectedNFT();
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice Call only after the offchain result verifier and raid rules determine the winner.
    function awardPrize(bytes32 raidId, address winner) external onlyOwner {
        Prize storage prize = prizes[raidId];
        if (prize.status != Status.Deposited) revert InvalidStatus();
        if (winner == address(0)) revert InvalidRaid();
        prize.winner = winner;
        prize.status = Status.Awarded;
        emit PrizeAwarded(raidId, winner);
    }

    /// @notice The awarded winner can choose an NFT-capable recipient wallet.
    function claimPrize(bytes32 raidId, address to) external nonReentrant {
        Prize storage prize = prizes[raidId];
        if (prize.status != Status.Awarded) revert InvalidStatus();
        if (msg.sender != prize.winner) revert NotWinner();
        if (to == address(0)) revert InvalidRaid();
        prize.status = Status.Claimed;
        IERC721(prize.collection).safeTransferFrom(address(this), to, prize.tokenId);
        emit PrizeClaimed(raidId, msg.sender, to);
    }

    /// @notice Cancellation is permitted only before a winner is awarded.
    function cancelRaid(bytes32 raidId) external onlyOwner {
        Prize storage prize = prizes[raidId];
        if (prize.status != Status.Registered && prize.status != Status.Deposited) revert InvalidStatus();
        prize.status = Status.Cancelled;
        emit RaidCancelled(raidId);
    }

    /// @notice A cancelled raid returns its deposited NFT to an address chosen by the depositor.
    function claimRefund(bytes32 raidId, address to) external nonReentrant {
        Prize storage prize = prizes[raidId];
        if (prize.status != Status.Cancelled) revert InvalidStatus();
        if (prize.depositor == address(0) || msg.sender != prize.depositor) revert NotDepositor();
        if (to == address(0)) revert InvalidRaid();
        prize.status = Status.Refunded;
        IERC721(prize.collection).safeTransferFrom(address(this), to, prize.tokenId);
        emit PrizeRefunded(raidId, msg.sender, to);
    }
}
