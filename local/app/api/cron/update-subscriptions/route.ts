import { NextRequest } from "next/server";
import { json } from "@local/lib/http";
import { requireLocalCronAuth } from "@local/lib/cron-auth";
import { runLocalSubscriptionAutoUpdateCron } from "@local/lib/auto-update-service";

export async function POST(request: NextRequest) {
  const authError = requireLocalCronAuth(request);
  if (authError) return authError;

  const summary = await runLocalSubscriptionAutoUpdateCron();
  return json({
    success: true,
    ...summary,
    timestamp: new Date().toISOString(),
  });
}
