import { createRoot } from "react-dom/client";
import { ArcadeAuthProvider } from "./auth";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <ArcadeAuthProvider><App /></ArcadeAuthProvider>,
);
