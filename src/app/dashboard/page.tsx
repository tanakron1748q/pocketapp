import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { PrivateWorkspace } from "@/components/private-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  if (!await getCurrentSession()) redirect("/login");
  return <PrivateWorkspace />;
}
