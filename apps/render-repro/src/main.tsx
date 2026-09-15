import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// The custom element renders into LIGHT DOM, so its scoped styles are not
// injected for us — `.vega-chart-container { width:100%; height:100% }` lives
// here, and without it the chart compiles to zero size and draws nothing.
// `udi-toolkit/react` does not import this; every React consumer must.
import "udi-toolkit/style.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
