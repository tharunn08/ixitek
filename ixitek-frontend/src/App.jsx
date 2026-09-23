import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/layout/Layout.jsx";
import Home from "./pages/Home.jsx";
const Company = lazy(() => import("./pages/Company.jsx"));
const Partners = lazy(() => import("./pages/Partners.jsx"));
const Products = lazy(() => import("./pages/Products.jsx"));
const CategoryPage = lazy(() => import("./pages/CategoryPage.jsx"));
const ProductDetail = lazy(() => import("./pages/ProductDetail.jsx"));
const Contact = lazy(() => import("./pages/Contact.jsx"));
const Career = lazy(() => import("./pages/Career.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin.jsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.jsx"));
import RequireAdminAuth from "./components/admin/RequireAdminAuth.jsx";
import { AdminAuthProvider } from "./context/AdminAuthContext.jsx";
import { LocaleProvider } from "./context/LocaleContext.jsx";
import { CartProvider } from "./context/CartContext.jsx";

// SAP / ERP micro-site — a self-contained section nested under /sap/*,
// with its own sub-navigation + footer band (see SapLayout.jsx). Added
// without touching any existing route below.
const SapLayout = lazy(() => import("./components/sap/SapLayout.jsx"));
const SapHome = lazy(() => import("./pages/sap/SapHome.jsx"));
const SapTraining = lazy(() => import("./pages/sap/SapTraining.jsx"));
const SapImplementation = lazy(() => import("./pages/sap/SapImplementation.jsx"));
const SapSupport = lazy(() => import("./pages/sap/SapSupport.jsx"));
const SapIndustries = lazy(() => import("./pages/sap/SapIndustries.jsx"));
const SapFaq = lazy(() => import("./pages/sap/SapFaq.jsx"));
const SapContact = lazy(() => import("./pages/sap/SapContact.jsx"));

// Online catalog + admin modules are code-split: visitors to the marketing
// pages never download admin or catalog code they don't use.
const CatalogPage = lazy(() => import("./pages/shop/CatalogPage.jsx"));
const ProductPage = lazy(() => import("./pages/shop/ProductPage.jsx"));
const ComparePage = lazy(() => import("./pages/shop/ComparePage.jsx"));
const AdminShell = lazy(() => import("./components/admin/AdminShell.jsx"));
const AdminProducts = lazy(() => import("./pages/admin/catalog/Products.jsx"));
const AdminProductEdit = lazy(() => import("./pages/admin/catalog/ProductEdit.jsx"));
const AdminImport = lazy(() => import("./pages/admin/catalog/CatalogImport.jsx"));
const AdminQuality = lazy(() => import("./pages/admin/catalog/DataQuality.jsx"));
const AdminPricing = lazy(() => import("./pages/admin/Pricing.jsx"));
const AdminStock = lazy(() => import("./pages/admin/inventory/Stock.jsx"));
const AdminWarehouses = lazy(() => import("./pages/admin/inventory/Warehouses.jsx"));
const AdminMovements = lazy(() => import("./pages/admin/inventory/Movements.jsx"));
const AdminAudit = lazy(() => import("./pages/admin/AuditLog.jsx"));
const AdminInternational = lazy(() => import("./pages/admin/International.jsx"));
// Storefront commerce (Waves 4–7)
const CartPage = lazy(() => import("./pages/shop/CartPage.jsx"));
const CheckoutPage = lazy(() => import("./pages/shop/CheckoutPage.jsx"));
const QuickOrderPage = lazy(() => import("./pages/shop/QuickOrderPage.jsx"));
const OrderPage = lazy(() => import("./pages/shop/OrderPage.jsx"));
const RfqPage = lazy(() => import("./pages/shop/RfqPage.jsx"));
const RfqView = lazy(() => import("./pages/shop/RfqPage.jsx").then((m) => ({ default: m.RfqView })));
const QuotePage = lazy(() => import("./pages/shop/QuotePage.jsx"));
const SupportPage = lazy(() => import("./pages/shop/SupportPages.jsx"));
const TicketPage = lazy(() => import("./pages/shop/SupportPages.jsx").then((m) => ({ default: m.TicketPage })));
const TrackOrderPage = lazy(() => import("./pages/shop/SupportPages.jsx").then((m) => ({ default: m.TrackOrderPage })));
const hub = (name) => lazy(() => import("./pages/shop/HubPages.jsx").then((m) => ({ default: m[name] })));
const SolutionsPage = hub("SolutionsPage");
const ServicesPage = hub("ServicesPage");
const ResourcesPage = hub("ResourcesPage");
const ShippingDutiesPage = hub("ShippingDutiesPage");
const acct = (name) => lazy(() => import("./pages/shop/AccountPages.jsx").then((m) => ({ default: m[name] })));
const AccountLayout = acct("AccountLayout");
const AccountDashboard = acct("AccountDashboard");
const AccountOrders = acct("AccountOrders");
const AccountQuotes = acct("AccountQuotes");
const AccountInvoices = acct("AccountInvoices");
const AccountReturns = acct("AccountReturns");
const AccountWishlist = acct("AccountWishlist");
const AccountAddresses = acct("AccountAddresses");
const AccountCompany = acct("AccountCompany");
const AccountProfile = acct("AccountProfile");
// Admin operations (orders, RFQs, quotes, finance, shipping, returns, support, CRM, companies, procurement)
const AdminOrders = lazy(() => import("./pages/admin/ops/Orders.jsx"));
const AdminOrderDetail = lazy(() => import("./pages/admin/ops/OrderDetail.jsx"));
const AdminRfqs = lazy(() => import("./pages/admin/ops/Rfqs.jsx"));
const AdminRfqDetail = lazy(() => import("./pages/admin/ops/RfqDetail.jsx"));
const AdminQuotes = lazy(() => import("./pages/admin/ops/Quotes.jsx"));
const AdminQuoteEditor = lazy(() => import("./pages/admin/ops/QuoteEditor.jsx"));
const AdminFinance = lazy(() => import("./pages/admin/ops/Finance.jsx"));
const AdminShipping = lazy(() => import("./pages/admin/ops/Shipping.jsx"));
const AdminReturns = lazy(() => import("./pages/admin/ops/Returns.jsx"));
const AdminTickets = lazy(() => import("./pages/admin/ops/Tickets.jsx"));
const AdminCrm = lazy(() => import("./pages/admin/ops/Crm.jsx"));
const AdminCompanies = lazy(() => import("./pages/admin/ops/Companies.jsx"));
const AdminProcurement = lazy(() => import("./pages/admin/ops/Procurement.jsx"));
const AdminMonitoring = lazy(() => import("./pages/admin/Monitoring.jsx"));

