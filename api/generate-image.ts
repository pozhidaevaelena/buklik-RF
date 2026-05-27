import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { prompt } = req.query;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const cleanPrompt = encodeURIComponent(prompt.trim());
    const width = 768;
    const height = 1024;
    const seed = Math.floor(Math.random() * 1000000);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;

    console.log(`Vercel function fetching from Pollinations: ${pollinationsUrl}`);
    
    const response = await fetch(pollinationsUrl);
    
    if (!response.ok) {
      throw new Error(`Pollinations API responded with ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error("Vercel Proxy error:", error);
    res.status(500).json({ error: "Failed to generate image via proxy" });
  }
}
