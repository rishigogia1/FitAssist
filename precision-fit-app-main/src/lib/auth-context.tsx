import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface AuthState {
  isAuthenticated: boolean;
  email: string | null;
  displayName: string | null;
  login: (email: string, token?: string) => void;
  logout: () => void;
  updateProfile: (name: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "fitassist_auth_email";
const NAME_KEY = "fitassist_auth_name";
const TOKEN_KEY = "fitassist_auth_token";

function readStoredEmail(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function readStoredName(): string | null {
  try {
    return sessionStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(readStoredEmail);
  const [displayName, setDisplayName] = useState<string | null>(readStoredName);

  const login = useCallback((userEmail: string, token?: string) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, userEmail);
      if (token) {
        sessionStorage.setItem(TOKEN_KEY, token);
      }
      // Default name from email prefix if not already set
      if (!sessionStorage.getItem(NAME_KEY)) {
        const defaultName = userEmail.split("@")[0];
        sessionStorage.setItem(NAME_KEY, defaultName);
        setDisplayName(defaultName);
      }
    } catch {
      /* ignore */
    }
    setEmail(userEmail);
  }, []);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(NAME_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setEmail(null);
    setDisplayName(null);
  }, []);

  const updateProfile = useCallback((name: string) => {
    try {
      sessionStorage.setItem(NAME_KEY, name);
    } catch {
      /* ignore */
    }
    setDisplayName(name);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated: !!email, email, displayName, login, logout, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
