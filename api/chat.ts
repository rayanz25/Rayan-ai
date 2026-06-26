import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "Messages array is required." });
      return;
    }

    const ai = new GoogleGenAI({ 
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const formattedContents = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    const config = {
      model: "gemini-3.5-flash",
      contents: formattedContents,
      config: {
        systemInstruction: "You are an expert AI assistant who answers questions and can help users build applications. When responding, use Markdown formatting, especially for code blocks. Provide complete, helpful, and concise answers."
      }
    };

    let stream;
    try {
      stream = await ai.models.generateContentStream(config);
    } catch (err: any) {
      if (err.message && err.message.includes("503")) {
        console.log("503 encountered, falling back to gemini-3.1-pro-preview...");
        config.model = "gemini-3.1-pro-preview";
        stream = await ai.models.generateContentStream(config);
      } else {
        throw err;
      }
    }

    for await (const chunk of stream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }
    
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    console.error("Chat generation error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Failed to generate response." });
    } else {
      res.end();
    }
  }
}
