import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './operation.controller.js';
import { createOperationSchema } from './operation.schemas.js';

export const operationRouter = Router();

operationRouter.use(requireAuth);
operationRouter.get('/', controller.list);
operationRouter.post('/', validateBody(createOperationSchema), controller.create);
operationRouter.get('/:id', controller.get);
operationRouter.get('/:id/preview', controller.preview);
operationRouter.post('/:id/pick', controller.pick);
operationRouter.post('/:id/pack', controller.pack);
operationRouter.post('/:id/validate', controller.validate);
operationRouter.post('/:id/cancel', controller.cancel);

