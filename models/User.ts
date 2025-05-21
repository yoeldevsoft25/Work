// backend/models/User.ts
import mongoose, { Document, Model, Schema, CallbackError } from 'mongoose'; // Añade CallbackError
import bcrypt from 'bcryptjs';

// Interfaz para el documento de usuario
export interface IUserDocument extends Document { // Exporta la interfaz
  _id: mongoose.Schema.Types.ObjectId;
  nombre: string;
  email: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
  compararPassword(candidatePassword: string): Promise<boolean>;
}

// Interfaz para el Modelo estático
export interface IUserModel extends Model<IUserDocument> {}

const UserSchema = new Schema<IUserDocument, IUserModel>({
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
UserSchema.pre<IUserDocument>('save', async function (next: (err?: CallbackError) => void) { // Tipar 'this' y 'next'
  const user = this; // 'this' ahora es de tipo IUserDocument

  if (!user.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
    next();
  } catch (error) {
    next(error as CallbackError); // Pasa el error a Mongoose
  }
});

// Método de instancia
UserSchema.methods.compararPassword = async function (candidatePassword: string): Promise<boolean> {
  // 'this' aquí se refiere a la instancia del documento User.
  // this.password estará disponible si se seleccionó explícitamente en la consulta (select('+password'))
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model<IUserDocument, IUserModel>('User', UserSchema);
export default User; // Exporta el modelo
