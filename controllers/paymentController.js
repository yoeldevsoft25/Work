// backend/controllers/paymentController.js
const crypto = require('crypto');
const Service = require('../models/Service');

// Variables de entorno de Wompi (configurar en Render)
const WOMPI_CHECKOUT_URL = process.env.WOMPI_CHECKOUT_URL || "https://checkout.wompi.co/p/";
const WOMPI_PUBLIC_KEY = process.env.WoMPI_PUBLIC_KEY;
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

    // Validación básica
    if (!serviceCodeFromRequest) {
      return res.status(400).json({ error: "Falta serviceId en la solicitud." });
    }

    try {
      // Paso 1: Buscar el servicio en MongoDB SIN modificar el case
      const service = await Service.findOne({ 
        serviceCode: serviceCodeFromRequest // Usar el valor original
      });

      if (!service) {
        console.error("Error: Servicio no encontrado. serviceCode en DB:", 
          await Service.distinct("serviceCode") // Log para debug
        );
        return res.status(404).json({ error: `Servicio '${serviceCodeFromRequest}' no encontrado.` });
      }

      // Paso 2: Generar parámetros para Wompi
      const amountInCents = service.precio * 100; // Precio desde DB
      const paymentReference = `VIO_${service.serviceCode}_${Date.now()}`;
      
      // Generar firma de integridad
      const signature = crypto
        .createHash('sha256')
        .update(
          `${paymentReference}${amountInCents}${service.moneda}${WOMPI_TRANSACTION_INTEGRITY_SECRET}`
        )
        .digest('hex');

      // Paso 3: Construir URL de redirección a Wompi (Web Checkout)
      const wompiParams = new URLSearchParams({
        'public-key': WOMPI_PUBLIC_KEY,
        'currency': service.moneda,
        'amount-in-cents': amountInCents.toString(),
        'reference': paymentReference,
        'signature:integrity': signature,
        'redirect-url': `${DEFAULT_REDIRECT_URL}?ref=${paymentReference}`,
        'customer-data:email': req.user.email,
        'customer-data:full-name': req.user.nombre
      });

      const checkoutUrl = `${WOMPI_CHECKOUT_URL}?${wompiParams.toString()}`;
      console.log("URL generada para Wompi:", checkoutUrl);

      return res.status(200).json({ checkout_url: checkoutUrl });

    } catch (error) {
      console.error("Error en createTransaction:", error);
      next(error);
    }
  }

  // ... (Método handleWebhook se mantiene igual)
}

module.exports = PaymentController;
