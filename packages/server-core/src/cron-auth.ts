export type CronSecretValidationResult =
  | { ok: true }
  | { ok: false; reason: "missing-secret" | "unauthorized" };

export function extractBearerToken(authorization: string | null | undefined): string {
  if (!authorization) return "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

export function validateCronSecret(params: {
  cronSecret: string | null | undefined;
  authorization: string | null | undefined;
}): CronSecretValidationResult {
  if (!params.cronSecret) return { ok: false, reason: "missing-secret" };
  if (extractBearerToken(params.authorization) !== params.cronSecret) {
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: true };
}
