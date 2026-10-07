import { z } from "zod";
const errorSchema = z.object({ error: z.object({ message: z.string() }) });
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
    throw new Error(
      error.success
        ? error.data.error.message
        : "The request could not complete. Try again.",
    );
  }
  return schema.parse(data);
}
