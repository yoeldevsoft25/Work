// backend/index.js (o index.cjs)
require('dotenv').config(); // ----> ¡CRUCIAL! Cargar variables de entorno PRIMERO

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Importar rutas
const authRoutes = require('./routes/auth');
const paymentsRoutes = require('./routes/payments');
// const serviceRoutes = require('./routes/services'); // Descomenta si tienes rutas de servicios

const app = express();

// Configuración de CORS
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4321';
console.log(`CONFIG: Permitiendo CORS para el origen: ${frontendUrl}`);
app.use(cors({
  origin: frontendUrl,
  // credentials: true, // Descomenta si usas cookies de sesión seguras
}));

// Middlewares para parsear el cuerpo de las solicitudes
// Para el webhook de Wompi, `express.raw()` se aplica directamente en la ruta específica.
app.use(express.json()); // Para parsear application/json
app.use(express.urlencoded({ extended: true })); // Para parsear application/x-www-form-urlencoded

// Registro de Rutas
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentsRoutes);
// app.use('/api/services', serviceRoutes); // Descomenta si tienes rutas de servicios

// Ruta de prueba simple para verificar que el servidor está arriba
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'UP', 
    message: 'Servidor VioTech Backend está operativo.',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Manejador de errores global (debe ser el último middleware)
app.use((err, req, res, next) => {
  console.error("----------------------------------------");
  console.error("ERROR GLOBAL NO CONTROLADO:", err.message);
  if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) { // Mostrar stack en desarrollo o si NODE_ENV no está seteado
    console.error("STACK TRACE:", err.stack);
  }
  console.error("----------------------------------------");
  
  const statusCode = err.status || err.statusCode || 500;
  const errorMessage = err.message || 'Ocurrió un error interno en el servidor.';
  
  res.status(statusCode).json({
    error: 'Error interno del servidor.',
    message: (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) ? errorMessage : 'Ocurrió un problema inesperado.',
    // ...(process.env.NODE_ENV === 'development' && { stack: err.stack }) // Opcional: enviar stack en desarrollo
  });
});

// Conexión a MongoDB y arranque del servidor
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 4000;

if (!MONGO_URI) {
  console.error('CRITICAL ERROR: MONGO_URI no está definido en el archivo .env. El servidor no puede iniciar.');
  process.exit(1); // Termina el proceso si no hay URI de MongoDB
}
if (!process.env.JWT_SECRET) {
  console.error('CRITICAL ERROR: JWT_SECRET no está definido en el archivo .env. La autenticación fallará.');
  // Podrías decidir terminar el proceso aquí también: process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas exitosamente.');
    app.listen(PORT, () => {
      console.log(`🚀 Servidor VioTech Backend corriendo en http://localhost:${PORT}`);
      console.log(`🔧 Entorno actual: ${process.env.NODE_ENV || 'development'}`);
      // Log para JWT_SECRET (solo para depuración inicial, considera quitarlo en producción)
      if (process.env.NODE_ENV === 'development') {
          console.log(`DEBUG: JWT_SECRET cargada: ${process.env.JWT_SECRET ? 'Sí (longitud: ' + process.env.JWT_SECRET.length + ')' : 'NO !!!'}`);
      }
    });
  })
  .catch(err => {
    console.error('❌ Error al conectar con MongoDB:', err.message);
    if (err.name === 'MongoNetworkError') {
        console.error('Detalle: Problema de red. Verifica tu conexión a internet o la configuración de IP en Atlas.');
    } else if (err.name === 'MongoParseError') {
        console.error('Detalle: La URI de MongoDB podría estar malformada.');
    } else if (err.message.includes('authentication fail')) {
        console.error('Detalle: Fallo de autenticación con MongoDB. Verifica tus credenciales (usuario/contraseña) en la MONGO_URI.');
    }
    process.exit(1); // Termina el proceso en caso de error de conexión a la DB
  });
