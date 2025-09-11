import express from "express";
import bodyParser from "body-parser";
import { corsHeaders, handleOptions } from "../_shared/cors";

const app = express();
app.use(bodyParser.json());

app.options("*", (req, res) => {
  res.set({ ...corsHeaders }).status(204).send();
});

app.post("/", async (req, res) => {
  try {
    const { amount, fee, recipient_email, description } = req.body;
    // Stubbed response — replace with real PayPal order creation
    const orderId = `TEST-ORDER-${Date.now()}`;
    const approval_url = `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`;
    res.set({ ...corsHeaders, "Content-Type": "application/json" });
    res.status(200).json({ orderId, approval_url });
  } catch (e) {
    res.set({ ...corsHeaders, "Content-Type": "application/json" });
    res.status(400).json({ error: String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
