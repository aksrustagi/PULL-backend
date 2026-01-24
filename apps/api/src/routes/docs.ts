import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { openApiSpec } from "../docs/openapi";
import type { Env } from "../index";

const app = new Hono<Env>();

/**
 * Serve OpenAPI JSON specification
 * GET /docs/openapi.json
 */
app.get("/openapi.json", (c) => {
  return c.json(openApiSpec);
});

/**
 * Serve OpenAPI YAML specification
 * GET /docs/openapi.yaml
 */
app.get("/openapi.yaml", (c) => {
  const yaml = convertToYaml(openApiSpec);
  c.header("Content-Type", "application/yaml");
  return c.text(yaml);
});

/**
 * Serve Swagger UI
 * GET /docs
 */
app.get(
  "/",
  swaggerUI({
    url: "/docs/openapi.json",
    persistAuthorization: true,
    docExpansion: "list",
    filter: true,
    tryItOutEnabled: true,
    syntaxHighlight: {
      activate: true,
      theme: "monokai",
    },
  })
);

/**
 * Serve ReDoc (alternative documentation UI)
 * GET /docs/redoc
 */
app.get("/redoc", (c) => {
  const html = `
<!DOCTYPE html>
<html>
  <head>
    <title>PULL API Documentation - ReDoc</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
    <style>
      body {
        margin: 0;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <redoc spec-url='/docs/openapi.json'
           expand-responses="200,201"
           hide-download-button="false"
           theme='{
             "colors": {
               "primary": { "main": "#6366f1" }
             },
             "typography": {
               "fontSize": "15px",
               "fontFamily": "Roboto, sans-serif",
               "headings": { "fontFamily": "Montserrat, sans-serif" }
             },
             "sidebar": {
               "backgroundColor": "#1e1e2e",
               "textColor": "#cdd6f4"
             }
           }'
    ></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>
  `.trim();

  return c.html(html);
});

/**
 * API documentation overview page
 * GET /docs/overview
 */
app.get("/overview", (c) => {
  const html = `
<!DOCTYPE html>
<html>
  <head>
    <title>PULL API Documentation</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      :root {
        --primary: #6366f1;
        --bg: #0f0f23;
        --surface: #1e1e2e;
        --text: #cdd6f4;
        --text-dim: #6c7086;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        background: var(--bg);
        color: var(--text);
        line-height: 1.6;
      }
      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem;
      }
      header {
        text-align: center;
        padding: 3rem 0;
        border-bottom: 1px solid var(--surface);
        margin-bottom: 3rem;
      }
      h1 {
        font-size: 2.5rem;
        margin-bottom: 0.5rem;
        background: linear-gradient(135deg, var(--primary) 0%, #a855f7 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .subtitle {
        color: var(--text-dim);
        font-size: 1.1rem;
      }
      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
        margin-bottom: 3rem;
      }
      .card {
        background: var(--surface);
        border-radius: 12px;
        padding: 1.5rem;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 30px rgba(99, 102, 241, 0.15);
      }
      .card h2 {
        font-size: 1.25rem;
        margin-bottom: 0.5rem;
        color: var(--primary);
      }
      .card p {
        color: var(--text-dim);
        font-size: 0.95rem;
        margin-bottom: 1rem;
      }
      .card a {
        display: inline-block;
        color: var(--primary);
        text-decoration: none;
        font-weight: 500;
      }
      .card a:hover {
        text-decoration: underline;
      }
      .endpoints {
        background: var(--surface);
        border-radius: 12px;
        padding: 2rem;
      }
      .endpoints h2 {
        font-size: 1.5rem;
        margin-bottom: 1.5rem;
      }
      .endpoint-group {
        margin-bottom: 2rem;
      }
      .endpoint-group h3 {
        font-size: 1.1rem;
        color: var(--primary);
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .endpoint-list {
        display: grid;
        gap: 0.5rem;
      }
      .endpoint {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem 1rem;
        background: rgba(99, 102, 241, 0.05);
        border-radius: 8px;
        font-family: 'SF Mono', Monaco, monospace;
        font-size: 0.9rem;
      }
      .method {
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
        min-width: 60px;
        text-align: center;
      }
      .method.get { background: #10b981; color: white; }
      .method.post { background: #3b82f6; color: white; }
      .method.put { background: #f59e0b; color: white; }
      .method.delete { background: #ef4444; color: white; }
      .path { color: var(--text); }
      footer {
        text-align: center;
        padding: 2rem;
        color: var(--text-dim);
        font-size: 0.9rem;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <h1>PULL Super App API</h1>
        <p class="subtitle">Complete API documentation for prediction markets, trading, RWA, and rewards</p>
      </header>

      <div class="card-grid">
        <div class="card">
          <h2>Swagger UI</h2>
          <p>Interactive API documentation with try-it-out functionality</p>
          <a href="/docs">Open Swagger UI &rarr;</a>
        </div>
        <div class="card">
          <h2>ReDoc</h2>
          <p>Beautiful, responsive documentation with search</p>
          <a href="/docs/redoc">Open ReDoc &rarr;</a>
        </div>
        <div class="card">
          <h2>OpenAPI JSON</h2>
          <p>Raw OpenAPI 3.1 specification in JSON format</p>
          <a href="/docs/openapi.json">Download JSON &rarr;</a>
        </div>
        <div class="card">
          <h2>OpenAPI YAML</h2>
          <p>Raw OpenAPI 3.1 specification in YAML format</p>
          <a href="/docs/openapi.yaml">Download YAML &rarr;</a>
        </div>
      </div>

      <div class="endpoints">
        <h2>API Endpoints Overview</h2>

        <div class="endpoint-group">
          <h3>Authentication</h3>
          <div class="endpoint-list">
            <div class="endpoint"><span class="method post">POST</span><span class="path">/api/auth/register</span></div>
            <div class="endpoint"><span class="method post">POST</span><span class="path">/api/auth/login</span></div>
            <div class="endpoint"><span class="method post">POST</span><span class="path">/api/auth/refresh</span></div>
            <div class="endpoint"><span class="method post">POST</span><span class="path">/api/auth/logout</span></div>
            <div class="endpoint"><span class="method post">POST</span><span class="path">/api/auth/forgot-password</span></div>
          </div>
        </div>

        <div class="endpoint-group">
          <h3>Trading</h3>
          <div class="endpoint-list">
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/trading/orders</span></div>
            <div class="endpoint"><span class="method post">POST</span><span class="path">/api/v1/trading/orders</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/trading/orders/:orderId</span></div>
            <div class="endpoint"><span class="method delete">DELETE</span><span class="path">/api/v1/trading/orders/:orderId</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/trading/portfolio</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/trading/buying-power</span></div>
          </div>
        </div>

        <div class="endpoint-group">
          <h3>Predictions</h3>
          <div class="endpoint-list">
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/predictions/events</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/predictions/events/:ticker</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/predictions/search</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/predictions/positions</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/predictions/categories</span></div>
          </div>
        </div>

        <div class="endpoint-group">
          <h3>Real-World Assets (RWA)</h3>
          <div class="endpoint-list">
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/rwa/assets</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/rwa/assets/:assetId</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/rwa/search</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/rwa/listings</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/rwa/ownership</span></div>
            <div class="endpoint"><span class="method post">POST</span><span class="path">/api/v1/rwa/purchase</span></div>
          </div>
        </div>

        <div class="endpoint-group">
          <h3>Rewards</h3>
          <div class="endpoint-list">
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/rewards/balance</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/rewards/history</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/rewards/catalog</span></div>
            <div class="endpoint"><span class="method post">POST</span><span class="path">/api/v1/rewards/redeem</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/v1/rewards/leaderboard</span></div>
            <div class="endpoint"><span class="method post">POST</span><span class="path">/api/v1/rewards/daily-streak</span></div>
          </div>
        </div>
      </div>

      <footer>
        <p>PULL Super App API v1.0.0 | &copy; ${new Date().getFullYear()} PULL Team</p>
      </footer>
    </div>
  </body>
</html>
  `.trim();

  return c.html(html);
});

