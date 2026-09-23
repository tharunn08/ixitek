// events.js — business events → durable background jobs (transactional outbox).
// emit() MUST be called with the same connection as the business change so the
// event exists if and only if the change committed. Handlers (email,
// notifications, stats) run later in the job worker and can fail/retry
// without ever rolling back an order, payment or quote.
const jobs = require("./jobs.js");

const handlers = new Map(); // event → [fn]

function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, []);
  handlers.get(event).push(fn);
}

async function emit(event, payload, conn, { key } = {}) {
  return jobs.enqueue("event", { event, payload }, { idempotencyKey: key ? `evt:${event}:${key}` : null, maxAttempts: 8 }, conn);
}

jobs.register("event", async ({ event, payload }) => {
  const list = handlers.get(event) || [];
  const results = [];
  for (const fn of list) results.push(await fn(payload));
  return { event, handlers: list.length, results: results.filter((r) => r !== undefined).slice(0, 5) };
});

module.exports = { on, emit };
