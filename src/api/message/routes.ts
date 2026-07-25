import { Router } from 'express';
import { z } from 'zod';

import { clientIp } from '../http/client-ip.js';
import { parse } from '../http/validate.js';
import { send } from './service.js';

/**
 * The contact form payload.
 *
 * There is deliberately no ip field: the server resolves the address itself. Accepting it from the
 * client would make the daily limit trivially bypassable.
 *
 * email is optional but validated when present - a malformed address is a typo worth catching at
 * the form, since it is the only way a reply ever gets back.
 */
const createMessageSchema = z.object({
  name: z.string().max(80, 'name must be at most 80 characters').optional(),
  email: z
    .union([z.email('email is not a valid address').max(254), z.literal('')])
    .optional(),
  body: z
    .string()
    .trim()
    .min(1, 'message is required')
    .max(5000, 'message must be at most 5000 characters')
});

export const messageRoutes = Router();

/**
 * There is no GET on this resource. Messages are read out of the database by hand; exposing them
 * would publish strangers' contact details to anyone who guessed the URL.
 */
messageRoutes.post('/', async (req, res) => {
  const request = parse(createMessageSchema, req.body);
  const saved = await send(request, clientIp(req));

  res.status(201).json({ id: Number(saved.id), createdAt: saved.created_at.toISOString() });
});
