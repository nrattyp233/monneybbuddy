// server/index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Mock attestation verifier (replace with Play Integrity / App Attest integration)
async function verifyAttestation(token) {
  // For prototype: always return true
  return { valid: true };
}

// Mock geofence point-in-polygon
function pointInZones(point, zones) {
  // zones: array of polygons [{lat,lng},{lat,lng}...]
  // point: {lat,lng}
  // Simple prototype: always true
  return true;
}

const app = express();
app.use(bodyParser.json());

app.post('/api/payments/request', async (req, res) => {
  try {
    const { userId, recipientId, amountCents, currency, lat, lng, attestationToken } = req.body;

    // 1) Verify attestation token
    const attRes = await verifyAttestation(attestationToken);
    if (!attRes.valid) return res.status(403).json({ error: 'Device attestation failed' });

    // 2) Check geofence
    const allowedZones = []; // Fetch from DB in production
    if (!pointInZones({ lat, lng }, allowedZones)) {
      return res.status(403).json({ error: 'Location not within allowed zone' });
    }

    // 3) Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: currency || 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { userId, recipientId, geoloc: `${lat},${lng}` },
    });

    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
