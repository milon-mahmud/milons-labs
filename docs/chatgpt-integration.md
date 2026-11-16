# ChatGPT integration setup

## 1. Configure the server secret

Generate a unique random secret (at least 32 bytes). Add it to the Render service's Environment settings as `CHATGPT_API_TOKEN`. Do not commit the real token to GitHub, put it in browser code, or share the Gemini API key with ChatGPT.

Also set `APP_URL=https://milons-labs-tht3.onrender.com` so the API returns correct download links.

## 2. Deploy this branch

Review and merge `feat/chatgpt-voice-srt-api` into `main`, then let Render deploy the updated main branch. The endpoint is not live until that deployment completes.

## 3. Configure a GPT Action

Import `docs/chatgpt-openapi.yaml` in the GPT Actions editor and configure Authentication as API Key, Bearer, using the `CHATGPT_API_TOKEN` value. Action availability depends on the ChatGPT plan and account features.

## 4. Request example

```json
{
  "script": "শিউলিপুর নামে একটা সুন্দর গ্রাম আছিল।",
  "voiceName": "Zephyr",
  "style": "Warm, gentle Pabna Bengali storytelling",
  "ttsModel": "auto"
}
```

The response includes `audioUrl`, `srtUrl`, subtitle cues, and an expiry time. Download links expire after 30 minutes.

## Important hosting limitation

Generated files are held in server memory, not durable storage. They disappear when the Render process restarts, and may not be available across multiple server instances. For reliable production downloads, move these files to private object storage (such as S3 or Cloudflare R2) and issue short-lived signed URLs.

## Security note

This token protects the new ChatGPT integration endpoint only. Existing public studio routes such as `/api/tts/single` and `/api/transcribe-srt` are unchanged for the current website UI. They should be protected with suitable per-user authentication and rate limits before treating the whole public service as abuse-resistant.

## Current status

This branch adds the endpoint and setup documentation. It does not deploy to Render, create a secret, or enable a GPT Action automatically.
