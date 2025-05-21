// backend/index.js (o index.cjs)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');

// Importar rutas
const authRoutes = require('./routes/auth');
const paymentsRoutes = require('./routes/payments');

const app = express();

// ==================================================
// 1. Configuración de Seguridad con helmet
// ==================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: [ 
        "'self'", 
        'data:', 
        'https://www.facebook.com',
        'https://www.google-analytics.com',
        'https://checkout.wompi.co'
      ],
      scriptSrc: [
        "'self'", 
        'https://connect.facebook.net',
        'https://www.googletagmanager.com'
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameSrc: ["'self'", 'https://checkout.wompi.co'],
      fontSrc: ["'self'", 'data:']
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" } // Para imágenes de terceros
}));

// ==================================================
// 2. Configuración de CORS
// ==================================================
const frontendUrl = process.env.FRONTEND_URL || 'https://viotech.com.co';
console.log(`CONFIG: Permitiendo CORS para el origen: ${frontendUrl}`);

app.use(cors({
  origin: frontendUrl,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ==================================================
// 3. Middlewares para parsear solicitudes
// ==================================================
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ==================================================
// 4. Registro de Rutas
// ==================================================
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentsRoutes);

// ==================================================
// 5. Ruta de salud del servidor
// ==================================================
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'UP', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ==================================================
// 6. Manejador de errores global
// ==================================================
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Error interno del servidor' 
    : err.message;

  console.error(`[${new Date().toISOString()}] Error:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  });

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// ==================================================
// 7. Conexión a MongoDB y arranque del servidor
// ==================================================
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 4000;

if (!MONGO_URI) {
  console.error('❌ CRITICAL: MONGO_URI no definido en .env');
  process.exit(1);
}

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(() => {
  console.log('✅ Conectado a MongoDB Atlas');
  app.listen(PORT, () => {
    console.log(`🚀 Servidor en http://localhost:${PORT}`);
    console.log('🔍 Variables de entorno verificadas:', {
      nodeEnv: process.env.NODE_ENV,
      jwtSecret: process.env.JWT_SECRET ? 'OK' : 'MISSING',
      wompiPublicKey: process.env.WOMPI_PUBLIC_KEY ? 'OK' : 'MISSING'
    });
  });
})
.catch(err => {
  console.error('❌ Error de conexión a MongoDB:', err.message);
  if (err.name === 'MongoServerSelectionError') {
    console.error('Verifica tu conexión a internet y la lista de IPs en MongoDB Atlas');
  }
  process.exit(1);
});
