const express = require('express');
const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_YOUR_STRIPE_KEY_HERE');

app.use(express.static('.'));
app.use(express.json());

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { items } = req.body;

    const lineItems = items.map(item => {
      // Append the custom engraving text to the product description if provided
      const finalDescription = item.customNote 
        ? `${item.description} | CUSTOM NOTE: ${item.customNote}`
        : item.description;

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: finalDescription,
            tax_code: 'txcd_99999999',
            metadata: {
              custom_engraving_details: item.customNote || 'None',
            }
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.qty,
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      automatic_tax: {
        enabled: true,
      },
      shipping_address_collection: {
        allowed_countries: ['US'],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 895, currency: 'usd' },
            display_name: 'Standard Tracked Ground (USPS/UPS)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 5 },
            },
          },
        },
      ],
      success_url: `${req.headers.origin}/index.html?status=success`,
      cancel_url: `${req.headers.origin}/index.html?status=cancelled`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe Session Error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Deer Camp Designs store live on port ${PORT}`));