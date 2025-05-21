"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/models/User.ts
const mongoose_1 = __importStar(require("mongoose")); // Añade CallbackError
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const UserSchema = new mongoose_1.Schema({
    nombre: { type: String, required: [true, 'El nombre es obligatorio.'], trim: true },
    email: {
        type: String, required: [true, 'El email es obligatorio.'], unique: true,
        lowercase: true, trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Por favor, ingrese un email válido.'],
    },
    password: {
        type: String, required: [true, 'La contraseña es obligatoria.'],
        minlength: [8, 'La contraseña debe tener al menos 8 caracteres.'], select: false,
    },
}, { timestamps: true });
// Hook pre-save
UserSchema.pre('save', async function (next) {
    const user = this; // 'this' ahora es de tipo IUserDocument
    if (!user.isModified('password')) {
        return next();
    }
    try {
        const salt = await bcryptjs_1.default.genSalt(10);
        user.password = await bcryptjs_1.default.hash(user.password, salt);
        next();
    }
    catch (error) {
        next(error); // Pasa el error a Mongoose
    }
});
// Método de instancia
UserSchema.methods.compararPassword = async function (candidatePassword) {
    // 'this' aquí se refiere a la instancia del documento User.
    // this.password estará disponible si se seleccionó explícitamente en la consulta (select('+password'))
    return bcryptjs_1.default.compare(candidatePassword, this.password);
};
const User = mongoose_1.default.model('User', UserSchema);
exports.default = User; // Exporta el modelo
//# sourceMappingURL=User.js.map