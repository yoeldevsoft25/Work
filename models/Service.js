const mongoose = require('mongoose');
require('mongoose-long')(mongoose);

// Verificar si el modelo ya existe
if (mongoose.models.Service) {
  module.exports = mongoose.model('Service');
} else {
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
    descripcion: String,
    tipo: {
      type: String,
      required: [true, 'El tipo de servicio es obligatorio.'],
      enum: ['licencia', 'landing-page', 'consultoria', 'otro']
    },
    precio: {
      type: Long, // <-- Usamos Long directamente
      required: [true, 'El precio es obligatorio.'],
      min: 0
    },
    moneda: {
      type: String,
      required: true,
      default: 'COP',
      uppercase: true
    },
    activo: {
      type: Boolean,
      default: true
    },
    caracteristicas: [String]
  }, { 
    timestamps: true 
  });

  serviceSchema.index({ tipo: 1, activo: 1 });

  module.exports = mongoose.model('Service', serviceSchema);
}
