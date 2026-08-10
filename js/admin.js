/** Painel Administrativo — Auth, Dashboard, Config */
const Admin = {
  supabase: null,
  grupos:   [],

  /**
   * SEGURANÇA: init() sempre começa com ambos os painéis ocultos.
   * Nenhum conteúdo do dashboard é exibido antes do await getSession().
   * O inline script no HTML que usava hash para decidir visibilidade foi removido.
   */
  async init() {
    // Garantir estado inicial seguro independente do hash da URL
    document.getElementById('auth-page').style.display        = 'none';
    document.getElementById('dashboard-section').style.display = 'none';

    this.supabase = this._getClient();

    if (!this.supabase) {
      // Supabase não configurado — mostrar login com aviso
      this._showAuth();
      return;
    }

    // Verificar sessão ANTES de exibir qualquer painel
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session) {
        await this._showDashboard(session);
      } else {
        this._showAuth();
      }
    } catch (e) {
      console.error('Erro ao verificar sessão:', e.message);
      this._showAuth();
    }
  },

  _getClient() {
    const url = APP.SUPABASE_URL || Config.get('supabaseUrl');
    const key = APP.SUPABASE_ANON_KEY || Config.get('supabaseAnonKey');
    if (!url || !key) return null;
    return window.supabase?.createClient(url, key) || null;
  },

  _showAuth() {
    document.getElementById('auth-page').style.display        = 'flex';
    document.getElementById('dashboard-section').style.display = 'none';
  },

  async _showDashboard(session) {
    document.getElementById('auth-page').style.display        = 'none';
    document.getElementById('dashboard-section').style.display = 'flex';
    const emailEl = document.getElementById('admin-email');
    if (emailEl) emailEl.textContent = session?.user?.email || '';
    this.loadConfig();
    await this.loadGrupos();
    this.bindDashboardEvents();
  },

  /* ── LOGIN ── */
  async login() {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-pass').value;
    const btn   = document.getElementById('btn-login');

    if (!email || !pass) {
      this._alert('login-alert', 'Preencha email e senha.', 'error');
      return;
    }

    btn.disabled = true; btn.textContent = 'Entrando...';

    if (!this.supabase) {
      this._alert('login-alert', 'Configure as credenciais do Supabase primeiro.', 'error');
      btn.disabled = false; btn.textContent = 'Entrar';
      return;
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({ email, password: pass });
      if (error) {
        // Mensagem genérica — não revelar se o email existe (anti-enumeração)
        this._alert('login-alert', 'Credenciais inválidas.', 'error');
        btn.disabled = false; btn.textContent = 'Entrar';
      } else {
        await this._showDashboard(data.session);
      }
    } catch (e) {
      this._alert('login-alert', 'Erro de conexão. Tente novamente.', 'error');
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  },

  /* ── DASHBOARD ── */
  bindDashboardEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab)?.classList.add('active');
      });
    });
  },

  switchTab(btn) {
    const tabId = btn.dataset.tab;
    document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tabId)?.classList.add('active');
  },

  async logout() {
    await this.supabase?.auth.signOut();
    this._showAuth();
  },

  /* ── GRUPOS ── */
  async loadGrupos() {
    const loadingEl = document.getElementById('loading-grupos');
    if (loadingEl) loadingEl.style.display = 'block';
    try {
      this.grupos = await DB.getGrupos();
      this.renderStats();
      this.renderGrupos();
    } catch (e) {
      console.error('loadGrupos:', e.message);
      const tbody = document.getElementById('grupos-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="td-error">Erro ao carregar. Verifique as configurações.</td></tr>';
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  },

  renderStats() {
    const total       = this.grupos.length;
    const totalPessoas = this.grupos.reduce((a, g) => a + (g.total_pessoas || 0), 0);
    const totalPago   = this.grupos.filter(g => this._paymentStatus(g) === 'pago').reduce((a, g) => a + (g.valor_total || 0), 0);
    const pendentes   = this.grupos.filter(g => this._paymentStatus(g) !== 'pago').length;
    document.getElementById('stat-grupos').textContent      = total;
    document.getElementById('stat-pessoas').textContent     = totalPessoas;
    document.getElementById('stat-arrecadado').textContent  = Payment.formatCurrency(totalPago);
    document.getElementById('stat-pendentes').textContent   = pendentes;
  },

  renderGrupos(filter = '') {
    const renderTo = (tbodyId) => {
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      let gs = this.grupos;
      if (filter) gs = gs.filter(g => g.nome_responsavel?.toLowerCase().includes(filter.toLowerCase()));
      if (!gs.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="td-empty">Nenhum grupo cadastrado ainda.</td></tr>';
        return;
      }
      tbody.innerHTML = gs.map(g => `
        <tr>
          <td><strong>${this._esc(g.nome_responsavel)}</strong><br><small>${this._esc(Validators.formatPhone(g.telefone_responsavel || ''))}</small></td>
          <td class="tc">${Number(g.total_pessoas)}</td>
          <td class="tc">${this._esc(Payment.formatCurrency(g.valor_total))}</td>
          <td class="tc"><span class="badge badge-${this._esc(this._paymentStatus(g))}">${this._esc(this._labelPag(this._paymentStatus(g)))}</span></td>
          <td class="tc"><span class="badge badge-${this._esc(g.status_confirmacao)}">${this._esc(this._labelConf(g.status_confirmacao))}</span></td>
          <td class="tc"><small>${this._esc(new Date(g.created_at).toLocaleDateString('pt-BR'))}</small></td>
          <td class="tc">
            <button class="btn-action" onclick="Admin.viewGrupo('${this._esc(g.id)}')">Ver</button>
            ${g.status_confirmacao !== 'confirmado' ? `<button class="btn-action btn-confirm" onclick="Admin.confirmGrupo('${this._esc(g.id)}')">✓ Confirmar</button>` : ''}
          </td>
        </tr>`).join('');
    };
    renderTo('grupos-body');
    renderTo('grupos-body-2');
  },

  _esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  _paymentStatus(g) {
    if (g.status_pagamento && g.status_pagamento !== 'pendente') return g.status_pagamento;
    const payments = Array.isArray(g.pagamentos) ? g.pagamentos : [];
    if (payments.some(p => p.metodo === 'pix' && p.status === 'pendente')) return 'pendente_pix';
    if (payments.some(p => p.metodo === 'cartao' && p.status === 'processando')) return 'processando';
    return g.status_pagamento || 'pendente';
  },

  _labelPag(s)  { return { pago: 'Pago', processando: 'Processando', pendente: 'Pendente', pendente_pix: 'PIX Enviado', falhou: 'Falhou', reembolsado: 'Reembolsado' }[s] || (s || '—'); },
  _labelConf(s) { return { confirmado: 'Confirmado', pendente: 'Pendente', rejeitado: 'Rejeitado' }[s] || (s || '—'); },

  viewGrupo(id) {
    // Validar UUID antes de buscar
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    const g = this.grupos.find(x => x.id === id);
    if (!g) return;
    const modal = document.getElementById('modal-grupo');
    document.getElementById('modal-title').textContent = `Grupo de ${g.nome_responsavel}`;
    document.getElementById('modal-body').innerHTML = `
      <div class="modal-info-grid">
        <div><strong>Responsável</strong><span>${this._esc(g.nome_responsavel)}</span></div>
        <div><strong>Telefone</strong><span>${this._esc(Validators.formatPhone(g.telefone_responsavel || ''))}</span></div>
        <div><strong>Pessoas</strong><span>${Number(g.total_pessoas)}</span></div>
        <div><strong>Valor Total</strong><span>${this._esc(Payment.formatCurrency(g.valor_total))}</span></div>
        <div><strong>Pagamento</strong><span class="badge badge-${this._esc(g.status_pagamento)}">${this._esc(this._labelPag(g.status_pagamento))}</span></div>
        <div><strong>Confirmação</strong><span class="badge badge-${this._esc(g.status_confirmacao)}">${this._esc(this._labelConf(g.status_confirmacao))}</span></div>
      </div>
      <h4>Pessoas do Grupo</h4>
      <table class="modal-table">
        <thead><tr><th>Nome</th><th>CPF</th><th>Telefone</th></tr></thead>
        <tbody>${(g.pessoas || []).map(p => `
          <tr>
            <td>${this._esc(p.nome)}</td>
            <td>${this._esc(Validators.formatCPF(p.cpf))}</td>
            <td>${this._esc(Validators.formatPhone(p.telefone))}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    modal.style.display = 'flex';
  },

  closeModal() { document.getElementById('modal-grupo').style.display = 'none'; },

  async confirmGrupo(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    if (!confirm('Confirmar presença deste grupo?')) return;
    await DB.confirmGrupo(id);
    await this.loadGrupos();
  },

  filterGrupos(val) { this.renderGrupos(val); },

  exportCSV() {
    const rows = [['Responsável', 'Telefone', 'Pessoas', 'Valor', 'Pagamento', 'Confirmação', 'Data']];
    this.grupos.forEach(g => rows.push([
      g.nome_responsavel,
      Validators.formatPhone(g.telefone_responsavel || ''),
      g.total_pessoas, g.valor_total,
      g.status_pagamento, g.status_confirmacao,
      new Date(g.created_at).toLocaleDateString('pt-BR'),
    ]));
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `convidados_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /* ── CONFIG ── */
  async loadConfig() {
    // Local configs
    const c   = Config.getAll();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('cfg-supabase-url', c.supabaseUrl);
    set('cfg-supabase-key', c.supabaseAnonKey);
    set('cfg-pix', c.pixEmail);

    // DB configs (Asaas)
    if (this.supabase) {
      try {
        const { data } = await this.supabase.from('configuracoes').select('*').limit(1).maybeSingle();
        if (data) {
          document.getElementById('cfg-asaas-env').value = data.asaas_env || 'sandbox';
          set('cfg-asaas-prod', data.asaas_key_prod);
          set('cfg-asaas-sand', data.asaas_key_sandbox);
          set('cfg-asaas-webhook', data.asaas_webhook_token);
        }
      } catch (e) {
        console.error('Erro ao carregar configuracoes do BD:', e.message);
      }
    }
  },

  async saveConfig() {
    Config.set({
      supabaseUrl:     document.getElementById('cfg-supabase-url')?.value.trim() || '',
      supabaseAnonKey: document.getElementById('cfg-supabase-key')?.value.trim() || '',
      pixEmail:        document.getElementById('cfg-pix')?.value.trim()          || '',
    });
    Config.invalidate();
    this.supabase = this._getClient();

    if (this.supabase) {
      try {
        const cfgDb = {
          id: 1,
          asaas_env: document.getElementById('cfg-asaas-env')?.value || 'sandbox',
          asaas_key_prod: document.getElementById('cfg-asaas-prod')?.value.trim() || '',
          asaas_key_sandbox: document.getElementById('cfg-asaas-sand')?.value.trim() || '',
          asaas_webhook_token: document.getElementById('cfg-asaas-webhook')?.value.trim() || ''
        };
        await this.supabase.from('configuracoes').upsert(cfgDb);
      } catch (e) {
        console.error('Erro ao salvar configuracoes no BD:', e.message);
      }
    }

    this._alert('cfg-alert', '✓ Configurações salvas! Recarregue a página para aplicar.', 'success');
  },

  /**
   * SQL de configuração do banco — RLS corrigida.
   * CORREÇÃO: Removido UPDATE público irrestrito.
   * O Worker usa service_role key (bypassa RLS) para atualizar status via webhook.
   */
  copySQL() {
    fetch('schema.sql')
      .then(res => {
        if (!res.ok) throw new Error('schema.sql nao encontrado');
        return res.text();
      })
      .then(sql => navigator.clipboard.writeText(sql))
      .then(() => {
        this._alert('cfg-alert', 'SQL copiado. Cole no Supabase SQL Editor e execute.', 'success');
      })
      .catch(() => {
        this._alert('cfg-alert', 'Nao foi possivel copiar o schema.sql.', 'error');
      });
    return;

    const sql = `-- ═══════════════════════════════════════════════════════
-- SQL de configuração do Supabase — Casamento Noiva & Noivo
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════

-- ── Tabelas ──────────────────────────────────────────────
create table if not exists grupos (
  id                   uuid        default gen_random_uuid() primary key,
  nome_responsavel     text        not null,
  telefone_responsavel text        not null,
  total_pessoas        int         not null default 1,
  valor_total          numeric     not null,
  status_pagamento     text        not null default 'pendente',
  status_confirmacao   text        not null default 'pendente',
  created_at           timestamptz default now(),
  constraint chk_max_pessoas check (total_pessoas between 1 and ${APP.MAX_GROUP_SIZE}),
  constraint chk_status_pag  check (status_pagamento in ('pendente','pago','pendente_pix','falhou','reembolsado')),
  constraint chk_status_conf check (status_confirmacao in ('pendente','confirmado','rejeitado'))
);

create table if not exists pessoas (
  id                uuid default gen_random_uuid() primary key,
  grupo_id          uuid not null references grupos(id) on delete cascade,
  nome              text not null,
  cpf               text,
  telefone          text,
  asaas_customer_id text,
  asaas_card_token  text,
  constraint unique_cpf unique (cpf)
);

create table if not exists pagamentos (
  id         uuid        default gen_random_uuid() primary key,
  grupo_id   uuid        not null references grupos(id) on delete cascade,
  valor      numeric     not null,
  metodo     text        not null,
  status     text        not null default 'pendente',
  gateway_id text,
  created_at timestamptz default now(),
  constraint chk_metodo check (metodo in ('cartao','pix'))
);

create table if not exists configuracoes (
  id                  int primary key default 1,
  asaas_env           text default 'sandbox',
  asaas_key_prod      text,
  asaas_key_sandbox   text,
  asaas_webhook_token text,
  constraint chk_id check (id = 1)
);

-- ── Índices ───────────────────────────────────────────────
create index if not exists idx_pessoas_grupo_id       on pessoas(grupo_id);
create index if not exists idx_pessoas_cpf            on pessoas(cpf);
create index if not exists idx_pagamentos_grupo_id    on pagamentos(grupo_id);
create index if not exists idx_grupos_status_pag      on grupos(status_pagamento);
create index if not exists idx_grupos_created_at      on grupos(created_at desc);

-- ── Row Level Security ────────────────────────────────────
alter table grupos     enable row level security;
alter table pessoas       enable row level security;
alter table pagamentos    enable row level security;
alter table configuracoes enable row level security;

-- ── Políticas: convidados (anônimos) podem APENAS inserir e ler certas configs ──
-- Leitura pública BLOQUEADA — nenhum convidado vê dados de outros.
-- UPDATE público REMOVIDO — o Cloudflare Worker usa service_role key
-- (que bypassa RLS) para atualizar status via webhook.

create policy "anon_insert_grupos"     on grupos     for insert to anon with check (true);
create policy "anon_select_grupos"     on grupos     for select to anon using (true);
create policy "anon_insert_pessoas"    on pessoas    for insert to anon with check (true);
create policy "anon_insert_pagamentos" on pagamentos for insert to anon with check (true);

-- ── Políticas: admin autenticado tem acesso total ──────────
create policy "auth_all_grupos"        on grupos        for all to authenticated using (true) with check (true);
create policy "auth_all_pessoas"       on pessoas       for all to authenticated using (true) with check (true);
create policy "auth_all_pagamentos"    on pagamentos    for all to authenticated using (true) with check (true);
create policy "auth_all_configuracoes" on configuracoes for all to authenticated using (true) with check (true);

-- ── Fim ───────────────────────────────────────────────────
-- Após executar, crie um usuário admin em:
--   Supabase Dashboard → Authentication → Users → Add User`;
    navigator.clipboard.writeText(sql).then(() => {
      this._alert('cfg-alert', '✓ SQL copiado! Cole no Supabase → SQL Editor e execute.', 'success');
    });
  },

  _alert(elId, msg, type) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.className   = `admin-alert admin-alert-${type}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 6000);
  },
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
