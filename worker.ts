// Entrada do Worker: reaproveita o handler gerado pelo OpenNext e acrescenta
// o handler `scheduled` (cron definido em wrangler.jsonc) que corre o sync
// sozinho — antes o sync so acontecia ao carregar no botao.
// @ts-ignore — gerado por `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";
import { cronKey } from "./lib/auth";

export default {
  fetch: handler.fetch,

  async scheduled(
    controller: { scheduledTime: number },
    env: Record<string, string | undefined>,
    ctx: { waitUntil(p: Promise<unknown>): void }
  ) {
    if (!env.APP_PASSWORD) {
      console.error("cron sync: APP_PASSWORD nao configurado");
      return;
    }
    const key = await cronKey(env.APP_PASSWORD);
    const call = async (path: string) => {
      const res: Response = await handler.fetch(
        new Request(`https://cron.internal${path}`, { method: "POST", headers: { "x-cron-key": key } }),
        env,
        ctx
      );
      console.log(`cron ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 500)}`);
    };
    // Cron de 15 em 15 min. Sync so na primeira volta de cada hora; o ciclo do
    // Holiday (historico, automacoes, briefing) corre sempre.
    const onTheHour = new Date(controller.scheduledTime).getUTCMinutes() < 15;
    const holiday = () => call("/api/holiday/briefing");
    ctx.waitUntil(onTheHour ? call("/api/sync").then(holiday) : holiday());
  },
};
