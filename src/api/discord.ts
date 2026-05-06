import { fetch } from "@tauri-apps/plugin-http";

interface DiscordField { name: string; value: string; inline?: boolean }

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordField[];
  footer?: { text: string };
  timestamp?: string;
}

export async function sendDiscordWebhook(webhookUrl: string, embeds: DiscordEmbed[]): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
}

export async function sendDiscordFile(webhookUrl: string, blob: Blob, filename: string): Promise<void> {
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ attachments: [{ id: 0, filename }] }));
  form.append("files[0]", blob, filename);
  const res = await fetch(webhookUrl, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
}
