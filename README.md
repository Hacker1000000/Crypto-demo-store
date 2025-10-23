# Crypto Store Demo (Replit-friendly, static-address mode)

This is a minimal demo store you can run on Replit that returns static BTC/XMR addresses at checkout.

Important: This demo uses static wallet addresses and does NOT automatically detect on-chain payments. For testing convenience there is a "simulate payment / mark paid" route which lets the order owner mark their order paid. Do not use static addresses in production.

Features
- Product catalog (SQLite) with dummy products you can edit
- User registration / login (JWT)
- Cart in browser
- Checkout returns static BTC or XMR address (configured via environment variables)
- Demo-only "mark paid" endpoint to simulate payment confirmation

Setup on Replit
1. Create a new Node.js Repl and paste these files into the project (server/, public/, package.json, .env).
2. Add Replit secrets or edit .env:
   - JWT_SECRET (random string)
   - STATIC_BTC_ADDRESS (your test BTC address)
   - STATIC_XMR_ADDRESS (your test XMR address)
   - Optionally STATIC_XMR_PAYMENT_ID and APP_BASE_URL
3. In the Replit shell run:
   npm install
4. Start the server:
   npm start
5. Use the webview URL Replit provides. Register a user, add items to the cart, checkout — the checkout result will show the static BTC/XMR address.
6. To simulate a payment while testing, click the "I've paid (simulate)" button in the checkout result. That calls the demo endpoint to mark the order paid.

Notes
- Edit server/db.js to change or add dummy products.
- On Replit the filesystem may be ephemeral for some plans; back up any data you need.
- For real payments you must integrate with BTCPay / monero-wallet-rpc or a custody provider.

License: demo / CC0
