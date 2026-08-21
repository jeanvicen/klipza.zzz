import assert from 'node:assert/strict';
import {
  directPaymentBody,
  idempotencyKey,
  paymentResponseDTO,
  paymentStatus
} from '../api/mercadopago.js';

const user = { id: 'user-1', email: 'cliente@example.com' };
const product = {
  code: 'tokens_100',
  kind: 'token_pack',
  title: '100 tokens',
  description: 'Pacote de teste',
  tokenAmount: 100,
  amountCents: 5990,
  currency: 'BRL',
  intervalMonths: null,
  sortOrder: 10
};
const order = {
  id: 'order-1',
  external_reference: 'klipza_order_1',
  status: 'pending',
  provider_payment_id: null
};
const request = {
  headers: { 'x-idempotency-key': '1f8f2d1a-8ae0-4e0d-b4b4-9c7e1d1b1a00' },
  body: {}
};

assert.equal(idempotencyKey(request), request.headers['x-idempotency-key']);
assert.equal(paymentStatus('in_process'), 'pending');
assert.equal(paymentStatus('approved'), 'approved');
assert.equal(paymentStatus('unknown'), 'pending');

const pix = directPaymentBody({ paymentMethodId: 'pix' }, user, product, order, { headers: {}, body: {} });
assert.equal(pix.transaction_amount, 59.9);
assert.equal(pix.payment_method_id, 'pix');
assert.equal(pix.payer.email, user.email);
assert.equal(pix.external_reference, order.external_reference);
assert.equal(pix.metadata.order_id, order.id);

const card = directPaymentBody({
  paymentMethodId: 'master',
  token: 'card-token',
  installments: 2,
  payer: { email: 'CARD@example.com', identification: { type: 'CPF', number: '111.444.777-35' } }
}, user, product, order, { headers: {}, body: {} });
assert.equal(card.payment_method_id, 'master');
assert.equal(card.token, 'card-token');
assert.equal(card.installments, 2);
assert.equal(card.payer.email, 'card@example.com');
assert.deepEqual(card.payer.identification, { type: 'CPF', number: '11144477735' });

const boleto = directPaymentBody({
  paymentMethodId: 'bolbradesco',
  payer: { identification: { type: 'CPF', number: '11144477735' } }
}, user, product, order, { headers: {}, body: {} });
assert.equal(boleto.payment_method_id, 'bolbradesco');
assert.equal(boleto.payer.identification.number, '11144477735');

assert.throws(
  () => idempotencyKey({ headers: {}, body: { idempotencyKey: 'not-a-uuid' } }),
  /X-Idempotency-Key UUID/
);
assert.throws(
  () => directPaymentBody({ paymentMethodId: 'bolbradesco' }, user, product, order, { headers: {}, body: {} }),
  /documento do comprador/
);
assert.throws(
  () => directPaymentBody({ paymentMethodId: 'visa' }, user, product, order, { headers: {}, body: {} }),
  /Token de cartão inválido/
);

const response = paymentResponseDTO({
  id: 123,
  status: 'pending',
  status_detail: 'pending_waiting_payment',
  payment_method_id: 'pix',
  transaction_amount: 59.9,
  point_of_interaction: { transaction_data: { qr_code: 'pix-copy-paste', qr_code_base64: 'base64' } }
}, order, product);
assert.equal(response.paymentId, '123');
assert.equal(response.qrCode, 'pix-copy-paste');
assert.equal(response.qrCodeBase64, 'base64');
assert.equal(response.status, 'pending');

console.log('test-mercadopago-api OK');
