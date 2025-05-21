// backend/models/Service.js
const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  serviceCode: { 
    type: String,
    required: [true, 'El código del servicio es obligatorio.'],
    unique: true,
    trim: true,
    uppercase: true, // <--- AÑADIDO/ASEGURADO: Siempre se guardará en mayúsculas
  },
  nombre: { 
    type: String, 
    required: [true, 'El nombre del servicio es obligatorio.'],
    trim: true,
  },
  descripcion: {
    type: String,
    required: false,
    trim: true,
  },
  tipo: {
    type: String,
    required: [true, 'El tipo de servicio es obligatorio.'],
    enum: ['licencia', 'landing-page', 'consultoria', 'otro'], // Asegúrate que estos valores coincidan con tus necesidades
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
    uppercase: true,
  },
  activo: {
    type: Boolean,
    default: true,
  },
  caracteristicas: { // Opcional: añadido como ejemplo
    type: [String],
    default: []
  }
}, { 
  timestamps: true 
});

serviceSchema.index({ serviceCode: 1 }); // Índice para búsquedas rápidas por serviceCode
serviceSchema.index({ tipo: 1, activo: 1 });

module.exports = mongoose.model('Service', serviceSchema);
