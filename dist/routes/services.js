"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/routes/services.ts
const express_1 = require("express");
// Update the import paths and usage according to your actual file structure and exports
// Update the path below if your auth middleware is located elsewhere
const auth_1 = __importDefault(require("../middleware/auth")); // <-- Ensure this file exists and exports 'auth' as default
// If the file does not exist, create 'backend/middleware/auth.ts' and export 'auth' from it.
const Service_1 = require("../models/Service");
const router = (0, express_1.Router)();
// Crear servicio (protegido)
router.post('/', auth_1.default, async (req, res, next) => {
    try {
        const { nombre, tipo, precio, detalles, fecha_expiracion } = req.body;
        // Validación básica
        if (!nombre || !tipo || !precio) {
            return res.status(400).json({ error: 'Nombre, tipo y precio son requeridos' });
        }
        const nuevoServicio = new Service_1.Service({
            ...req.body,
            usuario: req.user?._id // Asociar al usuario autenticado
        });
        await nuevoServicio.save();
        res.status(201).json({
            success: true,
            servicio: nuevoServicio
        });
    }
    catch (error) {
        next(error);
    }
});
// Obtener todos los servicios del usuario (con paginación)
router.get('/', auth_1.default, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const tipo = req.query.tipo;
        const query = { usuario: req.user?._id };
        if (tipo)
            query.tipo = tipo;
        const servicios = await Service_1.Service.find(query)
            .skip((page - 1) * limit)
            .limit(limit)
            .sort('-fecha_creacion');
        const total = await Service_1.Service.countDocuments(query);
        res.json({
            servicios,
            paginacion: {
                paginaActual: page,
                totalPaginas: Math.ceil(total / limit),
                totalServicios: total
            }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Error obteniendo servicios' });
    }
});
// Obtener un servicio específico
router.get('/:id', auth_1.default, async (req, res) => {
    try {
        const servicio = await Service_1.Service.findOne({
            _id: req.params.id,
            usuario: req.user?._id
        });
        if (!servicio) {
            return res.status(404).json({ error: 'Servicio no encontrado' });
        }
        res.json(servicio);
    }
    catch (error) {
        res.status(500).json({ error: 'Error obteniendo servicio' });
    }
});
// Actualizar servicio (solo propietario)
router.put('/:id', auth_1.default, async (req, res) => {
    try {
        const updates = Object.keys(req.body);
        const allowedUpdates = ['nombre', 'detalles', 'precio', 'fecha_expiracion'];
        const isValidOperation = updates.every(update => allowedUpdates.includes(update));
        if (!isValidOperation) {
            return res.status(400).json({ error: 'Actualizaciones no permitidas' });
        }
        const servicio = await Service_1.Service.findOneAndUpdate({ _id: req.params.id, usuario: req.user?._id }, req.body, { new: true, runValidators: true });
        if (!servicio) {
            return res.status(404).json({ error: 'Servicio no encontrado o no autorizado' });
        }
        res.json(servicio);
    }
    catch (error) {
        res.status(400).json({ error: 'Error actualizando servicio' });
    }
});
// Eliminar servicio (solo propietario)
router.delete('/:id', auth_1.default, async (req, res) => {
    try {
        const servicio = await Service_1.Service.findOneAndDelete({
            _id: req.params.id,
            usuario: req.user?._id
        });
        if (!servicio) {
            return res.status(404).json({ error: 'Servicio no encontrado o no autorizado' });
        }
        res.json({ success: true, mensaje: 'Servicio eliminado' });
    }
    catch (error) {
        res.status(500).json({ error: 'Error eliminando servicio' });
    }
});
exports.default = router;
//# sourceMappingURL=services.js.map