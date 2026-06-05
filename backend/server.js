const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";
const ROOT_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const SEED_DB_FILE = path.join(ROOT_DIR, "database", "smart-mandi.json");
const RUNTIME_DB_FILE = path.join(ROOT_DIR, "database", "smart-mandi-runtime.json");

const sessions = new Map();
let memoryDatabase = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

async function readDatabase() {
  if (memoryDatabase) {
    return JSON.parse(JSON.stringify(memoryDatabase));
  }

  let raw;
  try {
    raw = await fs.readFile(RUNTIME_DB_FILE, "utf-8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    raw = await fs.readFile(SEED_DB_FILE, "utf-8");
  }
  return JSON.parse(raw);
}

async function writeDatabase(data) {
  memoryDatabase = JSON.parse(JSON.stringify(data));
  const tempFile = `${RUNTIME_DB_FILE}.tmp`;
  try {
    await fs.writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
    await fs.rename(tempFile, RUNTIME_DB_FILE);
  } catch (error) {
    console.warn(`Smart Mandi database is running in memory because disk save failed: ${error.message}`);
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto
    .pbkdf2Sync(password, salt, 120000, 64, "sha512")
    .toString("hex");
  return { passwordSalt: salt, passwordHash };
}

function verifyPassword(user, password) {
  if (user.passwordSalt === "demo" && user.passwordHash === "demo") {
    return password === "demo123";
  }

  const hash = crypto
    .pbkdf2Sync(password, user.passwordSalt, 120000, 64, "sha512")
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    role: user.role,
    village: user.village,
    cropPreference: user.cropPreference
  };
}

function createToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, createdAt: new Date().toISOString() });
  return token;
}

function getQuery(req) {
  return new URL(req.url, `http://${req.headers.host}`).searchParams;
}

function withLivePriceMovement(price) {
  const drift = crypto.createHash("sha1").update(`${price.id}:${new Date().getMinutes()}`).digest()[0] % 31;
  const movement = drift - 12;
  return {
    ...price,
    price: Math.max(300, price.price + movement),
    updatedAt: new Date().toISOString()
  };
}

function buildSuggestion(crop, data) {
  const preferredCrop = crop || "Wheat";
  const price = data.prices.find((item) => item.crop.toLowerCase() === preferredCrop.toLowerCase()) || data.prices[0];
  const action = price.trend >= 1 ? "Sell soon" : "Wait and compare";
  const score = price.trend >= 1 ? 88 : 74;

  return {
    crop: price.crop,
    action,
    score,
    reason: price.trend >= 1
      ? `${price.market} is showing positive demand. Consider selling quality stock in small batches.`
      : `${price.market} is softer today. Check storage safety and compare nearby buyers before selling.`,
    market: price.market,
    price: price.price,
    signal: price.signal
  };
}

function buildFallbackAdvice(input, data) {
  const cropName = String(input.crop || "Wheat").trim();
  const location = String(input.location || "your local mandi").trim();
  const matchingPrice = data.prices.find((item) => item.crop.toLowerCase() === cropName.toLowerCase()) || data.prices[0];
  const action = matchingPrice.trend >= 1 ? "sell in batches" : "compare buyers before selling";
  const storageLine = matchingPrice.trend < 0
    ? "If storage quality is safe, hold part of the stock for a few days and compare nearby buyers."
    : "Because demand is positive, avoid distress selling and negotiate using the current mandi price.";

  return [
    `For ${cropName} near ${location}, the current Smart Mandi signal is: ${matchingPrice.signal}.`,
    `Suggested action: ${action}. ${matchingPrice.market} is around Rs. ${matchingPrice.price.toLocaleString("en-IN")} per quintal with a ${matchingPrice.trend}% trend.`,
    storageLine,
    "Next steps: check moisture/quality, compare at least two buyers, confirm transport cost, and record the final price before committing."
  ].join("\n\n");
}

function buildAdvicePrompt(input, data) {
  const topPrices = data.prices
    .slice(0, 6)
    .map((item) => `${item.crop}: ${item.market}, Rs. ${item.price}/quintal, trend ${item.trend}%, signal ${item.signal}`)
    .join("\n");

  return `
You are Smart Mandi's farmer assistant. Give practical, concise crop advice in simple language.

Farmer details:
- Crop: ${input.crop || "Not specified"}
- Location: ${input.location || "Not specified"}
- Land size: ${input.landSize || "Not specified"}
- Season: ${input.season || "Not specified"}
- Question/problem: ${input.question || "General selling advice"}

Current mandi context:
${topPrices}

Answer in 4 short sections:
1. Recommendation
2. Why
3. Selling/holding plan
4. Caution

Avoid claiming exact government or weather facts unless they are provided above.
`.trim();
}