/**
 * Simple JSON to YAML converter for the OpenAPI spec
 * This is a basic implementation - for production, consider using a proper YAML library
 */
function convertToYaml(obj: unknown, indent = 0): string {
  const spaces = "  ".repeat(indent);

  if (obj === null || obj === undefined) {
    return "null";
  }

  if (typeof obj === "boolean") {
    return obj ? "true" : "false";
  }

  if (typeof obj === "number") {
    return String(obj);
  }

  if (typeof obj === "string") {
    // Handle multiline strings
    if (obj.includes("\n")) {
      const lines = obj.split("\n");
      return `|\n${lines.map((line) => `${spaces}  ${line}`).join("\n")}`;
    }
    // Escape special characters
    if (
      obj.includes(":") ||
      obj.includes("#") ||
      obj.includes("'") ||
      obj.includes('"') ||
      obj.includes("{") ||
      obj.includes("}") ||
      obj.includes("[") ||
      obj.includes("]") ||
      obj.includes("&") ||
      obj.includes("*") ||
      obj.includes("!") ||
      obj.includes("|") ||
      obj.includes(">") ||
      obj.includes("%") ||
      obj.includes("@") ||
      obj.startsWith(" ") ||
      obj.endsWith(" ")
    ) {
      return `"${obj.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return "[]";
    }
    return obj
      .map((item) => {
        const value = convertToYaml(item, indent + 1);
        if (typeof item === "object" && item !== null) {
          // For objects/arrays, put on new line
          return `${spaces}- ${value.trimStart()}`;
        }
        return `${spaces}- ${value}`;
      })
      .join("\n");
  }

  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) {
      return "{}";
    }
    return entries
      .map(([key, value]) => {
        const yamlValue = convertToYaml(value, indent + 1);
        // Handle $ref specially
        const yamlKey = key.startsWith("$") ? `"${key}"` : key;
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          Object.keys(value).length > 0
        ) {
          return `${spaces}${yamlKey}:\n${yamlValue}`;
        }
        if (Array.isArray(value) && value.length > 0) {
          return `${spaces}${yamlKey}:\n${yamlValue}`;
        }
        return `${spaces}${yamlKey}: ${yamlValue}`;
      })
      .join("\n");
  }

  return String(obj);
}

export { app as docsRoutes };
