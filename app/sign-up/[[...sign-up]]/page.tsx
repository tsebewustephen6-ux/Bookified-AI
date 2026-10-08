import { Suspense } from "react";
import { SignUpForm } from "@/components/sign-up-form";
import { authConfigured } from "@/lib/env";

export default function SignUpPage() {
  return (
    <div className="auth-page">
      {authConfigured() ? (
        <Suspense fallback={<p role="status">Loading sign-up…</p>}>
          <SignUpForm />
        </Suspense>
      ) : (
        <div className="setup-note">
          <h1>Account creation is being prepared</h1>
          <p>Authentication service configuration is required to create an account.</p>
        </div>
      )}
    </div>
  );
}
