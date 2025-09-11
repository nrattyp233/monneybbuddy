import express from "express";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const app = express();
app.use(express.json());

app.options("*", (req, res) => {
  res.set({ ...corsHeaders }).status(204).send();
});

app.post("/", async (req, res) => {
  try {
    const { public_token } = req.body;
    // In production, call Plaid /item/public_token/exchange and store access_token
    res.status(200).set({ ...corsHeaders, "Content-Type": "application/json" }).json({ ok: true });
  } catch (e) {
    res.status(400).set({ ...corsHeaders, "Content-Type": "application/json" }).json({ error: String(e) });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
