import { Routes, Route, Navigate } from "react-router-dom";
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

// SAP / ERP micro-site — a self-contained section nested under /sap/*,
// with its own sub-navigation + footer band (see SapLayout.jsx). Added
// without touching any existing route below.
import SapLayout from "./components/sap/SapLayout.jsx";
import SapHome from "./pages/sap/SapHome.jsx";
import SapTraining from "./pages/sap/SapTraining.jsx";
import SapImplementation from "./pages/sap/SapImplementation.jsx";
import SapSupport from "./pages/sap/SapSupport.jsx";
import SapIndustries from "./pages/sap/SapIndustries.jsx";
import SapFaq from "./pages/sap/SapFaq.jsx";
import SapContact from "./pages/sap/SapContact.jsx";

export default function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        {/* Single account page — sign in (customer, staff or owner) and
            create account — standalone, no site header/footer. */}
        <Route path="login" element={<AdminLogin />} />
        <Route path="signup" element={<AdminLogin initialMode="signup" />} />
        {/* Old bookmarked/shared admin login URL still works. */}
        <Route path="admin/login" element={<Navigate to="/login" replace />} />

        {/* Admin area — standalone, no site header/footer */}
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

          {/* SAP / ERP micro-site */}
          <Route path="sap" element={<SapLayout />}>
            <Route index element={<SapHome />} />
            <Route path="training" element={<SapTraining />} />
            <Route path="implementation" element={<SapImplementation />} />
            <Route path="support" element={<SapSupport />} />
            <Route path="industries" element={<SapIndustries />} />
            <Route path="faq" element={<SapFaq />} />
            <Route path="contact" element={<SapContact />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}
