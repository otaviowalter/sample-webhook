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

// Middleware to parse various body types
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: "*/*" })); // Parse everything else as text

// Serve static UI
app.use(express.static(path.join(__dirname, "public")));

// Webhook endpoint - Capture everything
app.all("/webhook", (req, res) => {
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

// API to clear requests
app.post("/api/clear", (req, res) => {
  db.exec("DELETE FROM requests");
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Webhook URL: http://localhost:${port}/webhook`);
});
