import { api, type TokenGetter } from "./api.ts";
import type { ProgressConnection, ProgressRead, ProgressOperation, ProgressSnapshot } from "../../../packages/sdk/src/progress.ts";

export function accountProgress(gameId: string, token: TokenGetter, stillCurrent: () => boolean, status: (message: string) => void): ProgressConnection {
  const path = `/api/me/progress/${encodeURIComponent(gameId)}`;
  let scope = "";
  const guardedToken = async () => {
    if (!stillCurrent()) throw new Error("Account changed");
    const value = await token();
    if (!stillCurrent() || !value) throw new Error("Sign in again to sync progress");
    return value;
  };
  const post = async (data: { prepare?: ProgressRead; operation?: ProgressOperation }) => {
    const response = await api<{ state: ProgressSnapshot }>(path, guardedToken, { method: "POST", body: { scope, ...data } });
    if (!stillCurrent()) throw new Error("Account changed");
    return response.state;
  };
  return {
    async open() { const data = await api<{ scope: string; keys: string[] }>(path, guardedToken); scope = data.scope; return data; },
    prepare: prepare => post({ prepare }),
    async save(operation) { await post({ operation }); },
    status(message) { if (stillCurrent()) status(message); },
  };
}
