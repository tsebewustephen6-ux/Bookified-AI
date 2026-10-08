import { z } from "zod";
const errorSchema = z.object({
  error: z.object({ message: z.string(), code: z.string().optional() }),
});
export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = errorSchema.safeParse(data);
    throw new ApiError(
      error.success
        ? error.data.error.message
        : "The request could not complete. Try again.",
      error.success ? error.data.error.code : undefined,
    );
  }
  return schema.parse(data);
}
