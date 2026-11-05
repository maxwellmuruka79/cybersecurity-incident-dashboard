import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface Profile {
  id: string;
  full_name: string | null;
  role: "admin" | "analyst" | "viewer";
}

// Loads everyone's profile so we can show names for assignees and note authors.
export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .then(({ data }) => setProfiles((data ?? []) as Profile[]));
  }, []);

  const nameOf = (id: string | null) => {
    if (!id) return "Unassigned";
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || `User ${id.slice(0, 4)}`;
  };

  return { profiles, nameOf };
}