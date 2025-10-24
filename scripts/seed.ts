import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const file = path.join(process.cwd(), 'data', 'products.json');
  if (!fs.existsSync(file)) {
    console.warn('No data/products.json found — skipping product seed.');
  } else {
    const raw = fs.readFileSync(file, 'utf-8');
    const products = JSON.parse(raw || '[]');

    for (const p of products) {
      await prisma.product.upsert({
        where: { slug: p.id },
        update: {
          name: p.name,
          description: p.description,
          price: Math.round(p.price),
          category: p.category,
          image: p.image,
          sku: p.sku,
          inStock: p.in_stock
        },
        create: {
          slug: p.id,
          name: p.name,
          description: p.description,
          price: Math.round(p.price),
          category: p.category,
          image: p.image,
          sku: p.sku,
          inStock: p.in_stock
        }
      });
    }
    console.log(`Seeded ${products.length} products`);
  }

  const adminEmail = process.env.ADMIN_SEED_EMAIL;
  if (adminEmail) {
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: 'admin', name: 'Admin' },
      create: { email: adminEmail, name: 'Admin', role: 'admin' }
    });
    console.log(`Admin user created/updated: ${admin.email}`);
  } else {
    console.log('No ADMIN_SEED_EMAIL set — skipping admin creation.');
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
