// backend/controllers/paymentController.js
const axios = require('axios');
const Service = require('../models/Service'); // Asegúrate que la ruta sea correcta
const crypto = require('crypto'); // Para el webhook

class PaymentController {
  static async createTransaction(req, res, next) {
    console.log("PAYMENT_CONTROLLER - INICIO createTransaction");
    // ---- VERIFICACIÓN CRUCIAL DE req.user y req.body ----
    console.log("PAYMENT_CONTROLLER - req.user:", req.user ? JSON.stringify(req.user, null, 2) : "req.user NO DEFINIDO");
    console.log("PAYMENT_CONTROLLER - req.body:", JSON.stringify(req.body, null, 2));
    // ---- FIN VERIFICACIÓN ----
    
    try {
      // El email se obtiene de req.user, no de req.body
      const { amount, serviceId } = req.body;

      // ---- VALIDACIÓN DE req.user y req.user.email ----
      if (!req.user || typeof req.user !== 'object') {
        console.error("PAYMENT_CONTROLLER - Error crítico: req.user no es un objeto o no está definido. ¿authMiddleware funcionó?");
        return res.status(401).json({ error: "Usuario no autenticado o información de usuario no disponible." });
      }
      if (!req.user.email || typeof req.user.email !== 'string' || !/\S+@\S+\.\S+/.test(req.user.email)) {
        console.error(`PAYMENT_CONTROLLER - Error crítico: Email inválido en req.user. Email recibido: "${req.user.email}"`);
        // Nota: Si el email en req.user (que viene de tu DB) es inválido, tienes un problema de datos en tu DB.
        // Por ahora, para Wompi, necesitamos un email válido.
        return res.status(500).json({ error: "Error interno: Email de usuario inválido o no disponible." });
      }
      // ---- FIN VALIDACIÓN ----

      const userEmail = req.user.email;
      const userId = req.user._id; // Asumiendo que tu authMiddleware también añade _id

      console.log(`PAYMENT_CONTROLLER - Usando Email (de req.user): "${userEmail}"`);
      console.log(`PAYMENT_CONTROLLER - Usando User ID (de req.user): "${userId}"`);

      // Validaciones básicas para amount y serviceId
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        console.warn("PAYMENT_CONTROLLER - Validación fallida: Monto inválido.", { amount });
        return res.status(400).json({ error: 'Monto inválido.' });
      }
      if (!serviceId || typeof serviceId !== 'string') {
        console.warn("PAYMENT_CONTROLLER - Validación fallida: ID de servicio inválido.", { serviceId });
        return res.status(400).json({ error: 'ID de servicio inválido.' });
      }

      const serviceDoc = await Service.findById(serviceId);
      if (!serviceDoc) {
        console.warn("PAYMENT_CONTROLLER - Servicio no encontrado con ID:", serviceId);
        return res.status(404).json({ error: 'Servicio no encontrado.' });
      }
      // Podrías añadir validación serviceDoc.price === amount aquí si es necesario

      const wompiApiUrl = process.env.WOMPI_API_URL;
      const wompiPrivateKey = process.env.WOMPI_PRIVATE_KEY;
      const wompiRedirectUrl = process.env.WOMPI_REDIRECT_URL;

      if (!wompiApiUrl || !wompiPrivateKey || !wompiRedirectUrl) {
        console.error('PAYMENT_CONTROLLER - Error Config Wompi: Faltan variables de entorno WOMPI_API_URL, WOMPI_PRIVATE_KEY o WOMPI_REDIRECT_URL');
        return res.status(500).json({ error: 'Error de configuración del servidor para pagos.' });
      }

      const transactionData = {
        amount_in_cents: Math.round(amount * 100),
        currency: 'COP',
        customer_email: userEmail, // Usando el email del usuario autenticado
        reference: `VTECH_USR_${userId}_SVC_${serviceId}_${Date.now()}`, // Referencia más descriptiva
        redirect_url: wompiRedirectUrl,
        // payment_method: { type: 'CARD' }, // Opcional
      };

      console.log("PAYMENT_CONTROLLER - Enviando a Wompi:", JSON.stringify(transactionData, null, 2));

      const wompiResponse = await axios.post(
        `${wompiApiUrl}/transactions`,
        transactionData,
        { headers: { Authorization: `Bearer ${wompiPrivateKey}`, 'Content-Type': 'application/json' } }
      );

      console.log("PAYMENT_CONTROLLER - Respuesta de Wompi:", JSON.stringify(wompiResponse.data, null, 2));

      if (!wompiResponse.data?.data?.redirect_url || !wompiResponse.data?.data?.id) {
        console.error('PAYMENT_CONTROLLER - Respuesta de Wompi inesperada o incompleta:', wompiResponse.data);
        return res.status(502).json({ error: 'Respuesta inválida de la pasarela de pagos.', details: wompiResponse.data });
      }

      res.status(201).json({
        checkout_url: wompiResponse.data.data.redirect_url,
        transaction_id: wompiResponse.data.data.id,
      });

    } catch (error) {
      console.error("PAYMENT_CONTROLLER - Catch Error en createTransaction:", error);
      if (error.isAxiosError) {
        const axiosError = error; // Para mejor tipado si usaras TS
        console.error('PAYMENT_CONTROLLER - Error de Axios al llamar a Wompi:', axiosError.code);
        console.error('PAYMENT_CONTROLLER - Status Wompi:', axiosError.response?.status);
        console.error('PAYMENT_CONTROLLER - Data Wompi Error:', JSON.stringify(axiosError.response?.data, null, 2));
        
        const wompiErrorData = axiosError.response?.data;
        let details = 'Error al comunicarse con la pasarela de pago.';
        if (wompiErrorData && typeof wompiErrorData === 'object') {
            if (wompiErrorData.error?.messages && Array.isArray(wompiErrorData.error.messages)) {
                details = wompiErrorData.error.messages.join('; ');
            } else if (wompiErrorData.error?.message) {
                details = wompiErrorData.error.message;
            } else if (wompiErrorData.message) {
                details = wompiErrorData.message;
            }
        }
        return res.status(axiosError.response?.status || 500).json({
          error: 'Error al procesar el pago con Wompi.',
          details: process.env.NODE_ENV === 'development' ? details : 'Intente más tarde.',
        });
      }
      // Para otros errores no Axios
      if (next && typeof next === 'function') {
        return next(error); // Pasa a un manejador de errores global si lo tienes
      }
      return res.status(500).json({ error: 'Error interno del servidor al procesar el pago.', details: error.message });
    }
  }

  // --- MÉTODO WEBHOOK (sin cambios respecto a la versión anterior) ---
  static async handleWebhook(req, res, next) {
    try {
      const signature = req.headers['x-event-signature'] || req.headers['X-Event-Signature'];
      const rawBody = req.body; 

      if (!(rawBody instanceof Buffer)) {
        console.error('Webhook Wompi: El cuerpo no es un Buffer. Middleware express.raw() aplicado?');
        return res.status(400).send('Cuerpo de solicitud incorrecto.');
      }
      const bodyString = rawBody.toString('utf8');
      let event;
      try {
        event = JSON.parse(bodyString);
      } catch (parseError) {
        console.error("Webhook Wompi: Error al parsear JSON:", parseError);
        return res.status(400).send("Cuerpo JSON malformado.");
      }
      
      const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
      if (!integritySecret) {
        console.error("CRITICAL: WOMPI_INTEGRITY_SECRET no definido en .env para webhook.");
        return res.status(500).send('Error de configuración del servidor.');
      }

      const computedSignature = crypto.createHmac('sha256', integritySecret)
                                    .update(bodyString)
                                    .digest('hex');

      if (!signature || signature !== computedSignature) {
        console.warn(`Webhook Wompi: Firma inválida. Recibida: ${signature}, Calculada: ${computedSignature}`);
        return res.status(403).send('Firma inválida.');
      }

      console.log("Webhook Wompi Recibido y Verificado:", JSON.stringify(event.event, null, 2), "Status:", event.data?.transaction?.status);

      if (event.event === 'transaction.updated' && event.data?.transaction?.status === 'APPROVED') {
        const transaction = event.data.transaction;
        const reference = transaction.reference; // Ej: VTECH_USR_userId_SVC_serviceId_timestamp
        const wompiTransactionId = transaction.id;

        if (typeof reference !== 'string') {
            console.warn(`Webhook Wompi: Referencia inválida o ausente. Evento:`, transaction);
            return res.status(400).send('Referencia de transacción inválida.');
        }
        
        // Extraer serviceId de la referencia. Ajusta esto según cómo construyas tu referencia.
        // Asumiendo referencia: VTECH_USR_userId_SVC_serviceId_timestamp
        const parts = reference.split('_');
        const serviceId = parts.length >= 5 ? parts[3] : null; // Obtener el serviceId si la referencia tiene el formato esperado

        if (!serviceId) {
          console.warn(`Webhook Wompi: No se pudo extraer serviceId de la referencia: ${reference}`);
          // Decide si esto es un error fatal o si simplemente no puedes procesar este evento.
          // Si no puedes procesarlo pero no quieres que Wompi reintente, envía 200 OK.
          return res.status(200).send('OK - Referencia no procesable.');
        }

        const updatedService = await Service.findByIdAndUpdate(serviceId, {
            estado: 'activo', 
            fecha_pago: transaction.finalized_at ? new Date(transaction.finalized_at) : new Date(),
            transaccion_id_wompi: wompiTransactionId
          }, { new: true, runValidators: true }
        );

        if (updatedService) {
            console.log(`Webhook Wompi: Servicio ${serviceId} actualizado a 'activo'. Wompi ID: ${wompiTransactionId}`);
        } else {
            console.warn(`Webhook Wompi: Servicio ${serviceId} (de ref ${reference}) no encontrado para actualizar.`);
        }
      } else {
        console.log(`Webhook Wompi: Evento '${event.event}' estado '${event.data?.transaction?.status}'. No se requiere acción de actualización.`);
      }
      res.status(200).send('OK');
    } catch (error) {
      console.error('Error crítico en webhook Wompi (JS):', error);
      // Para errores que quieres que Wompi reintente, envía un status 5xx.
      // Si es un error de datos malformados o algo que no se resolverá con un reintento, envía 200 OK
      // para evitar reintentos innecesarios.
      res.status(500).send('Error interno procesando webhook.');
    }
  }
}

module.exports = PaymentController;
