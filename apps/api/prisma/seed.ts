import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Explicit operator provisioning only. No synthetic products, warehouses or movements.
async function main() {
  const input = z.object({
    BOOTSTRAP_MANAGER_NAME: z.string().trim().min(2).max(120),
    BOOTSTRAP_MANAGER_EMAIL: z.email().transform(value => value.toLowerCase()),
    BOOTSTRAP_MANAGER_PASSWORD: z.string().min(12).max(72),
  }).parse(process.env);
  const existing = await prisma.user.findUnique({ where: { email: input.BOOTSTRAP_MANAGER_EMAIL }, select: { id: true } });
  if (existing) throw new Error('That account already exists. Bootstrap will not reset credentials or silently grant manager access.');
  const passwordHash = await bcrypt.hash(input.BOOTSTRAP_MANAGER_PASSWORD, 12);
  await prisma.user.create({ data: { name: input.BOOTSTRAP_MANAGER_NAME, email: input.BOOTSTRAP_MANAGER_EMAIL, passwordHash, role: 'MANAGER' } });
  console.log('Manager account created. No inventory data was generated.');
}

main().catch(error => {
  console.error(error instanceof z.ZodError ? 'Set valid BOOTSTRAP_MANAGER_NAME, BOOTSTRAP_MANAGER_EMAIL and BOOTSTRAP_MANAGER_PASSWORD variables.' : 'Manager bootstrap failed; no existing account was changed.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
