import { GoogleGenAI } from "@google/genai";

// In Vite, browser-exposed env vars must be prefixed with VITE_
// Users can optionally omit the key in production; we fallback to a static tip.
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

let ai: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  if (!GEMINI_API_KEY) return null;
  if (!ai) {
    try {
      ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    } catch (e) {
      console.warn("Failed to initialize GoogleGenAI client:", e);
      ai = null;
    }
  }
  return ai;
}

const STATIC_FALLBACK_TIP = "Enable two-factor authentication (2FA) on your account for an extra layer of security.";

export const generateSecurityTip = async (): Promise<string> => {
  const client = getClient();
  if (!client) {
    // No key configured – return deterministic static tip so UI still shows content.
    return STATIC_FALLBACK_TIP;
  }

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Generate a security tip.',
      config: {
        systemInstruction: "You are a cybersecurity expert providing a single, concise security tip for a user of a modern financial/payment app. The tip must be a single sentence, easy to understand, and actionable. Do not add any conversational filler or introductory text. Just provide the tip.",
        maxOutputTokens: 60,
        thinkingConfig: { thinkingBudget: 30 },
        temperature: 0.9,
      }
    });

    let tip = response.text.trim();
    if ((tip.startsWith('"') && tip.endsWith('"')) || (tip.startsWith("'") && tip.endsWith("'"))) {
      tip = tip.substring(1, tip.length - 1);
    }
    return tip || STATIC_FALLBACK_TIP;
  } catch (error) {
    console.error("Error generating security tip from Gemini:", error);
    return STATIC_FALLBACK_TIP;
  }
};
