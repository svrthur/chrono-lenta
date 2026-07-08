import type { Response } from "express";

// SSE client registry for real-time broadcast
const clients = new Set<Response>();

export function addSseClient(res: Response): void {
  clients.add(res);
  res.on("close", () => {
    clients.delete(res);
  });
}

export function broadcastDataUpdated(): void {
  const msg = `event: data-updated\ndata: {}\n\n`;
  for (const client of clients) {
    try {
      client.write(msg);
    } catch {
      clients.delete(client);
    }
  }
}
