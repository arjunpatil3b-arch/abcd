COAST//TRACE

An interactive data interface exploring rising plastic pollution in coastal cities.

Run locally

Run start.bat or npm start, then open http://localhost:3001. Do not open index.html as a file — the assistant calls /api/trace on this server.

The server loads .env from the project folder. Set GROQ_API_KEY to a Groq key (gsk_...). GROQ_BASE_URL and GROQ_MODEL can override the defaults (https://api.groq.com/openai/v1 and openai/gpt-oss-120b). The older XAI_API_KEY name still works as a fallback.

Contents





Global plastic pollution metrics



Regional comparison chart



City explorer and news interface



Coastal before/after comparison



Interactive assistant dock

