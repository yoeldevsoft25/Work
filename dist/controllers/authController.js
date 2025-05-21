"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// @ts-ignore
const User_1 = __importDefault(require("../models/User"));
class AuthController {
    static async register(req, res) {
        try {
            const { nombre, email, password } = req.body;
            if (!nombre || !email || !password) {
                return res.status(400).json({ error: 'Todos los campos son obligatorios' });
            }
            const existeUsuario = await User_1.default.findOne({ email: email.toLowerCase().trim() });
            if (existeUsuario) {
                return res.status(400).json({ error: 'El correo ya está registrado' });
            }
            const hash = await bcryptjs_1.default.hash(password, 12);
            const nuevoUsuario = new User_1.default({
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
        }
        catch (error) {
            console.error('Error en registro:', error);
            res.status(500).json({ error: 'Error en el servidor' });
        }
    }
    static async login(req, res) {
        try {
            const { email, password } = req.body;
            const usuario = await User_1.default.findOne({ email: email.toLowerCase().trim() }).select('+password');
            if (!usuario)
                return res.status(401).json({ error: 'Credenciales inválidas' });
            const passwordValida = await bcryptjs_1.default.compare(password, usuario.password);
            if (!passwordValida)
                return res.status(401).json({ error: 'Credenciales inválidas' });
            const token = this.generateToken(usuario);
            res.json({
                token,
                usuario: {
                    id: usuario._id,
                    nombre: usuario.nombre,
                    email: usuario.email
                }
            });
        }
        catch (error) {
            console.error('Error en login:', error);
            res.status(500).json({ error: 'Error en el servidor' });
        }
    }
    static generateToken(user) {
        return jsonwebtoken_1.default.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '8h', algorithm: 'HS256' });
    }
}
exports.default = AuthController;
//# sourceMappingURL=authController.js.map