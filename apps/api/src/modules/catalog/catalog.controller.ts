import type { Request, Response } from 'express';
import * as catalog from './catalog.service.js';

export async function listProducts(request: Request, response: Response) {
  response.json({ data: await catalog.listProducts({
    search: typeof request.query.search === 'string' ? request.query.search : undefined,
    categoryId: typeof request.query.categoryId === 'string' ? request.query.categoryId : undefined,
    locationId: typeof request.query.locationId === 'string' ? request.query.locationId : undefined,
    stockStatus: typeof request.query.stockStatus === 'string' ? request.query.stockStatus : undefined,
  }) });
}
export async function getProduct(request: Request, response: Response) { response.json({ data: await catalog.getProduct(String(request.params.id)) }); }
export async function createProduct(request: Request, response: Response) { response.status(201).json({ data: await catalog.createProduct(request.body, request.user!.id) }); }
export async function updateProduct(request: Request, response: Response) { response.json({ data: await catalog.updateProduct(String(request.params.id), request.body) }); }
export async function upsertReorderRule(request: Request, response: Response) { response.json({ data: await catalog.upsertReorderRule(String(request.params.id), request.body) }); }
export async function masterData(_request: Request, response: Response) { response.json({ data: await catalog.getMasterData() }); }
export async function createCategory(request: Request, response: Response) { response.status(201).json({ data: await catalog.createCategory(request.body) }); }
export async function updateCategory(request: Request, response: Response) { response.json({ data: await catalog.updateCategory(String(request.params.id), request.body) }); }
export async function deleteCategory(request: Request, response: Response) { response.json({ data: await catalog.deleteCategory(String(request.params.id)) }); }

export async function createUnit(request: Request, response: Response) { response.status(201).json({ data: await catalog.createUnit(request.body) }); }
export async function updateUnit(request: Request, response: Response) { response.json({ data: await catalog.updateUnit(String(request.params.id), request.body) }); }
export async function deleteUnit(request: Request, response: Response) { response.json({ data: await catalog.deleteUnit(String(request.params.id)) }); }

export async function createWarehouse(request: Request, response: Response) { response.status(201).json({ data: await catalog.createWarehouse(request.body) }); }
export async function updateWarehouse(request: Request, response: Response) { response.json({ data: await catalog.updateWarehouse(String(request.params.id), request.body) }); }
export async function deleteWarehouse(request: Request, response: Response) { response.json({ data: await catalog.deleteWarehouse(String(request.params.id)) }); }

export async function createLocation(request: Request, response: Response) { response.status(201).json({ data: await catalog.createLocation(request.body) }); }
export async function updateLocation(request: Request, response: Response) { response.json({ data: await catalog.updateLocation(String(request.params.id), request.body) }); }
export async function deleteLocation(request: Request, response: Response) { response.json({ data: await catalog.deleteLocation(String(request.params.id)) }); }

