// backend/index.ts
import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express'; // Tipos para el error handler
import cors from 'cors';
import mongoose from 'mongoose'; // Solo un import de mongoose aquí
// ... otros imports ...

const app = express();
// ... middlewares y rutas ...

// Manejador de errores global (Línea 30 en tu error)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => { // Tipar los parámetros
  console.error("Ha ocurrido un error no controlado:");
  console.error("Ruta:", req.method, req.originalUrl);
  // ... más logging ...
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500; // Corrección aquí
  res.status(statusCode).json({
    error: 'Error interno del servidor.',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 4000;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI no está definido en las variables de entorno.');
  process.exit(1);
}

mongoose.connect(MONGO_URI as string)
  .then(() => { /* ... */ })
  .catch((err: Error) => { // Tipar el error del catch (Línea 49 en tu error)
    console.error('❌ Error conectando a MongoDB:', err);
    process.exit(1);
  });
