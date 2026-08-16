import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase-server";

export async function proxy(request: NextRequest) {
  if (
    process.env.ERP_WINDOW_FLOW_QA === "1" &&
    request.nextUrl.pathname.startsWith("/qa-window-flow")
  ) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|xlsx|xls|pdf)$).*)",
  ],
};
