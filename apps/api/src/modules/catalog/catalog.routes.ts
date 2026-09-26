import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './catalog.controller.js';
import {
  categorySchema, createProductSchema, locationSchema, reorderRuleSchema, unitSchema,
  updateCategorySchema, updateLocationSchema, updateProductSchema, updateUnitSchema, updateWarehouseSchema, warehouseSchema,
} from './catalog.schemas.js';

export const productRouter = Router();
productRouter.use(requireAuth);
productRouter.get('/', controller.listProducts);
productRouter.post('/', requireRole(Role.MANAGER), validateBody(createProductSchema), controller.createProduct);
productRouter.get('/:id', controller.getProduct);
productRouter.patch('/:id', requireRole(Role.MANAGER), validateBody(updateProductSchema), controller.updateProduct);
productRouter.put('/:id/reorder-rule', requireRole(Role.MANAGER), validateBody(reorderRuleSchema), controller.upsertReorderRule);

export const masterDataRouter = Router();
masterDataRouter.use(requireAuth);
masterDataRouter.get('/', controller.masterData);

masterDataRouter.post('/categories', requireRole(Role.MANAGER), validateBody(categorySchema), controller.createCategory);
masterDataRouter.patch('/categories/:id', requireRole(Role.MANAGER), validateBody(updateCategorySchema), controller.updateCategory);
masterDataRouter.delete('/categories/:id', requireRole(Role.MANAGER), controller.deleteCategory);

masterDataRouter.post('/units', requireRole(Role.MANAGER), validateBody(unitSchema), controller.createUnit);
masterDataRouter.patch('/units/:id', requireRole(Role.MANAGER), validateBody(updateUnitSchema), controller.updateUnit);
masterDataRouter.delete('/units/:id', requireRole(Role.MANAGER), controller.deleteUnit);

masterDataRouter.post('/warehouses', requireRole(Role.MANAGER), validateBody(warehouseSchema), controller.createWarehouse);
masterDataRouter.patch('/warehouses/:id', requireRole(Role.MANAGER), validateBody(updateWarehouseSchema), controller.updateWarehouse);
masterDataRouter.delete('/warehouses/:id', requireRole(Role.MANAGER), controller.deleteWarehouse);

masterDataRouter.post('/locations', requireRole(Role.MANAGER), validateBody(locationSchema), controller.createLocation);
masterDataRouter.patch('/locations/:id', requireRole(Role.MANAGER), validateBody(updateLocationSchema), controller.updateLocation);
masterDataRouter.delete('/locations/:id', requireRole(Role.MANAGER), controller.deleteLocation);

