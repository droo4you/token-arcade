// Run only against the operator's database while the API is stopped.
import { ArcadeStore } from "../apps/api/src/store.ts";
import { initializeProgress } from "../apps/api/src/freePlayProgress.ts";
import { initRunDiagnostics } from "../apps/api/src/runDiagnostics.ts";
import { initializePrivacy, completeDeletion } from "../apps/api/src/privacy.ts";
const [command, requestId, confirmation] = process.argv.slice(2);
if (command !== "list" && (command !== "complete" || !requestId || confirmation !== "--provider-reviewed")) {
  console.error("Usage: node --experimental-strip-types scripts/privacy-request.mjs list | complete REQUEST_ID --provider-reviewed");
  process.exit(1);
}
if (!process.env.ARCADE_DB_PATH) throw new Error("Set ARCADE_DB_PATH explicitly to the production database path.");
const store = new ArcadeStore(process.env.ARCADE_DB_PATH, false);
try {
  initializeProgress(store); initRunDiagnostics(store); initializePrivacy(store);
  if (command === "list") console.log(JSON.stringify(store.db.prepare("SELECT * FROM privacy_requests ORDER BY requested_at").all(), null, 2));
  else { completeDeletion(store, requestId); console.log("Local erasure completed. Confirm provider and backup handling with the requester."); }
} finally { store.close(); }
