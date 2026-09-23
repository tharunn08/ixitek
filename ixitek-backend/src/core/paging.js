// paging.js — one convention for list endpoints: ?page=1&limit=50.
// Values are clamped and interpolated as integers (never user strings), and
// responses carry { total, page, limit } next to the rows.
function paging(req, { def = 50, max = 200, pageParam = "page", limitParam = "limit" } = {}) {
  const limit = Math.min(Math.max(Math.floor(Number(req.query[limitParam])) || def, 1), max);
  const page = Math.min(Math.max(Math.floor(Number(req.query[pageParam])) || 1, 1), 100000);
  return { limit, page, offset: (page - 1) * limit, sql: `LIMIT ${limit} OFFSET ${(page - 1) * limit}` };
}
const meta = (pg, total) => ({ total: Number(total), page: pg.page, limit: pg.limit });

module.exports = { paging, meta };
