import { createServerFn } from "@tanstack/react-start";
import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_PROMPT = `You are the FitAssist AI Coach, a highly knowledgeable personal trainer and nutritionist. 
Your goal is to provide expert, encouraging, and science-based advice on:
1. Workout programming (strength, cardio, flexibility, recovery).
2. Nutrition and diet (macro balance, meal timing, hydration).
3. Motivation and habit building.

Guidelines:
- Be concise but thorough.
- Use a professional yet supportive tone.
- If a user asks something unrelated to fitness or health, politely redirect them back to their fitness journey.
- Format your responses with bullet points or bold text where helpful for readability.
- IMPORTANT: You do not have real-time access to the user's specific health sensors unless provided in the chat.
`;

type CoachData = { message: string; history: { role: "user" | "ai"; text: string }[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const chatWithCoachFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const data = ctx.data as CoachData;
    const apiKey = process.env.GEMINI_API_KEY;
    console.log("AI Coach Request: API Key present?", !!apiKey);
    if (apiKey) console.log("AI Coach Request: API Key starts with", apiKey.substring(0, 8));

    if (!apiKey) {
      return {
        error: "Gemini API key is missing. Please add GEMINI_API_KEY to your .env file.",
        text: "I'm sorry, my AI brain is currently offline. Please contact support or add an API key."
      };
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      
      const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

      // Build safe history with strict alternation
      const history: any[] = [
        { role: "user", parts: [{ text: `INSTRUCTIONS: ${SYSTEM_PROMPT}\n\nPlease acknowledge these instructions by saying 'Ready'.` }] },
        { role: "model", parts: [{ text: "Ready. How can I help you with your fitness journey today?" }] }
      ];

      // Add user history with strict alternation
      let lastRole = "model";
      for (const m of data.history) {
        const currentRole = m.role === "ai" ? "model" : "user";
        if (currentRole !== lastRole && m.text.trim().length > 0) {
          history.push({
            role: currentRole,
            parts: [{ text: m.text }]
          });
          lastRole = currentRole;
        }
      }

      const chat = model.startChat({ history });
      const result = await chat.sendMessage(data.message);
      const response = await result.response;
      return { text: response.text() };

    } catch (error: any) {
      console.error("AI COACH ERROR:", error);
      
      try {
        const fs = await import("node:fs");
        fs.appendFileSync("ai-coach-errors.log", `[${new Date().toISOString()}] ${error.message}\n`);
      } catch {}

      if (error.message?.includes("429") || error.message?.includes("quota")) {
        return {
          text: "I'm a bit overwhelmed with requests right now! Please wait about 30 seconds and try again. (Quota reached)"
        };
      }

      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(`${SYSTEM_PROMPT}\n\nUser: ${data.message}`);
        return { text: result.response.text() };
      } catch (innerError: any) {
         return {
           error: error.message,
           text: "I'm having trouble connecting to my AI brain. Try again in a minute."
         };
      }
    }
  });
