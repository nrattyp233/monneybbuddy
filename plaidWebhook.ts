// Supabase Edge Function: plaidWebhook.ts
// This function handles Plaid webhook events.
// Deploy this to Supabase Edge Functions and set its public URL as your Plaid webhook endpoint.

import http from "http";

// Supabase Edge Function: plaidWebhook.ts
// This function handles Plaid webhook events.
// Deploy this to Supabase Edge Functions and set its public URL as your Plaid webhook endpoint.

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  let body = "";
  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", () => {
    let event;
    try {
      event = JSON.parse(body);
    } catch (err) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid JSON");
      return;
    }

    // Log the event for debugging
    console.log("Plaid Webhook Event:", event);

    // TODO: Add your business logic here
    // For example, update Supabase tables based on event type
    // Example: if (event.webhook_type === "TRANSACTIONS") { ... }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Webhook received");
  });
});

server.listen(8080, () => {
  console.log("Server listening on port 8080");
});
