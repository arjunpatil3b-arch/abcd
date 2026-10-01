const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

/* =========================================================
   LOAD .ENV
   ========================================================= */

function loadEnv() {
  const envPath = path.join(ROOT, ".env");

  if (!fs.existsSync(envPath)) {
    console.log("WARNING: .env file not found.");
    return;
  }

  const text = fs.readFileSync(envPath, "utf8");

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");

    if (eq < 1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv();

/* =========================================================
   CONFIG
   ========================================================= */

const PORT = Number(process.env.PORT) || 3001;

const API_KEY = process.env.GROQ_API_KEY || process.env.XAI_API_KEY || "";

const BASE_URL = (
  process.env.GROQ_BASE_URL ||
  process.env.XAI_BASE_URL ||
  "https://api.groq.com/openai/v1"
).replace(/\/$/, "");

const MODEL =
  process.env.GROQ_MODEL ||
  process.env.XAI_MODEL ||
  "openai/gpt-oss-120b";

/* =========================================================
   MIME TYPES
   ========================================================= */

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

/* =========================================================
   RESPONSE HELPER
   ========================================================= */

function send(
  res,
  status,
  body,
  type = "text/plain; charset=utf-8"
) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });

  res.end(body);
}

/* =========================================================
   READ REQUEST BODY
   ========================================================= */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;

      if (data.length > 20000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      resolve(data);
    });

    req.on("error", reject);
  });
}

/* =========================================================
   GROK AI
   ========================================================= */

async function answerQuestion(question, facts) {

  if (!API_KEY) {
    return {
      ok: false,
      text: "Groq API key is missing. Add GROQ_API_KEY to .env."
    };
  }

  try {

    console.log("");
    console.log("TRACE request");
    console.log("Question:", question);
    console.log("Model:", MODEL);

    const response = await fetch(
      `${BASE_URL}/chat/completions`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${API_KEY}`,
          "User-Agent": "COAST-TRACE/1.0"
        },

        body: JSON.stringify({

          model: MODEL,

          temperature: 0.2,

          max_tokens: 1200,

          reasoning_effort: "low",

          messages: [

            {
              role: "system",

              content:
                "You are TRACE, a student-safe AI assistant inside the COAST//TRACE dashboard. " +

                "Answer every part of the user's question clearly. " +

                "For multi-part questions, address each part explicitly, using short sections or bullets when helpful. " +

                "Be concise, but include all requested details. " +

                "Use simple language suitable for students. " +

                "When questions concern plastic pollution or COAST//TRACE, use the supplied dashboard facts. " +

                "Do not invent statistics or claim to have live pollution data. " +

                "If exact local measurements are not provided, say so and explain what kind of local data is needed. " +

                "If you are uncertain, clearly say so. " +

                "Dashboard facts: approximately 350 million tonnes of plastic waste are produced " +
                "per year; approximately 1-2 million tonnes reach the ocean; Asia represents " +
                "approximately 56% of the latest published inventory. " +

                "Additional dashboard information: " +
                facts
            },

            {
              role: "user",
              content: question
            }

          ]
        })
      }
    );

    const raw = await response.text();

    console.log(
      "Groq HTTP status:",
      response.status
    );

    console.log(
      "Groq response:",
      raw.slice(0, 1000)
    );

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        text:
          `Groq returned an invalid response (HTTP ${response.status}).`
      };
    }

    /* =====================================================
       API ERROR
       ===================================================== */

    if (!response.ok) {

      const message =
        (response.status === 403 && /1010|error code/i.test(raw))
          ? "Cloudflare blocked the request (1010). Restart the server after this update."
          : (data?.error?.message ||
            data?.error?.type ||
            `HTTP ${response.status}`);

      console.error(
        "Groq API error:",
        message
      );

      return {
        ok: false,
        text:
          `Groq API error: ${String(message).slice(0, 350)}`
      };
    }

    /* =====================================================
       GET ANSWER
       ===================================================== */

    const message = data?.choices?.[0]?.message || {};
    const text = String(message.content || message.reasoning || "").trim();

    if (!text) {

      return {
        ok: false,
        text:
          "Groq connected successfully, but returned no answer."
      };
    }

    return {
      ok: true,
      text: text.slice(0, 3000)
    };

  } catch (error) {

    const causeCode = error?.cause?.code;
    const causeMessage = error?.cause?.message;
    const detail = causeCode
      ? `${causeCode}${causeMessage ? `: ${causeMessage}` : ""}`
      : error.message;

    console.error(
      "Groq connection error:",
      detail
    );

    return {
      ok: false,
      text:
        `Could not connect to Groq${causeCode ? ` (${causeCode})` : ""}. Check this computer's internet connection, DNS, or firewall, then try again.`
    };
  }
}

/* =========================================================
   SERVER
   ========================================================= */

