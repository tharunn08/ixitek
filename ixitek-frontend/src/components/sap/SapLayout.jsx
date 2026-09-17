import { Outlet } from "react-router-dom";
import SapSubNav from "./SapSubNav.jsx";
import SapFooterBand from "./SapFooterBand.jsx";

// Wraps every /sap/* route. Lives inside the main site <Layout /> (so the
// global Header/Footer still wrap it), and adds the micro-site's own local
// navigation + closing band — this is what makes /sap/* feel like a
// self-contained site nested inside ixitek.in rather than a couple of
// bolted-on pages.
export default function SapLayout() {
  return (
    <div className="flex flex-col">
      <SapSubNav />
      <Outlet />
      <SapFooterBand />
    </div>
  );
}
