import express from "express";
import path from "path";
import https from "https";
import { createServer as createViteServer } from "vite";

// Helper to handle GigaChat SberDevices API requests passing of SberCA self-signed certificate issues (rejectUnauthorized: false)
function callGigaChatApi(url: string, headers: Record<string, string>, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: headers,
      rejectUnauthorized: false // Bypasses Sber's custom CA certificate TLS errors cleanly
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`GigaChat API Error (${res.statusCode}): ${JSON.stringify(json)}`));
          } else {
            resolve(json);
          }
        } catch (err) {
          reject(new Error(`Failed to parse GigaChat response: ${data || res.statusMessage}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getGigaChatToken(): Promise<string> {
  const authData = process.env.GIGACHAT_AUTH_DATA;
  if (!authData) {
    throw new Error("GIGACHAT_AUTH_DATA is not configured in environment variables.");
  }

  // Token cache check (30-minute default lifetime, 1-minute safety buffer)
  if (cachedToken && tokenExpiresAt > Date.now() + 60000) {
    return cachedToken;
  }

  const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

  const scope = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
    "RqUID": uuid,
    "Authorization": `Bearer ${authData}`
  };

  try {
    const response = await callGigaChatApi(
      "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
      headers,
      `scope=${scope}`
    );

    if (response && response.access_token) {
      cachedToken = response.access_token;
      tokenExpiresAt = response.expires_at || (Date.now() + 30 * 60 * 1000);
      return cachedToken;
    } else {
      throw new Error("Invalid OAuth response: " + JSON.stringify(response));
    }
  } catch (error) {
    console.error("GigaChat OAuth retrieval failed:", error);
    throw error;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure JSON request parsing is enabled for full-stack API actions
  app.use(express.json());

  // API Route for GigaChat completions proxy
  app.post("/api/gigachat/completions", async (req, res) => {
    try {
      if (!process.env.GIGACHAT_AUTH_DATA) {
        return res.status(400).json({ error: "GigaChat is not configured. Config GIGACHAT_AUTH_DATA env variable." });
      }

      const { messages, temperature } = req.body;

      console.log("Acquiring GigaChat Bearer Access Token...");
      const token = await getGigaChatToken();

      const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
      };

      const payload = {
        model: "GigaChat", // This automatically invokes Sber GigaChat 2 Lite ("GigaChat")
        messages: messages || [],
        temperature: temperature ?? 0.8,
        max_tokens: 1024
      };

      console.log("Forwarding message payload to Sber GigaChat completions...");
      const result = await callGigaChatApi(
        "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
        headers,
        payload
      );

      return res.json(result);
    } catch (error: any) {
      console.error("GigaChat Proxy handler exception:", error);
      return res.status(500).json({ error: "GigaChat generation failed: " + (error.message || "Unknown error") });
    }
  });

  // API Route for Pollinations.ai Proxy
  app.get("/api/generate-image", async (req, res) => {
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

      console.log(`Fetching from Pollinations: ${pollinationsUrl}`);
      
      const response = await fetch(pollinationsUrl);
      
      if (!response.ok) {
        throw new Error(`Pollinations API responded with ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: "Failed to generate image via proxy" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
