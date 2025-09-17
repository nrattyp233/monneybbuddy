<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1w-d5H9Zppz8O0R_4UlXON_jjMlmeTdLP

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. (Optional) Set the `VITE_GEMINI_API_KEY` in `.env.local` to your Gemini API key.
   - If this is not set, the app will still run and show a static default security tip.
   - When provided, a dynamic AI‑generated security tip will be fetched at runtime using Gemini.
3. Run the app:
   `npm run dev`
