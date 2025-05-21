// backend/routes/services.ts
import { Router, Request, Response, NextFunction } from 'express';
// Update the import paths and usage according to your actual file structure and exports
// Update the path below if your auth middleware is located elsewhere
import auth from '../middleware/auth'; // <-- Ensure this file exists and exports 'auth' as default
// If the file does not exist, create 'backend/middleware/auth.ts' and export 'auth' from it.
import { Service } from '../models/Service';

// Si usas autenticación real (por ejemplo, JWT), reemplaza la lógica del middleware por la verificación correspondiente.
// Si tu modelo de usuario es diferente, ajusta el tipo de req.user según tu implementación.

// If you don't have a custom UserRequest type, use Request from express
// Otherwise, ensure '../types/express' exists and exports UserRequest
// import { UserRequest } from '../types/express';
type UserRequest = Request & { user?: { _id: string } };

const router = Router();

// Crear servicio (protegido)
router.post('/', auth, async (req: UserRequest, res: Response, next: NextFunction) => {
    try {
        const { nombre, tipo, precio, detalles, fecha_expiracion } = req.body;

    // Validación básica
    if (!nombre || !tipo || !precio) {
      return res.status(400).json({ error: 'Nombre, tipo y precio son requeridos' });
    }

    const nuevoServicio = new Service({
      ...req.body,
      usuario: req.user?._id  // Asociar al usuario autenticado
    });

    await nuevoServicio.save();

    res.status(201).json({
      success: true,
      servicio: nuevoServicio
    });

  } catch (error) {
    next(error);
  }
});

// Obtener todos los servicios del usuario (con paginación)
router.get('/', auth, async (req: UserRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const tipo = req.query.tipo as string | undefined;

    const query: any = { usuario: req.user?._id };
    if (tipo) query.tipo = tipo;

    const servicios = await Service.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort('-fecha_creacion');

    const total = await Service.countDocuments(query);

    res.json({
      servicios,
      paginacion: {
        paginaActual: page,
        totalPaginas: Math.ceil(total / limit),
        totalServicios: total
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo servicios' });
  }
});

// Obtener un servicio específico
router.get('/:id', auth, async (req: UserRequest, res: Response) => {
  try {
    const servicio = await Service.findOne({
      _id: req.params.id,
      usuario: req.user?._id
    });

    if (!servicio) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    res.json(servicio);
    
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo servicio' });
  }
});

// Actualizar servicio (solo propietario)
router.put('/:id', auth, async (req: UserRequest, res: Response) => {
  try {
    const updates = Object.keys(req.body);
    const allowedUpdates = ['nombre', 'detalles', 'precio', 'fecha_expiracion'];
    const isValidOperation = updates.every(update => allowedUpdates.includes(update));

    if (!isValidOperation) {
      return res.status(400).json({ error: 'Actualizaciones no permitidas' });
    }

    const servicio = await Service.findOneAndUpdate(
      { _id: req.params.id, usuario: req.user?._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!servicio) {
      return res.status(404).json({ error: 'Servicio no encontrado o no autorizado' });
    }

    res.json(servicio);

  } catch (error) {
    res.status(400).json({ error: 'Error actualizando servicio' });
  }
});

// Eliminar servicio (solo propietario)
router.delete('/:id', auth, async (req: UserRequest, res: Response) => {
  try {
    const servicio = await Service.findOneAndDelete({
      _id: req.params.id,
      usuario: req.user?._id
    });

    if (!servicio) {
      return res.status(404).json({ error: 'Servicio no encontrado o no autorizado' });
    }

    res.json({ success: true, mensaje: 'Servicio eliminado' });

  } catch (error) {
    res.status(500).json({ error: 'Error eliminando servicio' });
  }
});

export default router;
