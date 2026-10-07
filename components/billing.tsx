"use client";
import { PricingTable, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function Billing() {
  const clerk = useClerk();
  const router = useRouter();
  return (
    <>
      <div
        style={{ display: "flex", gap: 12, marginBottom: 25, flexWrap: "wrap" }}
      >
        <Button variant="outline" onClick={() => clerk.openUserProfile()}>
          Manage subscription
        </Button>
        <Button variant="ghost" onClick={() => router.refresh()}>
          Refresh confirmed plan
        </Button>
      </div>
      <PricingTable
        for="user"
        newSubscriptionRedirectUrl="/subscriptions"
        fallback={<p role="status">Loading current provider prices…</p>}
      />
    </>
  );
}
