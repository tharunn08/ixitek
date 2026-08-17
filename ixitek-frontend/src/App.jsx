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

export default function App() {
  return (
    <Routes>
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
  );
}
