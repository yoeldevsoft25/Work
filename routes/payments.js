// backend/routes/payments.js
const express = require('express');
const PaymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware'); // IMPORTA TU MIDDLEWARE

const router = express.Router();

// Ruta para crear la transacción de pago, AHORA PROTEGIDA
router.post('/create-transaction', authMiddleware, PaymentController.createTransaction);

router.post('/wompi-webhook', express.raw({ type: 'application/json' }), PaymentController.handleWebhook);

module.exports = router;
