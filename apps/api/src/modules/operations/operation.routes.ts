import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './operation.controller.js';
import { createOperationSchema } from './operation.schemas.js';
import { z } from 'zod';
import { previewRecovery, recoverySchema, reverseOperation } from './recovery.service.js';

export const operationRouter = Router();

operationRouter.use(requireAuth);
operationRouter.get('/:id/reversal-preview', requireRole(Role.MANAGER), async (request, response) => {
  response.json({ data: await previewRecovery(z.string().cuid().parse(request.params.id)) });
});
operationRouter.post('/:id/reverse', requireRole(Role.MANAGER), async (request, response) => {
  response.status(201).json({ data: await reverseOperation(z.string().cuid().parse(request.params.id), request.user!.id, recoverySchema.parse(request.body)) });
});
operationRouter.get('/', controller.list);
operationRouter.post('/', requireRole(Role.MANAGER, Role.STAFF), validateBody(createOperationSchema), controller.create);
operationRouter.get('/:id', controller.get);
operationRouter.get('/:id/preview', controller.preview);
operationRouter.post('/:id/pick', requireRole(Role.MANAGER, Role.STAFF), controller.pick);
operationRouter.post('/:id/pack', requireRole(Role.MANAGER, Role.STAFF), controller.pack);
operationRouter.patch('/:id/count', requireRole(Role.MANAGER, Role.STAFF), controller.updateCount);
operationRouter.post('/:id/validate', requireRole(Role.MANAGER, Role.STAFF), controller.validate);
operationRouter.post('/:id/cancel', requireRole(Role.MANAGER, Role.STAFF), controller.cancel);
