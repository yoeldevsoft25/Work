// backend/controllers/paymentController.js
const crypto = require('crypto');
const fetch = require('node-fetch'); // Asegúrate que esté en tu package.json y se instale (node-fetch@2)
const Service = require('../models/Service');
const User = require('../models/User');

const WOMPI_API_URL = process.env.WOMPI_API_URL || "https://sandbox.wompi.co/v1";
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY;
const DEFAULT_REDIRECT_URL = process.env.WOMPI_REDIRECT_URL || `${process.env.FRONTEND_URL || 'https://viotech.com.co'}/dashboard/payment-status`;

// (Función calculatePaymentReferenceSignature si la usas, omitida aquí por brevedad, pero asegúrate que esté)
// ... Si necesitas la función de firma, inclúyela aquí ...
const calculatePaymentReferenceSignature = (reference, amountInCents, currency, integrityKey) => {
  if (!reference || !amountInCents || !currency || !integrityKey) {
    console.error("calculatePaymentReferenceSignature: Faltan parámetros para la firma.");
    throw new Error("Faltan datos para generar la firma de pago.");
  }
  const stringToSign = `${reference}${amountInCents}${currency}${integrityKey}`;
  return crypto.createHash('sha256').update(stringToSign).digest('hex');
};


class PaymentController {
  static async createTransaction(req, res, next) {
    console.log("PAYMENT_CONTROLLER - INICIO createTransaction");
    
    if (!req.user || !req.user.email || !req.user._id) {
      console.error("PAYMENT_CONTROLLER - Error: req.user no definido o incompleto.");
      return res.status(401).json({ error: "Usuario no autenticado." });
    }

    const userEmail = req.user.email;
    const userId = req.user._id.toString();
    const { amount: amountFromRequest, serviceId: serviceCodeFromRequest } = req.body;

    console.log("PAYMENT_CONTROLLER - req.user:", { id: userId, email: userEmail });
    console.log("PAYMENT_CONTROLLER - req.body:", { amountFromRequest, serviceCodeFromRequest });

    if (!amountFromRequest || !serviceCodeFromRequest) {
      console.error("PAYMENT_CONTROLLER - Error: Faltan 'amount' o 'serviceId'.");
      return res.status(400).json({ error: "Faltan datos: monto o ID del servicio." });
    }
    if (isNaN(parseFloat(amountFromRequest)) || parseFloat(amountFromRequest) <= 0) {
        console.error("PAYMENT_CONTROLLER - Error: Monto inválido.", amountFromRequest);
        return res.status(400).json({ error: "Monto proporcionado inválido." });
    }
    if (!WOMPI_PUBLIC_KEY) {
        console.error("PAYMENT_CONTROLLER - CRITICAL: WOMPI_PUBLIC_KEY no configurada.");
        return res.status(500).json({ error: "Error de configuración del servidor (pagos)." });
    }

    try {
      const queryServiceCode = serviceCodeFromRequest.toUpperCase(); // Convertir a mayúsculas para la búsqueda
      console.log(`PAYMENT_CONTROLLER - Buscando servicio con serviceCode (query normalizada): "${queryServiceCode}"`);
      
      // --- BÚSQUEDA DEL SERVICIO ---
      const service = await Service.findOne({ serviceCode: queryServiceCode });

      if (!service) {
        console.error(`PAYMENT_CONTROLLER - Servicio NO encontrado con serviceCode normalizado: "${queryServiceCode}". Verifica que el código exista en la DB y esté en mayúsculas si 'uppercase:true' está en el schema.`);
        // Para depuración, podrías listar todos los serviceCodes de la DB:
        // const allServices = await Service.find({}, 'serviceCode');
        // console.log("PAYMENT_CONTROLLER - ServiceCodes existentes en DB:", allServices.map(s => s.serviceCode));
        return res.status(404).json({ error: `Servicio con código '${serviceCodeFromRequest}' no encontrado.` });
      }
      console.log(`PAYMENT_CONTROLLER - Servicio encontrado: ${service.nombre}, Precio DB: ${service.precio} ${service.moneda}, serviceCode DB: ${service.serviceCode}`);

      if (Number(amountFromRequest) !== service.precio) {
        console.warn(`PAYMENT_CONTROLLER - DISCREPANCIA DE PRECIO para serviceCode '${service.serviceCode}'. Frontend: ${amountFromRequest}, DB: ${service.precio}. Usando precio de DB.`);
        // No devolvemos error, pero usamos el precio de la DB para Wompi.
      }
      const amountInCents = service.precio * 100; 
      const currency = service.moneda || 'COP';

      console.log("PAYMENT_CONTROLLER - Obteniendo Acceptance Token de Wompi...");
      const acceptanceTokenResponse = await fetch(`${WOMPI_API_URL}/merchants/${WOMPI_PUBLIC_KEY}`);
      if (!acceptanceTokenResponse.ok) {
        const errorBody = await acceptanceTokenResponse.text();
        console.error(`PAYMENT_CONTROLLER - Error al obtener Acceptance Token (${acceptanceTokenResponse.status}):`, errorBody);
        throw new Error(`Wompi: No se pudo obtener token de aceptación. Status: ${acceptanceTokenResponse.status}`);
      }
      const acceptanceTokenData = await acceptanceTokenResponse.json();
      const acceptanceToken = acceptanceTokenData.data.presigned_acceptance.acceptance_token;
      console.log("PAYMENT_CONTROLLER - Acceptance Token obtenido.");

      const paymentReference = `VIO_${service.serviceCode}_${userId.slice(-6)}_${Date.now()}`;
      console.log("PAYMENT_CONTROLLER - Referencia de pago generada:", paymentReference);
      
      let signature = null;
      if (process.env.WOMPI_TRANSACTION_INTEGRITY_KEY) {
        signature = calculatePaymentReferenceSignature(
            paymentReference,
            amountInCents,
            currency,
            process.env.WOMPI_TRANSACTION_INTEGRITY_KEY 
        );
        console.log("PAYMENT_CONTROLLER - Firma de referencia de pago generada:", signature);
      }

      const transactionData = {
        acceptance_token: acceptanceToken,
        amount_in_cents: amountInCents,
        currency: currency,
        customer_email: userEmail,
        reference: paymentReference,
        redirect_url: `${DEFAULT_REDIRECT_URL}?ref=${paymentReference}`,
        customer_data: {
            phone_number: req.user.telefono || undefined,
            full_name: req.user.nombre || undefined
        },
        // payment_method: { type: "CARD" } // Opcional para forzar método
      };
      if (signature) {
        transactionData.signature = signature;
      }
      console.log("PAYMENT_CONTROLLER - Datos a enviar a Wompi:", JSON.stringify(transactionData, null, 2));

      const wompiTransactionResponse = await fetch(`${WOMPI_API_URL}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${WOMPI_PUBLIC_KEY}`
        },
        body: JSON.stringify(transactionData)
      });
      
