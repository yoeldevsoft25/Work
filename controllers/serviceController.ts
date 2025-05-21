// backend/controllers/serviceController.ts
import { Response, NextFunction } from 'express';
import { Service, IServiceDocument } from '../models/Service'; // Importa Service e IServiceDocument
// Define UserRequest type here if ../types/express does not exist
import { Request } from 'express';

interface UserRequest extends Request {
  user?: {
    _id: string;
    // Add other user properties if needed
  };
}

interface ServiceRequestBody {
  nombre: string; tipo: 'licencia' | 'landing-page'; precio: number;
  detalles?: string; fecha_expiracion: string | Date; fecha_compra?: string | Date;
  estado?: 'activo' | 'expirado' | 'pendiente';
}
interface JsonResponse { error?: string; message?: string; [key: string]: any; }

class ServiceController {
  static async createService(req: UserRequest, res: Response<IServiceDocument | JsonResponse>, next: NextFunction) {
    try {
      const { nombre, tipo, precio, fecha_expiracion } = req.body as ServiceRequestBody;
      if (!nombre || !tipo || !precio || !fecha_expiracion) {
        return res.status(400).json({ error: 'Nombre, tipo, precio y fecha de expiración requeridos.' });
      }
      if (!req.user?._id) return res.status(401).json({ error: 'Usuario no autenticado.' });
      const nuevoServicio = new Service({
        ...req.body, usuario: req.user._id,
        fecha_compra: req.body.fecha_compra || new Date(),
      });
      const servicioGuardado = await nuevoServicio.save();
      res.status(201).json(servicioGuardado);
    } catch (error) { next(error); }
  }

  static async getServices(req: UserRequest, res: Response<IServiceDocument[] | JsonResponse>, next: NextFunction) {
    try {
      if (!req.user?._id) return res.status(401).json({ error: 'Usuario no autenticado.' });
      const servicios = await Service.find({ usuario: req.user._id }).sort({ createdAt: -1 });
      res.json(servicios);
    } catch (error) { next(error); }
  }

  static async getServiceById(req: UserRequest, res: Response<IServiceDocument | JsonResponse>, next: NextFunction) {
    try {
      if (!req.user?._id) return res.status(401).json({ error: 'Usuario no autenticado.' });
      const servicio = await Service.findOne({ _id: req.params.id, usuario: req.user._id });
      if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado.' });
      res.json(servicio);
    } catch (error) { next(error); }
  }

  static async updateService(req: UserRequest, res: Response<IServiceDocument | JsonResponse>, next: NextFunction) {
    try {
      if (!req.user?._id) return res.status(401).json({ error: 'Usuario no autenticado.' });
      const servicio = await Service.findOneAndUpdate(
        { _id: req.params.id, usuario: req.user._id },
        req.body as Partial<ServiceRequestBody>, { new: true, runValidators: true }
      );
      if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado o no autorizado.' });
      res.json(servicio);
    } catch (error) { next(error); }
  }

  static async deleteService(req: UserRequest, res: Response<JsonResponse>, next: NextFunction) {
    try {
      if (!req.user?._id) return res.status(401).json({ error: 'Usuario no autenticado.' });
      const servicio = await Service.findOneAndDelete({ _id: req.params.id, usuario: req.user._id });
      if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado o no autorizado.' });
      res.json({ message: 'Servicio eliminado.' });
    } catch (error) { next(error); }
  }
}
export default ServiceController;
