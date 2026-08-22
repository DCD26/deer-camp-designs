const express = require('express');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '')));

// Route to create a Stripe Checkout Session
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
        },
        quantity: item.qty,
      };
    });

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
          shipping_rate: 'shr_1U7NWi3z3vaDR2XeNJuvYJut', // Standard $8.95
        },
        {
          shipping_rate: 'shr_1U7NKu3z3vaDR2Xex3a7utMi', // Free Local Pickup $0.00
        },
      ],
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