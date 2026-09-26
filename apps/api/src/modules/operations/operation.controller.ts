import type { Request, Response } from 'express';
import { operationFiltersSchema } from './operation.schemas.js';
import * as operationService from './operation.service.js';

export async function create(request: Request, response: Response) {
  response.status(201).json({ data: await operationService.createOperation(request.body, request.user!.id) });
}

export async function list(request: Request, response: Response) {
  const filters = operationFiltersSchema.parse(request.query);
  response.json(await operationService.listOperations(filters));
}

export async function get(request: Request, response: Response) {
  response.json({ data: await operationService.getOperation(String(request.params.id)) });
}

export async function preview(request: Request, response: Response) {
  response.json({ data: await operationService.previewOperation(String(request.params.id)) });
}

export async function pick(request: Request, response: Response) {
  response.json({ data: await operationService.advanceDelivery(String(request.params.id), 'pick') });
}

export async function pack(request: Request, response: Response) {
  response.json({ data: await operationService.advanceDelivery(String(request.params.id), 'pack') });
}

export async function validate(request: Request, response: Response) {
  response.json({ data: await operationService.validateOperation(String(request.params.id), request.user!.id) });
}

export async function cancel(request: Request, response: Response) {
  response.json({ data: await operationService.cancelOperation(String(request.params.id)) });
}
