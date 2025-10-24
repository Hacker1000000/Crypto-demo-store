import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { orderId, paymentId, amount, currency, method } = req.body || {};
    if (!orderId || !paymentId) return res.status(400).json({ error: 'missing_order_or_payment_id' });

    const provider = process.env.PAYMENT_PROVIDER || 'satsale';
    if (provider === 'satsale') {
      const key = process.env.SATSALE_API_KEY;
      if (!key) {
        const mock = {
          providerInvoice: `satsale-mock-${paymentId}`,
          invoiceUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/mock-pay?provider=satsale&paymentId=${paymentId}`,
          providerData: { note: 'SATSALE_API_KEY not set; this is a mock invoice' }
        };
        await prisma.payment.update({ where: { id: paymentId }, data: { providerInvoice: mock.providerInvoice, providerData: mock.providerData } });
        return res.status(200).json(mock);
      }

      const satsaleUrl = process.env.SATSALE_API_URL || 'https://api.satsale.example/v1/invoices';
      const payload = {
        external_id: orderId,
        price_amount: (amount / 100) || (amount),
        price_currency: currency,
        pay_currency: 'BTC',
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhooks/payment`,
        success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?checkout=success`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?checkout=cancel`
      };

      const resp = await fetch(satsaleUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const text = await resp.text();
        return res.status(502).json({ error: 'satsale_error', details: text });
      }

      const data = await resp.json();
      const providerInvoice = data.id || data.invoice_id || data.external_id || `satsale-${paymentId}`;
      const invoiceUrl = data.checkout_url || data.invoice_url || data.url || null;

      await prisma.payment.update({
        where: { id: paymentId },
        data: { providerInvoice, providerData: data, address: data.address || null }
      });

      return res.status(200).json({ providerInvoice, invoiceUrl, providerData: data });
    }

    return res.status(501).json({ error: 'provider_not_supported' });
  } catch (err) {
    return res.status(500).json({ error: 'create_invoice_failed' });
  }
}
