// backend/models/Service.js
const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  tipo: { type: String, required: true, enum: ['licencia', 'landing-page'] },
  estado: { type: String, default: 'pendiente', enum: ['activo', 'expirado', 'pendiente', 'cancelado'] },
  fecha_compra: { type: Date, default: Date.now },
  fecha_expiracion: { type: Date, required: true },
  precio: { type: Number, min: 0 },
  detalles: { type: String, trim: true },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Asume que tienes un modelo 'User'
  transaccion_id_wompi: { type: String },
}, { timestamps: true });

// Exportar el modelo
module.exports = mongoose.model('Service', serviceSchema);
