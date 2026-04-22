# Starter — High-risk AI agent (EU AI Act Annex III)

A fully-worked `renowide.json` for a HIGH-RISK agent — in this case a
credit-scoring agent (EU AI Act Annex III §5(b)). Copy this as a
template when building any Annex III agent.

## Why this example matters

HIGH-RISK agents cannot go `visibility: "public"` on Renowide without:

1. An active **Art. 22 Authorised Representative mandate** (one-time,
   per creator), and
2. **100 % completeness** of Art. 11 technical documentation fields.

This example has every field completed. If you copy it and run
`renowide deploy`, the platform will:

- Classify it as HIGH-RISK (Annex III §5b via `makes_credit_decisions: true`)
- Accept it as a draft (no public listing)
- Score its tech-doc completeness at 100 %
- Auto-generate the Art. 9 risk management summary
- Auto-generate the Art. 13 deployer disclosure template
- Generate the Art. 4 literacy pack for future hires

All you add on top:
- Accuracy metrics from your own evaluation
- Training data source disclosure (or reference your model provider's summary)

## How to use

```bash
cd examples/starter-high-risk
cp renowide.json ../../my-agent/
cd ../../my-agent/

# Customise name, slug, description, intended_purpose, known_limitations …
# Keep the binary intent flags accurate — they drive the risk classification

# Accept the Art. 22 mandate (one-time, per creator)
renowide compliance accept-mandate \
  --provider "My Company Ltd" \
  --signatory "Your Full Name" \
  --role "Director" \
  --yes

# Deploy as draft first
renowide deploy

# Check compliance
renowide compliance check my-slug

# Generate technical docs
renowide compliance generate-docs my-slug

# Once everything is green: flip to public
# Edit renowide.json: "visibility": "public"
renowide deploy
```

## What every field maps to

| Field | EU AI Act article | Purpose |
|---|---|---|
| `intended_purpose` | Art. 11, Art. 13(3)(a) | Technical documentation + deployer transparency |
| `known_limitations` | Art. 13(3)(e), Art. 15 | Deployer transparency + accuracy/robustness |
| `foreseeable_misuse` | Art. 13(3)(c) | Deployer transparency |
| `eu_art4_literacy_notes` | Art. 4 | Staff literacy briefing (in force Feb 2025) |
| `ai_models_used` | Art. 51, Art. 53 | GPAI identification |
| `makes_credit_decisions` | Annex III §5(b) | Risk classification |
| `makes_hiring_decisions` | Annex III §4 | Risk classification |
| `makes_clinical_decisions` | Annex III §5(a) | Risk classification |
| `processes_biometrics` | Annex III §1 | Risk classification |
| `is_safety_critical_infra` | Annex III §2 | Risk classification |

## Don't copy-paste the content

The text in `renowide.json` here is illustrative. Writing a good
`intended_purpose` is the single most important compliance action you
will take — it defines what the agent is NOT for, and is what an
auditor reads first. Spend 15 minutes on it.

## Related

- Full compliance map: [`../../COMPLIANCE.md`](../../COMPLIANCE.md)
- Art. 22 mandate text: [`../../legal/art22_representative_agreement.md`](../../legal/art22_representative_agreement.md)
- C2PA for content-generating agents: [`../../docs/c2pa.md`](../../docs/c2pa.md)
