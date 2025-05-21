// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Asegúrate que la ruta a tu modelo User sea correcta

module.exports = async (req, res, next) => {
  console.log("--- Entrando a authMiddleware ---");
  const authHeader = req.header('Authorization');
  // ---- LOG DE DEPURACIÓN PARA HEADER AUTORIZACIÓN ----
  console.log("AUTH_MIDDLEWARE - Header Authorization recibido:", authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn("AUTH_MIDDLEWARE: Acceso denegado - Formato de token inválido o no proporcionado.");
    return res.status(401).json({ error: 'Acceso denegado. Formato de token inválido o no proporcionado.' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const jwtSecretFromEnv = process.env.JWT_SECRET;

  // ---- LOGS DE DEPURACIÓN PARA JWT_SECRET Y TOKEN AL VERIFICAR ----
  console.log("AUTH_MIDDLEWARE - JWT_SECRET usada para VERIFICAR:", jwtSecretFromEnv ? `Sí (longitud: ${jwtSecretFromEnv.length})` : "NO DEFINIDA!!!");
  console.log("AUTH_MIDDLEWARE - Token extraído para VERIFICAR:", token);

  if (!jwtSecretFromEnv) {
    console.error('AUTH_MIDDLEWARE - ERROR CRÍTICO: JWT_SECRET no definido en .env al intentar verificar token.');
    return res.status(500).json({ error: 'Error de configuración del servidor (verificación de token).' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecretFromEnv);
    console.log("AUTH_MIDDLEWARE - Token decodificado:", decoded);

    // Busca al usuario, excluye la contraseña. Asegúrate que el modelo User exista y la ruta sea correcta.
    const user = await User.findById(decoded.userId).select('-password'); 

    if (!user) {
      console.warn(`AUTH_MIDDLEWARE: Token inválido - Usuario no encontrado con ID: ${decoded.userId}`);
      return res.status(401).json({ error: 'Token inválido, usuario no encontrado.' });
    }

    req.user = user; // Adjunta el objeto usuario completo (sin password) a la solicitud
    console.log("AUTH_MIDDLEWARE: Usuario autenticado y adjuntado a req.user:", JSON.stringify(user, null, 2));
    next(); // Pasa al siguiente middleware o controlador

  } catch (error) {
    console.error("AUTH_MIDDLEWARE - Error al verificar token o buscar usuario:", error.name, error.message);
    if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Token inválido (malformado o firma incorrecta).' });
    }
    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expirado.' });
    }
    // Para otros errores durante la verificación o búsqueda de usuario
    res.status(500).json({ error: 'Error interno del servidor al autenticar el token.' });
  }
};
