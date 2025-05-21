const crypto = require('crypto');
const Service = require('../models/Service');

const WOMPI_CHECKOUT_BASE_URL = process.env.WOMPI_CHECKOUT_URL || "https://checkout.wompi.co/p/";
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
      const service = await Service.findOne({ serviceCode: serviceCodeFromRequest });

      if (!service) {
        console.error("Error: Servicio no encontrado. serviceCode en DB:", 
          (await Service.find({})).map(s => s.serviceCode)
        );
        return res.status(404).json({ error: `Servicio '${serviceCodeFromRequest}' no encontrado.` });
      }

      // ============ CORRECCIONES CLAVE ============ //
      const currency = (service.moneda || 'COP').toUpperCase(); // Default COP
      const precio = Number(service.precio);
      
      if (isNaN(precio)) {
        console.error("❌ Precio inválido en DB:", service.precio);
        return res.status(500).json({ error: "El precio del servicio no es válido." });
      }
      const amountInCents = Math.round(precio * 100);
      // ============================================ //

      console.log("Datos procesados:", { currency, amountInCents });

      const paymentReference = `VIO_${service.serviceCode}_${Date.now()}`;
      
      const signature = crypto
        .createHash('sha256')
        .update(`${paymentReference}${amountInCents}${currency}${WOMPI_TRANSACTION_INTEGRITY_SECRET}`)
        .digest('hex');

      const wompiParams = new URLSearchParams({
        'public-key': WOMPI_PUBLIC_KEY,
        'currency': currency,
        'amount-in-cents': amountInCents.toString(),
        'reference': paymentReference,
        'signature:integrity': signature,
        'redirect-url': `${DEFAULT_REDIRECT_URL}?ref=${paymentReference}`,
        'customer-data:email': req.user.email,
        'customer-data:full-name': req.user.nombre || ''
      });

      const checkoutUrl = `${WOMPI_CHECKOUT_BASE_URL}?${wompiParams.toString()}`;
      console.log("✅ URL generada para Wompi:", checkoutUrl);

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
        console.warn("¡FIRMA INVÁLIDA! Posible ataque o error de configuración.");
        return res.status(403).json({ error: "Firma de webhook inválida." });
      }

      const eventData = JSON.parse(eventBodyString);
      console.log("Evento Wompi recibido:", JSON.stringify(eventData, null, 2));

      // ============ LÓGICA DE NEGOCIO PARA WEBHOOK ============ //
      const transaction = eventData.data?.transaction;
      if (!transaction) {
        return res.status(400).json({ error: "Transacción no encontrada en el evento." });
      }

      const { id, reference, status } = transaction;
      console.log(`Estado de pago: ${status} | Referencia: ${reference} | ID: ${id}`);

      // Ejemplo de lógica básica:
      if (status === 'APPROVED') {
        console.log("✅ Pago aprobado. Activar servicio...");
        // Aquí iría tu código para activar el servicio al usuario
      } else if (status === 'DECLINED') {
        console.log("❌ Pago rechazado. Notificar al usuario...");
      }

      return res.status(200).json({ message: "Webhook procesado exitosamente." });

    } catch (error) {
      console.error("Error en handleWebhook:", error);
      res.status(500).json({ 
        error: "Error interno al procesar webhook.",
        ...(process.env.NODE_ENV === 'development' && { detalle: error.message })
      });
    }
  }
}

module.exports = PaymentController;
