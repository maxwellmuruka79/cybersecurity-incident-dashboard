import { supabase } from "./supabase";

// Proves possession of the authenticator app: asks Supabase for a challenge, then answers it
// with the 6-digit code. Returns an error message, or null on success.
export async function verifyCode(factorId: string, code: string): Promise<string | null> {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) return challenge.error.message;
  const verified = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
  return verified.error ? verified.error.message : null;
}

export function friendlyCodeError(message: string): string {
  return message.toLowerCase().includes("invalid")
    ? "That code is not valid. Use the newest code from your app, and check that your phone's clock is correct."
    : message;
}