import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as controller from './staff.controller.js';

export const staffRouter = Router();

staffRouter.use(requireAuth);
staffRouter.get('/workspace', controller.getStaffWorkspace);
