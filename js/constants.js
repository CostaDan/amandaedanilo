/**
 * Constantes de domínio — edite aqui para refletir em todo o sistema.
 *
 * WORKER_URL: URL do Cloudflare Worker implantado.
 *   Substituir pelo valor real após `wrangler deploy`.
 *   Ex: https://casamento-api.seu-usuario.workers.dev
 */
const APP = {
  PRICE_PER_PERSON:   95,
  EVENT_DATE_ISO:     '2026-10-10T17:30:00-03:00',
  EVENT_DATE_DISPLAY: '10 · 10 · 2026',
  EVENT_DATE_TITLE:   '10/10/2026',
  EVENT_TITLE:        'Casamento Amanda & Danilo – 10/10/2026',
  RSVP_DEADLINE:      '15/09/2026',
  MAX_GROUP_SIZE:     10,

  WORKER_URL: '',

  PIX_PAYMENT: {
    qrCode: 'qr.jpeg',
    copiaECola: '00020101021126460014br.gov.bcb.pix0124dancosta.djs@hotmail.com5204000053039865802BR5912DANILO COSTA6013ALMIRANTE TAM62070503***630454B9',
    valor: 95.00,
  },

  // Credenciais públicas do Supabase (Anon Key e URL)
  // Deixe vazio para ler do localStorage (página admin) ou preencha para fixar em produção
  SUPABASE_URL:      '',
  SUPABASE_ANON_KEY: '',
};
