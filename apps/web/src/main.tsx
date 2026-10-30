import { createRoot } from "react-dom/client";
import { AdultGate } from "./AdultGate";
import "./privacy.css";
import "./styles.css";
import "./guide.css";
import "./dark.css";

createRoot(document.getElementById("root")!).render(
  <AdultGate />,
);
