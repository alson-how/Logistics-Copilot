import { Router } from 'express';
export const health = Router();
health.get('/health', (_, res) => res.json({ ok: true }));
