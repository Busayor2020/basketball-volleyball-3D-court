import React from "react";
import ReactDOM from "react-dom/client";
import MultipurposeCourt from "./MultipurposeCourt.jsx";
import "./index.css";

/* StrictMode is deliberately left off. In dev it double-invokes effects,
   which tears down and rebuilds the WebGL context on every mount. The scene
   cleans up correctly either way, but the extra context churn is noise you
   do not want while orbiting. */
ReactDOM.createRoot(document.getElementById("root")).render(
  <MultipurposeCourt />,
);
