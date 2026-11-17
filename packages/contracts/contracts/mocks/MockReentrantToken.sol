// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ILoanSettlement {
    function repay(bytes32 loanId, uint256 amount) external;
}

/// @notice TEST ONLY. On a transfer between two non-zero addresses it calls
/// back into LoanSettlement.repay. The settlement contract's reentrancy guard
/// must refuse the nested call.
contract MockReentrantToken is ERC20 {
    address public target;
    bytes32 public reentryLoanId;
    bool public reentryEnabled;

    constructor() ERC20("Mock Reentrant", "MRE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setReentry(address target_, bytes32 loanId) external {
        target = target_;
        reentryLoanId = loanId;
        reentryEnabled = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (reentryEnabled && from != address(0) && to != address(0)) {
            reentryEnabled = false;
            ILoanSettlement(target).repay(reentryLoanId, 1);
        }
    }
}
