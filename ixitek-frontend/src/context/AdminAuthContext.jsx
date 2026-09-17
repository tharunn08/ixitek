import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as adminAuth from "../lib/adminAuth.js";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [session, setSession] = useState(() => adminAuth.getSession());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const refresh = () => setSession(adminAuth.getSession());
    window.addEventListener(adminAuth.ADMIN_AUTH_EVENT, refresh);
    window.addEventListener("storage", refresh);

    // Confirm the cached session is still valid against the backend (e.g.
    // the account may have been removed, or the token may have expired).
    adminAuth.refreshSession().finally(() => setReady(true));

    return () => {
      window.removeEventListener(adminAuth.ADMIN_AUTH_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const login = useCallback(async (identifier, password, options) => {
    const nextSession = await adminAuth.login(identifier, password, options);
    setSession(nextSession);
    return nextSession;
  }, []);

  const register = useCallback(async (payload) => {
    const nextSession = await adminAuth.register(payload);
    setSession(nextSession);
    return nextSession;
  }, []);

  const logout = useCallback(() => {
    adminAuth.logout();
    setSession(null);
  }, []);

  return (
    <AdminAuthContext.Provider
      value={{
        session,
        ready,
        isAuthenticated: Boolean(session),
        isAdmin: adminAuth.isAdminRole(session?.role),
        login,
        register,
        logout,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  return ctx;
}
