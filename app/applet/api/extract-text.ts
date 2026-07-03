import { GoogleGenAI } from "@google/genai";
import multiparty from "multiparty";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false,
  },
  runtime: "nodejs",
  regions: ["sin1"],
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const form = new multiparty.Form();

  form.parse(req, async (err: any, fields: any, files: any) => {
    if (err) {
      console.error("Multiparty parsing error:", err);
      return res.status(400).json({ success: false, error: err.message });
    }

    try {
      const imageFiles = files.images;
      if (!imageFiles || imageFiles.length === 0) {
        return res.status(400).json({ success: false, error: "No images provided" });
      }

      console.log(`Backend: Received ${imageFiles.length} images for extraction.`);

      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey || apiKey === "your_api_key_here" || apiKey.includes("MY_GEMINI_API_KEY")) {
        return res.status(500).json({ success: false, error: "API key not configured in AI Studio Secrets" });
      }

      const ai = new GoogleGenAI({ apiKey });

      const parts: any[] = [
        "You are a Chinese text extractor. Extract ONLY Chinese characters from this image. This is likely a screenshot of a Chinese video, movie, TV show, or social media. Focus on subtitle text at the bottom of the image, speech bubbles, or any Chinese text overlaid on the image. Return ONLY the extracted Chinese text with no explanation, no pinyin, no translation. If multiple lines exist, separate them with a newline. If no Chinese text is found, return exactly the string: NO_TEXT_FOUND"
      ];

      for (const file of imageFiles) {
        const fileData = fs.readFileSync(file.path);
        parts.push({
          inlineData: {
            data: fileData.toString("base64"),
            mimeType: file.headers['content-type']
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: parts
      });

      let extractedText = response.text || "NO_TEXT_FOUND";

      if (extractedText.trim() === "NO_TEXT_FOUND") {
        return res.json({ success: true, extractedText: "", imageCount: imageFiles.length });
      }

      let lines = extractedText.split('\n').map((l: string) => l.replace(/<[^>]*>/g, '').trim()).filter((l: string) => l !== "" && l !== "NO_TEXT_FOUND");
      lines = Array.from(new Set(lines));
      extractedText = lines.join('\n').slice(0, 2000);

      return res.json({ success: true, extractedText, imageCount: imageFiles.length });

    } catch (error: any) {
      console.error("Gemini Extraction Error:", error);
      return res.status(500).json({ success: false, error: "Extraction failed" });
    }
  });
}
