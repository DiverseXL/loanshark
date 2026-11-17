// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.34;

/// @notice TEST ONLY. A token whose transfers return false without moving
/// funds. SafeERC20 must turn that into a revert, never a silent success.
contract MockFalseReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}
