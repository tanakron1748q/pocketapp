import "server-only";

import { headers } from "next/headers";
import { getAuth, isAuthConfigured } from "./auth";

// Call at every private server entry point. Never accept a user ID from the caller.
export async function getCurrentSession() {
  if (!isAuthConfigured()) return null;
  return getAuth().api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
}
