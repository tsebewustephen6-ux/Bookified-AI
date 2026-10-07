export const plans = {
  free: { books: 1, sessions: 5, duration: 300 },
  standard: { books: 10, sessions: 100, duration: 900 },
  pro: { books: 100, sessions: null, duration: 3600 },
} as const;
export type Plan = keyof typeof plans;
export function utcPeriod(now = new Date()) {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}
export function resolvePlan(
  items: {
    status: string;
    plan: { slug: string } | null;
    periodEnd?: number | null;
  }[],
  now = Date.now(),
): Plan {
  const active = items.filter(
    (i) =>
      i.status === "active" ||
      i.status === "past_due" ||
      (i.status === "canceled" && i.periodEnd != null && i.periodEnd > now),
  );
  return active.some((i) => i.plan?.slug === "pro")
    ? "pro"
    : active.some((i) => i.plan?.slug === "standard")
      ? "standard"
      : "free";
}
