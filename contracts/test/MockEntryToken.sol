// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockEntryToken is ERC20 {
    bool public rejectTransfers;
    function setRejectTransfers(bool reject) external { rejectTransfers = reject; }
    function _update(address from, address to, uint256 amount) internal override {
        require(!rejectTransfers || from == address(0), "transfer rejected");
        super._update(from, to, amount);
    }
    constructor() ERC20("Entry Token", "ENTRY") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
