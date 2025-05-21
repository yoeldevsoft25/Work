// backend/models/Service.js
const mongoose = require('mongoose');
require('mongoose-long')(mongoose);

const { Long } = mongoose.Types;

const serviceSchema = new mongoose.Schema({
  serviceCode: { 
    type: String,
    required: [true, 'El código del servicio es obligatorio.'],
    unique: true,
    trim: true,
    uppercase: true 
  },
  nombre: {
    type: String,
    required: [true, 'El nombre del servicio es obligatorio.'],
    trim: true
  },
  descripcion: {
    type: String,
    trim: true
  },
  tipo: {
    type: String,
    required: [true, 'El tipo de servicio es obligatorio.'],
    enum: ['licencia', 'landing-page', 'consultoria', 'otro'],
    trim: true
  },
  precio: {
    type: Long, // Aquí especificamos Int64 como usa tu colección
    required: [true, 'El precio es obligatorio.'],
    min: 0
  },
  moneda: {
    type: String,
    required: true,
    default: 'COP',
    uppercase: true,
    trim: true
  },
  activo: {
    type: Boolean,
    default: true
  },
  caracteristicas: {
    type: [String],
    default: []
  }
}, { 
  timestamps: true 
});

serviceSchema.index({ tipo: 1, activo: 1 });

module.exports = mongoose.model('Service', serviceSchema);