function PageFallback() {
  return (
    <div className="container-page py-16" aria-busy="true">
      <div className="h-6 w-48 animate-pulse rounded bg-ink-100" />
      <div className="mt-4 h-64 animate-pulse rounded-xl bg-ink-100/70" />
    </div>
  );
}

export default function App() {
  return (
    <AdminAuthProvider>
    <LocaleProvider>
    <CartProvider>
      <Suspense fallback={<PageFallback />}>
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
        {/* Admin modules (catalog, pricing, inventory, audit) */}
        <Route
          path="admin"
          element={
            <RequireAdminAuth>
              <AdminShell />
            </RequireAdminAuth>
          }
        >
          <Route path="catalog" element={<Navigate to="/admin/catalog/products" replace />} />
          <Route path="catalog/products" element={<AdminProducts />} />
          <Route path="catalog/products/:id" element={<AdminProductEdit />} />
          <Route path="catalog/import" element={<AdminImport />} />
          <Route path="catalog/quality" element={<AdminQuality />} />
          <Route path="pricing" element={<AdminPricing />} />
          <Route path="inventory" element={<AdminStock />} />
          <Route path="inventory/warehouses" element={<AdminWarehouses />} />
          <Route path="inventory/movements" element={<AdminMovements />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="international" element={<AdminInternational />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:number" element={<AdminOrderDetail />} />
          <Route path="rfqs" element={<AdminRfqs />} />
          <Route path="rfqs/:number" element={<AdminRfqDetail />} />
          <Route path="quotes" element={<AdminQuotes />} />
          <Route path="quotes/new" element={<AdminQuoteEditor />} />
          <Route path="quotes/:number" element={<AdminQuoteEditor />} />
          <Route path="finance" element={<AdminFinance />} />
          <Route path="shipping" element={<AdminShipping />} />
          <Route path="returns" element={<AdminReturns />} />
          <Route path="tickets" element={<AdminTickets />} />
          <Route path="crm" element={<AdminCrm />} />
          <Route path="companies" element={<AdminCompanies />} />
          <Route path="procurement" element={<AdminProcurement />} />
          <Route path="monitoring" element={<AdminMonitoring />} />
        </Route>

        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="company" element={<Company />} />
          <Route path="partners" element={<Partners />} />
          <Route path="products" element={<Products />} />
          <Route path="products/:categorySlug" element={<CategoryPage />} />
          <Route path="products/:categorySlug/:familySlug" element={<ProductDetail />} />
          {/* Database-driven online catalog */}
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="catalog/:slug" element={<CatalogPage />} />
          <Route path="product/:slug" element={<ProductPage />} />
          <Route path="search" element={<CatalogPage searchMode />} />
          <Route path="compare" element={<ComparePage />} />
          {/* Commerce */}
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="quick-order" element={<QuickOrderPage />} />
          <Route path="bom" element={<Navigate to="/quick-order" replace />} />
          <Route path="order/:number" element={<OrderPage />} />
          <Route path="track-order" element={<TrackOrderPage />} />
          <Route path="rfq" element={<RfqPage />} />
          <Route path="rfq/:number" element={<RfqView />} />
          <Route path="quote/:number" element={<QuotePage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="support/tickets/:number" element={<TicketPage />} />
          <Route path="solutions" element={<SolutionsPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="resources/shipping-and-duties" element={<ShippingDutiesPage />} />
          <Route path="account" element={<AccountLayout />}>
            <Route index element={<AccountDashboard />} />
            <Route path="orders" element={<AccountOrders />} />
            <Route path="quotes" element={<AccountQuotes />} />
            <Route path="invoices" element={<AccountInvoices />} />
            <Route path="returns" element={<AccountReturns />} />
            <Route path="wishlist" element={<AccountWishlist />} />
            <Route path="addresses" element={<AccountAddresses />} />
            <Route path="company" element={<AccountCompany />} />
            <Route path="company/join" element={<AccountCompany />} />
            <Route path="profile" element={<AccountProfile />} />
          </Route>
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
      </Suspense>
    </CartProvider>
    </LocaleProvider>
    </AdminAuthProvider>
  );
}
