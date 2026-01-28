const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const port = process.env.PORT || 3010;

// On Vercel, the file system is read-only except for /tmp
// We use /tmp/webhooks.db if running on Vercel, otherwise local webhooks.db
const dbPath = process.env.VERCEL 
  ? path.join("/tmp", "webhooks.db") 
  : "webhooks.db";

const db = new Database(dbPath);

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    method TEXT,
    headers TEXT,
    query TEXT,
    body TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Settings State
let settings = {
  active: true,
  simulateDowntime: false,
  errorStatusCode: 400,
  errorBody: JSON.stringify({ error: "Bad Request", message: "Webhook is disabled" }, null, 2)
};

// Middleware to parse various body types
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: "*/*" })); // Parse everything else as text

// Serve static UI
app.use(express.static(path.join(__dirname, "public")));

// Webhook endpoint - Capture everything
app.all("/webhook", (req, res) => {
  // Logic for Enable/Disable and Simulation
  if (!settings.active) {
    if (settings.simulateDowntime) {
      // Simulate "does not exist" -> 404
      console.log('Webhook disabled (Downtime Simulation): returning 404');
      return res.status(404).send("Cannot " + req.method + " " + req.originalUrl);
    } else {
      console.log(`Webhook disabled: returning ${settings.errorStatusCode}`);
      // Try to parse JSON for the response body
      try {
        const jsonBody = JSON.parse(settings.errorBody);
        return res.status(settings.errorStatusCode).json(jsonBody);
      } catch (e) {
        // Send as text if not valid JSON
        return res.status(settings.errorStatusCode).send(settings.errorBody);
      }
    }
  }

  const method = req.method;
  const headers = JSON.stringify(req.headers);
  const query = JSON.stringify(req.query);

  let body = req.body;
  if (typeof body === "object") {
    body = JSON.stringify(body);
  }

  const stmt = db.prepare(
    "INSERT INTO requests (method, headers, query, body) VALUES (?, ?, ?, ?)",
  );
  stmt.run(method, headers, query, body);

  console.log(`Received ${method} request`);
  res.status(200).send("Webhook received");
});

// API to get requests
app.get("/api/requests", (req, res) => {
  const stmt = db.prepare("SELECT * FROM requests ORDER BY id DESC");
  const requests = stmt.all();
  res.json(requests);
});

// API to get settings
app.get("/api/settings", (req, res) => {
  res.json(settings);
});

// API to update settings
app.post("/api/settings", (req, res) => {
  const newSettings = req.body;
  if (typeof newSettings.active === 'boolean') settings.active = newSettings.active;
  if (typeof newSettings.simulateDowntime === 'boolean') settings.simulateDowntime = newSettings.simulateDowntime;
  if (newSettings.errorStatusCode) settings.errorStatusCode = parseInt(newSettings.errorStatusCode);
  if (newSettings.errorBody) settings.errorBody = newSettings.errorBody;
  
  console.log("Settings updated:", settings);
  res.json(settings);
});

// API to clear requests
app.post("/api/clear", (req, res) => {
  db.exec("DELETE FROM requests");
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Webhook URL: http://localhost:${port}/webhook`);
});
