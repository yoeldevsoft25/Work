import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
// @ts-ignore
import User from '../models/User';

class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const { nombre, email, password } = req.body;
      
      if (!nombre || !email || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
      }

      const existeUsuario = await User.findOne({ email: email.toLowerCase().trim() });
      if (existeUsuario) {
        return res.status(400).json({ error: 'El correo ya está registrado' });
      }

      const hash = await bcrypt.hash(password, 12);
      const nuevoUsuario = new User({
        nombre: nombre.trim(),
        email: email.toLowerCase().trim(),
        password: hash
      });

      await nuevoUsuario.save();

      const token = this.generateToken(nuevoUsuario);
      
      res.status(201).json({
        token,
        usuario: {
          id: nuevoUsuario._id,
          nombre: nuevoUsuario.nombre,
          email: nuevoUsuario.email
        }
      });

    } catch (error) {
      console.error('Error en registro:', error);
      res.status(500).json({ error: 'Error en el servidor' });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      
      const usuario = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
      if (!usuario) return res.status(401).json({ error: 'Credenciales inválidas' });

      const passwordValida = await bcrypt.compare(password, usuario.password);
      if (!passwordValida) return res.status(401).json({ error: 'Credenciales inválidas' });

      const token = this.generateToken(usuario);
      
      res.json({
        token,
        usuario: {
          id: usuario._id,
          nombre: usuario.nombre,
          email: usuario.email
        }
      });

    } catch (error) {
      console.error('Error en login:', error);
      res.status(500).json({ error: 'Error en el servidor' });
    }
  }

  private static generateToken(user: any) {
    return jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '8h', algorithm: 'HS256' }
    );
  }
}

export default AuthController;
