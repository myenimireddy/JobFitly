# LLM & privacy

**Goal:** Your profile stays on **your machine**. JobFitly does not host a cloud copy of resumes or answers.

## Provider resolution

From `backend/src/lib/llmSettings.js`:

1. Settings **Use Ollama** (`forceOllama`) → local Ollama  
2. Else usable Groq key (Side Panel Settings or `GROQ_API_KEY`) → **Groq (fast)**  
3. Else → **Ollama (local, slower)**

## What leaves the machine

| Path | Behavior |
|------|----------|
| **Ollama** | Everything local |
| **Groq — Analyze / Ask AI / doc gen** | Contact PII replaced with placeholders (`piiSanitizer`), restored locally after |
| **Resume upload parse** | Prefers reachable **Ollama** even if Groq is on; Groq fallback scrubs emails/phones first |

Skills, titles, companies, and schools may still appear in sanitized match prompts (needed for scoring).

## Status

- `GET /api/llm/status` — effective provider  
- `GET/PUT /api/settings/llm` — public settings (key suffix only)  
- Web app header: green Backend / LLM dots when healthy  