      const wompiTransactionResult = await wompiTransactionResponse.json();
      console.log("PAYMENT_CONTROLLER - Respuesta de Wompi:", wompiTransactionResponse.status, JSON.stringify(wompiTransactionResult, null, 2));

      if (!wompiTransactionResponse.ok || wompiTransactionResult.status === 'ERROR' || !wompiTransactionResult.data || !wompiTransactionResult.data.id) {
        console.error(`PAYMENT_CONTROLLER - Error al crear transacción en Wompi.`, wompiTransactionResult);
        const wompiError = wompiTransactionResult.error?.messages?.join(', ') || wompiTransactionResult.error?.reason || wompiTransactionResult.reason || 'Error desconocido de Wompi.';
        throw new Error(`Wompi: ${wompiError}`);
      }
      
      let checkoutUrlForFrontend;
      // Buscar la URL de redirección en la respuesta de Wompi
      if (wompiTransactionResult.data.payment_method_type === 'NEQUI' || 
          wompiTransactionResult.data.payment_method_type === 'PSE' || 
          (wompiTransactionResult.data.next_action && wompiTransactionResult.data.next_action.type === 'REDIRECT_TO_URL')) {
          
          checkoutUrlForFrontend = wompiTransactionResult.data.next_action?.data?.url || wompiTransactionResult.data.payment_link_url; // Ajustar según la respuesta real
      } else if (wompiTransactionResult.data.status === 'PENDING' && wompiTransactionResult.data.id) {
          // Para pagos con tarjeta, Wompi puede devolver PENDING y el ID para el widget.
          // Si tu frontend usa el widget, esto es lo que necesitarías.
          // Si esperabas una URL para redirigir y no la hay, es un problema de flujo.
          // Por ahora, si no hay URL explícita, devolvemos el ID para posible uso con widget.
          console.log("PAYMENT_CONTROLLER - Wompi devolvió ID de transacción, pero no URL de checkout explícita. Frontend podría necesitar usar Widget.");
          res.status(200).json({
              message: "Transacción creada, posible uso de widget requerido.",
              transaction_id: wompiTransactionResult.data.id,
              status: wompiTransactionResult.data.status
          });
          return;
      }

