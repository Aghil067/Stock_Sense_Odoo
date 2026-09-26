import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/api-error.js';
import { createOperation } from '../operations/operation.service.js';
import { chat, chatSchema } from './ai.service.js';
import { transferOpportunities } from './inventory-tools.js';

export const aiRouter = Router();
aiRouter.use(requireAuth, requireRole('MANAGER'));
aiRouter.get('/status', (_request, response) =>
  response.json({
    data: {
      configured: true,
      provider: env.AI_API_KEY && env.AI_MODEL ? 'OpenAI' : 'StockSense Intelligence Engine',
      model: env.AI_MODEL || 'Controlled Database Analysis',
    },
  })
);
aiRouter.post('/chat', rateLimit({ windowMs: 60000, limit: 8, keyGenerator: request => request.user!.id, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: { code: 'AI_RATE_LIMIT', message: 'Please wait a minute before sending more AI questions.' } } }), async (request, response) => {
  response.json({ data: await chat(chatSchema.parse(request.body)) });
});
const draftSchema = z.object({ productId: z.string().cuid(), sourceLocationId: z.string().cuid(), destinationLocationId: z.string().cuid() }).strict();
aiRouter.post('/transfer-drafts', async (request, response) => {
  const input = draftSchema.parse(request.body);
  const operation = await prisma.$transaction(async tx => {
    const product = await tx.product.findUnique({ where: { id: input.productId }, select: { sku: true } });
    if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product no longer exists.');
    const recommendations = await transferOpportunities(product.sku, null, tx);
    const recommendation = recommendations.find(r => r.productId === input.productId && r.sourceLocationId === input.sourceLocationId && r.destinationLocationId === input.destinationLocationId);
    if (!recommendation) throw new ApiError(409, 'RECOMMENDATION_CHANGED', 'This transfer is no longer recommended. Ask for fresh transfer opportunities.');
    return createOperation({ type: 'INTERNAL_TRANSFER', sourceLocationId: input.sourceLocationId, destinationLocationId: input.destinationLocationId,
      reason: 'Manager-approved StockSense AI recommendation. Review before validation.', lines: [{ productId: input.productId, quantity: Number(recommendation.quantity) }] }, request.user!.id, tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.status(201).json({ data: operation });
});
