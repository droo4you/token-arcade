import { ArcadeAuthProvider } from "./auth";
import { App } from "./App";
export default function ArcadeRoot() { return <ArcadeAuthProvider><App /></ArcadeAuthProvider>; }
