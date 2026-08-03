export type Pillar = "deus" | "saude" | "familia" | "estudo" | "negocio" | "trabalho";

export const PILLARS: { key: Pillar; label: string; color: string }[] = [
  { key: "deus", label: "Deus", color: "#E8B93F" },
  { key: "saude", label: "Saúde", color: "#F54E00" },
  { key: "familia", label: "Família", color: "#8B7CF6" },
  { key: "estudo", label: "Estudo", color: "#36CFC9" },
  { key: "negocio", label: "Negócio", color: "#EF5DA8" },
  { key: "trabalho", label: "Trabalho", color: "#4F8FF7" },
];

export interface TaskCache {
  id: string;
  user_id: string;
  source: "todoist" | "ticktick";
  content: string;
  due: string | null;
  status: "open" | "done";
  pillar: Pillar | null;
  delegable: boolean;
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

