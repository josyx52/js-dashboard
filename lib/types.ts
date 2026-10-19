export type Pillar = "deus" | "saude" | "familia" | "estudo" | "negocio" | "trabalho";

export const PILLARS: { key: Pillar; label: string; color: string }[] = [
  { key: "deus", label: "Deus", color: "#c98500" },
  { key: "saude", label: "Saúde", color: "#d95926" },
  { key: "familia", label: "Família", color: "#9085e9" },
  { key: "estudo", label: "Estudo", color: "#199e70" },
  { key: "negocio", label: "Negócio", color: "#d55181" },
  { key: "trabalho", label: "Trabalho", color: "#3987e5" },
];

// Cores validadas (skill dataviz) no fundo escuro: banda de luminosidade,
// croma, contraste e separacao para daltonismo — nesta ordem de empilhamento.
export const PILLAR_STACK_ORDER: Pillar[] = ["deus", "familia", "saude", "estudo", "trabalho", "negocio"];

export interface TaskCache {
  id: string;
  user_id: string;
  source: "todoist" | "ticktick";
  content: string;
  due: string | null;
  status: "open" | "done";
  pillar: Pillar | null;
  delegable: boolean;
  recurring?: boolean;
  updated_at: string;
}

export interface Integration {
  id: string;
  name: string;
  description: string | null;
  connected: boolean;
  capabilities: string[];
  created_at: string;
}

export interface IntegrationTool {
  id: string;
  integration_id: string;
  name: string;
  description: string | null;
  input_schema: any;
}

