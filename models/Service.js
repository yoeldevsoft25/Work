// backend/models/Service.js
const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  serviceCode: { // Identificador único del servicio/plan (ej. "LP_PROFESIONAL_002")
    type: String,
    required: [true, 'El código del servicio es obligatorio.'],
    unique: true,    // Asegura que cada serviceCode sea único
    trim: true,      // Elimina espacios al principio/final
    uppercase: true, // Opcional: Guarda los códigos en mayúsculas para consistencia
  },
  nombre: { 
    type: String, 
    required: [true, 'El nombre del servicio es obligatorio.'],
    trim: true,
  },
  descripcion: { // Descripción más detallada del servicio
    type: String,
    required: false, // Puede ser opcional
    trim: true,
  },
  tipo: { // Para categorizar, ej. 'licencia', 'landing-page', 'consultoria'
    type: String,
    required: [true, 'El tipo de servicio es obligatorio.'],
    enum: ['licencia', 'landing-page', 'consultoria', 'otro'], // Valores permitidos
  },
  precio: { // Precio base del servicio EN LA UNIDAD MÍNIMA (ej. centavos para COP)
    type: Number, 
    required: [true, 'El precio del servicio es obligatorio.'],
    min: [0, 'El precio no puede ser negativo.']
  },
  moneda: { // Moneda del precio (ej. "COP", "USD")
    type: String,
    required: [true, 'La moneda es obligatoria.'],
    default: 'COP',
    uppercase: true,
  },
  activo: { // Para habilitar/deshabilitar un servicio para la venta
    type: Boolean,
    default: true,
  }
  // Podrías añadir más campos como:
  // caracteristicas: [String],
  // duracion_meses: Number, // Si es una suscripción
}, { 
  timestamps: true // Añade createdAt y updatedAt automáticamente
});

// Opcional: Índices para mejorar el rendimiento de las búsquedas
serviceSchema.index({ serviceCode: 1 });
serviceSchema.index({ tipo: 1, activo: 1 });

module.exports = mongoose.model('Service', serviceSchema); // La colección en MongoDB será 'services'
