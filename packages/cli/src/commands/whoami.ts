import pc from "picocolors";
import { RenowideAPI } from "../api.js";
import { requireCredentials } from "../config.js";

export async function cmdWhoami() {
  const c = requireCredentials();
  const api = new RenowideAPI(c.apiBase, c.token);
  try {
    const me = await api.get<{ id: string; email: string; creator_name?: string }>(
      "/api/v1/creator/me",
    );
    console.log(pc.green("✓ authenticated"));
    console.log(`  creator: ${me.email} (${me.id})`);
    console.log(`  api:     ${c.apiBase}`);
  } catch (err: any) {
    if (err?.status === 401) {
      throw new Error("credentials invalid — run `renowide login` to re-authenticate");
    }
    throw err;
  }
}
