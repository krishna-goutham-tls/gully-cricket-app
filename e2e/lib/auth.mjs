import { signIn, client, api } from "./env.mjs";

/** Opens the app signed in as a role, with no login screen. */
export async function loginAs(page, role, orgName) {
  const { token } = await signIn(role);
  const boot = await client().query(api.auth.bootstrap, { token });
  const m = orgName
    ? boot.memberships.find((x) => x.orgName === orgName)
    : boot.memberships.find((x) => x.status === "active" && !x.isSandbox);
  await page.addInitScript(
    ([t, o]) => {
      localStorage.setItem("cricket_session_token", t);
      if (o) localStorage.setItem("cricket_active_org", o);
    },
    [token, m ? String(m.orgId) : ""],
  );
  return { token, orgId: m?.orgId };
}

/** Opens a screen. A redirect on the screen before can interrupt the first try. */
export async function open(page, path) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(path);
      return;
    } catch (e) {
      if (i === 2 || !String(e).includes("interrupted")) throw e;
      await page.waitForTimeout(500);
    }
  }
}
