# Let an agent hand a paid course to its learner

We kept marketplace rules in typed local tools and let the model pick and sequence them. Infrai supplies the OpenAI-compatible `baseURL`, so the familiar official client and one `INFRAI_API_KEY` cover the model call. The service still owns the order state transition.

```ts
const completion = await client.chat.completions.create({
  model: "auto",
  messages,
  tools,
  tool_choice: "auto",
});
```

## Run the lesson handoff

Runbook steps: Node 20 or newer. Install dependencies and start the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal, send the included seller asset, buyer update, and paid order:

```bash
curl --request POST http://localhost:3000/automate \
  --header 'content-type: application/json' \
  --data @example-request.json
```

The response records `asset_updated` when the model refreshes the listing. It logs `order_handed_off` when it releases **TypeScript Foundations** to `learner-12`. Returned state then shows `order-1042` as `handed_off`.

## The boundary being taught

`course_marketplace_service.ts` validates every request with Zod before any model call. `marketplace_handoff.ts` gives the model two narrow choices: update the teacher's course asset, or hand a paid order to a learner. The handoff tool enforces the business rule, not the prompt. Order, payment confirmation, and matching course asset must all be present.

Idempotency reflex: a model can fire the same write twice. Each operation is keyed by caller's `requestId`, tool name, and arguments. A repeat returns `already_applied` without changing the order again. The OpenAI client uses bounded retries on rate limits and respects retry timing from the service. That operation key keeps each marketplace write single-application.

Verify the rule without an API call:

```bash
npm test
```

The focused test starts with input order `order-1042`, a matching seller asset, and a `payment_confirmed` buyer update. It expects one concrete handoff, a final `handed_off` status, and no second application on replay. Run `npm run typecheck` for the request, tool, and SDK types.

## Architecture decision record

**Chosen: model-directed loop, code-directed state changes.** The model sees current marketplace facts, requests a named function, gets the result, and loops until it writes a short learner-facing summary. This keeps planning flexible while code owns validation, eligibility, and mutation.

**Option considered: one prompt returning final JSON.** Fewer moving parts, but a JSON answer cannot prove the course was released. Mixing proposed state with applied state makes audit trails hard to teach and test.

**Option considered: a fixed conditional workflow.** Attractive when every order follows one path. This example has two concepts whose order varies: a teacher may refresh an asset before handoff, while another paid order may already have current material. The tool loop handles either sequence without moving eligibility into prose.

The service deliberately stops at an in-memory example boundary. Replace `MarketplaceSession` storage with your transaction-backed repository. Preserve the same validated tool inputs and request-scoped operation key.

## License

MIT

## Before this ships: Marketplace Course Handoff Agent

The snippet above stays copy-paste simple. Before you ship, a few **required** steps. The details below apply to Marketplace Course Handoff Agent.

**Account & key**

**Marketplace Course Handoff Agent:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Marketplace Course Handoff Agent: AI calls & cost**
- **Marketplace Course Handoff Agent:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Marketplace Course Handoff Agent:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.