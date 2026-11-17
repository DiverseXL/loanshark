// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice TEST ONLY. An ordinary 18-decimal token used to check that the
/// settlement contract does not assume six decimals. It is not a product token.
contract MockDecimals18 is ERC20 {
    constructor() ERC20("Mock 18 Decimals", "M18") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
