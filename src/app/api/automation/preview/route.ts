import { z } from "zod";
import { api } from "@/server/http";
import { rulesSchema } from "@/server/automation/settings";
import { planReply } from "@/server/automation/timing";

/** Explicit preview: how the (unsaved) rules affect a sample conversation. Runs 5 samples to show variance. */
export const POST = api(
  { auth: "user", body: z.object({ rules: rulesSchema, offsetsSec: z.array(z.number().int().min(0).max(7200)).min(1).max(10), isFirstReply: z.boolean(), startAt: z.string().datetime().optional(), sentLastHour: z.number().int().min(0).default(0), sentLastDay: z.number().int().min(0).default(0) }) },
  async ({ body }) => {
    const start = body.startAt ? new Date(body.startAt) : new Date();
    const inbound = body.offsetsSec.map((s) => new Date(start.getTime() + s * 1000));
    const runs = Array.from({ length: 5 }, () => planReply({ inboundAt: inbound, isFirstReply: body.isFirstReply, rules: body.rules, sentLastHour: body.sentLastHour, sentLastDay: body.sentLastDay }));
    return { inbound, runs };
  },
);
