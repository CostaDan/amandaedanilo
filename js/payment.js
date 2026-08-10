/**
 * Integracao de pagamentos - Asaas via Worker + PIX.
 *
 * SEGURANCA: chaves privadas do gateway nunca ficam no navegador.
 * A criacao da cobranca e delegada ao Cloudflare Worker.
 * O status real do pagamento e confirmado via webhook server-side.
 */
const Payment = {
  formatCurrency(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  },

  /**
   * Cria uma cobranca no Asaas via Worker.
   * @param {string} grupoId UUID do grupo salvo no Supabase
   * @param {Array} pessoas Lista de pessoas
   * @param {number} valor Valor total
   * @param {object} cardData Dados do cartao
   * @param {number} installments Numero de parcelas
   */
  async createAsaasPayment(grupoId, pessoas, valor, cardData, installments) {
    const workerUrl = APP.WORKER_URL;
    if (!workerUrl) {
      console.error('WORKER_URL nao configurado em APP.');
      return { success: false, reason: 'no_worker_url' };
    }

    try {
      const res = await fetch(`${workerUrl}/api/pay-asaas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grupoId, pessoas, valor, cardData, installments }),
      });

      if (res.status === 429) {
        return { success: false, reason: 'rate_limit' };
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Worker error:', err);
        return { success: false, reason: 'api_error', error: err.error };
      }

      const data = await res.json();
      return { success: true, paymentId: data.paymentId, status: data.status || 'processando' };
    } catch (e) {
      console.error('Fetch Worker error:', e);
      return { success: false, reason: 'network_error', error: e.message };
    }
  },

  /**
   * Processa retorno legado de checkout externo, quando existir.
   * IMPORTANTE: esta funcao apenas ajusta a UI. O status real no banco e
   * atualizado pelo webhook server-side, nunca pelo frontend.
   */
  handlePaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const mp = params.get('mp');
    const gid = params.get('gid');
    if (!mp || !gid) return null;

    window.history.replaceState({}, '', window.location.pathname);

    const displayStatus = mp === 'success' ? 'pago'
      : mp === 'pending' ? 'pendente'
      : 'falhou';

    return { status: displayStatus, grupoId: gid };
  },
};
