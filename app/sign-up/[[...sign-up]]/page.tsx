import { SignUp } from "@clerk/nextjs";
import { authConfigured } from "@/lib/env";
export default function SignUpPage() {
  return (
    <div className="auth-page">
      {authConfigured() ? (
        <SignUp />
      ) : (
        <div className="setup-note">
          <h1>Account creation is being prepared</h1>
          <p>Clerk configuration is required to create an account.</p>
        </div>
      )}
    </div>
  );
}
