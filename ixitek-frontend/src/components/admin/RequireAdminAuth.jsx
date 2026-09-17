import { Navigate, useLocation } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";

// Guards /admin — only signed-in staff or the owner may enter. A signed-in
// customer is redirected back to the login page too (their account simply
// has no admin access), not silently let through.
export default function RequireAdminAuth({ children }) {
  const { isAuthenticated, isAdmin } = useAdminAuth();
  const location = useLocation();

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