const server = http.createServer(
  async (req, res) => {

    try {

      const url = new URL(
        req.url,
        `http://127.0.0.1:${PORT}`
      );

      /* ===================================================
         OPTIONS / CORS
         =================================================== */

      if (req.method === "OPTIONS") {

        res.writeHead(204, {

          "Access-Control-Allow-Origin": "*",

          "Access-Control-Allow-Methods":
            "GET,POST,OPTIONS",

          "Access-Control-Allow-Headers":
            "Content-Type"

        });

        return res.end();
      }

      /* ===================================================
         TRACE API
         =================================================== */

      if (
        req.method === "POST" &&
        url.pathname === "/api/trace"
      ) {

        const raw =
          await readBody(req);

        let body = {};

        try {

          body =
            JSON.parse(raw || "{}");

        } catch {

          return send(
            res,
            400,
            JSON.stringify({
              ok: false,
              text: "Invalid JSON request."
            }),
            "application/json; charset=utf-8"
          );
        }

        const question =
          String(body.q || "")
            .trim()
            .slice(0, 500);

        const facts =
          String(body.facts || "")
            .trim()
            .slice(0, 800);

        if (!question) {

          return send(
            res,
            400,
            JSON.stringify({
              ok: false,
              text: "Type a question first."
            }),
            "application/json; charset=utf-8"
          );
        }

        const result =
          await answerQuestion(
            question,
            facts
          );

        return send(
          res,
          result.ok ? 200 : 502,
          JSON.stringify(result),
          "application/json; charset=utf-8"
        );
      }

      /* ===================================================
         HEALTH CHECK
         =================================================== */

      if (
        req.method === "GET" &&
        url.pathname === "/api/health"
      ) {

        return send(
          res,
          200,
          JSON.stringify({

            status: "online",

            aiProvider: "Groq",

            aiConfigured:
              Boolean(API_KEY),

            model: MODEL

          }),
          "application/json; charset=utf-8"
        );
      }

      /* ===================================================
         SERVE FRONTEND
         =================================================== */

      let relativePath =
        decodeURIComponent(
          url.pathname
        );

      if (relativePath === "/") {
        relativePath = "/index.html";
      }

      const filePath =
        path.normalize(
          path.join(
            ROOT,
            relativePath
          )
        );

      /* Prevent directory traversal */

      if (
        filePath !== ROOT &&
        !filePath.startsWith(
          ROOT + path.sep
        )
      ) {

        return send(
          res,
          403,
          "Forbidden"
        );
      }

      /* ===================================================
         FALLBACK TO INDEX
         =================================================== */

      if (
        !fs.existsSync(filePath) ||
        fs.statSync(filePath).isDirectory()
      ) {

        const indexPath =
          path.join(
            ROOT,
            "index.html"
          );

        if (!fs.existsSync(indexPath)) {

          return send(
            res,
            404,
            "index.html was not found."
          );
        }

        return send(
          res,
          200,
          fs.readFileSync(indexPath),
          TYPES[".html"]
        );
      }

      /* ===================================================
         SERVE FILE
         =================================================== */

      const extension =
        path.extname(
          filePath
        ).toLowerCase();

      const contentType =
        TYPES[extension] ||
        "application/octet-stream";

      return send(
        res,
        200,
        fs.readFileSync(filePath),
        contentType
      );

    } catch (error) {

      console.error(
        "Server error:",
        error
      );

      return send(
        res,
        500,
        "Server error. Check the terminal."
      );
    }
  }
);

/* =========================================================
   START
   ========================================================= */

server.listen(
  PORT,
  "127.0.0.1",
  () => {

    console.log("");
    console.log(
      "======================================"
    );
    console.log(
      "       COAST//TRACE // GROQ"
    );
    console.log(
      "======================================"
    );
    console.log("");

    console.log(
      `Website: http://localhost:${PORT}`
    );

    console.log(
      `AI API:  http://localhost:${PORT}/api/trace`
    );

    console.log(
      `Health:  http://localhost:${PORT}/api/health`
    );

    console.log("");

    console.log(
      "AI provider: Groq"
    );

    console.log(
      "API key:",
      API_KEY ? "LOADED" : "MISSING"
    );

    console.log(
      "Model:",
      MODEL
    );

    console.log(
      "API:",
      BASE_URL
    );

    console.log("");

    console.log(
      "Server is ready."
    );

    console.log(
      "Keep this terminal open."
    );

    console.log("");
  }
);

/* =========================================================
   SERVER ERROR
   ========================================================= */

server.on(
  "error",
  error => {

    if (
      error.code === "EADDRINUSE"
    ) {

      console.error(
        `Port ${PORT} is already in use.`
      );

      console.error(
        "Change PORT in .env or stop the other server."
      );

    } else {

      console.error(error);

    }

    process.exit(1);
  }
);
