import Link from "next/link";
import { currentOwner, entitlement } from "@/lib/auth";
import { plans, type Plan } from "@/lib/plans";
import { usageSummary } from "@/lib/sessions";
import { Billing } from "@/components/billing";

export default async function Subscriptions() {
  const owner = await currentOwner();
  let current: Plan | undefined;
  let usage: Awaited<ReturnType<typeof usageSummary>> | undefined;
  let unavailable = false;
  if (owner) {
    try {
      [current, usage] = await Promise.all([
        entitlement(owner),
        usageSummary(owner),
      ]);
    } catch {
      unavailable = true;
    }
  }
  return (
    <>
      <header className="page-header">
        <p className="eyebrow">KEEP THE CONVERSATION GOING</p>
        <h1>A plan for every reader.</h1>
        <p>
          Make space for more books and longer conversations. Session allowances
          reset on the first day of each UTC calendar month.
        </p>
      </header>
      {unavailable ? (
        <p className="error-message" role="status">
          We couldn’t confirm your plan or usage. Refresh to try again.
        </p>
      ) : usage && current ? (
        <section className="panel" style={{ marginBottom: 30 }}>
          <p className="eyebrow">CONFIRMED PLAN: {current.toUpperCase()}</p>
          <div className="usage-row">
            <p>
              Books reserved / ready
              <strong>
                {usage.books} / {plans[current].books}
              </strong>
            </p>
            <p>
              Connected sessions this month
              <strong>
                {usage.connected} / {plans[current].sessions ?? "Unlimited"}
              </strong>
            </p>
            <p>
              Pending connection<strong>{usage.reserved}</strong>
            </p>
          </div>
          <p style={{ fontSize: 12 }}>
            Resets {new Date(usage.resetAt).toUTCString()}. Upgrades apply
            immediately; downgrades keep your existing books readable.
          </p>
        </section>
      ) : null}
      <div className="plan-grid">
        {(Object.entries(plans) as [Plan, (typeof plans)[Plan]][]).map(
          ([name, limits]) => (
            <section className="plan-card" key={name}>
              <h2>{name[0].toUpperCase() + name.slice(1)}</h2>
              {current === name ? (
                <span className="status status-ready">Current plan</span>
              ) : null}
              <ul>
                <li>
                  {limits.books} {limits.books === 1 ? "book" : "books"} in your
                  library
                </li>
                <li>
                  {limits.sessions ?? "Unlimited"} connected sessions per UTC
                  month
                </li>
                <li>Up to {limits.duration / 60} minutes per conversation</li>
                <li>Private books and page-grounded answers</li>
              </ul>
            </section>
          ),
        )}
      </div>
      {owner ? (
        <Billing currentPlan={current} />
      ) : (
        <div className="setup-note">
          <Link className="text-link" href="/sign-in">
            Sign in to see subscription options →
          </Link>
        </div>
      )}
      <p style={{ margin: "25px 0 55px", color: "var(--muted)", fontSize: 12 }}>
        Session allowances reset on the first day of each UTC calendar month.
        Upgrades take effect immediately; downgrades keep your existing books
        readable.
      </p>
    </>
  );
}
