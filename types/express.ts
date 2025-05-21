// backend/types/express.ts
import { Request } from 'express';
import { IUserDocument } from '../models/User'; // Asegúrate que User.ts exporta esto

export interface UserRequest extends Request {
  user?: IUserDocument;
}
