import { fetch } from "@tauri-apps/plugin-http";
import { addDiscordLog } from "../components/Tabs/MyProfilePage";

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
  const payload = JSON.stringify({ embeds });
  let status: number | null = null;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    status = res.status;
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      const msg = `${res.status} ${text}`;
      addDiscordLog({ url: webhookUrl, payload, status, error: msg });
      throw new Error(msg);
    }
    addDiscordLog({ url: webhookUrl, payload, status, error: null });
  } catch (err) {
    if (status === null) {
      const msg = err instanceof Error ? err.message : String(err);
      addDiscordLog({ url: webhookUrl, payload, status: null, error: msg });
    }
    throw err;
  }
}

export async function sendDiscordFile(webhookUrl: string, blob: Blob, filename: string): Promise<void> {
  const form = new FormData();
  const payloadJson = JSON.stringify({ attachments: [{ id: 0, filename }] });
  form.append("payload_json", payloadJson);
  form.append("files[0]", blob, filename);
  let status: number | null = null;
  try {
    const res = await fetch(webhookUrl, { method: "POST", body: form });
    status = res.status;
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      const msg = `${res.status} ${text}`;
      addDiscordLog({ url: webhookUrl, payload: `[file: ${filename}] ${payloadJson}`, status, error: msg });
      throw new Error(msg);
    }
    addDiscordLog({ url: webhookUrl, payload: `[file: ${filename}] ${payloadJson}`, status, error: null });
  } catch (err) {
    if (status === null) {
      const msg = err instanceof Error ? err.message : String(err);
      addDiscordLog({ url: webhookUrl, payload: `[file: ${filename}] ${payloadJson}`, status: null, error: msg });
    }
    throw err;
  }
}
