// backend/routes/payments.js
const express = require('express');
const PaymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Crear transacción (protegida por autenticación)
router.post('/create-transaction', authMiddleware, PaymentController.createTransaction);

// Webhook de Wompi (NO debe estar protegido por tu authMiddleware, Wompi lo llama directamente)
// Usa express.raw() para obtener el cuerpo como Buffer para la verificación de la firma
router.post('/wompi-webhook', express.raw({ type: 'application/json' }), PaymentController.handleWebhook);

module.exports = router;
