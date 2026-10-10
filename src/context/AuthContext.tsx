import React, { createContext, useContext, useState, useEffect } from "react";
import { User, DemoAccount } from "../types";
import { api } from "../lib/api";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  demoAccounts: DemoAccount[];
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string, role?: string) => Promise<void>;
  quickLogin: (account: DemoAccount) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("campusverify_token"));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  // Load demo accounts
  useEffect(() => {
    api.auth
      .getDemoAccounts()
      .then((res) => setDemoAccounts(res.accounts))
      .catch((err) => console.error("Failed to load demo accounts:", err));
  }, []);

  // Validate active session on initial mount only
  useEffect(() => {
    const storedToken = localStorage.getItem("campusverify_token");
    if (storedToken && storedToken !== "undefined" && storedToken !== "null") {
      api.auth
        .me()
        .then((res) => {
          if (res?.user) {
            setUser(res.user);
            setToken(storedToken);
          } else {
            localStorage.removeItem("campusverify_token");
            setToken(null);
            setUser(null);
          }
        })
        .catch(() => {
          // Stored session expired or invalid
          localStorage.removeItem("campusverify_token");
          setToken(null);
          setUser(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []); // Run only once on mount!

  const login = async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    if (res && res.token && res.user) {
      localStorage.setItem("campusverify_token", res.token);
      setToken(res.token);
      setUser(res.user);
    } else {
      throw new Error("Invalid response received from authentication server.");
    }
  };

  const register = async (fullName: string, email: string, password: string, role: string = "student") => {
    const res = await api.auth.register({ fullName, email, password, role });
    if (res && res.token && res.user) {
      localStorage.setItem("campusverify_token", res.token);
      setToken(res.token);
      setUser(res.user);
    } else {
      throw new Error("Invalid response received from registration server.");
    }
  };

  const quickLogin = async (account: DemoAccount) => {
    await login(account.email, account.password);
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (e) {
      // Ignore network errors on logout
    }
    localStorage.removeItem("campusverify_token");
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const res = await api.auth.me();
      setUser(res.user);
    } catch (err) {
      console.error("Failed to refresh user:", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        demoAccounts,
        login,
        register,
        quickLogin,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
