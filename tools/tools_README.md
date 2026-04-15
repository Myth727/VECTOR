# VECTOR Offline Harness Tools

Python offline optimization tools for VECTOR, adapted from the Meta-Harness framework.

**Reference:** Lee, Nair, Zhang, et al. (2026). *Meta-Harness: End-to-End Optimization of Model Harnesses.* Stanford IRIS Lab. arXiv:2603.28052. https://arxiv.org/abs/2603.28052

Meta-Harness searches over harness configurations offline to find optimal parameters. These tools apply that same pattern to VECTOR — running VECTOR scoring against transcripts, proposing configuration improvements, and tracking the best known configuration per context type.

## Architecture

```
tools/
  vector_harness.py    ← offline VECTOR scoring engine (no browser required)
  meta_loop.py         ← Meta-Harness style evolution loop
  frontier.py          ← frontier tracker (best config per context type)
  domain_spec.md       ← fill this out before running (see ONBOARDING below)
  requirements.txt     ← anthropic, numpy
```

## Quick Start

```bash
pip install -r tools/requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...

# Score a transcript
python tools/vector_harness.py --transcript my_session.json

# Run evolution loop (5 iterations)
python tools/meta_loop.py --iterations 5 --transcript my_session.json

# View frontier
python tools/frontier.py --show
```

## Transcript Format

Export from VECTOR UI (EXPORT tab → JSONL Events), or create manually:

```json
[
  {"role": "user",      "content": "Your message here"},
  {"role": "assistant", "content": "Model response here"},
  ...
]
```

## Onboarding

Before running the evolution loop, fill out `tools/domain_spec.md` with:
- Your target use case (code review, creative writing, research, etc.)
- What metric matters most (avg C-score, drift events, H-signal rate)
- Budget (iterations, API cost cap)
- Baseline preset

## Credit

This tooling is directly inspired by and adapted from the Meta-Harness framework by the Stanford IRIS Lab (Chelsea Finn's group). The core concepts — 3-candidate proposals, exploitation/exploration axes, frontier tracking, anti-parameter-tuning rules — are theirs. VECTOR's application of these concepts to real-time coherence correction is our contribution.
