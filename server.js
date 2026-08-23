try {
  require('dotenv').config();
} catch (e) {
  // Gracefully continue
}

const express = require('express');
const path = require('path');
const fs = require('fs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;
const STOCK_FILE = path.join(__dirname, 'stock.json');

// Helper to load live stock
function getLiveStock() {
  try {
    if (fs.existsSync(STOCK_FILE)) {
      return JSON.parse(fs.readFileSync(STOCK_FILE, 'utf8'));
    }
  } catch (err) {
    console.error("Error reading stock file:", err);
  }
  return {};
}

// Helper to save live stock
function saveLiveStock(stockData) {
  try {
    fs.writeFileSync(STOCK_FILE, JSON.stringify(stockData, null, 2), 'utf8');
  } catch (err) {
    console.error("Error saving stock file:", err);
  }
}

// 1. Stripe Webhook (Captures completed payments & deducts inventory)
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  if (endpointSecret && sig) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    try {
      event = JSON.parse(req.body.toString());
    } catch (err) {
      return res.status(400).send("Invalid JSON payload");
    }
  }

  // Handle successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.metadata && session.metadata.order_items) {
      try {
        const orderedItems = JSON.parse(session.metadata.order_items);
        const currentStock = getLiveStock();

        orderedItems.forEach(item => {
          if (currentStock[item.id] !== undefined) {
            currentStock[item.id] = Math.max(0, currentStock[item.id] - item.qty);
          }
        });

        saveLiveStock(currentStock);
        console.log("Live inventory updated successfully after order.");
      } catch (err) {
        console.error("Error updating inventory from metadata:", err);
      }
    }
  }

  res.json({ received: true });
});

// JSON parser for regular API routes
app.use(express.json());
app.use(express.static(path.join(__dirname, '')));

// 2. Public API endpoint to provide live stock counts to frontend
app.get('/api/stock', (req, res) => {
  res.json(getLiveStock());
});

// 3. Checkout session creation
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { items } = req.body;

    const line_items = items.map(item => {
      const details = [];
      if (item.selectedColor) details.push(`Color: ${item.selectedColor}`);
      if (item.customNote) details.push(`Custom Details: ${item.customNote}`);

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: details.length > 0 ? details.join(' | ') : undefined,
          },
          unit_amount: Math.round(item.price * 100),
          tax_behavior: 'exclusive',
        },
        quantity: item.qty,
      };
    });

    // Store purchased item IDs & quantities in session metadata
    const orderMetadata = items.map(i => ({ id: i.id, qty: i.qty }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: line_items,
      mode: 'payment',
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US'],
      },
      shipping_options: [
        {
          shipping_rate: 'shr_1U7OAU3z3vaDR2XeS8aCvCs2', // Standard $5.95
        },
        {
          shipping_rate: 'shr_1U7NKu3z3vaDR2Xex3a7utMi', // Free Pickup $0.00
        },
      ],
      metadata: {
        order_items: JSON.stringify(orderMetadata)
      },
      success_url: `${req.headers.origin}/?success=true`,
      cancel_url: `${req.headers.origin}/?canceled=true`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});