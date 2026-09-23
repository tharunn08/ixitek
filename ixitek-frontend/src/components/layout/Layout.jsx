import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import ScrollToTop from "./ScrollToTop.jsx";
import RouteLoader from "./RouteLoader.jsx";
import PageTransition from "./PageTransition.jsx";
import WhatsAppButton from "../ui/WhatsAppButton.jsx";

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <ScrollToTop />
      <RouteLoader />
      <Header />
      <main className="flex-1">
        <PageTransition>
          {/* Keeps header/footer on screen while a code-split page loads. */}
          <Suspense fallback={<div className="container-page py-16" aria-busy="true"><div className="h-64 animate-pulse rounded-xl bg-ink-100/70" /></div>}>
            <Outlet />
          </Suspense>
        </PageTransition>
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
