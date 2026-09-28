// Minimal streaming stand-in for POST /v1/messages used to exercise the chat loop offline.
import http from "node:http";
import fs from "node:fs";

const log = process.env.MOCK_LOG;
let n = 0;
const sse = (res, events) => {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const [type, data] of events)
    res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  res.end();
};
const start = (id) => [
  "message_start",
  {
    message: {
      id,
      type: "message",
      role: "assistant",
      model: "mock",
      content: [],
      stop_reason: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  },
];
const toolUse = (id, name, input) => [
  start(`msg_${id}`),
  [
    "content_block_start",
    {
      index: 0,
      content_block: { type: "tool_use", id: `toolu_${id}`, name, input: {} },
    },
  ],
  [
    "content_block_delta",
    {
      index: 0,
      delta: { type: "input_json_delta", partial_json: JSON.stringify(input) },
    },
  ],
  ["content_block_stop", { index: 0 }],
  [
    "message_delta",
    { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } },
  ],
  ["message_stop", {}],
];
const text = (id, t) => [
  start(`msg_${id}`),
  [
    "content_block_start",
    { index: 0, content_block: { type: "text", text: "" } },
  ],
  ["content_block_delta", { index: 0, delta: { type: "text_delta", text: t } }],
  ["content_block_stop", { index: 0 }],
  [
    "message_delta",
    { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
  ],
  ["message_stop", {}],
];

http
  .createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const json = JSON.parse(body || "{}");
    if (log)
      fs.appendFileSync(
        log,
        JSON.stringify({ headers: req.headers, body: json }) + "\n",
      );
    const last = json.messages?.at(-1);
    const results = Array.isArray(last?.content)
      ? last.content.filter((b) => b.type === "tool_result")
      : [];
    n++;
    if (!results.length)
      return sse(res, toolUse(n, "find_warm_paths", { company: "Shopify" }));
    const paths = (() => {
      try {
        return JSON.parse(results[0].content);
      } catch {
        return null;
      }
    })();
    if (Array.isArray(paths)) {
      const best = paths.find((p) => p.people.length === 3) ?? paths[0];
      return sse(
        res,
        toolUse(n, "present", {
          kind: "path",
          title: "Sara can introduce you to Daniel at Shopify",
          people: best.people.slice(1).map((p) => ({
            id: p.id,
            reason: `${p.name}: ${p.headline}`,
            badges: ["Product Manager Community"],
          })),
          hops: best.hops.map((h) => ({
            evidence: h.evidence,
            confirmed: h.confirmed,
          })),
          draft: "Hi Sara — would you be open to introducing me to Daniel?",
        }),
      );
    }
    return sse(
      res,
      text(
        n,
        "**Sara Chen** is your best path: you've met twice and she worked with Daniel at Shopify (2018–2021).",
      ),
    );
  })
  .listen(Number(process.env.MOCK_PORT ?? 4555), () =>
    console.log("mock anthropic listening"),
  );
