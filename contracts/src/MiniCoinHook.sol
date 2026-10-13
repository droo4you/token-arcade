// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {FeeAccumulator} from "./FeeAccumulator.sol";

/// @notice A single, immutable MiniCoin/WMON v4 pool hook with a WMON-denominated swap fee.
/// @dev The contract address must be CREATE2-mined for BEFORE_INITIALIZE, BEFORE_SWAP,
/// AFTER_SWAP, BEFORE_SWAP_RETURNS_DELTA and AFTER_SWAP_RETURNS_DELTA permissions.
/// Fees are claims held by FeeAccumulator until the immutable EconomyManager collects them.
contract MiniCoinHook is IHooks {
    using BalanceDeltaLibrary for BalanceDelta;

    uint16 public constant MAX_HOOK_FEE_BPS = 500;
    uint16 private constant BPS_DENOMINATOR = 10_000;

    IPoolManager public immutable poolManager;
    IERC20 public immutable wmon;
    address public immutable miniCoin;
    address public immutable economyManager;
    FeeAccumulator public immutable feeAccumulator;
    address public immutable initializer;
    uint24 public immutable lpFee;
    int24 public immutable tickSpacing;
    uint16 public immutable hookFeeBps;
    bytes32 public immutable approvedPoolId;

    mapping(bytes32 poolId => uint256 amount) public accrued;

    event FeeCaptured(bytes32 indexed poolId, uint256 amount);
    event FeeCollected(bytes32 indexed poolId, address indexed recipient, uint256 amount);

    error InvalidConfiguration();
    error InvalidPool();
    error Unauthorized();
    error UnsupportedCallback();
    error FeeExceedsSwapAmount();
    error InsufficientAccrual();

    constructor(
        IPoolManager poolManager_,
        address wmon_,
        address miniCoin_,
        address economyManager_,
        FeeAccumulator feeAccumulator_,
        address initializer_,
        uint24 lpFee_,
        int24 tickSpacing_,
        uint16 hookFeeBps_
    ) {
        if (
            address(poolManager_).code.length == 0 || wmon_.code.length == 0 || miniCoin_.code.length == 0
                || wmon_ == miniCoin_ || economyManager_.code.length == 0 || initializer_ == address(0)
                || lpFee_ > 1_000_000 || tickSpacing_ <= 0 || tickSpacing_ > type(int16).max || hookFeeBps_ == 0
                || hookFeeBps_ > MAX_HOOK_FEE_BPS
        ) revert InvalidConfiguration();
        if (address(feeAccumulator_).code.length == 0 || feeAccumulator_.wmon() != wmon_
            || address(feeAccumulator_.poolManager()) != address(poolManager_)) revert InvalidConfiguration();

        Hooks.validateHookPermissions(
            IHooks(address(this)),
            Hooks.Permissions({
                beforeInitialize: true,
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: true,
                afterSwapReturnDelta: true,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            })
        );

        poolManager = poolManager_;
        wmon = IERC20(wmon_);
        miniCoin = miniCoin_;
        economyManager = economyManager_;
        feeAccumulator = feeAccumulator_;
        initializer = initializer_;
        lpFee = lpFee_;
        tickSpacing = tickSpacing_;
        hookFeeBps = hookFeeBps_;

        (address currency0, address currency1) = miniCoin_ < wmon_ ? (miniCoin_, wmon_) : (wmon_, miniCoin_);
        approvedPoolId = keccak256(
            abi.encode(PoolKey(Currency.wrap(currency0), Currency.wrap(currency1), lpFee_, tickSpacing_, IHooks(address(this))))
        );
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert Unauthorized();
        _;
    }

    function beforeInitialize(address sender, PoolKey calldata key, uint160)
        external
        view
        override
        onlyPoolManager
        returns (bytes4)
    {
        _checkPool(key);
        if (sender != initializer || feeAccumulator.hook() != address(this)) revert Unauthorized();
        return IHooks.beforeInitialize.selector;
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        override
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        bytes32 poolId = _checkPool(key);
        if (!_isWmonSpecified(key, params)) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint256 fee;
        if (params.amountSpecified < 0) {
            if (params.amountSpecified == type(int256).min) revert FeeExceedsSwapAmount();
            uint256 amountIn = uint256(-params.amountSpecified);
            fee = Math.mulDiv(amountIn, hookFeeBps, BPS_DENOMINATOR);
            // A positive specified delta reduces the exact-input amount sent into the pool.
            if (fee >= amountIn) revert FeeExceedsSwapAmount();
        } else {
            // An exact-output trade must still receive its requested net WMON amount.
            // Ask the pool for additional WMON and take only that gross-up as the fee.
            fee = Math.mulDiv(uint256(params.amountSpecified), hookFeeBps, BPS_DENOMINATOR - hookFeeBps, Math.Rounding.Ceil);
        }

        if (fee > uint256(uint128(type(int128).max))) revert FeeExceedsSwapAmount();
        if (fee != 0) {
            poolManager.mint(address(feeAccumulator), uint256(uint160(address(wmon))), fee);
            accrued[poolId] += fee;
            emit FeeCaptured(poolId, fee);
        }
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(fee)), 0), 0);
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        override
        onlyPoolManager
        returns (bytes4, int128)
    {
        bytes32 poolId = _checkPool(key);
        if (_isWmonSpecified(key, params)) return (IHooks.afterSwap.selector, 0);

        int128 wmonDelta = Currency.unwrap(key.currency0) == address(wmon) ? delta.amount0() : delta.amount1();
        uint256 wmonLeg = wmonDelta < 0 ? uint256(-int256(wmonDelta)) : uint256(int256(wmonDelta));
        uint256 fee = Math.mulDiv(wmonLeg, hookFeeBps, BPS_DENOMINATOR);
        if (fee > uint256(uint128(type(int128).max))) revert FeeExceedsSwapAmount();
        if (fee != 0) {
            poolManager.mint(address(feeAccumulator), uint256(uint160(address(wmon))), fee);
            accrued[poolId] += fee;
            emit FeeCaptured(poolId, fee);
        }
        // Positive unspecified delta is charged to the swapper in WMON.
        return (IHooks.afterSwap.selector, int128(int256(fee)));
    }

    /// @notice Transfer previously captured WMON after the swap has finished.
    /// @dev The accumulator redeems claims through a fresh PoolManager unlock.
    function collect(bytes32 poolId, address recipient, uint256 amount) external {
        if (msg.sender != economyManager) revert Unauthorized();
        if (poolId != approvedPoolId || recipient == address(0)) revert InvalidPool();
        uint256 available = accrued[poolId];
        if (amount == 0 || amount > available) revert InsufficientAccrual();
        accrued[poolId] = available - amount;
        feeAccumulator.redeem(recipient, amount);
        emit FeeCollected(poolId, recipient, amount);
    }

    function _checkPool(PoolKey calldata key) private view returns (bytes32 poolId) {
        poolId = keccak256(abi.encode(key));
        if (poolId != approvedPoolId) revert InvalidPool();
    }

    function _isWmonSpecified(PoolKey calldata key, SwapParams calldata params) private view returns (bool) {
        bool specifiedIsCurrency0 = (params.amountSpecified < 0) == params.zeroForOne;
        return specifiedIsCurrency0 == (Currency.unwrap(key.currency0) == address(wmon));
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure override returns (bytes4) { revert UnsupportedCallback(); }
    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata) external pure override returns (bytes4) { revert UnsupportedCallback(); }
    function afterAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata) external pure override returns (bytes4, BalanceDelta) { revert UnsupportedCallback(); }
    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata) external pure override returns (bytes4) { revert UnsupportedCallback(); }
    function afterRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata) external pure override returns (bytes4, BalanceDelta) { revert UnsupportedCallback(); }
    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure override returns (bytes4) { revert UnsupportedCallback(); }
    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure override returns (bytes4) { revert UnsupportedCallback(); }
}
