# Assistant Evals

Run the deterministic assistant eval suite before pilot demos and releases:

```bash
npm run assistant:eval
```

The eval runner executes the production chat resolver with fixed site config, approved knowledge, a null provider, and controlled AI-provider doubles.

Covered release gates:

- Greeting behavior.
- Approved knowledge precedence.
- Bulgarian localized knowledge answers.
- Safe pricing response.
- Human handoff routing.
- Lead capture with contact details.
- Fallback when no answer is confirmed.
- Disabled knowledge ignored.
- Safe AI answer path.
- Unsafe AI operational claim blocked.

Every eval also checks for:

- Empty replies.
- Replies longer than the public display limit.
- Markdown code fences.
- Prompt leakage markers.
- UUID-like internal references.
- Unsupported operational claims such as invented cart, payment, or shipping status.

This suite is not a replacement for live customer prompt review. For each pilot, add real failed or high-risk visitor prompts as new eval cases before launch.
