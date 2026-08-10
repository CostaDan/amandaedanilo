/** Operações com Supabase e fallback localStorage */
let _supabase = null;

function getSupabaseClient() {
  if (_supabase) return _supabase;
  const url = APP.SUPABASE_URL || Config.get('supabaseUrl');
  const key = APP.SUPABASE_ANON_KEY || Config.get('supabaseAnonKey');
  if (!url || !key) return null;
  _supabase = window.supabase.createClient(url, key);
  return _supabase;
}

function resetSupabaseClient() { _supabase = null; }

const DB = {
  async saveGroup({ responsavel, pessoas }) {
    const client = getSupabaseClient();
    if (!client) {
      // Avisa o usuário que o banco não está configurado
      console.warn('DB.saveGroup: Supabase não configurado – usando localStorage como fallback.');
      return this._saveLocal({ responsavel, pessoas });
    }
    try {
      const { data: grupo, error: gErr } = await client.from('grupos').insert({
        nome_responsavel: responsavel.nome,
        telefone_responsavel: Validators.stripMask(responsavel.telefone),
        total_pessoas: pessoas.length,
        valor_total: pessoas.length * APP.PRICE_PER_PERSON,
        status_pagamento: 'pendente',
        status_confirmacao: 'pendente'
      }).select().single();
      if (gErr) throw gErr;

      const pessoasData = pessoas.map(p => ({
        grupo_id: grupo.id,
        nome: p.nome,
        cpf: Validators.stripMask(p.cpf) || null,
        telefone: Validators.stripMask(p.telefone) || null
      }));
      const { error: pErr } = await client.from('pessoas').insert(pessoasData);
      if (pErr) throw pErr;
      return { success: true, grupoId: grupo.id };
    } catch (e) {
      console.error('DB.saveGroup:', e);
      return { success: false, error: e.message };
    }
  },

  async createPaymentRecord(grupoId, { valor, metodo, status, gatewayId }) {
    const client = getSupabaseClient();
    if (!client) return;
    await client.from('pagamentos').insert({
      grupo_id: grupoId, valor, metodo,
      status: status || 'pendente', gateway_id: gatewayId || null
    });
  },

  async updatePaymentStatus(grupoId, status, gatewayId = null) {
    const client = getSupabaseClient();
    if (!client) {
      const gs = this._getLocal();
      const g = gs.find(x => x.id === grupoId);
      if (g) { g.status_pagamento = status; this._setLocal(gs); }
      return;
    }
    await client.from('grupos').update({ status_pagamento: status }).eq('id', grupoId);
    const upd = { status };
    if (gatewayId) upd.gateway_id = gatewayId;
    await client.from('pagamentos').update(upd).eq('grupo_id', grupoId).eq('status', 'pendente');
  },

  async getGrupos() {
    const client = getSupabaseClient();
    if (!client) return this._getLocal();
    const { data, error } = await client.from('grupos')
      .select('*, pessoas(*), pagamentos(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async confirmGrupo(grupoId) {
    const client = getSupabaseClient();
    if (!client) return;
    await client.from('grupos').update({ status_confirmacao: 'confirmado' }).eq('id', grupoId);
  },

  async rejectGrupo(grupoId) {
    const client = getSupabaseClient();
    if (!client) return;
    await client.from('grupos').update({ status_confirmacao: 'rejeitado' }).eq('id', grupoId);
  },

  _saveLocal({ responsavel, pessoas }) {
    const gs = this._getLocal();
    const id = 'local_' + Date.now();
    gs.push({
      id, nome_responsavel: responsavel.nome,
      telefone_responsavel: Validators.stripMask(responsavel.telefone),
      total_pessoas: pessoas.length,
      valor_total: pessoas.length * APP.PRICE_PER_PERSON,
      status_pagamento: 'pendente', status_confirmacao: 'pendente',
      created_at: new Date().toISOString(),
      pessoas: pessoas.map((p, i) => ({
        id: 'lp_' + i + '_' + Date.now(), grupo_id: id,
        nome: p.nome, cpf: Validators.stripMask(p.cpf),
        telefone: Validators.stripMask(p.telefone)
      }))
    });
    this._setLocal(gs);
    return { success: true, grupoId: id, isLocal: true };
  },

  _getLocal() {
    try { return JSON.parse(localStorage.getItem('wedding_groups')) || []; }
    catch { return []; }
  },

  _setLocal(data) { localStorage.setItem('wedding_groups', JSON.stringify(data)); }
};
