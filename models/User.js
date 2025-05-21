// backend/models/Service.js
const mongoose = require('mongoose');

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
    enum: ['licencia', 'landing-page', 'consultoria', 'otro']
  },
  precio: {
    type: Number,
    required: [true, 'El precio del servicio es obligatorio.'],
    min: [0, 'El precio no puede ser negativo.']
  },
  moneda: {
    type: String,
    required: [true, 'La moneda es obligatoria.'],
    default: 'COP',
    uppercase: true
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

// Índice compuesto para consultas frecuentes
serviceSchema.index({ tipo: 1, activo: 1 });

module.exports = mongoose.model('Service', serviceSchema);
