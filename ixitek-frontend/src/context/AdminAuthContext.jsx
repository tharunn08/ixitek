import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as adminAuth from "../lib/adminAuth.js";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [session, setSession] = useState(() => adminAuth.getSession());

  useEffect(() => {
    const refresh = () => setSession(adminAuth.getSession());
    window.addEventListener(adminAuth.ADMIN_AUTH_EVENT, refresh);
    window.addEventListener("storage", refresh);
    // Catch session expiry (TTL) even if nothing else triggers a re-render.
    const interval = setInterval(refresh, 60 * 1000);
    return () => {
      window.removeEventListener(adminAuth.ADMIN_AUTH_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      clearInterval(interval);
    };
  }, []);

  const login = useCallback(async (username, password, options) => {
    const nextSession = await adminAuth.login(username, password, options);
    setSession(nextSession);
    return nextSession;
  }, []);

  const logout = useCallback(() => {
    adminAuth.logout();
    setSession(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ session, isAuthenticated: Boolean(session), login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  return ctx;
}
