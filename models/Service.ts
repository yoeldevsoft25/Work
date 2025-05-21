// backend/models/Service.ts
import mongoose, { Document, Model, Schema } from 'mongoose';
import { IUserDocument } from './User'; // Importa la interfaz de usuario

export interface IServiceDocument extends Document {
  _id: mongoose.Schema.Types.ObjectId;
  nombre: string;
  tipo: 'licencia' | 'landing-page';
  estado: 'activo' | 'expirado' | 'pendiente' | 'cancelado';
  fecha_compra: Date;
  fecha_expiracion: Date;
  precio?: number;
  detalles?: string;
  usuario: IUserDocument['_id'];
  transaccion_id_wompi?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IServiceModel extends Model<IServiceDocument> {}

const ServiceSchema = new Schema<IServiceDocument, IServiceModel>({
  nombre: { type: String, required: true, trim: true },
  tipo: { type: String, required: true, enum: ['licencia', 'landing-page'] },
  estado: { type: String, default: 'pendiente', enum: ['activo', 'expirado', 'pendiente', 'cancelado'] },
  fecha_compra: { type: Date, default: Date.now },
  fecha_expiracion: { type: Date, required: true },
  precio: { type: Number, min: 0 },
  detalles: { type: String, trim: true },
  usuario: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  transaccion_id_wompi: { type: String },
}, { timestamps: true });

export const Service = mongoose.model<IServiceDocument, IServiceModel>('Service', ServiceSchema);
// NO export default aquí si quieres usar "import { Service } from ..."
