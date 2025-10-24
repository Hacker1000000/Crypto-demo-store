import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const provider = process.env.PAYMENT_PROVIDER || 'satsale';
  try {
    const payload = req.body;
    if (provider === 'satsale') {
      const invoiceId = payload.invoice_id || payload.id || payload.external_id;
      const status = payload.status || payload.payment_status || null;

      if (!invoiceId) {
        return res.status(400).json({ error: 'missing_invoice_id' });
      }

      const payment = await prisma.payment.findFirst({ where: { providerInvoice: invoiceId } });
      if (!payment) {
        return res.status(404).json({ error: 'payment_not_found' });
      }

      if (status === 'paid' || status === 'completed' || payload.paid === true) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'paid', providerData: payload, txHash: payload.tx_hash || null }
        });
        if (payment.orderId) {
          await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'paid' } });
        }
        return res.status(200).json({ ok: true });
      }

      await prisma.payment.update({ where: { id: payment.id }, data: { providerData: payload } });
      return res.status(200).json({ ok: true });
    }
    return res.status(501).json({ error: 'provider_webhook_not_supported' });
  } catch (err) {
    return res.status(500).json({ error: 'webhook_handler_error' });
  }
}
