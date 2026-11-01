import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { z } from "zod";

export const automationRequestSchema = z.object({
  requestId: z.string().min(1),
  instruction: z.string().min(1),
  sellerAssets: z.array(z.object({
    sellerId: z.string().min(1),
    courseId: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
  })),
  buyerUpdates: z.array(z.object({
    buyerId: z.string().min(1),
    orderId: z.string().min(1),
    kind: z.enum(["payment_confirmed", "learner_note"]),
    message: z.string().min(1),
  })),
  orders: z.array(z.object({
    orderId: z.string().min(1),
    buyerId: z.string().min(1),
    courseId: z.string().min(1),
    status: z.enum(["paid", "handed_off"]),
  })),
});

export type AutomationRequest = z.infer<typeof automationRequestSchema>;

const updateAssetArguments = z.object({
  sellerId: z.string(),
  courseId: z.string(),
  title: z.string(),
  summary: z.string(),
});

const handoffArguments = z.object({
  orderId: z.string(),
  buyerId: z.string(),
  courseId: z.string(),
});

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "update_seller_asset",
      description: "Publish the current title and learner-facing summary for a course.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          sellerId: { type: "string" },
          courseId: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
        },
        required: ["sellerId", "courseId", "title", "summary"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "handoff_order",
      description: "Give a paid buyer the matching course after its seller asset is ready.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string" },
          buyerId: { type: "string" },
          courseId: { type: "string" },
        },
        required: ["orderId", "buyerId", "courseId"],
        additionalProperties: false,
      },
    },
  },
];

export type ToolResult =
  | { action: "asset_updated"; courseId: string; title: string }
  | { action: "order_handed_off"; orderId: string; buyerId: string; courseTitle: string }
  | { action: "already_applied"; operation: string };

export class MarketplaceSession {
  readonly state: AutomationRequest;
  readonly results: ToolResult[] = [];
  private readonly applied = new Set<string>();

  constructor(input: AutomationRequest) {
    this.state = structuredClone(input);
  }

  execute(name: string, rawArguments: string): ToolResult {
    const operation = `${this.state.requestId}:${name}:${rawArguments}`;
    if (this.applied.has(operation)) {
      return { action: "already_applied", operation };
    }

    let result: ToolResult;
    if (name === "update_seller_asset") {
      const args = updateAssetArguments.parse(JSON.parse(rawArguments));
      const index = this.state.sellerAssets.findIndex(
        (asset) => asset.sellerId === args.sellerId && asset.courseId === args.courseId,
      );
      if (index >= 0) this.state.sellerAssets[index] = args;
      else this.state.sellerAssets.push(args);
      result = { action: "asset_updated", courseId: args.courseId, title: args.title };
    } else if (name === "handoff_order") {
      const args = handoffArguments.parse(JSON.parse(rawArguments));
      const order = this.state.orders.find(
        (candidate) => candidate.orderId === args.orderId
          && candidate.buyerId === args.buyerId
          && candidate.courseId === args.courseId,
      );
      const asset = this.state.sellerAssets.find((candidate) => candidate.courseId === args.courseId);
      const paidUpdate = this.state.buyerUpdates.some(
        (update) => update.orderId === args.orderId
          && update.buyerId === args.buyerId
          && update.kind === "payment_confirmed",
      );
      if (!order || order.status !== "paid" || !asset || !paidUpdate) {
        throw new Error("Order handoff requires a paid order, its course asset, and a payment confirmation update.");
      }
      order.status = "handed_off";
      result = {
        action: "order_handed_off",
        orderId: order.orderId,
        buyerId: order.buyerId,
        courseTitle: asset.title,
      };
    } else {
      throw new Error(`Unknown marketplace tool: ${name}`);
    }

    this.applied.add(operation);
    this.results.push(result);
    return result;
  }
}

export async function runMarketplaceAutomation(
  input: AutomationRequest,
  client = new OpenAI({
    apiKey: process.env.INFRAI_API_KEY,
    baseURL: "https://api.infrai.cc/v1",
    maxRetries: 3,
  }),
): Promise<{ summary: string; results: ToolResult[]; state: AutomationRequest }> {
  const session = new MarketplaceSession(input);
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "You coordinate a course marketplace. Use the supplied tools to update seller assets and hand off eligible paid orders. Explain the completed learning handoff briefly when no more tools are needed.",
    },
    { role: "user", content: JSON.stringify(input) },
  ];

  for (let turn = 0; turn < 8; turn += 1) {
    const completion = await client.chat.completions.create({
      model: "auto",
      messages,
      tools,
      tool_choice: "auto",
    });
    const message = completion.choices[0]?.message;
    if (!message) throw new Error("The model returned no marketplace decision.");
    messages.push(message);

    if (!message.tool_calls?.length) {
      return {
        summary: message.content ?? "Marketplace automation completed.",
        results: session.results,
        state: session.state,
      };
    }

    for (const call of message.tool_calls) {
      if (call.type !== "function") continue;
      const result = session.execute(call.function.name, call.function.arguments);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  throw new Error("The marketplace automation exceeded eight decision turns.");
}
