import { z } from "zod";
import { createHash } from "node:crypto";
import type { Tx } from "../db";

/**
 * Customer-level, stable variant assignment for comparing a small number of style versions.
 * One customer always sees one variant for the whole experiment. Human takeover is recorded
 * separately (funnel event "takeover") so it can be treated as its own intervention.
 */
export const experimentSchema = z.object({
  enabled: z.boolean(),
  key: z.string().min(1).max(40),
  /** variant name → style profile version */
  variants: z.record(z.string().max(10), z.number().int().min(1)).refine((v) => Object.keys(v).length >= 2 && Object.keys(v).length <= 4, "Use 2–4 variants"),
  startedAt: z.string().nullable(),
});
export type Experiment = z.infer<typeof experimentSchema>;

export async function getExperiment(tx: Tx): Promise<Experiment | null> {
  const row = await tx.integrationConfig.findUnique({ where: { id: "experiment" } });
  if (!row?.enabled) return null;
  const p = experimentSchema.safeParse(row.settings);
  return p.success && p.data.enabled ? p.data : null;
}

export function assignVariant(key: string, customerId: string, variants: string[]) {
  const h = createHash("sha256").update(`${key}:${customerId}`).digest();
  return [...variants].sort()[h.readUInt32BE(0) % variants.length];
}

export async function variantFor(tx: Tx, customerId: string): Promise<string | null> {
  const exp = await getExperiment(tx);
  if (!exp) return null;
  const v = `${exp.key}:${assignVariant(exp.key, customerId, Object.keys(exp.variants))}`;
  await tx.customer.update({ where: { id: customerId }, data: { experimentVariant: v } });
  return v;
}

export async function styleVersionForVariant(tx: Tx, variant: string | null): Promise<number | null> {
  if (!variant) return null;
  const exp = await getExperiment(tx);
  if (!exp) return null;
  const [key, name] = variant.split(":");
  if (key !== exp.key) return null;
  return exp.variants[name] ?? null;
}
