/**
 * Cloudflare Worker — Casamento Noiva & Noivo
 * Backend seguro para: integração Asaas, receber webhook, health check.
 *
 * ENV vars (definir no Cloudflare Dashboard ou via wrangler secret):
 *   SUPABASE_URL          — URL do projeto Supabase (https://xxx.supabase.co)
 *   SUPABASE_SERVICE_KEY  — service_role key (bypassa RLS, nunca exposta ao client)
 *   FRONTEND_URL          — URL do frontend (https://seudominio.com)
 *   WORKER_URL            — URL deste worker
 */

const PRICE_PER_PERSON = 95;
const MAX_GROUP_SIZE   = 10;
const EVENT_TITLE      = 'Casamento Noiva & Noivo – 03/10/2026';

// ─── Rate limiting simples (in-memory, reinicia em cold start) ────────────────
const _rl = new Map();
function rateLimit(ip, limit = 10, windowMs = 60_000) {
  const now  = Date.now();
  const slot = _rl.get(ip) ?? { n: 0, exp: now + windowMs };
  if (now > slot.exp) { slot.n = 0; slot.exp = now + windowMs; }
  slot.n++;
  _rl.set(ip, slot);
  return slot.n <= limit;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

function corsHeaders(origin, allowedOrigins) {
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowed || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, asaas-access-token',
    'Access-Control-Max-Age': '86400',
  };
}

function validateEnv(env) {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
    if (!env[k]) throw new Error(`ENV ausente: ${k}`);
  }
}

function isValidUUID(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ─── Supabase REST helper (usa service_role, bypassa RLS) ────────────────────
async function sb(env, path, method = 'GET', body = null) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (method === 'GET') {
    if (!res.ok) return null;
    return res.json();
  }
  return res.ok;
}

// ─── Asaas Config Helper ─────────────────────────────────────────────────────
async function getAsaasConfig(env) {
  // Tenta ler das variáveis de ambiente/segredos do Cloudflare Worker primeiro (recomendado)
  if (env.ASAAS_API_KEY) {
    const isProd = env.ASAAS_ENV === 'production';
    return {
      apiKey: env.ASAAS_API_KEY,
      baseUrl: isProd ? 'https://api.asaas.com' : 'https://sandbox.asaas.com/api',
      webhookToken: env.ASAAS_WEBHOOK_TOKEN || ''
    };
  }

  // Fallback para a tabela configuracoes do Supabase
  const configs = await sb(env, 'configuracoes?id=eq.1&select=*');
  if (!configs || configs.length === 0) {
    throw new Error('Configurações do Asaas não encontradas nas variáveis do Worker nem no banco de dados.');
  }
  const cfg = configs[0];
  const isProd = cfg.asaas_env === 'production';
  return {
    apiKey: isProd ? cfg.asaas_key_prod : cfg.asaas_key_sandbox,
    baseUrl: isProd ? 'https://api.asaas.com' : 'https://sandbox.asaas.com/api',
    webhookToken: cfg.asaas_webhook_token
  };
}

