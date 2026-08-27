import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./AppV2";
import "../tokens.css";
import "./styles.css";
import "./v2.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
