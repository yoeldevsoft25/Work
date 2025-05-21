// backend/controllers/paymentController.js
const crypto = require('crypto');
// const fetch = require('node-fetch'); // No necesitamos fetch para este flujo de Web Checkout
const Service = require('../models/Service');
// const User = require('../models/User'); // Solo si necesitas más datos del usuario para Wompi

// --- Constantes de Wompi (obtenidas de variables de entorno) ---
const WOMPI_CHECKOUT_BASE_URL = process.env.WOMPI_CHECKOUT_URL || "https://checkout.wompi.co/p/"; // URL para Web Checkout (Sandbox)
// Si estás en producción, cambia a la URL de producción de Wompi: https://checkout.wompi.co/p/
// Puedes poner esto en una variable de entorno también: WOMPI_CHECKOUT_URL

const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY;
const WOMPI_TRANSACTION_INTEGRITY_SECRET = process.env.WOMPI_TRANSACTION_INTEGRITY_SECRET;
const DEFAULT_REDIRECT_URL = process.env.WOMPI_REDIRECT_URL || `${process.env.FRONTEND_URL || 'http://localhost:4321'}/payment-result`; // Página de resultado en tu frontend

class PaymentController {
  static async createTransaction(req, res, next) {
    console.log("PAYMENT_CONTROLLER (Web Checkout) - INICIO createTransaction");
    
    if (!req.user || !req.user.email || !req.user._id) {
      console.error("PAYMENT_CONTROLLER - Error: req.user no definido o incompleto.");
      return res.status(401).json({ error: "Usuario no autenticado." });
    }

    const userEmail = req.user.email;
    const userId = req.user._id.toString();
    const { amount: amountFromRequest, serviceId: serviceCodeFromRequest } = req.body;

    console.log("PAYMENT_CONTROLLER - req.user:", { id: userId, email: userEmail, nombre: req.user.nombre });
    console.log("PAYMENT_CONTROLLER - req.body:", { amountFromRequest, serviceCodeFromRequest });

    if (!amountFromRequest || !serviceCodeFromRequest) {
      console.error("PAYMENT_CONTROLLER - Error: Faltan 'amount' o 'serviceId'.");
      return res.status(400).json({ error: "Faltan datos: monto o ID del servicio." });
    }
    if (isNaN(parseFloat(amountFromRequest)) || parseFloat(amountFromRequest) <= 0) {
        console.error("PAYMENT_CONTROLLER - Error: Monto inválido.", amountFromRequest);
        return res.status(400).json({ error: "Monto proporcionado inválido." });
    }
    if (!WOMPI_PUBLIC_KEY || !WOMPI_TRANSACTION_INTEGRITY_SECRET) {
        console.error("PAYMENT_CONTROLLER - CRITICAL: WOMPI_PUBLIC_KEY o WOMPI_TRANSACTION_INTEGRITY_SECRET no configuradas.");
        return next(new Error("Error de configuración del servidor (pagos).")); // Pasa al manejador de errores
    }

    try {
      const queryServiceCode = serviceCodeFromRequest.toUpperCase();
      console.log(`PAYMENT_CONTROLLER - Buscando servicio con serviceCode (query normalizada): "${queryServiceCode}"`);
      const service = await Service.findOne({ serviceCode: queryServiceCode });

      if (!service) {
        console.error(`PAYMENT_CONTROLLER - Servicio NO encontrado con serviceCode: "${queryServiceCode}".`);
        return res.status(404).json({ error: `Servicio con código '${serviceCodeFromRequest}' no encontrado.` });
      }
      console.log(`PAYMENT_CONTROLLER - Servicio encontrado: ${service.nombre}, Precio DB: ${service.precio} ${service.moneda}`);

      // Verificar precio (opcional pero recomendado)
      if (Number(amountFromRequest) !== service.precio) {
        console.warn(`PAYMENT_CONTROLLER - Discrepancia de precio para '${service.serviceCode}'. Frontend: ${amountFromRequest}, DB: ${service.precio}. Usando precio de DB.`);
      }
      
      const amountInCents = service.precio * 100; // Wompi espera el monto en centavos
      const currency = service.moneda || 'COP';

      // Generar referencia única de pago
      const paymentReference = `VIO_${service.serviceCode}_${userId.slice(-6)}_${Date.now()}`;
      console.log("PAYMENT_CONTROLLER - Referencia de pago generada:", paymentReference);

      // Generar la firma de integridad
      // Concatenación: "<Referencia><MontoEnCentavos><Moneda><SecretoIntegridad>"
      const stringToSign = `${paymentReference}${amountInCents}${currency}${WOMPI_TRANSACTION_INTEGRITY_SECRET}`;
      const signatureIntegrity = crypto.createHash('sha256').update(stringToSign).digest('hex');
      console.log("PAYMENT_CONTROLLER - Cadena para firmar:", stringToSign);
      console.log("PAYMENT_CONTROLLER - Firma de Integridad generada:", signatureIntegrity);

      // Preparar los parámetros para la URL del Web Checkout de Wompi
      const wompiCheckoutParams = new URLSearchParams({
        'public-key': WOMPI_PUBLIC_KEY,
        'currency': currency,
        'amount-in-cents': amountInCents.toString(),
        'reference': paymentReference,
        'signature:integrity': signatureIntegrity,
        'redirect-url': `${DEFAULT_REDIRECT_URL}?ref=${paymentReference}`, // Tu URL de redirección
        // --- Parámetros Opcionales (pero recomendados) ---
        'customer-data:email': userEmail,
        'customer-data:full-name': req.user.nombre,
        // 'customer-data:phone-number': req.user.telefono, // Si tienes el teléfono
        // 'customer-data:phone-number-prefix': '+57',    // Si tienes el teléfono
        // 'expiration-time': new Date(Date.now() + 30 * 60 * 1000).toISOString(), // Expira en 30 minutos
      });

      // Construir la URL completa del Web Checkout de Wompi
      const wompiWebCheckoutUrl = `${WOMPI_CHECKOUT_BASE_URL}?${wompiCheckoutParams.toString()}`;
      console.log("PAYMENT_CONTROLLER - URL de Web Checkout construida para frontend:", wompiWebCheckoutUrl);

      // Enviar esta URL al frontend
      res.status(200).json({
        message: "URL de Web Checkout lista. Redirigiendo...",
        checkout_url: wompiWebCheckoutUrl, // El frontend usará esto para redirigir
        reference: paymentReference // Opcional: enviar la referencia de vuelta si el frontend la necesita
      });

    } catch (error) {
      console.error("PAYMENT_CONTROLLER - Catch Error FINAL en createTransaction:", error.message, error.stack);
      next(error); 
    }
  }

