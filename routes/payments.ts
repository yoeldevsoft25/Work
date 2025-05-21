// backend/routes/payments.ts
import express, { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import crypto from 'crypto'; // Importar crypto de Node.js

// Manejo de errores para AxiosError import
// AxiosError ya no se exporta directamente en axios v1+, así que usa:
// import type { AxiosError } from 'axios';
// O simplemente usa 'any' si no necesitas tipado estricto
const Service: any = require('../models/Service');

const router = Router();

// Configuración desde variables de entorno
const WOMPI_API = process.env.WOMPI_API || 'https://sandbox.wompi.co/v1';
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY!; // Usar "!" si estás seguro que está en .env
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET!;
const FRONTEND_URL = process.env.FRONTEND_URL!;

// Interfaz para la respuesta de Wompi al crear transacción
interface WompiTransactionCreationData {
  id: string;
  redirect_url: string;
  // Agrega más campos si Wompi los devuelve aquí
}
interface WompiTransactionCreationResponse {
  data: WompiTransactionCreationData;
  meta?: any; // Si Wompi devuelve un objeto meta
}

// Interfaz para el cuerpo de la solicitud de creación de transacción
interface CreateTransactionRequestBody {
  amount: number;
  email: string;
  serviceId: string;
}

router.post('/create-transaction', async (req: Request<{}, {}, CreateTransactionRequestBody>, res: Response, next: NextFunction) => {
  try {
    const { amount, email, serviceId } = req.body;

    if (!amount || !email || !serviceId) {
      return res.status(400).json({ error: 'Datos incompletos: amount, email y serviceId son requeridos.' });
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'El monto debe ser un número positivo.' });
    }

    const serviceExists = await Service.findById(serviceId);
    if (!serviceExists) {
      return res.status(404).json({ error: 'Servicio no encontrado.' });
    }

    const transactionData = {
      amount_in_cents: Math.round(amount * 100), // Asegurar que sea entero
      currency: 'COP',
      customer_email: email,
      reference: `VTECH_${serviceId}_${Date.now()}`,
      payment_method: { type: 'CARD' }, // Ajusta si necesitas más métodos
      redirect_url: `${FRONTEND_URL}/dashboard/payment-result` // O la URL que prefieras
    };

    const response = await axios.post<WompiTransactionCreationResponse>(
      `${WOMPI_API}/transactions`,
      transactionData,
      {
        headers: {
          Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      checkout_url: response.data.data.redirect_url,
      transaction_id: response.data.data.id
    });

  } catch (error: any) {
    const axiosError = error as any;
    // Loguear el error completo de Wompi si existe
    if (axiosError.isAxiosError && axiosError.response) {
      console.error('Error Wompi Response:', axiosError.response.data);
    } else {
      console.error('Error creando transacción Wompi:', error);
    }
    next(error); // Pasa el error al manejador de errores global
  }
});

// Webhook para Wompi
// Importante: este middleware de express.raw DEBE ir antes de express.json() global si lo usas.
// O aplicarlo solo a esta ruta como aquí.
router.post('/wompi-webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['x-event-signature'] as string | undefined; // Wompi usa 'x-event-signature'
    const rawBody = req.body; // express.raw hace que req.body sea un Buffer

    if (!(rawBody instanceof Buffer)) {
        console.error('Webhook Wompi: El cuerpo no es un Buffer. ¿Está express.raw() configurado correctamente?');
        return res.status(400).send('Cuerpo de solicitud inválido.');
    }
    const bodyString = rawBody.toString();
    const event = JSON.parse(bodyString);

    // Validación de firma
    const computedSignature = crypto
      .createHmac('sha256', WOMPI_INTEGRITY_SECRET)
      .update(bodyString) // Usar el string del body
      .digest('hex');

    if (!signature || signature !== computedSignature) {
      console.warn('Webhook Wompi: Firma inválida o ausente.');
      return res.status(403).send('Firma inválida.');
    }

    if (event.event === 'transaction.updated' && event.data?.transaction?.status === 'APPROVED') {
      const transaction = event.data.transaction;
      const reference = transaction.reference;
      const [prefix, serviceId] = reference.split('_');

      if (prefix !== 'VTECH' || !serviceId) {
        console.warn(`Webhook Wompi: Referencia inválida: ${reference}`);
        return res.status(400).send('Referencia inválida.');
      }

      const updatedService = await Service.findByIdAndUpdate(
        serviceId,
        {
          estado: 'activo', // O el estado que corresponda
          // Guarda más datos si es necesario, ej: transaction_id, fecha_pago
          // fecha_pago: new Date(transaction.status_message.finalized_at), // Ajusta según Wompi
          // transaccion_id_wompi: transaction.id
        },
        { new: true, runValidators: true }
      );

      if (updatedService) {
        console.log(`Webhook Wompi: Servicio ${serviceId} actualizado a estado 'activo'.`);
      } else {
        console.warn(`Webhook Wompi: Servicio con ID ${serviceId} no encontrado para actualizar.`);
      }
    } else {
      console.log(`Webhook Wompi: Evento ${event.event} recibido, estado ${event.data?.transaction?.status}. No se requiere acción.`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error en webhook Wompi:', error);
    next(error);
  }
});

export default router;
