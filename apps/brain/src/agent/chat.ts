import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config.ts";
import { all } from "../db/index.ts";
import { me } from "../graph/query.ts";
import { toolByName, tools } from "./tools.ts";

type Msg = Anthropic.Beta.BetaMessageParam;

export type ChatEvents = {
  onText?: (delta: string) => void;
  onToolCall?: (name: string, input: unknown) => void;
  onCard?: (card: unknown) => void;
};

const SYSTEM = `You are the owner's People Brain: a private memory of everyone they know, built from their Gmail accounts, calendars, Google and phone contacts, LinkedIn and X exports, community data, and profile enrichment.

How to work:
- Answer from the tools, never from general knowledge about people. Look people up before making claims about them; fetch full profiles for anyone you recommend.
- Every relationship claim needs evidence you can name: "met twice (last in March)", "worked together at Shopify 2018–2021", "both in Product Manager Community". Say which source it came from when it matters.
- Keep confirmed relationships separate from context. A shared community, same company or same city is context, not proof two people know each other — say so.
- For a company ("get into Shopify"), start with get_company: it resolves aliases and domains and gives current people, alumni and warm paths. For company lists ("fintechs where I know someone") use companies_where_i_know_people. Pass the company to \`present\` so it shows as a header.
- Prefer warm paths through strong ties. When suggesting an introduction, name the connector, why they're well placed, and offer a short draft ask.
- For signals (hiring, fundraising, moving, exploring roles, a topic someone wrote about), search activity and cite the item (date, community or thread).
- If the data doesn't support an answer, say what's missing (for example, "no one at Shopify in your data; LinkedIn export not imported yet") rather than guessing.
- End each answer by calling \`present\` once with the people, hops and evidence that matter, so the UI can show it. Keep the written answer tight: lead with the answer, then the evidence.
- Refer to people by name, never by internal id.`;

function toolParams(): Anthropic.Beta.BetaTool[] {
  return tools.map((t, i) => {
    const { $schema: _s, ...schema } = z.toJSONSchema(t.schema) as Record<
      string,
      unknown
    >;
    return {
      name: t.name,
      description: t.description,
      input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
      eager_input_streaming: true,
      ...(i === tools.length - 1
        ? { cache_control: { type: "ephemeral" as const } }
        : {}),
    };
  });
}

function ownerContext(): string {
  const self = me();
  const accounts = all<{
    provider: string;
    label: string;
    email: string | null;
  }>("SELECT provider, label, email FROM accounts");
  return [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    self
      ? `The owner is ${self.display_name}${self.headline ? ` (${self.headline})` : ""}${self.city ? `, based in ${self.city}` : ""}.`
      : "The owner's own profile isn't identified yet.",
    accounts.length
      ? `Connected sources: ${accounts.map((a) => `${a.provider}${a.email ? ` <${a.email}>` : ` (${a.label})`}`).join(", ")}.`
      : "No sources are connected yet.",
  ].join(" ");
}

export class Conversation {
  private client = new Anthropic();
  private messages: Msg[] = [];

  async send(userText: string, ev: ChatEvents = {}): Promise<string> {
    this.messages.push({ role: "user", content: userText });
    const toolDefs = toolParams();
    let finalText = "";
    let jsonRetries = 0;

    for (let turn = 0; turn < 12; turn++) {
      const stream = this.client.beta.messages.stream({
        model: config.anthropicModel,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config: { effort: config.anthropicEffort },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: ownerContext() },
        ],
        tools: toolDefs,
        messages: this.messages,
      });
      stream.on("text", (delta) => {
        finalText += delta;
        ev.onText?.(delta);
      });

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        // Only an unparseable streamed tool input is retried; API errors propagate.
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
        continue;
      }

      if (message.stop_reason === "refusal") {
        const note = "\n\n(The model declined this request.)";
        ev.onText?.(note);
        return finalText + note;
      }
      this.messages.push({ role: "assistant", content: message.content });
      if (message.stop_reason === "pause_turn") continue;

      const calls = message.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
      );
      if (!calls.length) return finalText;
      if (message.stop_reason === "max_tokens")
        throw new Error("Response hit max_tokens mid tool call");

      const results: Anthropic.Beta.BetaToolResultBlockParam[] =
        await Promise.all(
          calls.map(async (call) => {
            const t = toolByName.get(call.name);
            ev.onToolCall?.(call.name, call.input);
            if (!t)
              return {
                type: "tool_result" as const,
                tool_use_id: call.id,
                is_error: true,
                content: `Unknown tool ${call.name}`,
              };
            const parsed = t.schema.safeParse(call.input);
            if (!parsed.success) {
              return {
                type: "tool_result" as const,
                tool_use_id: call.id,
                is_error: true,
                content: `Invalid input: ${parsed.error.message}`,
              };
            }
            try {
              const out = (await t.run(parsed.data)) as { card?: unknown };
              if (call.name === "present" && out?.card) {
                ev.onCard?.(out.card);
                return {
                  type: "tool_result" as const,
                  tool_use_id: call.id,
                  content: "Shown to the user.",
                };
              }
              return {
                type: "tool_result" as const,
                tool_use_id: call.id,
                content: JSON.stringify(out),
              };
            } catch (err) {
              return {
                type: "tool_result" as const,
                tool_use_id: call.id,
                is_error: true,
                content: String(err),
              };
            }
          }),
        );
      this.messages.push({ role: "user", content: results });
      if (finalText && !finalText.endsWith("\n")) {
        finalText += "\n\n";
        ev.onText?.("\n\n");
      }
    }
    return finalText;
  }
}
