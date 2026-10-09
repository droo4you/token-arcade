// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A deliberately basic, fixed-supply game token for the Metropolis demo.
/// @dev Future game economies should use their own reviewed implementation rather than assume this model.
contract ExperimentalMinicoin is ERC20 {
    enum CommunityAssetType { None, ERC20, ERC721, ERC1155 }

    struct Config {
        bytes32 gameId;
        string name;
        string symbol;
        string metadataURI;
        CommunityAssetType communityAssetType;
        address communityAsset;
        uint256 communityTokenId;
        bytes32 strategyRef;
        address treasury;
        address supplyRecipient;
        uint256 initialSupply;
    }

    bytes32 public immutable gameId;
    address public immutable creator;
    address public immutable treasury;
    address public immutable communityAsset;
    uint8 public immutable communityAssetType;
    uint256 public immutable communityTokenId;
    bytes32 public immutable strategyRef;
    address public immutable factory;
    string public metadataURI;

    bool public constant EXPERIMENTAL = true;

    constructor(Config memory config, address creator_) ERC20(config.name, config.symbol) {
        gameId = config.gameId;
        creator = creator_;
        treasury = config.treasury;
        communityAsset = config.communityAsset;
        communityAssetType = uint8(config.communityAssetType);
        communityTokenId = config.communityTokenId;
        strategyRef = config.strategyRef;
        factory = msg.sender;
        metadataURI = config.metadataURI;
        _mint(config.supplyRecipient, config.initialSupply);
    }
}
