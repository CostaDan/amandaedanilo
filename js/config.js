/**
 * Gerenciamento de configuracoes do cliente.
 *
 * SEGURANCA: apenas dados publicos ou nao sensiveis devem ficar aqui.
 * - supabaseUrl / supabaseAnonKey: a anon key e publica por design; a RLS protege os dados.
 * - pixEmail: chave PIX exibida aos convidados.
 *
 * Chaves privadas do Asaas e a service role do Supabase nunca devem ser
 * armazenadas no navegador.
 */
const CONFIG_KEY = 'wedding_config_v1';

const Config = {
  _data: null,

  _load() {
    if (!this._data) {
      try { this._data = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; }
      catch { this._data = {}; }
    }
    return this._data;
  },

  _save() { localStorage.setItem(CONFIG_KEY, JSON.stringify(this._data)); },

  get(key) { return this._load()[key] || ''; },
  set(values) { this._load(); Object.assign(this._data, values); this._save(); },
  getAll() { return { ...this._load() }; },

  invalidate() {
    this._data = null;
    if (typeof resetSupabaseClient === 'function') resetSupabaseClient();
  },

  isSupabaseConfigured() {
    const d = this._load();
    return !!(APP.SUPABASE_URL || d.supabaseUrl) && !!(APP.SUPABASE_ANON_KEY || d.supabaseAnonKey);
  },

  isPixConfigured() { return !!this._load().pixEmail; },
};