  // --- MÉTODO PARA MANEJAR WEBHOOKS DE WOMPI ---
  static async handleWebhook(req, res, next) {
    console.log("PAYMENT_CONTROLLER - INICIO handleWebhook");
    const wompiEventSignatureHeader = req.headers['x-wompi-signature'];
    const rawBody = req.body; // Asume que usas express.raw() en la ruta

    if (!wompiEventSignatureHeader || !rawBody) { /* ... manejo de error ... */ }
    if (!process.env.WOMPI_EVENTS_INTEGRITY_SECRET) { /* ... manejo de error ... */ }

    try {
      const signatureDetails = JSON.parse(wompiEventSignatureHeader);
      const receivedSignature = signatureDetails.signature;
      const receivedTimestamp = signatureDetails.timestamp;
      const eventBodyString = rawBody.toString('utf-8');
      
      // Concatenación: "<cadena_de_eventos><timestamp_en_ms><secreto_de_integridad_de_eventos>"
      const stringToSignWebhook = `${eventBodyString}${receivedTimestamp}${process.env.WOMPI_EVENTS_INTEGRITY_SECRET}`;
      const calculatedSignature = crypto.createHash('sha256').update(stringToSignWebhook).digest('hex');
      
      // ... (logs de depuración para firmas) ...

      if (calculatedSignature !== receivedSignature) {
        console.warn("WEBHOOK - ¡FIRMA INVÁLIDA!");
        return res.status(403).json({ error: "Firma de webhook inválida." });
      }
      console.log("WEBHOOK - Firma verificada.");

      const eventData = JSON.parse(eventBodyString);
      // ... (procesar evento, actualizar DB) ...
      // Ejemplo:
      // const transaction = eventData.data.transaction;
      // console.log(`WEBHOOK - Transacción ID: ${transaction.id}, Estado: ${transaction.status}, Ref: ${transaction.reference}`);
      // if (transaction.status === 'APPROVED') {
      //   console.log(`WEBHOOK - Transacción APROBADA: ${transaction.id}. Implementa tu lógica de activación de servicio.`);
      //   // await activateServiceForUser(transaction.reference, transaction.id);
      // }

      res.status(200).json({ message: "Webhook recibido." });

    } catch (error) { /* ... manejo de error ... */ }
  }
}

module.exports = PaymentController;
