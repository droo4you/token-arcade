// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/// @notice Escrows one fixed entry amount per payment, then routes a settled raid's total.
/// @dev The owner decides whether a raid is settled or cancelled. Backend verification and
///      attempt limits remain offchain. ERC-20 assets must transfer their exact face amount.
contract EntryFeeRouter is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { None, Open, Settled, Cancelled }

    struct RouteConfig {
        bytes32 raidId;
        bytes32 gameId;
        address communityAsset;
        address asset; // address(0) means the chain's native coin (MON on Monad).
        uint256 entryAmount;
        uint64 startsAt;
        uint64 endsAt;
        address prizeRecipient;
        address communityRecipient;
        address treasuryRecipient;
        uint16 prizeBps;
        uint16 communityBps;
        uint16 treasuryBps;
    }

    struct Route {
        bytes32 gameId;
        address communityAsset;
        address asset;
        uint256 entryAmount;
        uint64 startsAt;
        uint64 endsAt;
        address prizeRecipient;
        address communityRecipient;
        address treasuryRecipient;
        uint16 prizeBps;
        uint16 communityBps;
        uint16 treasuryBps;
        uint256 collected;
        bool accepting;
        Status status;
    }

    mapping(bytes32 => Route) private routes;
    mapping(bytes32 => mapping(address => uint256)) public paidBy;
    mapping(address => mapping(address => uint256)) public withdrawable;

    event RouteRegistered(bytes32 indexed raidId, bytes32 indexed gameId, address indexed asset, address communityAsset, uint256 entryAmount);
    event AcceptingChanged(bytes32 indexed raidId, bool accepting);
    event EntryPaid(bytes32 indexed raidId, address indexed payer, address indexed asset, uint256 amount);
    event RouteSettled(bytes32 indexed raidId, uint256 prizeAmount, uint256 communityAmount, uint256 treasuryAmount);
    event RouteCancelled(bytes32 indexed raidId);
    event EntryRefunded(bytes32 indexed raidId, address indexed payer, address indexed to, uint256 amount);
    event Withdrawn(address indexed asset, address indexed recipient, address indexed to, uint256 amount);

    error InvalidRoute();
    error InvalidStatus();
    error InvalidPayment();
    error NothingToClaim();
    error OwnershipRenouncementDisabled();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function getRoute(bytes32 raidId) external view returns (Route memory) {
        return routes[raidId];
    }

    function renounceOwnership() public override onlyOwner {
        revert OwnershipRenouncementDisabled();
    }

    function registerRoute(RouteConfig calldata c) external onlyOwner {
        if (
            c.raidId == bytes32(0) || c.gameId == bytes32(0) || c.communityAsset == address(0) || c.entryAmount == 0 ||
            c.startsAt >= c.endsAt || c.endsAt <= block.timestamp ||
            c.prizeRecipient == address(0) || c.communityRecipient == address(0) ||
            c.treasuryRecipient == address(0) || routes[c.raidId].status != Status.None ||
            uint256(c.prizeBps) + c.communityBps + c.treasuryBps != 10_000
        ) revert InvalidRoute();
        routes[c.raidId] = Route({
            gameId: c.gameId,
            communityAsset: c.communityAsset,
            asset: c.asset,
            entryAmount: c.entryAmount,
            startsAt: c.startsAt,
            endsAt: c.endsAt,
            prizeRecipient: c.prizeRecipient,
            communityRecipient: c.communityRecipient,
            treasuryRecipient: c.treasuryRecipient,
            prizeBps: c.prizeBps,
            communityBps: c.communityBps,
            treasuryBps: c.treasuryBps,
            collected: 0,
            accepting: true,
            status: Status.Open
        });
        emit RouteRegistered(c.raidId, c.gameId, c.asset, c.communityAsset, c.entryAmount);
    }

    function setAccepting(bytes32 raidId, bool accepting) external onlyOwner {
        Route storage route = routes[raidId];
        if (route.status != Status.Open) revert InvalidStatus();
        route.accepting = accepting;
        emit AcceptingChanged(raidId, accepting);
    }

    /// @notice Each call pays for one entry. The backend binds an EntryPaid log to a run.
    function payEntry(bytes32 raidId) external payable nonReentrant {
        Route storage route = routes[raidId];
        if (
            route.status != Status.Open || !route.accepting ||
            block.timestamp < route.startsAt || block.timestamp >= route.endsAt
        ) revert InvalidStatus();
        uint256 amount = route.entryAmount;
        if (route.asset == address(0)) {
            if (msg.value != amount) revert InvalidPayment();
        } else {
            if (msg.value != 0) revert InvalidPayment();
            IERC20 asset = IERC20(route.asset);
            uint256 beforeBalance = asset.balanceOf(address(this));
            asset.safeTransferFrom(msg.sender, address(this), amount);
            if (asset.balanceOf(address(this)) - beforeBalance != amount) revert InvalidPayment();
        }
        paidBy[raidId][msg.sender] += amount;
        route.collected += amount;
        emit EntryPaid(raidId, msg.sender, route.asset, amount);
    }

    /// @notice Splits all collected entries after the raid ends; recipients withdraw separately.
    function settleRoute(bytes32 raidId) external onlyOwner {
        Route storage route = routes[raidId];
        if (route.status != Status.Open || block.timestamp <= route.endsAt) revert InvalidStatus();
        route.status = Status.Settled;
        uint256 prizeAmount = Math.mulDiv(route.collected, route.prizeBps, 10_000);
        uint256 communityAmount = Math.mulDiv(route.collected, route.communityBps, 10_000);
        uint256 treasuryAmount = route.collected - prizeAmount - communityAmount;
        withdrawable[route.asset][route.prizeRecipient] += prizeAmount;
        withdrawable[route.asset][route.communityRecipient] += communityAmount;
        withdrawable[route.asset][route.treasuryRecipient] += treasuryAmount;
        emit RouteSettled(raidId, prizeAmount, communityAmount, treasuryAmount);
    }

    /// @notice Before settlement, the owner can cancel and let every payer reclaim their entries.
    function cancelRoute(bytes32 raidId) external onlyOwner {
        Route storage route = routes[raidId];
        if (route.status != Status.Open) revert InvalidStatus();
        route.status = Status.Cancelled;
        emit RouteCancelled(raidId);
    }

    function claimRefund(bytes32 raidId, address to) external nonReentrant {
        Route storage route = routes[raidId];
        if (route.status != Status.Cancelled) revert InvalidStatus();
        if (to == address(0)) revert InvalidRoute();
        uint256 amount = paidBy[raidId][msg.sender];
        if (amount == 0) revert NothingToClaim();
        paidBy[raidId][msg.sender] = 0;
        _send(route.asset, to, amount);
        emit EntryRefunded(raidId, msg.sender, to, amount);
    }

    function withdraw(address asset, address to) external nonReentrant {
        if (to == address(0)) revert InvalidRoute();
        uint256 amount = withdrawable[asset][msg.sender];
        if (amount == 0) revert NothingToClaim();
        withdrawable[asset][msg.sender] = 0;
        _send(asset, to, amount);
        emit Withdrawn(asset, msg.sender, to, amount);
    }

    function _send(address asset, address to, uint256 amount) private {
        if (asset == address(0)) {
            Address.sendValue(payable(to), amount);
        } else {
            IERC20(asset).safeTransfer(to, amount);
        }
    }
}
