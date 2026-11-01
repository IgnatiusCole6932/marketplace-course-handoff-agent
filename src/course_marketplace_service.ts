import { createServer } from "node:http";
import { ZodError } from "zod";
import { automationRequestSchema, runMarketplaceAutomation } from "./marketplace_handoff.js";

const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/automate") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "Use POST /automate." }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = automationRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const output = await runMarketplaceAutomation(input);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(output));
  } catch (error) {
    const isRequestError = error instanceof SyntaxError || error instanceof ZodError;
    response.writeHead(isRequestError ? 400 : 422, { "content-type": "application/json" });
    response.end(JSON.stringify({
      message: isRequestError ? "Request body did not match the marketplace schema." : "Marketplace decision could not be applied.",
    }));
  }
});

server.listen(port, () => {
  console.log(`Course marketplace service listening on http://localhost:${port}`);
});
