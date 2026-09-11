import { Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout.jsx";
import Home from "./pages/Home.jsx";
import Company from "./pages/Company.jsx";
import Partners from "./pages/Partners.jsx";
import Products from "./pages/Products.jsx";
import CategoryPage from "./pages/CategoryPage.jsx";
import ProductDetail from "./pages/ProductDetail.jsx";
import Contact from "./pages/Contact.jsx";
import Career from "./pages/Career.jsx";
import NotFound from "./pages/NotFound.jsx";
import AdminLogin from "./pages/admin/AdminLogin.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import RequireAdminAuth from "./components/admin/RequireAdminAuth.jsx";
import { AdminAuthProvider } from "./context/AdminAuthContext.jsx";

export default function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        {/* Admin area — standalone, no site header/footer */}
        <Route path="admin/login" element={<AdminLogin />} />
        <Route
          path="admin"
          element={
            <RequireAdminAuth>
              <AdminDashboard />
            </RequireAdminAuth>
          }
        />

        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="company" element={<Company />} />
          <Route path="partners" element={<Partners />} />
          <Route path="products" element={<Products />} />
          <Route path="products/:categorySlug" element={<CategoryPage />} />
          <Route path="products/:categorySlug/:familySlug" element={<ProductDetail />} />
          <Route path="contact" element={<Contact />} />
          <Route path="enquiry" element={<Contact />} />
          <Route path="career" element={<Career />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}
