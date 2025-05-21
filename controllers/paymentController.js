const crypto = require('crypto');
const Service = require('../models/Service');

// Configuración Wompi
const WOMPI_CHECKOUT_URL = process.env.WOMPI_CHECKOUT_URL || "https://checkout.wompi.co/p/";
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY;
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_TRANSACTION_INTEGRITY_SECRET;

class PaymentController {
  static async createTransaction(req, res) {
    try {
      // Validación de usuario
      if (!req.user?.email || !req.user?._id) {
        return res.status(401).json({ error: "Usuario no autenticado." });
      }

      const { serviceId: serviceCode } = req.body;
      
      // Buscar servicio
      const service = await Service.findOne({ serviceCode });
      if (!service) return res.status(404).json({ error: "Servicio no encontrado." });

      // ========== CONVERSIÓN SEGURA DE PRECIO ==========
      const precio = service.precio instanceof mongoose.Types.Long 
        ? service.precio.toNumber() 
        : Number(service.precio);
      
      if (isNaN(precio)) {
        console.error('Precio inválido:', service.precio);
        return res.status(500).json({ error: "Error en configuración del servicio." });
      }

      const amountInCents = precio * 100;
      const currency = service.moneda?.toUpperCase() || 'COP';

      // Generar referencia única
      const reference = `VIO-${service.serviceCode}-${Date.now()}`;
      
      // Firma de seguridad
      const signature = crypto
        .createHash('sha256')
        .update(`${reference}${amountInCents}${currency}${WOMPI_INTEGRITY_SECRET}`)
        .digest('hex');

      // Construir URL de pago
      const checkoutUrl = new URL(WOMPI_CHECKOUT_URL);
      checkoutUrl.search = new URLSearchParams({
        'public-key': WOMPI_PUBLIC_KEY,
        'currency': currency,
        'amount-in-cents': amountInCents.toString(),
        'reference': reference,
        'signature:integrity': signature,
        'redirect-url': `${process.env.WOMPI_REDIRECT_URL}?ref=${reference}`,
        'customer-data:email': req.user.email,
        'customer-data:full-name': req.user.nombre || ''
      }).toString();

      return res.json({ checkout_url: checkoutUrl.href });

    } catch (error) {
      console.error('Error en transacción:', error);
      return res.status(500).json({ error: "Error interno del servidor." });
    }
  }
}

module.exports = PaymentController;