// ─── Handler: POST /api/pay-asaas ────────────────────────────────────────────
async function handlePayAsaas(request, env, cors) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!rateLimit(ip, 10, 60_000)) {
    return json({ error: 'Muitas requisições. Aguarde 1 minuto.' }, 429, cors);
  }

  validateEnv(env);

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400, cors);
  }

  const { grupoId, pessoas, cardData, installments, billingType } = body;
  const method = billingType === 'PIX' ? 'PIX' : 'CREDIT_CARD';

  // Validar inputs principais
  if (!isValidUUID(grupoId)) return json({ error: 'grupoId inválido.' }, 400, cors);
  if (!Array.isArray(pessoas) || pessoas.length < 1 || pessoas.length > MAX_GROUP_SIZE) {
    return json({ error: 'Lista de pessoas inválida.' }, 400, cors);
  }
  if (method === 'CREDIT_CARD') {
    if (!cardData || !cardData.number || !cardData.ccv) {
      return json({ error: 'Dados do cartão incompletos.' }, 400, cors);
    }
  }

  // Buscar grupo no Supabase para validar existência e valor
  const grupos = await sb(env, `grupos?id=eq.${grupoId}&select=id,valor_total,status_pagamento,total_pessoas`);
  if (!grupos || grupos.length === 0) return json({ error: 'Grupo não encontrado.' }, 404, cors);
  
  const grupo = grupos[0];
  if (grupo.status_pagamento === 'pago') return json({ error: 'Grupo já possui pagamento confirmado.' }, 409, cors);

  const valorEsperado = grupo.total_pessoas * PRICE_PER_PERSON;
  const valorReal     = Number(grupo.valor_total);
  if (Math.abs(valorReal - valorEsperado) > 0.01) {
    return json({ error: 'Inconsistência de valor. Contate os noivos.' }, 409, cors);
  }

  // Buscar configuração do Asaas
  let asaas;
  try {
    asaas = await getAsaasConfig(env);
  } catch (err) {
    return json({ error: 'Erro de configuração do gateway de pagamento.' }, 500, cors);
  }

  const respPessoa = pessoas[0]; // O pagador principal

  // 1. Resolver o CustomerID do Asaas
  let customerId = null;
  const dbPessoas = await sb(env, `pessoas?cpf=eq.${respPessoa.cpf.replace(/\D/g, '')}&select=id,asaas_customer_id`);
  if (dbPessoas && dbPessoas.length > 0 && dbPessoas[0].asaas_customer_id) {
    customerId = dbPessoas[0].asaas_customer_id;
  }

  if (!customerId) {
    // Buscar no Asaas
    const searchRes = await fetch(`${asaas.baseUrl}/v3/customers?cpfCnpj=${respPessoa.cpf.replace(/\D/g, '')}`, {
      headers: { 'access_token': asaas.apiKey }
    });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.data && searchData.data.length > 0) customerId = searchData.data[0].id;
    }

    // Criar se não existir
    if (!customerId) {
      const createRes = await fetch(`${asaas.baseUrl}/v3/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': asaas.apiKey },
        body: JSON.stringify({
          name: method === 'CREDIT_CARD' ? cardData.holderName : respPessoa.nome,
          cpfCnpj: respPessoa.cpf.replace(/\D/g, ''),
          mobilePhone: respPessoa.telefone.replace(/\D/g, ''),
          externalReference: respPessoa.cpf.replace(/\D/g, '')
        })
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        console.error('Erro ao criar customer:', err);
        return json({ error: 'Falha ao registrar cliente no gateway.' }, 502, cors);
      }
      const createData = await createRes.json();
      customerId = createData.id;
    }

    // Atualizar no banco
    await sb(env, `pessoas?cpf=eq.${respPessoa.cpf.replace(/\D/g, '')}`, 'PATCH', { asaas_customer_id: customerId });
  }

  // 2. Preparar Payload da Cobrança
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1); // Vencimento seguro para pagamentos de cartão D+1

  const asaasPayload = {
    customer: customerId,
    billingType: method,
    dueDate: dueDate.toISOString().split('T')[0],
    description: EVENT_TITLE,
    externalReference: grupoId
  };

  if (method === 'CREDIT_CARD') {
    asaasPayload.creditCard = {
      holderName: cardData.holderName,
      number: cardData.number,
      expiryMonth: cardData.expiryMonth,
      expiryYear: cardData.expiryYear,
      ccv: cardData.ccv
    };
    asaasPayload.creditCardHolderInfo = {
      name: cardData.holderName,
      email: 'convidado@casamentonoivaenoivo.com.br', // Mock, Asaas as vezes exige formato valido
      cpfCnpj: respPessoa.cpf.replace(/\D/g, ''),
      postalCode: '83501000', // Mock para não pedir endereço ao convidado
      addressNumber: '100',
      phone: respPessoa.telefone.replace(/\D/g, '')
    };

    const instCount = Number(installments) || 1;
    if (instCount > 1 && instCount <= 3) {
      asaasPayload.installmentCount = instCount;
      asaasPayload.installmentValue = Number((valorReal / instCount).toFixed(2));
    } else {
      asaasPayload.value = valorReal;
    }
  } else {
    // Para PIX, sempre valor total à vista
    asaasPayload.value = valorReal;
  }

  // 3. Processar Pagamento
  const payRes = await fetch(`${asaas.baseUrl}/v3/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'access_token': asaas.apiKey },
    body: JSON.stringify(asaasPayload)
  });

  if (!payRes.ok) {
    const err = await payRes.json().catch(() => ({}));
    console.error('Asaas API error:', JSON.stringify(err).substring(0, 500));
    const errMsg = err.errors && err.errors[0] ? err.errors[0].description : 'Erro ao processar cobrança.';
    return json({ error: errMsg }, 502, cors);
  }

  const payData = await payRes.json();
  console.log(`[pay-asaas] id=${payData.id} grupo=${grupoId} metodo=${method}`);

  // 4. Salvar token do cartão se disponível (para usos futuros se desejado)
  if (method === 'CREDIT_CARD' && payData.creditCard && payData.creditCard.creditCardToken) {
    await sb(env, `pessoas?cpf=eq.${respPessoa.cpf.replace(/\D/g, '')}`, 'PATCH', { 
      asaas_card_token: payData.creditCard.creditCardToken 
    });
  }

  // Se for PIX, buscar QRCode
  if (method === 'PIX') {
    const qrRes = await fetch(`${asaas.baseUrl}/v3/payments/${payData.id}/pixQrCode`, {
      headers: { 'access_token': asaas.apiKey }
    });
    if (!qrRes.ok) {
      const err = await qrRes.json().catch(() => ({}));
      console.error('Asaas QR Code error:', err);
      return json({ error: 'Erro ao obter QR Code do Pix.' }, 502, cors);
    }
    const qrData = await qrRes.json();

    // Inserir registro de pagamento Pix no banco
    await sb(env, 'pagamentos', 'POST', {
      grupo_id: grupoId,
      valor: valorReal,
      metodo: 'pix',
      status: 'pendente',
      gateway_id: payData.id
    });
    await sb(env, `grupos?id=eq.${grupoId}`, 'PATCH', { status_pagamento: 'pendente_pix' });

    return json({
      success: true,
      paymentId: payData.id,
      billingType: 'PIX',
      encodedImage: qrData.encodedImage, // QR Code base64
      payload: qrData.payload // Pix copia e cola
    }, 200, cors);
  }

  // Se for Cartão de Crédito, criar pagamento processando
  await sb(env, 'pagamentos', 'POST', {
    grupo_id: grupoId,
    valor: valorReal,
    metodo: 'cartao',
    status: 'processando',
    gateway_id: payData.id,
  });
  await sb(env, `grupos?id=eq.${grupoId}`, 'PATCH', { status_pagamento: 'processando' });

  return json({ success: true, paymentId: payData.id, status: 'processando' }, 200, cors);
}

