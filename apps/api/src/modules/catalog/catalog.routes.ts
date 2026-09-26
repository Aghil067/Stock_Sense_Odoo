import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './catalog.controller.js';
import { categorySchema, createProductSchema, locationSchema, unitSchema, updateProductSchema, warehouseSchema } from './catalog.schemas.js';

export const productRouter = Router();
productRouter.use(requireAuth);
productRouter.get('/', controller.listProducts);
productRouter.post('/', requireRole(Role.MANAGER), validateBody(createProductSchema), controller.createProduct);
productRouter.get('/:id', controller.getProduct);
productRouter.patch('/:id', requireRole(Role.MANAGER), validateBody(updateProductSchema), controller.updateProduct);

export const masterDataRouter = Router();
masterDataRouter.use(requireAuth);
masterDataRouter.get('/', controller.masterData);
masterDataRouter.post('/categories', requireRole(Role.MANAGER), validateBody(categorySchema), controller.createCategory);
masterDataRouter.post('/units', requireRole(Role.MANAGER), validateBody(unitSchema), controller.createUnit);
masterDataRouter.post('/warehouses', requireRole(Role.MANAGER), validateBody(warehouseSchema), controller.createWarehouse);
masterDataRouter.post('/locations', requireRole(Role.MANAGER), validateBody(locationSchema), controller.createLocation);

