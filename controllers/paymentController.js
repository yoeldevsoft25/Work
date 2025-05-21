const crypto = require('crypto');
const Service = require('../models/Service');

// Variables de entorno (DEFINE ESTAS EN RENDER o tu .env)
const WOMPI_CHECKOUT_URL = process.env.WOMPI_CHECKOUT_URL || "https://checkout.wompi.co/p/";
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY;
const WOMPI_TRANSACTION_INTEGRITY_SECRET = process.env.WOMPI_TRANSACTION_INTEGRITY_SECRET;
const DEFAULT_REDIRECT_URL = process.env.WOMPI_REDIRECT_URL;

class PaymentController {
  static async createTransaction(req, res, next) {
    console.log("PAYMENT_CONTROLLER - INICIO createTransaction");
    if (!req.user?.email || !req.user?._id) {
      return res.status(401).json({ error: "Usuario no autenticado." });
    }

    const { amount: amountFromRequest, serviceId: serviceCodeFromRequest } = req.body;
    console.log("Datos recibidos:", { serviceCodeFromRequest, amountFromRequest });

    if (!serviceCodeFromRequest) {
      return res.status(400).json({ error: "Falta serviceId en la solicitud." });
    }

    try {
      // Busca el servicio EXACTAMENTE como llega del frontend
      const service = await Service.findOne({ serviceCode: serviceCodeFromRequest });
      if (!service) {
        console.error("Error: Servicio no encontrado. Códigos existentes:", 
          (await Service.find({}, "serviceCode")).map(s => s.serviceCode)
        );
        return res.status(404).json({ error: `Servicio '${serviceCodeFromRequest}' no encontrado.` });
      }

      // CORRECTO: calcula el monto en centavos como entero sin punto ni coma
      const precioPesos = Number(service.precio); // Asegura que es número
      if (isNaN(precioPesos)) {
        return res.status(500).json({ error: "Precio del servicio inválido en base de datos." });
      }
      const amountInCents = Math.round(precioPesos * 100); // SIEMPRE entero en centavos

      // Verifica que el amountInCents es un número y no tiene formato erróneo
      console.log('Amount-in-cents que se mandará a Wompi:', amountInCents, typeof amountInCents);

      const currency = (service.moneda || 'COP').toUpperCase();
      const paymentReference = `VIO_${service.serviceCode}_${Date.now()}`;

      // Calcula la firma de integridad correctamente
      const toSign = `${paymentReference}${amountInCents}${currency}${WOMPI_TRANSACTION_INTEGRITY_SECRET}`;
      const signature = crypto.createHash('sha256').update(toSign).digest('hex');

      // Construye la URL para Web Checkout de Wompi
      const wompiCheckoutParams = new URLSearchParams({
        'public-key': WOMPI_PUBLIC_KEY,
        'currency': currency,
        'amount-in-cents': amountInCents.toString(),
        'reference': paymentReference,
        'signature:integrity': signature,
        'redirect-url': `${DEFAULT_REDIRECT_URL}?ref=${paymentReference}`,
        'customer-data:email': req.user.email,
        'customer-data:full-name': req.user.nombre
      });

      const checkoutUrl = `${WOMPI_CHECKOUT_URL}?${wompiCheckoutParams.toString()}`;
      console.log("URL generada para Wompi:", checkoutUrl);

      return res.status(200).json({ checkout_url: checkoutUrl });

    } catch (error) {
      console.error("Error en createTransaction:", error);
      next(error);
    }
  }

  static async handleWebhook(req, res, next) {
    console.log("PAYMENT_CONTROLLER - INICIO handleWebhook");
    const wompiEventSignatureHeader = req.headers['x-wompi-signature'];
    const rawBody = req.body; 

    if (!wompiEventSignatureHeader || !rawBody) {
      return res.status(400).json({ error: "Petición de webhook inválida." });
    }
    if (!process.env.WOMPI_EVENTS_INTEGRITY_SECRET) {
      return res.status(500).json({ error: "Error de configuración del servidor (webhooks)." });
    }

    try {
      const signatureDetails = JSON.parse(wompiEventSignatureHeader);
      const receivedSignature = signatureDetails.signature;
      const receivedTimestamp = signatureDetails.timestamp;
      const eventBodyString = rawBody.toString('utf-8');
      
      const stringToSignWebhook = `${eventBodyString}${receivedTimestamp}${process.env.WOMPI_EVENTS_INTEGRITY_SECRET}`;
      const calculatedSignature = crypto.createHash('sha256').update(stringToSignWebhook).digest('hex');

      if (calculatedSignature !== receivedSignature) {
        console.warn("¡FIRMA INVÁLIDA!");
        return res.status(403).json({ error: "Firma de webhook inválida." });
      }

      const eventData = JSON.parse(eventBodyString);
      console.log("Evento recibido:", JSON.stringify(eventData, null, 2));

      // Implementa tu lógica de negocio aquí (activar servicio, etc.)
      res.status(200).json({ message: "Webhook procesado." });

    } catch (error) {
      console.error("Error en handleWebhook:", error);
      res.status(500).json({ error: "Error interno al procesar webhook." });
    }
  }
}

module.exports = PaymentController;
