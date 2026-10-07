import { SignIn } from "@clerk/nextjs";
import { authConfigured } from "@/lib/env";
export default function SignInPage() {
  return (
    <div className="auth-page">
      {authConfigured() ? (
        <SignIn />
      ) : (
        <div className="setup-note">
          <h1>Sign-in is being prepared</h1>
          <p>
            Clerk configuration is required before you can open a personal
            library.
          </p>
        </div>
      )}
    </div>
  );
}
