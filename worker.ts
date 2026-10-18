// Entrada do Worker: reaproveita o handler gerado pelo OpenNext e acrescenta
// o handler `scheduled` (cron definido em wrangler.jsonc) que corre o sync
// sozinho — antes o sync so acontecia ao carregar no botao.
// @ts-ignore — gerado por `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";
import { cronKey } from "./lib/auth";

export default {
  fetch: handler.fetch,

  async scheduled(_controller: unknown, env: Record<string, string | undefined>, ctx: { waitUntil(p: Promise<unknown>): void }) {
    if (!env.APP_PASSWORD) {
      console.error("cron sync: APP_PASSWORD nao configurado");
      return;
    }
    const req = new Request("https://cron.internal/api/sync", {
      method: "POST",
      headers: { "x-cron-key": await cronKey(env.APP_PASSWORD) },
    });
    ctx.waitUntil(
      handler.fetch(req, env, ctx).then(async (res: Response) => {
        console.log(`cron sync: HTTP ${res.status} ${await res.text()}`);
      })
    );
  },
};
