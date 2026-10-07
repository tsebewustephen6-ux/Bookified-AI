import { AppError } from "./errors";
export function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      `Service configuration is missing: ${name}.`,
      503,
    );
  return value;
}
export const authConfigured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
export function baseUrl() {
  const configured = required("APP_BASE_URL");
  try {
    const url = new URL(configured);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("Expected an origin");
    return url;
  } catch {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "APP_BASE_URL must be an application origin without credentials, paths or query parameters.",
      503,
    );
  }
}
