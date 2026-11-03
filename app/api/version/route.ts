// The version of the build that is live now. Built once per deploy, so a
// phone running an older build can see that a newer one exists.
export const dynamic = "force-static";

export function GET() {
  return Response.json({ v: process.env.NEXT_PUBLIC_APP_VERSION ?? "" });
}
