// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice TEST ONLY. A local mock with the metadata profile recorded for the
/// fest fUSD: 6 decimals, name "Fest USD", symbol "fUSD". It is NOT the real
/// fUSD contract and contains none of its code. The name and symbol are
/// prefixed with "Mock"/"m" so no output can be mistaken for the real token.
/// Its open mint exists only so local tests can fund participants.
contract MockFusdProfile is ERC20 {
    constructor() ERC20("Mock Fest USD", "mFUSD") {}

    /// @notice Six decimals, matching the fest fUSD metadata (source-lock claim 21).
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
