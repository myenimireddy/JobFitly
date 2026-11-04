# LLM & privacy

**Goal:** Your profile stays on **your machine**. JobFitly does not host a cloud copy of resumes or answers.

## Provider resolution

From `backend/src/lib/llmSettings.js`:

1. Settings **Use Ollama** (`forceOllama`) → local Ollama  
2. Else usable Groq key (Side Panel Settings or `GROQ_API_KEY`) → **Groq (fast)**  
   Model id comes from Groq’s live model list. Preference order is [`backend/config/groq-models.json`](../backend/config/groq-models.json) (edit that file when you want a different default — a retired id is skipped automatically).  
3. Else → **Ollama (local, slower)**

## What leaves the machine

| Path | Behavior |
|------|----------|
| **Ollama** | Everything local |
| **Groq — Analyze / Ask AI / doc gen** | Contact PII replaced with placeholders (`piiSanitizer`), restored locally after |
| **Resume upload parse** | Same as Settings: **Groq** when a key is saved (emails/phones scrubbed); **Ollama** when Use Ollama / no key |

Skills, titles, companies, and schools may still appear in sanitized match prompts (needed for scoring).

## Status

- `GET /api/llm/status` — effective provider  
- `GET/PUT /api/settings/llm` — public settings (key suffix only)  
- Web app header: green Backend / LLM dots when healthy  