      if (!checkoutUrlForFrontend) {
          console.error("PAYMENT_CONTROLLER - No se pudo determinar la URL de checkout de Wompi a partir de la respuesta:", wompiTransactionResult.data);
          throw new Error("Wompi no proporcionó una URL de pago válida en la respuesta.");
      }
        
      console.log("PAYMENT_CONTROLLER - Enviando URL de checkout al frontend:", checkoutUrlForFrontend);
      res.status(200).json({
        message: "Transacción creada. Redirigiendo a Wompi.",
        checkout_url: checkoutUrlForFrontend,
        transaction_id: wompiTransactionResult.data.id,
        status: wompiTransactionResult.data.status
      });

    } catch (error) {
      console.error("PAYMENT_CONTROLLER - Catch Error FINAL en createTransaction:", error.message, error.stack);
      // El manejador de errores global en index.js se encargará de la respuesta 500
      next(error); 
    }
  }

  // --- MÉTODO PARA MANEJAR WEBHOOKS DE WOMPI ---
  // (Código del webhook omitido por brevedad, pero asegúrate que esté como en la respuesta anterior)
  static async handleWebhook(req, res, next) {
    console.log("PAYMENT_CONTROLLER - INICIO handleWebhook");
    const wompiEventSignatureHeader = req.headers['x-wompi-signature']; // Header de Wompi
    const rawBody = req.body; // Debe ser Buffer si usas express.raw()

    if (!wompiEventSignatureHeader || !rawBody) {
      console.warn("WEBHOOK - Petición inválida: Falta firma o cuerpo.");
      return res.status(400).json({ error: "Petición de webhook inválida." });
    }
    if (!process.env.WOMPI_EVENTS_INTEGRITY_SECRET) {
        console.error("WEBHOOK - CRITICAL: WOMPI_EVENTS_INTEGRITY_SECRET no configurado.");
        return res.status(500).json({ error: "Error de configuración del servidor (webhooks)." });
    }

    try {
      const signatureDetails = JSON.parse(wompiEventSignatureHeader); // { "signature": "checksum", "timestamp": timestamp_ms }
      const receivedSignature = signatureDetails.signature;
      const receivedTimestamp = signatureDetails.timestamp;
      const eventBodyString = rawBody.toString('utf-8');
      
      const stringToSign = `${eventBodyString}${receivedTimestamp}${process.env.WOMPI_EVENTS_INTEGRITY_SECRET}`;
      const calculatedSignature = crypto.createHash('sha256').update(stringToSign).digest('hex');
      
      console.log("WEBHOOK - Event Body (inicio):", eventBodyString.substring(0, 200) + "...");
      console.log("WEBHOOK - Received Timestamp:", receivedTimestamp);
      console.log("WEBHOOK - Received Signature:", receivedSignature);
      console.log("WEBHOOK - Calculated Signature:", calculatedSignature);

      if (calculatedSignature !== receivedSignature) {
        console.warn("WEBHOOK - ¡FIRMA INVÁLIDA!");
        return res.status(403).json({ error: "Firma de webhook inválida." });
      }
      console.log("WEBHOOK - Firma verificada.");

      const eventData = JSON.parse(eventBodyString);
      console.log("WEBHOOK - Evento Wompi verificado:", JSON.stringify(eventData.event, null, 2)); // Loguear el tipo de evento

      const transaction = eventData.data.transaction;
      console.log(`WEBHOOK - Transacción ID: ${transaction.id}, Estado: ${transaction.status}, Ref: ${transaction.reference}`);

      // Aquí tu lógica para actualizar la base de datos (órdenes, servicios de usuario, etc.)
      // Ejemplo:
      // if (transaction.status === 'APPROVED') {
      //    await activateServiceForUser(transaction.reference, transaction.id);
      // }
      
      res.status(200).json({ message: "Webhook recibido." });

    } catch (error) {
      console.error("WEBHOOK - Error procesando webhook:", error.message, error.stack);
      res.status(500).json({ error: "Error interno procesando webhook." });
    }
  }
}

module.exports = PaymentController;
