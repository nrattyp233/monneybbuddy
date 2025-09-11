import http from "http";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...corsHeaders });
    res.end();
    return;
  }
  try {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", () => {
      const { savingId } = JSON.parse(body);
      res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, savingId }));
    });
  } catch (e) {
    res.writeHead(400, { ...corsHeaders, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(e) }));
  }
});

server.listen(8000, () => {
  console.log("Server running on port 8000");
});
