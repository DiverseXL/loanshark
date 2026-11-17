// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice TEST ONLY. A token that burns a 1% fee on every non-mint transfer,
/// so the recipient receives less than the amount sent. The settlement
/// contract must detect the shortfall and revert.
contract MockFeeOnTransferToken is ERC20 {
    address private constant FEE_SINK = address(0x000000000000000000000000000000000000dEaD);

    constructor() ERC20("Mock Fee On Transfer", "MFEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        uint256 fee = value / 100;
        if (fee > 0) super._update(from, FEE_SINK, fee);
        super._update(from, to, value - fee);
    }
}
