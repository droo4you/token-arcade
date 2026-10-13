// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IMiniCoinFeeSource {
    function wmon() external view returns (address);
    function economyManager() external view returns (address);
    function accrued(bytes32 poolId) external view returns (uint256);
    function collect(bytes32 poolId, address recipient, uint256 amount) external;
}

/// @notice Sends a pool's collected WMON hook fees to fixed, per-pool destinations.
/// @dev A pool may be configured once. Strategy failures are outside the swap path.
contract EconomyManager is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Allocation {
        address prizeVault;
        address communityRecipient;
        address treasuryRecipient;
        uint16 prizeBps;
        uint16 communityBps;
        uint16 treasuryBps;
        bool configured;
    }

    IERC20 public immutable wmon;
    IMiniCoinFeeSource public feeSource;
    mapping(bytes32 => Allocation) public allocations;

    event PoolConfigured(
        bytes32 indexed poolId,
        address indexed prizeVault,
        address indexed communityRecipient,
        address treasuryRecipient,
        uint16 prizeBps,
        uint16 communityBps,
        uint16 treasuryBps
    );
    event FeeSourceSet(address indexed feeSource);
    event Distributed(bytes32 indexed poolId, uint256 total, uint256 prize, uint256 community, uint256 treasury);

    error InvalidConfiguration();
    error NothingToDistribute();
    error FeeCollectionMismatch();
    error OwnershipRenouncementDisabled();

    constructor(address initialOwner, address wmon_) Ownable(initialOwner) {
        if (wmon_ == address(0)) revert InvalidConfiguration();
        wmon = IERC20(wmon_);
    }

    function renounceOwnership() public override onlyOwner {
        revert OwnershipRenouncementDisabled();
    }

    /// @notice The hook address is set once, after its permissioned CREATE2 deployment.
    function setFeeSource(address feeSource_) external onlyOwner {
        if (address(feeSource) != address(0) || feeSource_ == address(0) || feeSource_.code.length == 0) {
            revert InvalidConfiguration();
        }
        IMiniCoinFeeSource source = IMiniCoinFeeSource(feeSource_);
        if (source.wmon() != address(wmon) || source.economyManager() != address(this)) {
            revert InvalidConfiguration();
        }
        feeSource = source;
        emit FeeSourceSet(feeSource_);
    }

    /// @notice Finalizes a pool's recipients and split. A migration needs a new pool.
    function configurePool(
        bytes32 poolId,
        address prizeVault,
        address communityRecipient,
        address treasuryRecipient,
        uint16 prizeBps,
        uint16 communityBps,
        uint16 treasuryBps
    ) external onlyOwner {
        if (
            poolId == bytes32(0) || allocations[poolId].configured || prizeVault == address(0) ||
            communityRecipient == address(0) || treasuryRecipient == address(0) ||
            uint256(prizeBps) + communityBps + treasuryBps != 10_000
        ) revert InvalidConfiguration();
        allocations[poolId] = Allocation({
            prizeVault: prizeVault,
            communityRecipient: communityRecipient,
            treasuryRecipient: treasuryRecipient,
            prizeBps: prizeBps,
            communityBps: communityBps,
            treasuryBps: treasuryBps,
            configured: true
        });
        emit PoolConfigured(
            poolId, prizeVault, communityRecipient, treasuryRecipient,
            prizeBps, communityBps, treasuryBps
        );
    }

    /// @notice Anyone may allocate accrued WMON after the swap has finished.
    function distribute(bytes32 poolId) external nonReentrant {
        Allocation memory a = allocations[poolId];
        if (!a.configured || address(feeSource) == address(0)) revert InvalidConfiguration();
        uint256 amount = feeSource.accrued(poolId);
        if (amount == 0) revert NothingToDistribute();

        uint256 beforeBalance = wmon.balanceOf(address(this));
        feeSource.collect(poolId, address(this), amount);
        if (wmon.balanceOf(address(this)) - beforeBalance != amount) revert FeeCollectionMismatch();

        uint256 community = Math.mulDiv(amount, a.communityBps, 10_000);
        uint256 treasury = Math.mulDiv(amount, a.treasuryBps, 10_000);
        // Keep integer rounding dust in the raid funding allocation.
        uint256 prize = amount - community - treasury;
        if (prize != 0) wmon.safeTransfer(a.prizeVault, prize);
        if (community != 0) wmon.safeTransfer(a.communityRecipient, community);
        if (treasury != 0) wmon.safeTransfer(a.treasuryRecipient, treasury);
        emit Distributed(poolId, amount, prize, community, treasury);
    }
}
