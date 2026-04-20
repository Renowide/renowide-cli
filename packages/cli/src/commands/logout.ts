import pc from "picocolors";
import { clearCredentials, loadCredentials } from "../config.js";

export async function cmdLogout() {
  const c = loadCredentials();
  if (!c) {
    console.log(pc.gray("already logged out"));
    return;
  }
  clearCredentials();
  console.log(pc.green(`✓ cleared credentials for ${c.creatorEmail || c.creatorId}`));
}
