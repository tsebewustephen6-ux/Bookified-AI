import { Suspense } from "react";
import { SignInForm } from "@/components/sign-in-form";
import { authConfigured } from "@/lib/env";

export default function SignInPage() {
  return (
    <div className="auth-page">
      {authConfigured() ? (
        <Suspense fallback={<p role="status">Loading sign-in…</p>}>
          <SignInForm />
        </Suspense>
      ) : (
        <div className="setup-note">
          <h1>Sign-in is being prepared</h1>
          <p>
            Authentication service configuration is required before you can open
            a personal library.
          </p>
        </div>
      )}
    </div>
  );
}
