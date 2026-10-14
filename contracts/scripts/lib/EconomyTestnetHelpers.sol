// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
// Testnet/rehearsal-only helpers: a CREATE2 deployer for hook address mining and a minimal
// PoolManager unlock router for seeding liquidity and demo swaps. Not for mainnet use.
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// Imported so the PoolManager ABI/bytecode is available (local rehearsal deploys its own).
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";

/// Local-rehearsal stand-in for WMON (WETH9-style deposit/withdraw). Never deployed to testnet.
contract LocalWMON is ERC20 {
    constructor() ERC20("Wrapped MON (local)", "WMON") {}
    function deposit() public payable { _mint(msg.sender, msg.value); }
    function withdraw(uint256 amount) external { _burn(msg.sender, amount); payable(msg.sender).transfer(amount); }
    receive() external payable { deposit(); }
}

contract EconomyCreate2Deployer {
    event Deployed(address deployed, bytes32 salt);
    function deploy(bytes memory code, bytes32 salt) external returns (address deployed) {
        assembly { deployed := create2(0, add(code, 32), mload(code), salt) }
        require(deployed != address(0), "CREATE2 failed");
        emit Deployed(deployed, salt);
    }
}

contract EconomyTestRouter is IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;
    IPoolManager public immutable manager;
    address public immutable liquidityOwner;
    struct Call { bool liquidity; address payer; PoolKey key; ModifyLiquidityParams liq; SwapParams swapParams; }
    constructor(IPoolManager manager_) {
        require(block.chainid == 10143 || block.chainid == 31337, "test chains only");
        manager = manager_; liquidityOwner = msg.sender;
    }
    function addLiquidity(PoolKey calldata key, int24 tickLower, int24 tickUpper, int256 liquidityDelta) external returns (BalanceDelta delta) {
        require(msg.sender == liquidityOwner, "liquidity owner only");
        Call memory c = Call(true, msg.sender, key, ModifyLiquidityParams(tickLower, tickUpper, liquidityDelta, bytes32(0)), SwapParams(false, 0, 0));
        delta = abi.decode(manager.unlock(abi.encode(c)), (BalanceDelta));
    }
    function swap(PoolKey calldata key, SwapParams calldata params) external returns (BalanceDelta delta) {
        Call memory c = Call(false, msg.sender, key, ModifyLiquidityParams(0, 0, 0, bytes32(0)), params);
        delta = abi.decode(manager.unlock(abi.encode(c)), (BalanceDelta));
    }
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager), "manager only");
        Call memory c = abi.decode(data, (Call));
        BalanceDelta delta;
        if (c.liquidity) (delta,) = manager.modifyLiquidity(c.key, c.liq, "");
        else delta = manager.swap(c.key, c.swapParams, "");
        _settle(c.key.currency0, c.payer, delta.amount0());
        _settle(c.key.currency1, c.payer, delta.amount1());
        return abi.encode(delta);
    }
    function _settle(Currency currency, address payer, int128 amount) private {
        if (amount < 0) {
            manager.sync(currency);
            require(IERC20(Currency.unwrap(currency)).transferFrom(payer, address(manager), uint256(uint128(-amount))));
            manager.settle();
        } else if (amount > 0) {
            manager.take(currency, payer, uint256(uint128(amount)));
        }
    }
}
