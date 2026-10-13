// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockFeeSource {
    using SafeERC20 for IERC20;

    IERC20 public immutable wmon;
    address public economyManager;
    mapping(bytes32 => uint256) public accrued;

    constructor(address wmon_) {
        wmon = IERC20(wmon_);
    }

    function setManager(address manager_) external {
        require(economyManager == address(0), "configured");
        economyManager = manager_;
    }

    function fund(bytes32 poolId, uint256 amount) external {
        wmon.safeTransferFrom(msg.sender, address(this), amount);
        accrued[poolId] += amount;
    }

    function collect(bytes32 poolId, address recipient, uint256 amount) external {
        require(msg.sender == economyManager, "manager only");
        accrued[poolId] -= amount;
        wmon.safeTransfer(recipient, amount);
    }
}
