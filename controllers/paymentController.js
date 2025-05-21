// backend/controllers/paymentController.js
const crypto = require('crypto');
const fetch = require('node-fetch'); // O la librería que uses para hacer peticiones HTTP desde Node.js
const Service = require('../models/Service'); // Ajusta la ruta si es necesario
const User = require('../models/User');     // Ajusta la ruta si es necesario (si necesitas más datos del usuario)

// --- Constantes de Wompi (obtenidas de variables de entorno) ---
// Es crucial que estas variables estén configuradas en tu entorno de Render
const WOMPI_API_URL = process.env.WOMPI_API_URL || "https://sandbox.wompi.co/v1";
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY;
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY; // Este es el que se usa para firmar eventos, no directamente aquí.
const WOMPI_EVENTS_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET; // Para validar webhooks
const DEFAULT_REDIRECT_URL = process.env.WOMPI_REDIRECT_URL || `${process.env.FRONTEND_URL || 'http://localhost:4321'}/dashboard/payment-status`;

// Helper para generar firma de integridad para datos de transacción
// Esta función específica puede variar según la documentación de Wompi para crear la transacción.
// La firma de integridad es más común para *validar webhooks*.
// Para *crear* la transacción, Wompi usa el "Acceptance Token" y la firma de referencia.
// Aquí, el ejemplo es para la firma de la referencia de pago.
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
      console.error("PAYMENT_CONTROLLER - Error: req.user no está definido o incompleto. El middleware de autenticación podría haber fallado o no se ejecutó.");
      return res.status(401).json({ error: "Usuario no autenticado o datos de usuario incompletos." });
    }

    const userEmail = req.user.email;
    const userId = req.user._id.toString(); // ObjectId a string
    const { amount: amountFromRequest, serviceId: serviceCodeFromRequest } = req.body;

    console.log("PAYMENT_CONTROLLER - req.user:", { id: userId, email: userEmail });
    console.log("PAYMENT_CONTROLLER - req.body:", { amountFromRequest, serviceCodeFromRequest });

    if (!amountFromRequest || !serviceCodeFromRequest) {
      console.error("PAYMENT_CONTROLLER - Error: Faltan 'amount' o 'serviceId' en el cuerpo de la solicitud.");
      return res.status(400).json({ error: "Faltan datos necesarios: monto o ID del servicio." });
    }
    if (isNaN(parseFloat(amountFromRequest)) || parseFloat(amountFromRequest) <= 0) {
        console.error("PAYMENT_CONTROLLER - Error: Monto inválido.", amountFromRequest);
        return res.status(400).json({ error: "El monto proporcionado es inválido." });
    }

    // Verificar que las claves de Wompi estén configuradas
    if (!WOMPI_PUBLIC_KEY) {
        console.error("PAYMENT_CONTROLLER - CRITICAL: WOMPI_PUBLIC_KEY no está configurada en las variables de entorno.");
        return res.status(500).json({ error: "Error de configuración del servidor (pagos)." });
    }

    try {
      console.log(`PAYMENT_CONTROLLER - Buscando servicio con serviceCode: "${serviceCodeFromRequest}"`);
      const service = await Service.findOne({ serviceCode: serviceCodeFromRequest.toUpperCase() }); // Asumiendo que guardas serviceCode en mayúsculas

      if (!service) {
        console.error(`PAYMENT_CONTROLLER - Servicio NO encontrado con serviceCode: ${serviceCodeFromRequest}`);
        return res.status(404).json({ error: `Servicio con código '${serviceCodeFromRequest}' no encontrado.` });
      }
      console.log(`PAYMENT_CONTROLLER - Servicio encontrado: ${service.nombre}, Precio DB: ${service.precio} ${service.moneda}`);

      // --- VERIFICACIÓN DE PRECIO ---
      // Compara el precio del servicio en la DB con el monto enviado por el frontend.
      // ¡Es crucial que el precio final venga de tu DB!
      if (Number(amountFromRequest) !== service.precio) {
        console.warn(`PAYMENT_CONTROLLER - DISCREPANCIA DE PRECIO para serviceCode '${serviceCodeFromRequest}'. Frontend envió: ${amountFromRequest}, DB tiene: ${service.precio}.`);
        // Podrías decidir si esto es un error fatal o solo una advertencia si Wompi toma el monto de la DB de todas formas.
        // Por seguridad, es mejor considerarlo un error si esperas que coincidan.
        // return res.status(400).json({ error: "Discrepancia en el precio del servicio. Intente de nuevo." });
      }
      // --- FIN VERIFICACIÓN DE PRECIO ---

      // Monto en centavos para Wompi (ej. $10.000 COP = 1000000 centavos)
      // Asegúrate de que service.precio esté en la unidad principal (ej. 990000 para $990.000 COP)
      const amountInCents = service.precio * 100; 
      const currency = service.moneda || 'COP'; // Moneda del servicio o default a COP

      // 1. Obtener el "Acceptance Token" de Wompi
      console.log("PAYMENT_CONTROLLER - Obteniendo Acceptance Token de Wompi...");
      const acceptanceTokenResponse = await fetch(`${WOMPI_API_URL}/merchants/${WOMPI_PUBLIC_KEY}`);
      if (!acceptanceTokenResponse.ok) {
        const errorBody = await acceptanceTokenResponse.text();
        console.error(`PAYMENT_CONTROLLER - Error al obtener Acceptance Token de Wompi (${acceptanceTokenResponse.status}):`, errorBody);
        throw new Error(`No se pudo obtener el token de aceptación de Wompi. Status: ${acceptanceTokenResponse.status}`);
      }
      const acceptanceTokenData = await acceptanceTokenResponse.json();
      const acceptanceToken = acceptanceTokenData.data.presigned_acceptance.acceptance_token;
      console.log("PAYMENT_CONTROLLER - Acceptance Token obtenido.");

      // 2. Crear la referencia de pago única
      //    Debe ser única para cada transacción.
      const paymentReference = `VIO_${service.serviceCode}_${userId.slice(-6)}_${Date.now()}`;
      console.log("PAYMENT_CONTROLLER - Referencia de pago generada:", paymentReference);
      
      // 3. Generar la firma de la referencia de pago (si Wompi la sigue requiriendo para este flujo)
      //    La documentación de Wompi dice: "payment_source_id, public_key, reference, amount_in_cents, currency"
      //    Esto podría referirse a la creación de una *fuente de pago*, no necesariamente la *transacción* inicial.
      //    Para la creación de la transacción, la firma principal es la que Wompi genera con el widget o la que se usa para el token de tarjeta.
      //    Aquí, vamos a asumir que necesitamos una firma de *integridad* de la referencia de pago.
      //    IMPORTANTE: WOMPI_EVENTS_INTEGRITY_SECRET es para webhooks. ¿Hay otra clave de integridad para crear transacciones?
      //    Si Wompi requiere la "firma de la transacción", usualmente es: reference + amount_in_cents + currency + integrity_secret_del_comercio
      //    Revisa bien la documentación de Wompi para la API de "Crear una transacción".
      //    Por ahora, usaré WOMPI_EVENTS_INTEGRITY_SECRET como ejemplo, PERO PODRÍA SER OTRA CLAVE.
      
      let signature = null;
      if (process.env.WOMPI_TRANSACTION_INTEGRITY_KEY) { // Si tienes una clave específica para esto
        signature = calculatePaymentReferenceSignature(
            paymentReference,
            amountInCents,
            currency,
            process.env.WOMPI_TRANSACTION_INTEGRITY_KEY 
        );
        console.log("PAYMENT_CONTROLLER - Firma de referencia de pago generada:", signature);
      } else {
        console.warn("PAYMENT_CONTROLLER - WOMPI_TRANSACTION_INTEGRITY_KEY no está configurada. Si es necesaria, la transacción podría fallar o ser menos segura.");
      }


      // 4. Preparar los datos para crear la transacción en Wompi
      const transactionData = {
        acceptance_token: acceptanceToken,
        amount_in_cents: amountInCents,
        currency: currency,
        customer_email: userEmail,
        payment_method: { // Opcional: si quieres forzar un tipo, ej. NEQUI, TARJETA, BANCOLOMBIA_TRANSFER
          // "type": "NEQUI", 
          // "phone_number": "3001234567" // Si es NEQUI
        },
        reference: paymentReference,
        // signature: signature, // Añade la firma si es requerida por Wompi para este endpoint
        redirect_url: `${DEFAULT_REDIRECT_URL}?ref=${paymentReference}`, // URL a la que Wompi redirige después del pago
        // Opcional: customer_data para información del cliente
        customer_data: {
            phone_number: req.user.telefono || undefined, // Si tienes el teléfono del usuario
            full_name: req.user.nombre || undefined
        },
        // Opcional: shipping_address
        // shipping_address: { ... }
      };

      // Añadir firma solo si se generó
      if (signature) {
        transactionData.signature = signature;
      }

      console.log("PAYMENT_CONTROLLER - Datos a enviar a Wompi para crear transacción:", JSON.stringify(transactionData, null, 2));

      // 5. Enviar la solicitud a Wompi para crear la transacción
      const wompiTransactionResponse = await fetch(`${WOMPI_API_URL}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${WOMPI_PUBLIC_KEY}` // Usar la llave pública de Wompi aquí
        },
        body: JSON.stringify(transactionData)
      });
      
      const wompiTransactionResult = await wompiTransactionResponse.json();
      console.log("PAYMENT_CONTROLLER - Respuesta de Wompi (crear transacción):", wompiTransactionResponse.status, JSON.stringify(wompiTransactionResult, null, 2));

      if (!wompiTransactionResponse.ok || wompiTransactionResult.status === 'ERROR') {
        console.error(`PAYMENT_CONTROLLER - Error al crear transacción en Wompi. Status: ${wompiTransactionResponse.status}. Respuesta:`, wompiTransactionResult);
        const wompiError = wompiTransactionResult.error?.messages?.join(', ') || wompiTransactionResult.error?.message || wompiTransactionResult.reason || 'Error desconocido de Wompi.';
        throw new Error(`Wompi: ${wompiError}`);
      }
      
      // Si Wompi devuelve una URL de checkout (para pagos que requieren redirección, como PSE, Nequi con redirección)
      if (wompiTransactionResult.data && wompiTransactionResult.data.id && wompiTransactionResult.data.payment_method_type) {
        // Para algunos métodos de pago, la transacción se crea y luego se debe redirigir
        // a una URL que Wompi proporciona o se debe usar el widget.
        // Si Wompi devuelve un ID de transacción y el estado es PENDING,
        // usualmente se usa el Widget de Wompi con este ID de transacción
        // o se redirige a la URL de pago si la proporciona.
        // El flujo exacto depende de cómo integres el Checkout de Wompi.
        // Si usas el Widget de Wompi en el frontend, solo necesitas devolver el ID de la transacción.
        // Si esperas una URL de redirección de Wompi, búscala en wompiTransactionResult.data.
        // Ejemplo: si Wompi te da una URL para el checkout:
        // const checkoutUrl = wompiTransactionResult.data.checkout_url; // El nombre del campo puede variar

        // Para el Widget, usualmente solo necesitas el ID de la transacción para pasarlo al frontend.
        // Para redirección directa (PSE, Nequi, etc.), Wompi podría dar una URL.
        // Aquí asumimos que Wompi nos da un ID y el frontend usa el Widget.
        // O, si es una redirección directa, Wompi lo indicaría en la respuesta.
        // El ejemplo anterior de "checkout_url" es más para el "Acceptance Token" en el contexto de una "Transacción ligera".
        // Para una transacción completa, el ID de la transacción es clave.

        // Wompi con `redirect_url` en la petición de transacción:
        // Wompi redirigirá al usuario a `redirect_url` automáticamente después del proceso de pago en su pasarela.
        // Lo que necesitas enviar al frontend es la URL a la *pasarela de Wompi*.
        // Esta URL se encuentra en `wompiTransactionResult.data.payment_link_url` o similar,
        // o se construye usando el `id` de la transacción para el widget.

        // Por ahora, vamos a asumir que el objetivo es redirigir al checkout de Wompi,
        // Wompi debería proporcionar una URL de redirección en su respuesta `wompiTransactionResult.data`.
        // El campo exacto puede variar (ej. `payment_link_url`, `next_action.redirect_to_url`, etc.)
        // Revisa la respuesta de Wompi para encontrar la URL de redirección correcta.
        
        // Si el método `create-transaction` del payment button solo busca el checkout para wompi
        // entonces debería buscar el "hosted_payment_page_url" o similar que devuelva la API de wompi.
        // El código original que tenías para el frontend espera `responseData.checkout_url`
        // Así que vamos a intentar devolver algo con ese nombre.
        // Esto puede depender de si Wompi da una URL directa o si tú construyes una para el widget.
        
        // Si Wompi devuelve un ID de transacción y necesitas redirigir a una página de Wompi:
        // Para el Widget de Wompi, normalmente iniciarías el widget con este ID.
        // Para una redirección explícita (PSE, Nequi, etc.), Wompi te da una URL.
        // Asumamos que Wompi provee una URL de redirección en `data.next_action.data.redirect_url` o similar.
        // O si usas el "Link de Pago" de Wompi, la URL estaría en `data.payment_link_url`.

        let checkoutUrlForFrontend;
        if (wompiTransactionResult.data.status === 'PENDING' && wompiTransactionResult.data.payment_link_url) {
            checkoutUrlForFrontend = wompiTransactionResult.data.payment_link_url;
        } else if (wompiTransactionResult.data.next_action && wompiTransactionResult.data.next_action.type === 'REDIRECT_TO_URL' && wompiTransactionResult.data.next_action.data.url) {
            checkoutUrlForFrontend = wompiTransactionResult.data.next_action.data.url;
        } else {
             // Si no hay URL directa, quizás sea para el widget, y el frontend necesitaría el ID.
             // O podrías construir una URL si Wompi usa un patrón predecible.
             // Por ahora, si no hay URL explícita, devolvemos error.
            console.error("PAYMENT_CONTROLLER - Wompi no devolvió una URL de checkout explícita y el flujo de widget no está implementado aquí.");
            // throw new Error("No se pudo determinar la URL de pago de Wompi.");
            // Alternativa: devolver el ID de la transacción para que el frontend use el widget
             res.status(200).json({
                message: "Transacción creada, usar widget con ID.",
                transaction_id: wompiTransactionResult.data.id,
                status: wompiTransactionResult.data.status
            });
            return;
        }
        
        console.log("PAYMENT_CONTROLLER - Enviando URL de checkout al frontend:", checkoutUrlForFrontend);
        res.status(200).json({
          message: "Transacción creada exitosamente. Redirigiendo a Wompi.",
          checkout_url: checkoutUrlForFrontend, // El frontend espera esto
          transaction_id: wompiTransactionResult.data.id, // También envía el ID
          status: wompiTransactionResult.data.status
        });

      } else {
        console.error("PAYMENT_CONTROLLER - Respuesta de Wompi no contiene ID de transacción o tipo de método de pago válidos:", wompiTransactionResult.data);
        throw new Error("Respuesta inesperada de Wompi después de crear la transacción.");
      }

    } catch (error) {
      console.error("PAYMENT_CONTROLLER - Catch Error FINAL en createTransaction:", error.message, error.stack);
      next(error); // Pasa al manejador de errores global de Express
    }
  }

  // --- MÉTODO PARA MANEJAR WEBHOOKS DE WOMPI ---
  static async handleWebhook(req, res, next) {
    console.log("PAYMENT_CONTROLLER - INICIO handleWebhook");
    const wompiEventSignature = req.headers['x-wompi-signature']; // O el header que Wompi use
    const rawBody = req.body; // `express.raw({ type: 'application/json' })` lo deja como Buffer

    if (!wompiEventSignature || !rawBody) {
      console.warn("WEBHOOK - Petición inválida: Falta firma o cuerpo.");
      return res.status(400).json({ error: "Petición de webhook inválida." });
    }
    if (!WOMPI_EVENTS_INTEGRITY_SECRET) {
        console.error("WEBHOOK - CRITICAL: WOMPI_EVENTS_INTEGRITY_SECRET no configurado. No se pueden validar eventos.");
        return res.status(500).json({ error: "Error de configuración del servidor (webhooks)." });
    }

    try {
      // Wompi usa una firma basada en timestamp y el secreto de integridad de eventos
      // Ejemplo de estructura de la firma (VERIFICAR DOCUMENTACIÓN DE WOMPI):
      // `timestamp_en_ms.secreto_de_integridad_de_eventos` y luego SHA256 del body.
      // O `body_del_evento.timestamp_en_ms.secreto_de_integridad_de_eventos`
      // Este es un punto crucial y depende de la documentación exacta de Wompi para la firma de eventos.

      // Asumamos que la firma es un SHA256 del cuerpo del evento concatenado con el secreto
      // const stringToSignForWebhook = rawBody.toString('utf-8') + WOMPI_EVENTS_INTEGRITY_SECRET;
      // const calculatedSignature = crypto.createHash('sha256').update(stringToSignForWebhook).digest('hex');

      // Wompi, para "Firma de eventos" dice que el header 'X-Wompi-Signature' contiene:
      // { "signature": "checksum_generado", "timestamp": timestamp_en_ms }
      // Y el checksum se genera con: `cadena_de_eventos + timestamp_en_ms + secreto_de_integridad_de_eventos`
      // donde `cadena_de_eventos` es el cuerpo de la petición (el evento JSON como string).

      const signatureHeader = JSON.parse(wompiEventSignature);
      const receivedSignature = signatureHeader.signature;
      const receivedTimestamp = signatureHeader.timestamp;

      const eventBodyString = rawBody.toString('utf-8');
      const stringToSign = `${eventBodyString}${receivedTimestamp}${WOMPI_EVENTS_INTEGRITY_SECRET}`;
      const calculatedSignature = crypto.createHash('sha256').update(stringToSign).digest('hex');
      
      console.log("WEBHOOK - Event Body String:", eventBodyString.substring(0, 100) + "..."); // Loguear solo una parte
      console.log("WEBHOOK - Received Timestamp:", receivedTimestamp);
      console.log("WEBHOOK - Received Signature:", receivedSignature);
      console.log("WEBHOOK - Calculated Signature:", calculatedSignature);

      if (calculatedSignature !== receivedSignature) {
        console.warn("WEBHOOK - ¡FIRMA INVÁLIDA! Posible intento de suplantación o error de configuración.");
        return res.status(403).json({ error: "Firma de webhook inválida." });
      }
      console.log("WEBHOOK - Firma verificada exitosamente.");

      const eventData = JSON.parse(eventBodyString); // Ahora parsea el cuerpo a JSON
      console.log("WEBHOOK - Evento de Wompi recibido y verificado:", JSON.stringify(eventData, null, 2));

      // Procesar el evento (ej. actualizar estado de la orden, enviar email, etc.)
      const transaction = eventData.data.transaction;
      const transactionId = transaction.id;
      const transactionStatus = transaction.status; // APPROVED, DECLINED, VOIDED, ERROR
      const paymentReference = transaction.reference;

      console.log(`WEBHOOK - Transacción ID: ${transactionId}, Estado: ${transactionStatus}, Referencia: ${paymentReference}`);

      // Aquí tu lógica para actualizar tu base de datos según el estado de la transacción
      // Ejemplo:
      // const order = await Order.findOne({ paymentReference: paymentReference });
      // if (order) {
      //   order.paymentStatus = transactionStatus;
      //   order.wompiTransactionId = transactionId;
      //   if (transactionStatus === 'APPROVED') {
      //     order.status = 'pagada';
      //     // Lógica de activación de servicio, etc.
      //   } else if (['DECLINED', 'ERROR', 'VOIDED'].includes(transactionStatus)) {
      //     order.status = 'pago_fallido';
      //   }
      //   await order.save();
      //   console.log(`WEBHOOK - Orden con referencia ${paymentReference} actualizada a estado ${transactionStatus}.`);
      // } else {
      //   console.warn(`WEBHOOK - No se encontró orden con referencia ${paymentReference} para actualizar.`);
      // }

      res.status(200).json({ message: "Webhook recibido y procesado." });

    } catch (error) {
      console.error("WEBHOOK - Error al procesar webhook de Wompi:", error);
      // Es importante no enviar un error 500 si es posible, para que Wompi no reintente indefinidamente
      // si el problema es con el formato del evento o algo que no se puede recuperar.
      // Pero si es un error de tu lógica, un 500 podría estar bien para que Wompi reintente.
      res.status(500).json({ error: "Error interno al procesar webhook." });
      // next(error); // O pasarlo al manejador global
    }
  }
}

module.exports = PaymentController;
