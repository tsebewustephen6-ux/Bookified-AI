export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "QUOTA_REACHED"
  | "PROCESSING_FAILED"
  | "PROVIDER_UNAVAILABLE"
  | "CONFLICT"
  | "INTERNAL";
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function failure(error: unknown) {
  if (error instanceof AppError)
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  console.error("request_failed", {
    kind: error instanceof Error ? error.name : "unknown",
  });
  return Response.json(
    {
      error: {
        code: "INTERNAL",
        message: "The request could not be completed. Please try again.",
      },
    },
    { status: 500 },
  );
}
