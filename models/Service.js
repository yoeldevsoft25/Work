// backend/models/Service.js
const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  serviceCode: { 
    type: String,
    required: [true, 'El código del servicio es obligatorio.'],
    unique: true,  // <-- Esto ya crea un índice ÚNICO
    trim: true,
    uppercase: true,
  },
  // ... (otros campos se mantienen igual)
}, { 
  timestamps: true 
});

// ⚠️ ELIMINA ESTA LÍNEA para evitar duplicación:
// serviceSchema.index({ serviceCode: 1 });

serviceSchema.index({ tipo: 1, activo: 1 }); // Este índice se mantiene

module.exports = mongoose.model('Service', serviceSchema);
