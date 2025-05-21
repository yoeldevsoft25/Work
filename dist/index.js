"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/index.ts
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express")); // Tipos para el error handler
const mongoose_1 = __importDefault(require("mongoose")); // Solo un import de mongoose aquí
// ... otros imports ...
const app = (0, express_1.default)();
// ... middlewares y rutas ...
// Manejador de errores global (Línea 30 en tu error)
app.use((err, req, res, next) => {
    console.error("Ha ocurrido un error no controlado:");
    console.error("Ruta:", req.method, req.originalUrl);
    // ... más logging ...
    const statusCode = res.statusCode !== 200 ? res.statusCode : 500; // Corrección aquí
    res.status(statusCode).json({
        error: 'Error interno del servidor.',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
});
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 4000;
if (!MONGO_URI) {
    console.error('❌ MONGO_URI no está definido en las variables de entorno.');
    process.exit(1);
}
mongoose_1.default.connect(MONGO_URI)
    .then(() => { })
    .catch((err) => {
    console.error('❌ Error conectando a MongoDB:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map