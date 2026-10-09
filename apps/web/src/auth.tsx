import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";

export type DemoRole = "player" | "admin" | null;

type AuthState = {
  configured: boolean;
  ready: boolean;
  authenticated: boolean;
  identityLabel: string;
  demoRole: DemoRole;
  login: () => void;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
  setDemoRole: (role: DemoRole) => void;
};

const AuthContext = createContext<AuthState | null>(null);
const appId = import.meta.env.VITE_PRIVY_APP_ID?.trim();

function AuthShell({ children, privy }: { children: ReactNode; privy?: ReturnType<typeof usePrivy> }) {
  const [demoRole, setDemoRole] = useState<DemoRole>(null);
  const authenticated = Boolean(privy?.authenticated || demoRole);
  const value = useMemo<AuthState>(() => ({
    configured: Boolean(appId),
    ready: privy?.ready ?? true,
    authenticated,
    identityLabel: demoRole ? `Local ${demoRole}` : privy?.authenticated ? "Player" : "Guest",
    demoRole,
    login: () => { if (privy) privy.login(); },
    logout: async () => {
      setDemoRole(null);
      if (privy?.authenticated) await privy.logout();
    },
    getToken: async () => {
      if (demoRole) return `local-demo:${demoRole}`;
      if (privy?.authenticated) return await privy.getAccessToken();
      return null;
    },
    setDemoRole,
  }), [demoRole, privy, authenticated]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function PrivyAuthShell({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  return <AuthShell privy={privy}>{children}</AuthShell>;
}

export function ArcadeAuthProvider({ children }: { children: ReactNode }) {
  if (!appId) return <AuthShell>{children}</AuthShell>;
  return (
    <PrivyProvider appId={appId} config={{ appearance: { theme: "light", accentColor: "#685494" }, embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } } }}>
      <PrivyAuthShell>{children}</PrivyAuthShell>
    </PrivyProvider>
  );
}

export function useArcadeAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("ArcadeAuthProvider is missing.");
  return auth;
}
