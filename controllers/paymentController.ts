// backend/controllers/paymentController.ts
import { Request, Response, NextFunction } from 'express';
import axios from 'axios'; // Solo se importa axios
// No se importa AxiosError directamente
import crypto from 'crypto';
import { Service } from '../models/Service'; // Asume que Service.ts exporta 'Service'

// --- Interfaces (mantenemos las que ya tenías) ---
interface WompiTransactionDetails {
  id: string; status: string; reference: string; amount_in_cents: number;
  currency: string; customer_email: string; redirect_url: string;
  finalized_at?: string;
}
interface WompiCreateTransactionResponse { data: WompiTransactionDetails; meta?: any; }
interface CreateTransactionRequestBody { amount: number; email: string; serviceId: string; }
interface ControllerSuccessResponse { checkout_url: string; transaction_id: string; }
interface ErrorResponse { error: string; details?: string | string[] | Record<string, any>; }

class PaymentController {
  static async createTransaction(
    req: Request<{}, {}, CreateTransactionRequestBody>, // req está aquí
    res: Response<ControllerSuccessResponse | ErrorResponse>, // res está aquí
    next: NextFunction // next está aquí
  ) {
    try {
      const { amount, email, serviceId } = req.body;

      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'El monto debe ser un número positivo.' });
      }
      if (!email || typeof email !== 'string' || !/\S+@\S+\.\S+/.test(email)) { // Simple email validation
        return res.status(400).json({ error: 'Por favor, provea un email válido.' });
      }
      if (!serviceId || typeof serviceId !== 'string') {
        return res.status(400).json({ error: 'ID de servicio inválido.' });
      }

      const serviceDoc = await Service.findById(serviceId); // serviceDoc para evitar conflicto con Service (modelo)
      if (!serviceDoc) {
        return res.status(404).json({ error: 'Servicio no encontrado.' });
      }

      const wompiApiKey = process.env.WOMPI_API || 'https://sandbox.wompi.co/v1';
      const wompiPrivateKey = process.env.WOMPI_PRIVATE_KEY;
      const frontendRedirectUrlBase = process.env.FRONTEND_URL;

      if (!wompiPrivateKey || !frontendRedirectUrlBase) {
          console.error("CRITICAL: WOMPI_PRIVATE_KEY o FRONTEND_URL no están definidos.");
          // Lanzar un error para que sea capturado por el catch y pasado a next()
          throw new Error("Error de configuración del servidor para pagos. Contacte al administrador.");
      }
      
      const transactionData = {
        amount_in_cents: Math.round(amount * 100), currency: 'COP', customer_email: email,
        reference: `VTECH_${serviceId}_${Date.now()}`, payment_method: { type: 'CARD' },
        redirect_url: `${frontendRedirectUrlBase}/dashboard/payment-result`
      };

      const wompiResponse = await axios.post<WompiCreateTransactionResponse>(
        `${wompiApiKey}/transactions`, transactionData,
        { headers: { Authorization: `Bearer ${wompiPrivateKey}`, 'Content-Type': 'application/json' } }
      );

      if (!wompiResponse.data?.data?.redirect_url || !wompiResponse.data?.data?.id) {
          console.error('Respuesta de Wompi inesperada:', wompiResponse.data);
          throw new Error('Información de checkout de Wompi incompleta.');
      }

      res.json({ // Esto usa el 'res' definido en los parámetros
        checkout_url: wompiResponse.data.data.redirect_url,
        transaction_id: wompiResponse.data.data.id
      });

    } catch (error: unknown) { // Tipar error como unknown inicialmente
      if (axios.isAxiosError(error)) { // Type guard de Axios
        console.error('Error desde API Wompi:', error.code, error.response?.status, JSON.stringify(error.response?.data, null, 2));
        
        const wompiErrorData = error.response?.data as any; 
        let details = 'Error al comunicarse con la pasarela de pago.';

        if (wompiErrorData && typeof wompiErrorData === 'object') {
            if (wompiErrorData.error?.messages && Array.isArray(wompiErrorData.error.messages)) {
                details = wompiErrorData.error.messages.join('; ');
            } else if (wompiErrorData.error?.message && typeof wompiErrorData.error.message === 'string') {
                details = wompiErrorData.error.message;
            } else if (wompiErrorData.message && typeof wompiErrorData.message === 'string') {
                details = wompiErrorData.message;
            } else if (typeof wompiErrorData.error === 'string') {
                details = wompiErrorData.error;
            } else if (typeof wompiErrorData === 'string') {
                details = wompiErrorData;
            }
        }
        
        // Esto usa el 'res' definido en los parámetros
        return res.status(error.response?.status || 500).json({ 
            error: 'Error al procesar el pago con Wompi.',
            details: process.env.NODE_ENV === 'development' ? details : 'Por favor, intente más tarde.'
        });
      } else if (error instanceof Error) { // Para errores estándar de JavaScript
        console.error('Error de JavaScript en createTransaction:', error.message);
        next(error); // Esto usa el 'next' definido en los parámetros
      } else {
        // Para otros tipos de errores (strings, etc.)
        console.error('Error desconocido en createTransaction:', error);
        next(new Error('Ocurrió un error desconocido procesando el pago.')); // Usa 'next'
      }
    }
  }

  static async handleWebhook(
    req: Request, // req está aquí
    res: Response, // res está aquí
    next: NextFunction // next está aquí
  ) {
    try {
      const signature = req.headers['x-event-signature'] as string | undefined || req.headers['X-Event-Signature'] as string | undefined;
      const rawBody = req.body;

      if (!(rawBody instanceof Buffer)) {
        console.error('Webhook Wompi: Cuerpo no es Buffer. Verificar middleware express.raw() en la ruta.');
        return res.status(400).send('Cuerpo de solicitud incorrecto.'); // Usa 'res'
      }
      const bodyString = rawBody.toString('utf8');
      let event;
      try {
          event = JSON.parse(bodyString);
      } catch (parseError) {
          console.error("Webhook Wompi: Error al parsear JSON del body:", parseError);
          return res.status(400).send("Cuerpo JSON malformado."); // Usa 'res'
      }
      
      const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
      if (!integritySecret) {
          console.error("CRITICAL: WOMPI_INTEGRITY_SECRET no está definido en .env para el webhook.");
          return res.status(500).send('Error de configuración del servidor.'); // Usa 'res'
      }

      const computedSignature = crypto.createHmac('sha256', integritySecret).update(bodyString).digest('hex');

      if (!signature || signature !== computedSignature) {
          console.warn(`Webhook Wompi: Firma inválida. Recibida: ${signature}, Calculada: ${computedSignature}.`);
          return res.status(403).send('Firma inválida.'); // Usa 'res'
      }

      if (event.event === 'transaction.updated' && event.data?.transaction?.status === 'APPROVED') {
        const transaction = event.data.transaction;
        const reference = transaction.reference;
        const wompiTransactionId = transaction.id;

        if (typeof reference !== 'string') {
            console.warn(`Webhook Wompi: Referencia no es un string o está ausente.`);
            return res.status(400).send('Referencia de transacción inválida.'); // Usa 'res'
        }

        const [prefix, serviceId] = reference.split('_');

        if (prefix !== 'VTECH' || !serviceId) {
          console.warn(`Webhook Wompi: Referencia inválida o mal formada: ${reference}`);
          return res.status(400).send('Referencia inválida.'); // Usa 'res'
        }

        await Service.findByIdAndUpdate(serviceId, {
            estado: 'activo', 
            fecha_pago: transaction.finalized_at ? new Date(transaction.finalized_at) : new Date(),
            transaccion_id_wompi: wompiTransactionId
          }, { new: true, runValidators: true }
        );
        console.log(`Webhook: Servicio ${serviceId} actualizado.`);
      } else {
        console.log(`Webhook Wompi: Evento '${event.event}' recibido con estado '${event.data?.transaction?.status}'. No se procesa.`);
      }
      res.status(200).send('OK'); // Usa 'res'
    } catch (error) {
      console.error('Error crítico en webhook Wompi:', error);
      // Aquí podrías considerar llamar a next(error) si tienes un manejador de errores global que
      // sepa cómo responder a Wompi, o manejarlo como está para asegurar que Wompi no reintente indefinidamente.
      // Por ahora, mantenemos la respuesta directa.
      res.status(500).send('Error interno procesando webhook.'); // Usa 'res'
    }
  }
}

export default PaymentController;
