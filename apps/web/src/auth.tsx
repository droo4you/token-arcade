import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { PrivyProvider, useCreateWallet, usePrivy } from "@privy-io/react-auth";

export type DemoRole = "player" | "admin" | null;

type AuthState = {
  configured: boolean;
  ready: boolean;
  authenticated: boolean;
  identityKey: string | null;
  identityLabel: string;
  demoRole: DemoRole;
  hasEmbeddedWallet: boolean;
  login: () => void;
  logout: () => Promise<void>;
  createArcadeWallet: () => Promise<void>;
  getToken: () => Promise<string | null>;
  setDemoRole: (role: DemoRole) => void;
};

const AuthContext = createContext<AuthState | null>(null);
const appId = import.meta.env.VITE_PRIVY_APP_ID?.trim();

function AuthShell({ children, privy, createWallet }: { children: ReactNode; privy?: ReturnType<typeof usePrivy>; createWallet?: ReturnType<typeof useCreateWallet>["createWallet"] }) {
  const [demoRole, setDemoRole] = useState<DemoRole>(null);
  const privyAuthenticated = Boolean(privy?.ready && privy.authenticated);
  const activeDemoRole = privyAuthenticated ? null : demoRole;
  const authenticated = privyAuthenticated || Boolean(activeDemoRole);
  const identityKey = privyAuthenticated ? privy?.user?.id ?? null : activeDemoRole ? `local-demo:${activeDemoRole}` : null;
  const hasEmbeddedWallet = Boolean(privy?.user?.linkedAccounts.some((account) =>
    account.type === "wallet" && account.chainType === "ethereum" && account.connectorType === "embedded" &&
    (account.walletClientType === "privy" || account.walletClientType === "privy-v2")));
  useEffect(() => {
    if (privyAuthenticated) setDemoRole(null);
  }, [privyAuthenticated]);
  const value = useMemo<AuthState>(() => ({
    configured: Boolean(appId),
    ready: privy?.ready ?? true,
    authenticated,
    identityKey,
    identityLabel: privyAuthenticated ? "Privy player" : activeDemoRole ? `Local demo ${activeDemoRole}` : "Guest",
    demoRole: activeDemoRole,
    hasEmbeddedWallet,
    login: () => { if (privy?.ready) { setDemoRole(null); privy.login(); } },
    logout: async () => {
      setDemoRole(null);
      if (privyAuthenticated) await privy?.logout();
    },
    createArcadeWallet: async () => {
      if (!privyAuthenticated || !createWallet) throw new Error("Sign in with Privy to create an arcade wallet.");
      await createWallet();
    },
    getToken: async () => {
      if (privyAuthenticated) return await privy!.getAccessToken();
      if (activeDemoRole) return `local-demo:${activeDemoRole}`;
      return null;
    },
    setDemoRole: (role) => { if (!privyAuthenticated) setDemoRole(role); },
  }), [activeDemoRole, privy, privyAuthenticated, authenticated, identityKey, hasEmbeddedWallet, createWallet]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function PrivyAuthShell({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const { createWallet } = useCreateWallet();
  return <AuthShell privy={privy} createWallet={createWallet}>{children}</AuthShell>;
}

export function ArcadeAuthProvider({ children }: { children: ReactNode }) {
  if (!appId) return <AuthShell>{children}</AuthShell>;
  return (
    <PrivyProvider appId={appId} config={{ appearance: { theme: "light", accentColor: "#4A1D55" }, embeddedWallets: { ethereum: { createOnLogin: "off" } } }}>
      <PrivyAuthShell>{children}</PrivyAuthShell>
    </PrivyProvider>
  );
}

export function useArcadeAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("ArcadeAuthProvider is missing.");
  return auth;
}
