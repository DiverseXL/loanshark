// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LoanSettlement
/// @notice Local-only settlement for one-borrower, one-lender loans. The loan id
/// is keccak256(abi.encode(block.chainid, address(this), terms)); the terms are
/// immutable once proposed. The chain id and this contract's address are part of
/// the preimage, so a commitment made for another chain or another deployment
/// cannot be replayed here (ADR-0008 decision 8).
/// @dev No admin, no upgrade path, no arbitrary calls, no collateral and no
/// interest-rate math. Tokens are restricted to an immutable allowlist fixed at
/// deployment. Every token movement is checked against the actual balance change.
contract LoanSettlement is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Terms {
        address borrower;
        address lender;
        address token;
        uint256 principal;
        uint256 interest;
        uint64 dueDate;
        uint64 graceSeconds;
        uint64 fundingDeadline;
        uint64 claimDeadline;
        bytes32 salt;
    }

    enum State {
        None,
        Proposed,
        Funded,
        Active,
        Defaulted,
        Repaid,
        Cancelled,
        Expired,
        Refunded
    }

    struct Loan {
        Terms terms;
        State state;
        uint256 repaid;
        uint256 withdrawable;
    }

    error NotBorrower(address caller);
    error NotLender(address caller);
    error InvalidAddress();
    error InvalidTerms();
    error TokenNotAllowed(address token);
    error LoanExists(bytes32 loanId);
    error UnknownLoan(bytes32 loanId);
    error InvalidState(bytes32 loanId, State actual);
    error FundingDeadlinePassed();
    error FundingDeadlineNotReached();
    error ClaimDeadlinePassed();
    error ClaimDeadlineNotReached();
    error ClaimWindowTooShort(uint256 minimum);
    error DefaultNotYetAvailable();
    error NothingToWithdraw();
    error ZeroAmount();
    error Overpayment(uint256 outstanding, uint256 amount);
    error InexactTransfer();

    event LoanProposed(
        bytes32 indexed loanId,
        address indexed borrower,
        address indexed lender,
        address token,
        uint256 principal,
        uint256 interest,
        uint64 dueDate,
        uint64 graceSeconds,
        uint64 fundingDeadline,
        uint64 claimDeadline
    );
    event LoanFunded(bytes32 indexed loanId, address indexed lender, uint256 amount);
    event LoanClaimed(bytes32 indexed loanId, address indexed borrower, uint256 amount);
    event RepaymentMade(
        bytes32 indexed loanId,
        address indexed borrower,
        uint256 amount,
        uint256 outstandingAfter
    );
    event LenderWithdrew(bytes32 indexed loanId, address indexed lender, uint256 amount);
    event LoanDefaulted(bytes32 indexed loanId);
    event LoanRepaid(bytes32 indexed loanId);
    event LoanCancelled(bytes32 indexed loanId);
    event LoanExpired(bytes32 indexed loanId);
    event LoanRefunded(bytes32 indexed loanId, address indexed lender, uint256 amount);

    /// @notice Minimum gap between the funding and claim deadlines, in seconds.
    uint256 public constant MINIMUM_CLAIM_WINDOW = 3_600;

    mapping(bytes32 => Loan) private _loans;
    mapping(address => bool) private _allowedToken;
    address[] private _tokens;

    /// @param testUsd_ The project's labelled test token.
    /// @param fusd_ The fest fUSD contract allowed by ADR-0013 Option A.
    /// @dev Both addresses are immutable in effect: there is no mutator and no
    /// admin. A zero address or the same address twice is rejected.
    constructor(address testUsd_, address fusd_) {
        if (testUsd_ == address(0) || fusd_ == address(0) || testUsd_ == fusd_) {
            revert InvalidAddress();
        }
        _allowedToken[testUsd_] = true;
        _tokens.push(testUsd_);
        _allowedToken[fusd_] = true;
        _tokens.push(fusd_);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice The commitment, identical to the TypeScript `commitmentOf` for the
    /// same chain id and contract address.
    function commitmentOf(Terms calldata terms) external view returns (bytes32) {
        return _commitment(terms);
    }

    function termsOf(bytes32 loanId) external view returns (Terms memory) {
        Loan storage loan = _loans[loanId];
        if (loan.state == State.None) revert UnknownLoan(loanId);
        return loan.terms;
    }

    function stateOf(bytes32 loanId) external view returns (State) {
        return _loans[loanId].state;
    }

    function repaidOf(bytes32 loanId) external view returns (uint256) {
        return _loans[loanId].repaid;
    }

    function withdrawableOf(bytes32 loanId) external view returns (uint256) {
        return _loans[loanId].withdrawable;
    }

    function outstandingOf(bytes32 loanId) external view returns (uint256) {
        Loan storage loan = _loans[loanId];
        if (loan.state != State.Active && loan.state != State.Defaulted) return 0;
        return _totalDue(loan.terms) - loan.repaid;
    }

    function isAllowedToken(address token) external view returns (bool) {
        return _allowedToken[token];
    }

    function allowedTokens() external view returns (address[] memory) {
        return _tokens;
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    function proposeLoan(Terms calldata terms) external returns (bytes32 loanId) {
        if (msg.sender != terms.borrower) revert NotBorrower(msg.sender);

        loanId = _commitment(terms);
        // Check reuse before the deadline validation, so an id that was already
        // proposed always reports LoanExists even after it expired.
        if (_loans[loanId].state != State.None) revert LoanExists(loanId);
        _validateTerms(terms);

        Loan storage loan = _loans[loanId];
        loan.terms = terms;
        loan.state = State.Proposed;

        emit LoanProposed(
            loanId,
            terms.borrower,
            terms.lender,
            terms.token,
            terms.principal,
            terms.interest,
            terms.dueDate,
            terms.graceSeconds,
            terms.fundingDeadline,
            terms.claimDeadline
        );
    }

    function fund(bytes32 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (loan.state == State.None) revert UnknownLoan(loanId);
        if (loan.state != State.Proposed) revert InvalidState(loanId, loan.state);
        if (msg.sender != loan.terms.lender) revert NotLender(msg.sender);
        if (block.timestamp > loan.terms.fundingDeadline) revert FundingDeadlinePassed();

        loan.state = State.Funded;
        _pullExact(loan.terms.token, msg.sender, loan.terms.principal);
        emit LoanFunded(loanId, msg.sender, loan.terms.principal);
    }

    function cancel(bytes32 loanId) external {
        Loan storage loan = _loans[loanId];
        if (loan.state == State.None) revert UnknownLoan(loanId);
        if (loan.state != State.Proposed) revert InvalidState(loanId, loan.state);
        if (msg.sender != loan.terms.borrower) revert NotBorrower(msg.sender);

        loan.state = State.Cancelled;
        emit LoanCancelled(loanId);
    }

    function expire(bytes32 loanId) external {
        Loan storage loan = _loans[loanId];
        if (loan.state == State.None) revert UnknownLoan(loanId);
        if (loan.state != State.Proposed) revert InvalidState(loanId, loan.state);
        if (block.timestamp <= loan.terms.fundingDeadline) revert FundingDeadlineNotReached();

        loan.state = State.Expired;
        emit LoanExpired(loanId);
    }

    function claim(bytes32 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (loan.state == State.None) revert UnknownLoan(loanId);
        if (loan.state != State.Funded) revert InvalidState(loanId, loan.state);
        if (msg.sender != loan.terms.borrower) revert NotBorrower(msg.sender);
        if (block.timestamp > loan.terms.claimDeadline) revert ClaimDeadlinePassed();

        loan.state = State.Active;
        _pushExact(loan.terms.token, loan.terms.borrower, loan.terms.principal);
        emit LoanClaimed(loanId, msg.sender, loan.terms.principal);
    }

    function refund(bytes32 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (loan.state == State.None) revert UnknownLoan(loanId);
        if (loan.state != State.Funded) revert InvalidState(loanId, loan.state);
        if (msg.sender != loan.terms.lender) revert NotLender(msg.sender);
        if (block.timestamp <= loan.terms.claimDeadline) revert ClaimDeadlineNotReached();

        loan.state = State.Refunded;
        _pushExact(loan.terms.token, loan.terms.lender, loan.terms.principal);
        emit LoanRefunded(loanId, msg.sender, loan.terms.principal);
    }

    function repay(bytes32 loanId, uint256 amount) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (loan.state == State.None) revert UnknownLoan(loanId);
        if (loan.state != State.Active && loan.state != State.Defaulted) {
            revert InvalidState(loanId, loan.state);
        }
        if (msg.sender != loan.terms.borrower) revert NotBorrower(msg.sender);
        if (amount == 0) revert ZeroAmount();

        uint256 total = _totalDue(loan.terms);
        uint256 outstanding = total - loan.repaid;
        if (amount > outstanding) revert Overpayment(outstanding, amount);

        loan.repaid += amount;
        loan.withdrawable += amount;
        bool fullyRepaid = loan.repaid == total;
        if (fullyRepaid) loan.state = State.Repaid;

        _pullExact(loan.terms.token, msg.sender, amount);
        emit RepaymentMade(loanId, msg.sender, amount, total - loan.repaid);
        if (fullyRepaid) emit LoanRepaid(loanId);
    }

    function markDefault(bytes32 loanId) external {
        Loan storage loan = _loans[loanId];
        if (loan.state == State.None) revert UnknownLoan(loanId);
        if (loan.state != State.Active) revert InvalidState(loanId, loan.state);

        uint256 due = uint256(loan.terms.dueDate) + uint256(loan.terms.graceSeconds);
        if (block.timestamp <= due) revert DefaultNotYetAvailable();

        loan.state = State.Defaulted;
        emit LoanDefaulted(loanId);
    }

    function withdraw(bytes32 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (loan.state == State.None) revert UnknownLoan(loanId);
        if (msg.sender != loan.terms.lender) revert NotLender(msg.sender);

        uint256 amount = loan.withdrawable;
        if (amount == 0) revert NothingToWithdraw();

        loan.withdrawable = 0;
        _pushExact(loan.terms.token, msg.sender, amount);
        emit LenderWithdrew(loanId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _commitment(Terms calldata terms) private view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), terms));
    }

    function _totalDue(Terms storage terms) private view returns (uint256) {
        return terms.principal + terms.interest;
    }

    function _validateTerms(Terms calldata terms) private view {
        if (terms.borrower == address(0) || terms.lender == address(0)) revert InvalidAddress();
        if (terms.borrower == terms.lender) revert InvalidAddress();
        if (terms.principal == 0) revert InvalidTerms();
        if (!_allowedToken[terms.token]) revert TokenNotAllowed(terms.token);
        if (terms.fundingDeadline <= block.timestamp) revert FundingDeadlinePassed();
        if (terms.claimDeadline < terms.fundingDeadline) revert InvalidTerms();
        if (uint256(terms.claimDeadline) < uint256(terms.fundingDeadline) + MINIMUM_CLAIM_WINDOW) {
            revert ClaimWindowTooShort(MINIMUM_CLAIM_WINDOW);
        }
        if (terms.dueDate <= terms.claimDeadline) revert InvalidTerms();
        if (terms.principal > type(uint256).max - terms.interest) revert InvalidTerms();
    }

    /// @dev Incoming transfer must increase this contract's balance by exactly
    /// `amount`. A fee-on-transfer token therefore reverts.
    function _pullExact(address token, address from, uint256 amount) private {
        IERC20 erc20 = IERC20(token);
        uint256 before = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(from, address(this), amount);
        uint256 afterBalance = erc20.balanceOf(address(this));
        if (afterBalance < before || afterBalance - before != amount) revert InexactTransfer();
    }

    /// @dev Outgoing transfer must decrease this contract and increase the
    /// recipient by exactly `amount`. A fee-on-transfer token therefore reverts.
    function _pushExact(address token, address to, uint256 amount) private {
        IERC20 erc20 = IERC20(token);
        uint256 contractBefore = erc20.balanceOf(address(this));
        uint256 recipientBefore = erc20.balanceOf(to);
        erc20.safeTransfer(to, amount);
        uint256 contractAfter = erc20.balanceOf(address(this));
        uint256 recipientAfter = erc20.balanceOf(to);
        if (
            contractBefore < contractAfter ||
            contractBefore - contractAfter != amount ||
            recipientAfter < recipientBefore ||
            recipientAfter - recipientBefore != amount
        ) revert InexactTransfer();
    }
}
