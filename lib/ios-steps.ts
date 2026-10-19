// No iPhone, os passos so saem da app Saude atraves do atalho de passos
// (Atalhos). O botao Sincronizar abre-o e o atalho volta ao dashboard
// (x-callback-url), por isso os passos atualizam junto com o sync.
// Nome exato do atalho no iPhone (o iOS nao deixou mudar o nome automatico).
export const STEPS_SHORTCUT = "Get Contents of URL";

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function stepsShortcutUrl(back: string) {
  const ok = new URL(back);
  ok.searchParams.set("passos", "ok");
  const err = new URL(back);
  err.searchParams.set("passos", "erro");
  return (
    "shortcuts://x-callback-url/run-shortcut?name=" +
    encodeURIComponent(STEPS_SHORTCUT) +
    "&x-success=" +
    encodeURIComponent(ok.toString()) +
    "&x-error=" +
    encodeURIComponent(err.toString())
  );
}
