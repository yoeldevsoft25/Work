"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Service_1 = require("../models/Service"); // Importa Service e IServiceDocument
class ServiceController {
    static async createService(req, res, next) {
        try {
            const { nombre, tipo, precio, fecha_expiracion } = req.body;
            if (!nombre || !tipo || !precio || !fecha_expiracion) {
                return res.status(400).json({ error: 'Nombre, tipo, precio y fecha de expiración requeridos.' });
            }
            if (!req.user?._id)
                return res.status(401).json({ error: 'Usuario no autenticado.' });
            const nuevoServicio = new Service_1.Service({
                ...req.body, usuario: req.user._id,
                fecha_compra: req.body.fecha_compra || new Date(),
            });
            const servicioGuardado = await nuevoServicio.save();
            res.status(201).json(servicioGuardado);
        }
        catch (error) {
            next(error);
        }
    }
    static async getServices(req, res, next) {
        try {
            if (!req.user?._id)
                return res.status(401).json({ error: 'Usuario no autenticado.' });
            const servicios = await Service_1.Service.find({ usuario: req.user._id }).sort({ createdAt: -1 });
            res.json(servicios);
        }
        catch (error) {
            next(error);
        }
    }
    static async getServiceById(req, res, next) {
        try {
            if (!req.user?._id)
                return res.status(401).json({ error: 'Usuario no autenticado.' });
            const servicio = await Service_1.Service.findOne({ _id: req.params.id, usuario: req.user._id });
            if (!servicio)
                return res.status(404).json({ error: 'Servicio no encontrado.' });
            res.json(servicio);
        }
        catch (error) {
            next(error);
        }
    }
    static async updateService(req, res, next) {
        try {
            if (!req.user?._id)
                return res.status(401).json({ error: 'Usuario no autenticado.' });
            const servicio = await Service_1.Service.findOneAndUpdate({ _id: req.params.id, usuario: req.user._id }, req.body, { new: true, runValidators: true });
            if (!servicio)
                return res.status(404).json({ error: 'Servicio no encontrado o no autorizado.' });
            res.json(servicio);
        }
        catch (error) {
            next(error);
        }
    }
    static async deleteService(req, res, next) {
        try {
            if (!req.user?._id)
                return res.status(401).json({ error: 'Usuario no autenticado.' });
            const servicio = await Service_1.Service.findOneAndDelete({ _id: req.params.id, usuario: req.user._id });
            if (!servicio)
                return res.status(404).json({ error: 'Servicio no encontrado o no autorizado.' });
            res.json({ message: 'Servicio eliminado.' });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.default = ServiceController;
//# sourceMappingURL=serviceController.js.map