// ─── Handler: POST /api/webhook/asaas ─────────────────────────────────────────
async function handleWebhookAsaas(request, env, cors) {
  validateEnv(env);

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Body inválido.' }, 400, cors);
  }

  // Validação de segurança do Webhook
  const asaasToken = request.headers.get('asaas-access-token');
  try {
    const asaasCfg = await getAsaasConfig(env);
    if (!asaasCfg.webhookToken || asaasToken !== asaasCfg.webhookToken) {
      console.warn('[webhook] Acesso negado. Token inválido.');
      return json({ error: 'Unauthorized' }, 401, cors);
    }
  } catch (err) {
    return json({ error: 'Erro interno.' }, 500, cors);
  }

  const { event, payment } = body;
  console.log(`[webhook] event=${event} paymentId=${payment?.id}`);

  const eventGrupoId = payment?.externalReference;
  await sb(env, 'payment_events', 'POST', {
    grupo_id: isValidUUID(eventGrupoId) ? eventGrupoId : null,
    gateway: 'asaas',
    gateway_event: event || 'unknown',
    gateway_payment_id: payment?.id || null,
    payload: body,
  });

  // Responde rápido para não bloquear a fila do Asaas
  if (event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_CHARGEBACK_REQUESTED') {
    const grupoId = payment?.externalReference;
    if (isValidUUID(grupoId)) {
      await sb(env, `grupos?id=eq.${grupoId}`, 'PATCH', { status_pagamento: 'reembolsado' });
      await sb(env, `pagamentos?grupo_id=eq.${grupoId}&gateway_id=eq.${payment.id}`, 'PATCH', { status: 'reembolsado' });
    }
    return json({ ok: true, handled: event }, 200, cors);
  }

  if (event === 'PAYMENT_OVERDUE' || event === 'PAYMENT_DELETED') {
    const grupoId = payment?.externalReference;
    if (isValidUUID(grupoId)) {
      await sb(env, `grupos?id=eq.${grupoId}`, 'PATCH', { status_pagamento: 'falhou' });
      await sb(env, `pagamentos?grupo_id=eq.${grupoId}&gateway_id=eq.${payment.id}`, 'PATCH', { status: 'falhou' });
    }
    return json({ ok: true, handled: event }, 200, cors);
  }

  if (event !== 'PAYMENT_CONFIRMED' && event !== 'PAYMENT_RECEIVED') {
    return json({ ok: true, skipped: true }, 200, cors);
  }

  const grupoId = payment?.externalReference;
  if (!isValidUUID(grupoId)) {
    console.warn(`[webhook] externalReference inválido: ${grupoId}`);
    return json({ ok: true }, 200, cors);
  }

  // Buscar estado atual para idempotência
  const grupos = await sb(env, `grupos?id=eq.${grupoId}&select=id,status_pagamento`);
  if (!grupos || grupos.length === 0) {
    console.warn(`[webhook] Grupo não encontrado: ${grupoId}`);
    return json({ ok: true }, 200, cors);
  }

  if (grupos[0].status_pagamento === 'pago') {
    console.log(`[webhook] Ignorando regressão para grupo ${grupoId} (já pago)`);
    return json({ ok: true, skipped: 'already_paid' }, 200, cors);
  }

  // Atualizar Supabase
  await sb(env, `grupos?id=eq.${grupoId}`, 'PATCH', { status_pagamento: 'pago' });
  await sb(env, `pagamentos?grupo_id=eq.${grupoId}&status=neq.pago`, 'PATCH', {
    status: 'pago',
    gateway_id: payment.id,
  });

  console.log(`[webhook] grupo=${grupoId} status=pago payment=${payment.id}`);
  return json({ ok: true, grupoId }, 200, cors);
}

// ─── Entry point ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';
    const allowed = (env.FRONTEND_URL ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const cors   = corsHeaders(origin, allowed.length ? allowed : ['*']);

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const route = `${request.method} ${url.pathname}`;

      if (route === 'GET /api/health') {
        return json({ ok: true, ts: Date.now() }, 200, cors);
      }
      if (route === 'POST /api/pay-asaas') {
        return handlePayAsaas(request, env, cors);
      }
      if (route === 'POST /api/webhook/asaas') {
        return handleWebhookAsaas(request, env, cors);
      }

      return json({ error: 'Rota não encontrada.' }, 404, cors);

    } catch (err) {
      console.error('[worker] Erro não tratado:', err.message);
      return json({ error: 'Erro interno do servidor.' }, 500, cors);
    }
  },
};
