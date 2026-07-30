export type Pillar = "deus" | "saude" | "familia" | "estudo" | "negocio" | "trabalho";

export const PILLARS: { key: Pillar; label: string; color: string }[] = [
  { key: "deus", label: "Deus", color: "#8B5CF6" },
  { key: "saude", label: "Saúde", color: "#22C55E" },
  { key: "familia", label: "Família", color: "#F59E0B" },
  { key: "estudo", label: "Estudo", color: "#3B82F6" },
  { key: "negocio", label: "Negócio", color: "#EC4899" },
  { key: "trabalho", label: "Trabalho", color: "#22D3D0" },
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

