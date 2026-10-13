// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

interface IAccumulatorHook {
    function feeAccumulator() external view returns (address);
    function poolManager() external view returns (address);
    function wmon() external view returns (address);
}

/// @notice Custodies one hook's WMON fees as v4 ERC-6909 claims until distribution.
/// @dev The hook credits claims without calling this contract during swaps.
contract FeeAccumulator is Ownable2Step, ReentrancyGuard, IUnlockCallback {
    IPoolManager public immutable poolManager;
    address public immutable wmon;
    address public hook;
    bool private redeeming;

    event HookSet(address indexed hook);
    event Redeemed(address indexed recipient, uint256 amount);
    error InvalidConfiguration();
    error Unauthorized();

    constructor(address initialOwner, IPoolManager poolManager_, address wmon_) Ownable(initialOwner) {
        if (address(poolManager_).code.length == 0 || wmon_.code.length == 0) revert InvalidConfiguration();
        poolManager = poolManager_;
        wmon = wmon_;
    }

    function setHook(address hook_) external onlyOwner {
        if (hook != address(0) || hook_.code.length == 0) revert InvalidConfiguration();
        IAccumulatorHook candidate = IAccumulatorHook(hook_);
        if (candidate.feeAccumulator() != address(this) || candidate.poolManager() != address(poolManager)
            || candidate.wmon() != wmon) revert InvalidConfiguration();
        hook = hook_;
        emit HookSet(hook_);
    }

    function redeem(address recipient, uint256 amount) external nonReentrant {
        if (msg.sender != hook) revert Unauthorized();
        if (recipient == address(0) || amount == 0) revert InvalidConfiguration();
        redeeming = true;
        poolManager.unlock(abi.encode(recipient, amount));
        redeeming = false;
        emit Redeemed(recipient, amount);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager) || !redeeming) revert Unauthorized();
        (address recipient, uint256 amount) = abi.decode(data, (address, uint256));
        poolManager.burn(address(this), uint256(uint160(wmon)), amount);
        poolManager.take(Currency.wrap(wmon), recipient, amount);
        return "";
    }
}
