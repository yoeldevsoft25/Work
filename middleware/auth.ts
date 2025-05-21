// backend/middleware/auth.ts
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUserDocument } from '../models/User';
import { UserRequest } from '../types/express';

export default async (req: UserRequest, res: Response, next: NextFunction) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ error: 'Acceso denegado. No se proporcionó token.' });
  }

  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Formato de token inválido.' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('Error Crítico Middleware: JWT_SECRET no definido.');
      return res.status(500).json({ error: 'Error de configuración del servidor.' });
    }

    const decoded = jwt.verify(token, jwtSecret) as { userId: string; /* otros campos del payload */ };
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({ error: 'Token inválido. Usuario no encontrado.' });
    }
    req.user = user as IUserDocument; // Asignar usuario a la request
    next();
  } catch (error) {
    // Diferenciar errores de JWT de otros errores
    if (error instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({ error: 'Token inválido o corrupto.' });
    }
    if (error instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ error: 'Token expirado.' });
    }
    console.error("Error en middleware de autenticación:", error);
    res.status(500).json({ error: 'Error interno al validar el token.' });
  }
};
