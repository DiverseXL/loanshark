// LOANSHARK diagnostics surface.
//
// Deliberately plain: this is a technical validation page, not a product UI.
// The panels are added in Task 4 of Phase 4; until then this shell only proves
// that the app builds and that the testnet banner is always visible.
export function App() {
  return (
    <>
      <div className="testnet-banner">TESTNET ONLY - QoreChain Diana - no funds move from this page</div>
      <div className="page">
        <h1>LOANSHARK diagnostics</h1>
        <p className="muted">
          Native chain: qorechain-diana. EVM chain: 0x2648 (9800). No transaction is sent from this
          page and the only signing request is the fixed test message.
        </p>
        <div className="panel">
          <h2>Panels</h2>
          <p className="muted">Wallet panels are wired in the next task of this phase.</p>
        </div>
      </div>
    </>
  );
}
