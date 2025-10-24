import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { items = [], paymentMethod = 'btc', userEmail } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'no_items' });
    }

    const total = items.reduce((s: number, i: any) => s + (i.price || 0) * (i.quantity || 1), 0);

    const order = await prisma.order.create({
      data: {
        total: Math.round(total),
        currency: 'USD',
        status: 'pending',
        items: items,
        user: userEmail ? { connectOrCreate: { where: { email: userEmail }, create: { email: userEmail } } } : undefined
      }
    });

    const payment = await prisma.payment.create({
      data: {
        provider: process.env.PAYMENT_PROVIDER || (paymentMethod === 'btc' ? 'satsale' : 'manual'),
        amount: Math.round(total),
        currency: 'USD',
        method: paymentMethod,
        order: { connect: { id: order.id } }
      }
    });

    if (paymentMethod === 'btc' && (process.env.PAYMENT_PROVIDER === 'satsale' || !process.env.PAYMENT_PROVIDER)) {
      const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
      const resp = await fetch(`${base}/api/payments/create-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, paymentId: payment.id, amount: payment.amount, currency: payment.currency, method: 'btc' })
      });
      const data = await resp.json();
      if (data.providerInvoice) {
        await prisma.payment.update({ where: { id: payment.id }, data: { providerInvoice: data.providerInvoice, providerData: data.providerData || {} } });
      }
      return res.status(200).json({ orderId: order.id, payment: data });
    }

    if (paymentMethod === 'xmr') {
      const staticXmrAddress = process.env.STATIC_XMR_ADDRESS || null;
      await prisma.payment.update({ where: { id: payment.id }, data: { address: staticXmrAddress, provider: 'static-xmr' } });
      return res.status(200).json({ orderId: order.id, payment: { method: 'xmr', address: staticXmrAddress, paymentReference: order.id } });
    }

    return res.status(200).json({ orderId: order.id, payment: { mock: true, total: payment.amount } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'checkout_failed' });
  } finally {
  }
}
