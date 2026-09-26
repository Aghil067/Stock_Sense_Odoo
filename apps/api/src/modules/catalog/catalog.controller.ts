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
export async function masterData(_request: Request, response: Response) { response.json({ data: await catalog.getMasterData() }); }
export async function createCategory(request: Request, response: Response) { response.status(201).json({ data: await catalog.createCategory(request.body) }); }
export async function createUnit(request: Request, response: Response) { response.status(201).json({ data: await catalog.createUnit(request.body) }); }
export async function createWarehouse(request: Request, response: Response) { response.status(201).json({ data: await catalog.createWarehouse(request.body) }); }
export async function createLocation(request: Request, response: Response) { response.status(201).json({ data: await catalog.createLocation(request.body) }); }

