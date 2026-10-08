"use client";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import type { Plan } from "@/lib/plans";

export function Billing({ currentPlan = "free" }: { currentPlan?: Plan }) {
  const router = useRouter();
  return (
    <div style={{ marginTop: 24, marginBottom: 35 }}>
      <p>Confirmed plan: {currentPlan[0].toUpperCase() + currentPlan.slice(1)}</p>
      <Button variant="ghost" onClick={() => router.refresh()}>
        Refresh confirmed plan
      </Button>
      <p role="status">Paid subscriptions are being prepared. Your confirmed plan remains active.</p>
    </div>
  );
}
