// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Testnet demo token. It has no monetary value and is not a stablecoin.
/// @dev The owner can mint; that power is only for funding local tests and a
/// demo deployment. No other privileged function exists.
contract TestUSD is ERC20, Ownable {
    constructor(address initialOwner) ERC20("LOANSHARK Test USD", "tUSD") Ownable(initialOwner) {}

    /// @notice Six decimals, matching a stablecoin-style unit for the demo.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Owner-only mint for test funding.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
