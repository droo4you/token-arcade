// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ExperimentalMinicoin} from "./ExperimentalMinicoin.sol";

/// @notice Curated, one-Minicoin-per-game deployment for Metropolis.
/// @dev gameId is keccak256(bytes(the registry's canonical game ID)).
contract MinicoinFactory is Ownable2Step {
    mapping(bytes32 => address) public minicoinByGame;

    event MinicoinDeployed(
        bytes32 indexed gameId,
        address indexed minicoin,
        address indexed creator,
        address communityAsset,
        ExperimentalMinicoin.CommunityAssetType communityAssetType,
        uint256 communityTokenId,
        bytes32 strategyRef,
        address treasury,
        address supplyRecipient,
        uint256 initialSupply
    );

    error InvalidDeployment();
    error GameAlreadyHasMinicoin(bytes32 gameId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function deploy(ExperimentalMinicoin.Config calldata d) external onlyOwner returns (address minicoin) {
        if (
            d.gameId == bytes32(0) || bytes(d.name).length == 0 || bytes(d.symbol).length == 0 ||
            d.treasury == address(0) || d.supplyRecipient == address(0)
        ) revert InvalidDeployment();
        if (minicoinByGame[d.gameId] != address(0)) revert GameAlreadyHasMinicoin(d.gameId);
        if (d.communityAssetType == ExperimentalMinicoin.CommunityAssetType.None) {
            if (d.communityAsset != address(0) || d.communityTokenId != 0) revert InvalidDeployment();
        } else {
            if (d.communityAsset == address(0)) revert InvalidDeployment();
            if (d.communityAssetType == ExperimentalMinicoin.CommunityAssetType.ERC20 && d.communityTokenId != 0) {
                revert InvalidDeployment();
            }
        }

        ExperimentalMinicoin token = new ExperimentalMinicoin(d, msg.sender);
        minicoin = address(token);
        minicoinByGame[d.gameId] = minicoin;
        emit MinicoinDeployed(
            d.gameId,
            minicoin,
            msg.sender,
            d.communityAsset,
            d.communityAssetType,
            d.communityTokenId,
            d.strategyRef,
            d.treasury,
            d.supplyRecipient,
            d.initialSupply
        );
    }
}
