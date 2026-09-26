import type { Request, Response } from 'express';
import * as staffService from './staff.service.js';

export async function getStaffWorkspace(_request: Request, response: Response) {
  response.json({ data: await staffService.getStaffWorkspace() });
}
