// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockPrizeNFT is ERC721 {
    constructor() ERC721("Prize", "PRIZE") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}
