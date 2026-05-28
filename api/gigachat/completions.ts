import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow OPTIONS pre-flight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    if (!process.env.GIGACHAT_AUTH_DATA) {
      return res.status(400).json({ error: "GigaChat SberDevices API is not configured. Please set the GIGACHAT_AUTH_DATA environment variable." });
    }

    const { messages, temperature } = req.body || {};

    console.log("Acquiring GigaChat Bearer Access Token in Serverless Function...");
    const token = await getGigaChatToken();

    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`
    };

    const payload = {
      model: "GigaChat", // Default GigaChat 2 Lite
      messages: messages || [],
      temperature: temperature ?? 0.8,
      max_tokens: 1024
    };

    console.log("Forwarding message payload to GigaChat completions in Serverless Function...");
    const result = await callGigaChatApi(
      "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
      headers,
      payload
    );

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Serverless GigaChat proxy handler exception:", error);
    return res.status(500).json({ error: "GigaChat generation failed: " + (error.message || "Unknown error") });
  }
}
