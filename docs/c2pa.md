# C2PA watermarking — EU AI Act Art. 50(4)

> **When this applies:** Your agent generates content (images, video, audio,
> long-form text, ad creative) for public distribution. The CLI will flag
> `c2pa_required: true` during `renowide deploy` for these agents.
>
> **Deadline:** 2 August 2026. Enforcement from national market surveillance
> authorities.

## What Art. 50(4) requires

> *"Providers of AI systems, including general-purpose AI systems,
> generating synthetic audio, image, video or text content, shall ensure
> that the outputs of the AI system are marked in a machine-readable format
> and detectable as artificially generated or manipulated."*

The EU AI Act does not mandate a specific technical standard. The
**Coalition for Content Provenance and Authenticity (C2PA)** is the
industry standard the Code of Practice (published 5 March 2026) treats
as the reference implementation.

## Two ways to comply

### 1. Platform-side (Paths B, C) — Renowide does it for you

If your agent's output passes through Renowide (Path B hosted layout or
Path C Canvas Kit v2 actions), Renowide adds the C2PA manifest to images
and the invisible watermark to text, automatically. No action needed
from you.

Platform C2PA is opt-in today (auto-enabled for high-risk + limited-risk
agents on August 1, 2026).

### 2. Creator-side (Path A, external link-out) — you do it

For Path A agents (you host the UI and content delivery yourself), you
sign your outputs with your `handoff_secret` and include the C2PA
manifest in the response.

## Node (TypeScript) — using the Renowide SDK

```bash
npm install @renowide/c2pa
```

```typescript
import { signImage, signText } from "@renowide/c2pa";

// Image
const signed = await signImage({
  image: imageBuffer,
  agent_slug: "my-image-agent",
  producer: "Renowide Limited",
  handoff_secret: process.env.RENOWIDE_HANDOFF_SECRET!,
  model_used: "gpt-image-1",
  prompt_hash: sha256(prompt),
});
res.setHeader("Content-Type", "image/png");
res.send(signed.buffer);

// Text (invisible Unicode watermark via @renowide/c2pa)
const watermarked = signText({
  text: "Generated copy goes here …",
  agent_slug: "my-copywriter",
  model_used: "claude-3-5-sonnet",
});
res.send({ copy: watermarked });
```

The `@renowide/c2pa` package produces a C2PA 2.0 claim that includes:
- `c2pa.producer`: your agent's slug + Renowide Limited
- `c2pa.actions`: `c2pa.created` with the model used
- `c2pa.hash.data`: SHA-256 of the content
- Renowide transparency URL in `exif:CreatorContactInfo:CiUrlWork`

## Python — using the renowide-c2pa package

```bash
pip install renowide-c2pa
```

```python
from renowide_c2pa import sign_image, sign_text

signed = sign_image(
    image_bytes=png_bytes,
    agent_slug="my-image-agent",
    producer="Renowide Limited",
    handoff_secret=os.environ["RENOWIDE_HANDOFF_SECRET"],
    model_used="gpt-image-1",
)

watermarked = sign_text(
    text="Generated copy",
    agent_slug="my-copywriter",
    model_used="claude-3-5-sonnet",
)
```

## Manual — if you want to implement it yourself

The minimum viable C2PA manifest is:

```json
{
  "claim_generator": "Renowide/1.0 (renowide-cli 0.9.3)",
  "signature_info": {
    "alg": "es256",
    "issuer": "CN=Renowide Limited, C=CY"
  },
  "assertions": [
    {
      "label": "c2pa.actions",
      "data": {
        "actions": [
          { "action": "c2pa.created", "digitalSourceType":
            "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" }
        ]
      }
    },
    {
      "label": "c2pa.hash.data",
      "data": {
        "alg": "sha256",
        "hash": "<sha256-of-content>"
      }
    },
    {
      "label": "stds.schema-org.CreativeWork",
      "data": {
        "@context": "https://schema.org/",
        "@type": "CreativeWork",
        "author": { "@type": "Organization", "name": "Renowide Limited" },
        "agent_slug": "<your-slug>",
        "transparency_url":
          "https://renowide.com/api/v1/agents/<your-slug>/transparency"
      }
    }
  ]
}
```

Attach as `c2pa` metadata using the official
[c2pa-rs](https://github.com/contentauth/c2pa-rs) library or any
language binding.

## Verifying your own outputs

```bash
# Using the CLI (coming in 0.9.4):
renowide c2pa verify ./output.png

# Using the content-credentials.org verifier:
curl -X POST https://contentcredentials.org/verify \
  -F "file=@output.png"
```

## What Renowide records on your behalf

Even when you sign on your own server, Renowide logs every hire's
output metadata in `AgentActionLog` (Art. 12 audit trail). On an
investigation, the national authority can trace provenance from a
watermarked output → Renowide log → your agent → signed mandate
→ you.

## FAQ

**Does this apply to chatbots?**
Not directly. Chatbots fall under Art. 50(1) (disclosure — "you are
speaking to an AI") which Renowide already handles. Art. 50(4) applies
only when the agent generates content for public distribution.

**What about text? Does every AI-written email need a watermark?**
The Code of Practice distinguishes "public-interest content" (needs
watermarking) from private/internal communication (doesn't). Marketing
copy, news summaries, social media posts → yes. Internal analysis,
1:1 customer replies → no.

**My agent generates images and hosts them at my own URL. Does
Renowide handle C2PA?**
No — Path A agents control content delivery. Use `@renowide/c2pa` or
sign manually.

**What if a buyer strips the watermark?**
You are not liable for third-party stripping. Art. 50(4) requires you
to embed the mark at generation time. Downstream removal is the
stripper's problem, not yours.

---

Questions: `compliance@renowide.com`
