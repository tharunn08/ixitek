export default function SpecTable({ specs }) {
  return (
    <dl className="grid grid-cols-1 divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0">
      {specs.map((spec) => (
        <div
          key={spec.label}
          className="flex flex-col gap-1 px-5 py-4 transition-colors duration-200 hover:bg-brand-50/50"
        >
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{spec.label}</dt>
          <dd className="text-sm font-medium text-ink-800">{spec.value}</dd>
        </div>
      ))}
    </dl>
  );
}