async function askOllama(input, data) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model || OLLAMA_MODEL,
        prompt: buildAdvicePrompt(input, data),
        stream: false,
        options: {
          temperature: 0.4,
          num_predict: 260
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const result = await response.json();
    if (!result.response) {
      throw new Error("Ollama returned an empty response");
    }
    return result.response.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, {
      status: "ok",
      service: "Smart Mandi API",
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (pathname === "/api/prices" && req.method === "GET") {
    const data = await readDatabase();
    const query = getQuery(req);
    const search = (query.get("search") || "").trim().toLowerCase();
    const sort = query.get("sort") || "";

    let prices = data.prices.map(withLivePriceMovement);
    if (search) {
      prices = prices.filter((item) => {
        return item.crop.toLowerCase().includes(search) || item.market.toLowerCase().includes(search);
      });
    }
    if (sort === "price_asc") prices.sort((a, b) => a.price - b.price);
    if (sort === "price_desc") prices.sort((a, b) => b.price - a.price);

    sendJson(res, 200, { prices, count: prices.length });
    return;
  }

  if (pathname === "/api/listings" && req.method === "GET") {
    const data = await readDatabase();
    sendJson(res, 200, { listings: data.listings });
    return;
  }

  if (pathname === "/api/listings" && req.method === "POST") {
    const body = await parseBody(req);
    const required = ["crop", "market", "price", "quantity", "seller", "phone"];
    const missing = required.find((field) => !body[field]);
    if (missing) {
      sendError(res, 400, `${missing} is required`);
      return;
    }

    const data = await readDatabase();
    const listing = {
      id: `lst_${Date.now()}`,
      crop: String(body.crop).trim(),
      market: String(body.market).trim(),
      price: Number(body.price),
      quantity: Number(body.quantity),
      unit: body.unit || "quintal",
      seller: String(body.seller).trim(),
      phone: String(body.phone).trim(),
      verified: false,
      image: body.image || "../images/hero.jpg"
    };

    data.listings.unshift(listing);
    await writeDatabase(data);
    sendJson(res, 201, { listing });
    return;
  }

  if (pathname === "/api/buy-requests" && req.method === "POST") {
    const body = await parseBody(req);
    if (!body.listingId || !body.buyerName || !body.phone) {
      sendError(res, 400, "listingId, buyerName, and phone are required");
      return;
    }

    const data = await readDatabase();
    const request = {
      id: `buy_${Date.now()}`,
      listingId: body.listingId,
      buyerName: String(body.buyerName).trim(),
      phone: String(body.phone).trim(),
      message: String(body.message || "").trim(),
      status: "new",
      createdAt: new Date().toISOString()
    };

    data.buyRequests.unshift(request);
    await writeDatabase(data);
    sendJson(res, 201, { request });
    return;
  }

  if (pathname === "/api/auth/signup" && req.method === "POST") {
    const body = await parseBody(req);
    const required = ["name", "mobile", "password", "role"];
    const missing = required.find((field) => !body[field]);
    if (missing) {
      sendError(res, 400, `${missing} is required`);
      return;
    }

    const data = await readDatabase();
    const mobile = String(body.mobile).trim();
    if (data.users.some((user) => user.mobile === mobile)) {
      sendError(res, 409, "This mobile number is already registered");
      return;
    }

    const user = {
      id: `usr_${Date.now()}`,
      name: String(body.name).trim(),
      mobile,
      role: String(body.role).trim().toLowerCase(),
      village: String(body.village || "").trim(),
      cropPreference: String(body.cropPreference || "").trim(),
      ...createPasswordRecord(String(body.password))
    };

    data.users.push(user);
    await writeDatabase(data);
    const token = createToken(user.id);
    sendJson(res, 201, { token, user: publicUser(user) });
    return;
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = await parseBody(req);
    if (!body.mobile || !body.password) {
      sendError(res, 400, "mobile and password are required");
      return;
    }

    const data = await readDatabase();
    const user = data.users.find((item) => item.mobile === String(body.mobile).trim());
    if (!user || !verifyPassword(user, String(body.password))) {
      sendError(res, 401, "Invalid mobile number or password");
      return;
    }

    const token = createToken(user.id);
    sendJson(res, 200, { token, user: publicUser(user) });
    return;
  }

  if (pathname === "/api/suggestions" && req.method === "GET") {
    const data = await readDatabase();
    const crop = getQuery(req).get("crop");
    sendJson(res, 200, { suggestion: buildSuggestion(crop, data) });
    return;
  }

  if (pathname === "/api/ai/advice" && req.method === "POST") {
    const body = await parseBody(req);
    const data = await readDatabase();
    const input = {
      crop: String(body.crop || "").trim(),
      location: String(body.location || "").trim(),
      landSize: String(body.landSize || "").trim(),
      season: String(body.season || "").trim(),
      question: String(body.question || "").trim(),
      model: String(body.model || "").trim()
    };

    if (!input.crop && !input.question) {
      sendError(res, 400, "crop or question is required");
      return;
    }

    try {
      const advice = await askOllama(input, data);
      sendJson(res, 200, {
        provider: "ollama",
        model: input.model || OLLAMA_MODEL,
        advice
      });
    } catch (error) {
      sendJson(res, 200, {
        provider: "fallback",
        model: "rule-based",
        advice: buildFallbackAdvice(input, data),
        note: `Ollama is not available yet: ${error.message}`
      });
    }
    return;
  }

  sendError(res, 404, "API route not found");
}

async function serveStatic(req, res, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(FRONTEND_DIR, safePath);

  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (error) {
    sendError(res, 500, error.message || "Internal server error");
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Smart Mandi server running at http://127.0.0.1:${PORT}`);
    console.log(`API health check: http://127.0.0.1:${PORT}/api/health`);
  });
}

module.exports = { server };
