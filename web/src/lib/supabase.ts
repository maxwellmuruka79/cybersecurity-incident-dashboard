import { createClient } from "@supabase/supabase-js";

// Browser client. Uses the PUBLISHABLE key only; Row Level Security decides
// what a logged-in user may read or change. Never put the secret key in here.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);