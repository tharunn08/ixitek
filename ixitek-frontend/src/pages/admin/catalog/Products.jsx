// Admin → Catalog → Products: server-side paged product table.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader, Table, Pagination, Pill, SearchInput, ErrorBanner, useApi, useDebounced, usd, num, inputCls } from "../../../components/admin/kit/index.jsx";

const STATUS_TONE = { active: "green", draft: "gray", review: "amber", coming_soon: "blue", discontinued: "red", end_of_sale: "red", end_of_life: "red", archived: "gray" };
const IMG_TONE = { valid: "green", unchecked: "gray", broken: "red", missing: "amber" };

export default function Products() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const dq = useDebounced(q);
  const page = Number(params.get("page") || 1);
  const categoryId = params.get("categoryId") || "";
  const price = params.get("price") || "";
  const cats = useApi("/api/admin/catalog/categories");
  const qs = new URLSearchParams({ page, limit: 50, ...(dq && { q: dq }), ...(categoryId && { categoryId }), ...(price && { price }) });
  const list = useApi(`/api/admin/catalog/products?${qs}`);
  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next, { replace: true });
  };
  useEffect(() => set("q", dq), [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  const costs = list.data?.canSeeCosts;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="Package" title="Products" subtitle={`${num(list.data?.total)} products in the catalog. Click a product to edit details, pricing and stock.`} />
      <div className="flex flex-col gap-2 md:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Search SKU, name or description" className="md:w-96" />
        <select className={`${inputCls} md:w-64`} value={categoryId} onChange={(e) => set("categoryId", e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {cats.data?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? "— " : ""}{c.name} ({c.products})
            </option>
          ))}
        </select>
        <select className={`${inputCls} md:w-56`} value={price} onChange={(e) => set("price", e.target.value)} aria-label="Price status">
          <option value="">Any price status</option>
          <option value="none">No selling price (RFQ)</option>
          <option value="override">Manual override</option>
        </select>
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rows={list.data?.items}
        onRowClick={(r) => navigate(`/admin/catalog/products/${r.id}`)}
        columns={[
          { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs font-semibold text-ink-900">{r.sku}</span> },
          { key: "name", label: "Name", render: (r) => <span className="line-clamp-2 max-w-sm text-ink-700">{r.name}</span> },
          { key: "cat", label: "Category › Family", render: (r) => <span className="text-xs text-ink-500">{r.category} › {r.family || "—"}</span> },
          ...(costs
            ? [
                { key: "exw", label: "EXW cost", align: "right", render: (r) => <span className="text-xs text-ink-500">{usd(r.costs?.supplierExwCostUsd, 4)}</span> },
                { key: "fob", label: "FOB cost", align: "right", render: (r) => <span className="text-xs text-ink-500">{usd(r.costs?.supplierFobCostUsd, 4)}</span> },
              ]
            : []),
          {
            key: "price",
            label: "Selling price",
            align: "right",
            render: (r) => (r.sellingPriceUsd ? <span className="font-semibold text-ink-900">{usd(r.sellingPriceUsd)}{r.priceSource === "override" && <span title="Manual override" className="ml-1 text-brand-600">●</span>}</span> : <Pill tone="amber">RFQ</Pill>),
          },
          { key: "available", label: "Available", align: "right", render: (r) => num(r.available) },
          { key: "img", label: "Image", render: (r) => <Pill tone={IMG_TONE[r.imageStatus]}>{r.imageStatus}</Pill> },
          { key: "status", label: "Status", render: (r) => <Pill tone={STATUS_TONE[r.status]}>{r.status.replace(/_/g, " ")}</Pill> },
        ]}
      />
      <Pagination page={page} limit={50} total={list.data?.total} onPage={(p) => set("page", String(p))} />
    </div>
  );
}
