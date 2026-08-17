import Button from "../components/ui/Button.jsx";
import { Icon } from "../lib/icons.jsx";

export default function NotFound() {
  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon name="ServerCrash" className="h-8 w-8" />
      </span>
      <span className="font-display text-6xl font-extrabold text-ink-200">404</span>
      <h1 className="font-display text-2xl font-bold text-ink-900">Page not found</h1>
      <p className="max-w-md text-sm leading-relaxed text-ink-500">
        The page you're looking for may have been moved or no longer exists. Try heading back to
        the homepage or browsing our product catalogue.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Button to="/" icon="ArrowRight">
          Back to Home
        </Button>
        <Button to="/products" variant="secondary">
          Browse Products
        </Button>
      </div>
    </section>
  );
}
