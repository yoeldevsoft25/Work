// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}, { timestamps: true });

// Exporta el modelo CORRECTAMENTE:
module.exports = mongoose.model('User', UserSchema);
