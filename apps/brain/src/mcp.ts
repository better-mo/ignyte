import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools } from "./agent/tools.ts";

/**
 * The same People Brain tools over MCP (stdio), so Claude Desktop / Claude Code can
 * query your network directly. `present` is UI-only and not exposed here.
 */
export async function startMcpServer() {
  const server = new McpServer({
    name: "ignyte-people-brain",
    version: "0.1.0",
  });
  for (const t of tools) {
    if (t.name === "present") continue;
    server.registerTool(
      t.name,
      {
        description: t.description,
        inputSchema: t.schema.shape,
        annotations: { readOnlyHint: !t.writes },
      },
      async (args: unknown) => {
        const parsed = t.schema.safeParse(args ?? {});
        if (!parsed.success)
          return {
            isError: true,
            content: [{ type: "text" as const, text: parsed.error.message }],
          };
        try {
          const out = await t.run(parsed.data);
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(out, null, 1) },
            ],
          };
        } catch (err) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: String(err) }],
          };
        }
      },
    );
  }
  await server.connect(new StdioServerTransport());
  console.error("ignyte people brain MCP server running on stdio");
}
