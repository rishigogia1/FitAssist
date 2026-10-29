import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

async function checkModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No GEMINI_API_KEY found in .env");
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    // List models is not directly on genAI in the SDK sometimes, 
    // we have to use the fetch approach or check the docs for current SDK version
    // But we can just try to ping gemini-1.5-flash again with correct name
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hello");
    console.log("Success with gemini-1.5-flash!");
    console.log(result.response.text());
  } catch (e: any) {
    console.log("Error with gemini-1.5-flash:", e.message);
    
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const result = await model.generateContent("Hello");
        console.log("Success with gemini-1.5-flash-latest!");
    } catch (e2: any) {
        console.log("Error with gemini-1.5-flash-latest:", e2.message);
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("Hello");
        console.log("Success with gemini-pro!");
    } catch (e3: any) {
        console.log("Error with gemini-pro:", e3.message);
    }
  }
}

checkModels();
