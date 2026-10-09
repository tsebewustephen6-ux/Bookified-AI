import { mobileHandler } from "@/lib/mobile-api";
export const runtime = "nodejs";
export const maxDuration = 60;
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return mobileHandler(request, (await context.params).path);
}
export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
