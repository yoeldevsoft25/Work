// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Asegúrate que la ruta a tu modelo User sea correcta

const router = express.Router();

// POST /api/auth/registro
router.post('/registro', async (req, res) => {
  console.log("================ AUTH_ROUTE - /api/auth/registro ================");
  const { nombre, email, password } = req.body;
  console.log("REGISTRO - Body recibido:", { nombre, email, password: password ? `Presente (longitud: ${password.length})` : 'NO PRESENTE' });
  
  if (!nombre || !email || !password) {
    console.warn("REGISTRO - Validación fallida: Campos obligatorios faltantes.");
    return res.status(400).json({ error: 'Todos los campos son obligatorios (nombre, email, password).' });
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    console.warn("REGISTRO - Validación fallida: Formato de email inválido.");
    return res.status(400).json({ error: 'Formato de correo electrónico inválido.' });
  }
  if (password.length < 6) {
    console.warn("REGISTRO - Validación fallida: Contraseña demasiado corta.");
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const existeUsuario = await User.findOne({ email });
    if (existeUsuario) {
      console.warn(`REGISTRO - Usuario YA EXISTE con email: ${email}`);
      return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
    }

    console.log(`REGISTRO - Usuario con email ${email} NO existe. Procediendo a crear.`);

    // --- Hashing de Contraseña ---
    // Idealmente, esto sucede en un pre-save hook en el modelo User.js
    // Si NO está en el modelo, se hace aquí:
    console.log("REGISTRO - Password original (antes de hashear):", password); // Log para ver la contraseña original
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log("REGISTRO - Password hasheada (lista para guardar):", hashedPassword ? `Sí (longitud: ${hashedPassword.length})` : "FALLO AL HASHEAR");
    // --- Fin Hashing ---

    const nuevoUsuario = new User({
      nombre,
      email,
      password: hashedPassword // <--- Usar la contraseña hasheada aquí
      // Si el hashing está en el modelo, simplemente pasarías: password: password
    });
    console.log("REGISTRO - Objeto nuevoUsuario (antes de save):", { nombre: nuevoUsuario.nombre, email: nuevoUsuario.email, passwordIsHashed: !!nuevoUsuario.password });

    await nuevoUsuario.save();
    console.log(`REGISTRO - Usuario ${email} registrado y guardado exitosamente en DB.`);
    res.status(201).json({ 
      success: true,
      message: 'Usuario registrado exitosamente.' 
    });

  } catch (error) {
    console.error("REGISTRO - ERROR CATCH en /api/auth/registro:", error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: 'Error de validación al registrar.', details: errors });
    }
    res.status(500).json({ error: 'Error interno del servidor al registrar usuario.', details: error.message });
  }
  console.log("================ FIN AUTH_ROUTE - /api/auth/registro ================");
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  console.log("================ AUTH_ROUTE - /api/auth/login ================");
  const { email, password } = req.body;
  console.log("LOGIN - Body recibido:", { email, password: password ? `Presente (longitud: ${password.length})` : 'NO PRESENTE' });

  if (!email || !password) {
    console.warn("LOGIN - Validación fallida: Email y/o contraseña son obligatorios.");
    return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
  }

  try {
    console.log(`LOGIN - Buscando usuario en DB con email: "${email}"`);
    // Buscar usuario y seleccionar explícitamente la contraseña (ya que puede tener select:false en el schema)
    const usuario = await User.findOne({ email }).select('+password'); 
    
    if (!usuario) {
      console.warn(`LOGIN - Usuario NO ENCONTRADO en DB con email: ${email}`);
      return res.status(401).json({ error: 'Credenciales inválidas.' }); 
    }

    console.log(`LOGIN - Usuario ENCONTRADO: ${usuario.email}.`);
    console.log(`LOGIN - Verificando si la contraseña está presente en el objeto 'usuario' devuelto por DB...`);
    if (usuario.password) {
      console.log(`LOGIN - Contraseña de DB (hasheada) para ${usuario.email}: SÍ PRESENTE (longitud: ${usuario.password.length}). Hash: ${usuario.password.substring(0,10)}...`); // Muestra parte del hash
    } else {
      console.error(`LOGIN - ERROR CRÍTICO: Contraseña de DB NO PRESENTE en el objeto 'usuario' para ${usuario.email}. ¿.select('+password') funcionó o el campo se llama diferente?`);
      return res.status(500).json({ error: 'Error interno del servidor (lectura de datos de usuario).' });
    }

    console.log(`LOGIN - Comparando contraseña ingresada ("${password.substring(0,3)}...") con hash de DB para ${usuario.email}.`);
    const contraseñaValida = await bcrypt.compare(password, usuario.password);
    console.log(`LOGIN - Resultado de bcrypt.compare para ${usuario.email}: ${contraseñaValida}`);

    if (!contraseñaValida) {
      console.warn(`LOGIN - COMPARACIÓN FALLIDA: Contraseña inválida para usuario ${email}.`);
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    console.log(`LOGIN - COMPARACIÓN EXITOSA: Contraseña válida para usuario ${email}. Procediendo a generar token.`);

    // --- Generación de Token JWT ---
    const secretParaFirmar = process.env.JWT_SECRET;
    console.log(">>>>>>>> LOGIN RUTA - JWT_SECRET usada para FIRMAR:", 
                  secretParaFirmar ? `Sí (longitud: ${secretParaFirmar.length}, primeros 5: ${secretParaFirmar.substring(0,5)}...)` : "¡¡¡NO DEFINIDA!!!");
    
    if (!secretParaFirmar) {
        console.error(">>>>>>>> LOGIN RUTA - ERROR CRÍTICO: JWT_SECRET es undefined. El token no se puede firmar.");
        return res.status(500).json({ error: "Error de configuración del servidor (firma de token)."});
    }

    const payload = { 
      userId: usuario._id, 
      email: usuario.email,
    };

    const token = jwt.sign(
      payload,
      secretParaFirmar,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    console.log(">>>>>>>> LOGIN RUTA - Token generado (primeros 15 chars):", token.substring(0,15) + "...");
    // --- Fin Generación de Token ---
    
    res.json({ 
      message: 'Inicio de sesión exitoso.',
      token,
      nombre: usuario.nombre 
    });

  } catch (error) {
    console.error("LOGIN - ERROR CATCH en /api/auth/login:", error);
    res.status(500).json({ error: 'Error interno del servidor al iniciar sesión.', details: error.message });
  }
  console.log("================ FIN AUTH_ROUTE - /api/auth/login ================");
});

module.exports = router;
