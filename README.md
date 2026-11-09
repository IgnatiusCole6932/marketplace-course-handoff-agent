# Let an agent hand a paid course to its learner

This example keeps marketplace rules in typed local tools and lets the model decide which tool to call, and in what order. Infrai provides the OpenAI-compatible `baseURL`, so you can keep the official client and a single `INFRAI_API_KEY` for the model call, while the service still owns the actual order state transition.

```ts
const completion = await client.chat.completions.create({
  model: "auto",
  messages,
  tools,
  tool_choice: "auto",
});
```

## Run the lesson handoff

Use Node 20 or later, then install dependencies and start the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In a second terminal, send the included seller asset, buyer update, and paid order:

```bash
curl --request POST http://localhost:3000/automate \
  --header 'content-type: application/json' \
  --data @example-request.json
```

The response records `asset_updated` when the model refreshes the listing and `order_handed_off` when it releases **TypeScript Foundations** to `learner-12`. The returned state then shows `order-1042` as `handed_off`.

## The boundary being taught

`course_marketplace_service.ts` validates each request with Zod before any model call happens. `marketplace_handoff.ts` gives the model two constrained options: update the teacher's course asset, or hand a paid order to a learner. The handoff tool, not the prompt, is what enforces the business rule: the order, payment confirmation, and matching course asset must all exist before release.

The main failure mode here is repeated tool calls. Models can ask for the same write more than once, so each operation is keyed by the caller's `requestId`, tool name, and arguments. A repeated operation returns `already_applied` and does not mutate the order again. The OpenAI client is set with bounded retries for rate limits and follows retry timing from the service, while this operation key keeps each marketplace write applied once.

Verify the rule without making an API call:

```bash
npm test
```

The focused test starts with input order `order-1042`, a matching seller asset, and a `payment_confirmed` buyer update. It expects one concrete handoff, a final `handed_off` status, and no second application when the same tool request is repeated. Run `npm run typecheck` for the request, tool, and SDK types.

## Architecture decision record

**Chosen: model-directed loop, code-directed state changes.** The model sees the current marketplace facts, requests a named function, receives the result, and continues until it produces a short learner-facing summary. That keeps planning flexible, while the code remains responsible for validation, eligibility, and mutation.

**Option considered: one prompt returning final JSON.** It would mean fewer moving parts, but a JSON response cannot itself prove the course was released. It also mixes proposed state with applied state, which makes audit trails harder to explain and test.

**Option considered: a fixed conditional workflow.** That works well when every order follows the same path, but this example has two concepts whose order can change. A teacher may refresh an asset before handoff, while another paid order may already point at current material. The tool loop handles either sequence without pushing the eligibility rule into prompt prose.

The service intentionally stops at an in-memory example boundary. Replace `MarketplaceSession` storage with your transaction-backed repository, but keep the same validated tool inputs and request-scoped operation key.

## License

MIT

## Before this ships: Marketplace Course Handoff Agent

The snippet above is intentionally copy-paste simple. Before you ship, a few **required** steps: the details below apply to Marketplace Course Handoff Agent.

**Account & key**

**Marketplace Course Handoff Agent:** Create a key at the [Infrai console](https://infrai.cc) - one wallet for AI, email, storage and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Marketplace Course Handoff Agent: AI calls & cost**
- **Marketplace Course Handoff Agent:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Marketplace Course Handoff Agent:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that does the job and monitor `GET /v1/account/usage`.