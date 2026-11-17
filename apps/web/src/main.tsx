import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./app.css";

// Browser-only entry point. Nothing is rendered on a server and no key material
// is generated or stored here; see ADR-0012.
const root = document.getElementById("root");
if (root === null) {
  throw new Error("the #root element is missing from index.html");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
