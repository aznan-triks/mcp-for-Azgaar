import { z } from "zod";
import type { MapSession } from "./browser.ts";

// The bridge owns geometry and rendering. Node only validates the wire shape and transports bytes.
export const insetSchema = z.object({
  x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number(),
  title: z.string().optional(),
  corner: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
  cover: z.number().min(0.15).max(0.65).optional()
}).strict();

export async function captureInset(session: MapSession, inset: z.infer<typeof insetSchema>, width: number, height: number, format: "png" | "jpeg") {
  const pic = await session.call<{ data: string; mimeType: string; width: number; height: number; bounds: unknown; cartouche: unknown; regionRatio: number }>("renderInset", { inset, width, height, format });
  return { ...pic, bytes: Buffer.from(pic.data, "base64") };
}
