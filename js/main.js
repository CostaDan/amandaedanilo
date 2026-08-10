/** Lógica principal da landing page — fluxo RSVP */
const App = {
  state: { step: 0, mode: null, pessoas: [], grupoId: null, valor: 0 },
  _countdownInterval: null,

  init() {
    this.initCountdown();
    this.initScrollAnimations();
    this.checkPaymentReturn();
  },

  initCountdown() {
    const target = new Date(APP.EVENT_DATE_ISO);
    const el     = document.getElementById('countdown');
    if (!el) return;
    const pad  = n => String(n).padStart(2, '0');
    const tick = () => {
      const diff = target - new Date();
      if (diff <= 0) {
        el.innerHTML = '<div class="cdown-done">O grande dia chegou! 💍</div>';
        clearInterval(this._countdownInterval);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.innerHTML = `
        <div class="cd-item"><span class="cd-num">${d}</span><span class="cd-lbl">Dias</span></div>
        <span class="cd-sep">·</span>
        <div class="cd-item"><span class="cd-num">${pad(h)}</span><span class="cd-lbl">Horas</span></div>
        <span class="cd-sep">·</span>
        <div class="cd-item"><span class="cd-num">${pad(m)}</span><span class="cd-lbl">Min</span></div>
        <span class="cd-sep">·</span>
        <div class="cd-item"><span class="cd-num">${pad(s)}</span><span class="cd-lbl">Seg</span></div>`;
    };
    tick();
    this._countdownInterval = setInterval(tick, 1000);
  },

  initScrollAnimations() {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.12 });
    document.querySelectorAll('.fade-in').forEach(el => obs.observe(el));
  },

  checkPaymentReturn() {
    // Payment.handlePaymentReturn() é síncrono — apenas lê URL params para UI.
    // O banco é atualizado pelo webhook server-side, nunca aqui.
    const result = Payment.handlePaymentReturn();
    if (!result) return;
    if (result.status === 'pago')    this.showStep('step-5-card');
    else if (result.status === 'falhou') this.showStep('step-error');
    else this.showStep('step-5-pending');
    setTimeout(() => document.getElementById('confirmacao')?.scrollIntoView({ behavior: 'smooth' }), 400);
  },

  /* ── Flow Control ── */
  startFlow(mode) {
    this.state.mode   = mode;
    this.state.pessoas = [this._emptyPessoa()];
    this.renderPessoas();
    this.showStep('step-2');
  },

  _emptyPessoa() { return { nome: '', cpf: '', telefone: '' }; },

  addPessoa() {
    if (this.state.pessoas.length >= APP.MAX_GROUP_SIZE) {
      alert(`Máximo de ${APP.MAX_GROUP_SIZE} pessoas por grupo.`);
      return;
    }
    this.state.pessoas.push(this._emptyPessoa());
    this.renderPessoas();
    setTimeout(() => {
      const forms = document.querySelectorAll('.person-form');
      if (forms.length) forms[forms.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  },

  removePessoa(i) {
    if (this.state.pessoas.length <= 1) return;
    this.state.pessoas.splice(i, 1);
    this.renderPessoas();
  },

  /** Escape de HTML — previne XSS ao inserir dados do usuário via innerHTML */
  _esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  renderPessoas() {
    const c = document.getElementById('pessoas-container');
    if (!c) return;
    c.innerHTML = this.state.pessoas.map((p, i) => `
      <div class="person-form fade-in visible" id="pf-${i}">
        <div class="person-form-header">
          <span class="person-badge">${i === 0 ? '👑 Responsável' : `👤 Convidado ${i + 1}`}</span>
          ${i > 0 ? `<button class="btn-remove-person" onclick="App.removePessoa(${i})" title="Remover">✕</button>` : ''}
        </div>
        <div class="form-group">
          <label for="nome-${i}">Nome Completo *</label>
          <input type="text" id="nome-${i}" placeholder="Nome Sobrenome" value="${this._esc(p.nome)}"
            oninput="App.updateField(${i},'nome',this.value)" class="form-input" autocomplete="name"/>
          <small class="field-hint">Informe nome e sobrenome</small>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="cpf-${i}">CPF ${i === 0 ? '*' : '(Opcional)'}</label>
            <input type="text" id="cpf-${i}" placeholder="000.000.000-00"
              value="${this._esc(Validators.formatCPF(p.cpf))}" maxlength="14" inputmode="numeric"
              oninput="App.handleCPF(${i},this)" class="form-input"/>
          </div>
          <div class="form-group">
            <label for="tel-${i}">Telefone ${i === 0 ? '*' : '(Opcional)'}</label>
            <input type="tel" id="tel-${i}" placeholder="(00) 00000-0000"
              value="${this._esc(Validators.formatPhone(p.telefone))}" maxlength="15" inputmode="numeric"
              oninput="App.handlePhone(${i},this)" class="form-input" autocomplete="tel"/>
          </div>
        </div>
      </div>`).join('');
    this.updateLiveTotal();
  },

  updateField(i, field, val) { this.state.pessoas[i][field] = val; this.updateLiveTotal(); },

  handleCPF(i, input) {
    Validators.applyMask(input, v => Validators.formatCPF(v));
    this.state.pessoas[i].cpf = input.value;
  },

  handlePhone(i, input) {
    Validators.applyMask(input, v => Validators.formatPhone(v));
    this.state.pessoas[i].telefone = input.value;
  },

  handleCCNumber(input) {
    let v = input.value.replace(/\D/g, '');
    v = v.replace(/(\d{4})(?=\d)/g, '$1 ');
    input.value = v;
  },

  handleCCExpiry(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
    input.value = v;
  },

  updateLiveTotal() {
    const n  = this.state.pessoas.length;
    const el = document.getElementById('live-total');
    if (el) el.textContent = Payment.formatCurrency(n * APP.PRICE_PER_PERSON);
  },

  _collectDOM() {
    this.state.pessoas = this.state.pessoas.map((p, i) => ({
      nome:     document.getElementById(`nome-${i}`)?.value.trim() || p.nome,
      cpf:      document.getElementById(`cpf-${i}`)?.value        || p.cpf,
      telefone: document.getElementById(`tel-${i}`)?.value        || p.telefone,
    }));
  },

  validateStep2() {
    this._collectDOM();
    const errs = [];
    this.state.pessoas.forEach((p, i) => {
      const lbl = i === 0 ? 'Responsável' : `Convidado ${i + 1}`;
      const nm  = document.getElementById(`nome-${i}`);
      const cp  = document.getElementById(`cpf-${i}`);
      const tl  = document.getElementById(`tel-${i}`);
      
      // Nome sempre obrigatório
      if (!Validators.validateName(p.nome)) { errs.push(`${lbl}: nome e sobrenome obrigatórios`); nm?.classList.add('error'); } else nm?.classList.remove('error');
      
      // CPF e Telefone obrigatórios apenas para o Responsável (i === 0)
      if (i === 0) {
        if (!Validators.validateCPF(p.cpf)) { errs.push(`${lbl}: CPF inválido`); cp?.classList.add('error'); } else cp?.classList.remove('error');
        if (!Validators.validatePhone(p.telefone)) { errs.push(`${lbl}: telefone inválido`); tl?.classList.add('error'); } else tl?.classList.remove('error');
      } else {
        // Para convidados, se preencheu, valida. Se não, passa.
        if (p.cpf && !Validators.validateCPF(p.cpf)) { errs.push(`${lbl}: CPF inválido`); cp?.classList.add('error'); } else cp?.classList.remove('error');
        if (p.telefone && !Validators.validatePhone(p.telefone)) { errs.push(`${lbl}: telefone inválido`); tl?.classList.add('error'); } else tl?.classList.remove('error');
      }
    });

    const errEl = document.getElementById('form-errors');
    if (errs.length) {
      // FIX XSS: usar textContent em cada <li>, não innerHTML com dados brutos
      errEl.innerHTML = '';
      errs.forEach(msg => {
        const li = document.createElement('li');
        li.textContent = msg;
        errEl.appendChild(li);
      });
      errEl.style.display = 'block';
      errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return false;
    }
    errEl.innerHTML      = '';
    errEl.style.display  = 'none';
    return true;
  },

  async goToStep3() {
    if (!this.validateStep2()) return;
    const n        = this.state.pessoas.length;
    this.state.valor = n * APP.PRICE_PER_PERSON;
    const priceStr = Payment.formatCurrency(APP.PRICE_PER_PERSON);
    const rl       = document.getElementById('review-list');
    if (rl) {
      rl.innerHTML = this.state.pessoas.map((p, i) => `
        <div class="review-item">
          <div class="review-left">
            <span class="review-icon">${i === 0 ? '👑' : '👤'}</span>
            <div>
              <strong>${this._esc(p.nome)}</strong>
              <span class="review-meta">CPF: ${this._esc(Validators.formatCPF(p.cpf))} · ${this._esc(Validators.formatPhone(p.telefone))}</span>
            </div>
          </div>
          <span class="review-price">R$&nbsp;${APP.PRICE_PER_PERSON},00</span>
        </div>`).join('');
    }
    document.getElementById('total-value').textContent  = Payment.formatCurrency(this.state.valor);
    document.getElementById('total-people').textContent = `${n} pessoa${n > 1 ? 's' : ''} × ${priceStr}`;
    this.showStep('step-3');
  },

  async goToStep4() {
    const btn = document.getElementById('btn-step3');
    btn.disabled    = true;
    btn.textContent = 'Salvando...';
    try {
      const result = await DB.saveGroup({ responsavel: this.state.pessoas[0], pessoas: this.state.pessoas });
      if (!result.success) throw new Error(result.error || 'Erro ao salvar');

      if (result.isLocal) {
        const alertEl = document.getElementById('pay-alert');
        if (alertEl) {
          alertEl.textContent = '⚠️ Banco de dados não configurado. Dados salvos localmente neste dispositivo.';
          alertEl.style.display = 'block';
        }
      }

      this.state.grupoId = result.grupoId;

      // Mostrar opções de pagamento disponíveis
      const hasPix = Config.isPixConfigured();
      const hasCC  = !!(APP.WORKER_URL); // Worker disponível = cartão disponível

      document.getElementById('cc-option').style.display    = hasCC  ? 'block' : 'none';
      document.getElementById('pix-option').style.display   = hasPix ? 'block' : 'none';
      document.getElementById('no-pay-warn').style.display  = (!hasCC && !hasPix) ? 'block' : 'none';
      
      if (hasPix) document.getElementById('pix-key-display').textContent = Config.get('pixEmail');
      document.getElementById('pay-valor').textContent = Payment.formatCurrency(this.state.valor);

      if (hasCC) {
        const select = document.getElementById('cc-installments');
        select.innerHTML = '';
        for (let i = 1; i <= Math.min(3, Math.floor(this.state.valor / 5) || 1); i++) {
          const valParcela = this.state.valor / i;
          select.innerHTML += `<option value="${i}">${i}x de ${Payment.formatCurrency(valParcela)}${i===1?' (à vista)':''}</option>`;
        }
      }

      this.showStep('step-4');
    } catch (e) {
      alert('Erro ao processar sua inscrição. Tente novamente.');
      console.error('goToStep4:', e.message);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Continuar para Pagamento →';
    }
  },

  showCreditContact() {
    CreditContactModal.open();
  },

  async payWithAsaas() {
    const btn = document.getElementById('btn-pay-cc');
    const name = document.getElementById('cc-name').value.trim();
    const number = document.getElementById('cc-number').value.replace(/\D/g, '');
    const expiry = document.getElementById('cc-expiry').value.trim();
    const cvv = document.getElementById('cc-cvv').value.trim();
    const installments = parseInt(document.getElementById('cc-installments').value, 10) || 1;

    if (!name || number.length < 13 || expiry.length !== 5 || cvv.length < 3) {
      alert('Preencha corretamente todos os dados do cartão.');
      return;
    }

    const [expMonth, expYear] = expiry.split('/');

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Processando...';

    const cardData = {
      holderName: name,
      number: number,
      expiryMonth: expMonth,
      expiryYear: expYear,
      ccv: cvv
    };

    const result = await Payment.createAsaasPayment(
      this.state.grupoId,
      this.state.pessoas,
      this.state.valor,
      cardData,
      installments
    );

    if (result.success) {
      this.showStep('step-5-pending');
    } else {
      const alertEl = document.getElementById('pay-alert');
      const msgs = {
        rate_limit:   'Muitas tentativas. Aguarde 1 minuto e tente novamente.',
        network_error:'Erro de conexão. Verifique sua internet.',
        no_worker_url:'Pagamento por cartão não configurado. Use PIX.',
      };
      alertEl.textContent   = msgs[result.reason] || result.error || 'Erro ao processar pagamento. Verifique os dados do cartão ou tente o PIX.';
      alertEl.style.display = 'block';
      btn.disabled  = false;
      btn.innerHTML = '💳 Pagar com Cartão';
    }
  },

  async pixPago() {
    const btn = document.getElementById('btn-pix-pago');
    btn.disabled    = true;
    btn.textContent = 'Registrando...';
    try {
      await DB.createPaymentRecord(this.state.grupoId, {
        valor: this.state.valor, metodo: 'pix',
        status: 'pendente', gatewayId: null,
      });
      await DB.updatePaymentStatus(this.state.grupoId, 'pendente_pix');
      this.showStep('step-5-pix');
    } catch (e) {
      alert('Erro ao registrar. Tente novamente.');
      btn.disabled    = false;
      btn.textContent = 'Já realizei o pagamento via PIX';
    }
  },

  showStep(id) {
    document.querySelectorAll('.rsvp-step').forEach(s => {
      s.style.display = 'none';
      s.classList.remove('step-active');
    });
    const s = document.getElementById(id);
    if (s) { s.style.display = 'block'; s.classList.add('step-active'); }
    const stepMap = {
      'step-1': 1, 'step-2': 2, 'step-3': 3, 'step-4': 4,
      'step-5-card': 5, 'step-5-pix': 5, 'step-5-pending': 5, 'step-error': 5,
    };
    const n = stepMap[id] || 1;
    document.querySelectorAll('.progress-dot').forEach((d, i) => d.classList.toggle('active', i < n));
    setTimeout(() => document.getElementById('confirmacao')?.scrollIntoView({ behavior: 'smooth' }), 100);
  },

  goBack(stepId) { this.showStep(stepId); },
};

const PaymentModal = {
  backdrop: null,
  modal: null,
  giftNameEl: null,
  linkInput: null,
  selectedMethod: '',
  currentButton: null,

  init() {
    this.backdrop = document.getElementById('payment-modal-backdrop');
    this.modal = this.backdrop?.querySelector('.payment-modal');
    this.giftNameEl = document.getElementById('payment-modal-gift-name');
    this.linkInput = document.getElementById('payment-link-input');

    if (!this.backdrop || !this.modal) return;

    this.backdrop.hidden = true;

    window.buyGift = (giftId) => {
      const button = document.querySelector(`.btn-buy[data-gift-id="${giftId}"]`);
      if (button) this.open(button);
    };

    this.backdrop.addEventListener('click', (event) => {
      if (event.target === this.backdrop) {
        this.close();
      }
    });

    document.addEventListener('click', (event) => {
      const button = event.target.closest('.btn-buy');
      if (button) {
        event.preventDefault();
        this.open(button);
      }
    });

    this.backdrop.querySelectorAll('.payment-method-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.selectMethod(btn.dataset.method);
      });
    });

    this.backdrop.querySelector('[data-action="cancel"]').addEventListener('click', (event) => {
      event.stopPropagation();
      this.close();
    });
    this.backdrop.querySelector('.payment-modal-close').addEventListener('click', (event) => {
      event.stopPropagation();
      this.close();
    });
    this.backdrop.querySelector('[data-action="save"]').addEventListener('click', (event) => {
      event.stopPropagation();
      this.save();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.backdrop.hasAttribute('hidden')) {
        this.close();
      }
    });
  },

  open(button) {
    if (!button) return;
    this.currentButton = button;
    const giftItem = button.closest('.gift-item');
    const giftTitle = giftItem?.querySelector('h3')?.textContent?.trim() || 'este presente';
    this.giftNameEl.textContent = giftTitle;
    // Não pré-selecionar método — usuário escolherá PIX ou Cartão no modal
    this.selectedMethod = '';
    this.linkInput.value = '';
    this.updateMethodButtons();
    this.backdrop.hidden = false;
    document.body.classList.add('modal-open');
    this.linkInput.focus();
  },

  close() {
    this.backdrop.hidden = true;
    document.body.classList.remove('modal-open');
    this.currentButton = null;
    this.selectedMethod = '';
    this.linkInput.value = '';
    this.updateMethodButtons();
  },

  // Abre o modal para um `gift-item` específico (edição por produto)
  openFor(giftItem, method) {
    if (!giftItem) return;
    this.currentGiftItem = giftItem;
    this.currentButton = null;
    const giftTitle = giftItem.querySelector('h3')?.textContent?.trim() || 'este presente';
    this.giftNameEl.textContent = giftTitle;
    this.selectedMethod = method || '';
    if (this.selectedMethod === 'pix') this.linkInput.value = giftItem.dataset.pixLink || '';
    else if (this.selectedMethod === 'cartao') this.linkInput.value = giftItem.dataset.ccLink || '';
    else this.linkInput.value = '';
    this.updateMethodButtons();
    this.backdrop.hidden = false;
    document.body.classList.add('modal-open');
    this.linkInput.focus();
  },

  selectMethod(method) {
    // Se existe um botão/itens atuais, tentamos abrir o link configurado
    const giftItem = this.currentGiftItem || this.currentButton?.closest('.gift-item');
    if (giftItem) {
      if (method === 'pix') {
        if (giftItem.dataset.pixLink) {
          window.open(giftItem.dataset.pixLink, '_blank');
        } else {
          // Usa o modal PIX manual global quando o presente não tem PIX próprio
          this.close();
          PixManualModal.open();
          return;
        }
        this.close();
        return;
      }
      if (method === 'cartao') {
        if (giftItem.dataset.ccLink) {
          window.open(giftItem.dataset.ccLink, '_blank');
        } else {
          alert('Link de Cartão não configurado para este presente.');
        }
        this.close();
        return;
      }
    }
    // Caso não exista link configurado, apenas selecionamos o método para edição
    this.selectedMethod = method;
    this.updateMethodButtons();
  },

  updateMethodButtons() {
    this.backdrop.querySelectorAll('.payment-method-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.method === this.selectedMethod);
    });
  },

  save() {
    if (!this.currentButton && !this.currentGiftItem) return;

    if (!this.selectedMethod) {
      this.backdrop.querySelector('.payment-method-options').classList.add('shake');
      setTimeout(() => this.backdrop.querySelector('.payment-method-options').classList.remove('shake'), 400);
      return;
    }

    const link = this.linkInput.value.trim();
    // Salvar o link no dataset do gift-item (prioriza edição por produto)
    const target = this.currentGiftItem || this.currentButton?.closest('.gift-item');
    if (target) {
      if (this.selectedMethod === 'pix') target.dataset.pixLink = link;
      else if (this.selectedMethod === 'cartao') target.dataset.ccLink = link;
      target.classList.add('gift-configured');
    }
    this.currentButton = null;
    this.currentGiftItem = null;
    this.close();
  },
  async pixPago() {
    const btn = document.getElementById('btn-pix-pago');
    btn.disabled    = true;
    btn.textContent = 'Registrando...';
    try {
      await DB.createPaymentRecord(this.state.grupoId, {
        valor: this.state.valor, metodo: 'pix',
        status: 'pendente', gatewayId: null,
      });
      await DB.updatePaymentStatus(this.state.grupoId, 'pendente_pix');
      this.showStep('step-5-pix');
    } catch (e) {
      alert('Erro ao registrar. Tente novamente.');
      btn.disabled    = false;
      btn.textContent = 'Já realizei o pagamento via PIX';
    }
  },

  showStep(id) {
    document.querySelectorAll('.rsvp-step').forEach(s => {
      s.style.display = 'none';
      s.classList.remove('step-active');
    });
    const s = document.getElementById(id);
    if (s) { s.style.display = 'block'; s.classList.add('step-active'); }
    const stepMap = {
      'step-1': 1, 'step-2': 2, 'step-3': 3, 'step-4': 4,
      'step-5-card': 5, 'step-5-pix': 5, 'step-5-pending': 5, 'step-error': 5,
    };
    const n = stepMap[id] || 1;
    document.querySelectorAll('.progress-dot').forEach((d, i) => d.classList.toggle('active', i < n));
    setTimeout(() => document.getElementById('confirmacao')?.scrollIntoView({ behavior: 'smooth' }), 100);
  },

  goBack(stepId) { this.showStep(stepId); },
};

const PixManualModal = {
  backdrop: null,
  btnCopy: null,
  codeInput: null,

  init() {
    this.backdrop = document.getElementById('pix-manual-backdrop');
    this.btnCopy = document.getElementById('pix-manual-btn-copy');
    this.codeInput = document.getElementById('pix-manual-code');
    
    if (!this.backdrop) return;
    
    // Configura listeners de fechamento
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });
    
    const closeBtn = document.getElementById('pix-manual-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.backdrop.hasAttribute('hidden')) {
        this.close();
      }
    });

    // Listener de cópia
    if (this.btnCopy) {
      this.btnCopy.addEventListener('click', () => this.copyCode());
    }
  },

  open() {
    // Configura os valores definidos manualmente
    const imgEl = document.getElementById('pix-manual-qr-img');
    const valueEl = document.getElementById('pix-manual-value');
    
    if (imgEl) imgEl.src = APP.PIX_PAYMENT.qrCode;
    if (valueEl) valueEl.textContent = Payment.formatCurrency(APP.PIX_PAYMENT.valor);
    if (this.codeInput) this.codeInput.value = APP.PIX_PAYMENT.copiaECola;

    this.backdrop.hidden = false;
    document.body.classList.add('modal-open');
    setTimeout(() => this.btnCopy?.focus(), 0);
  },

  close() {
    this.backdrop.hidden = true;
    document.body.classList.remove('modal-open');
    if (this.btnCopy) {
      this.btnCopy.textContent = 'Copiar código Pix';
      this.btnCopy.classList.remove('copied');
    }
  },

  copyCode() {
    if (!this.codeInput) return;
    
    navigator.clipboard.writeText(APP.PIX_PAYMENT.copiaECola).then(() => {
      this.btnCopy.textContent = '✓ Código copiado!';
      this.btnCopy.classList.add('copied');
      
      setTimeout(() => {
        this.btnCopy.textContent = 'Copiar código Pix';
        this.btnCopy.classList.remove('copied');
      }, 3000);
    }).catch(err => {
      console.error('Erro ao copiar código PIX', err);
      // Fallback
      this.codeInput.select();
      document.execCommand('copy');
      this.btnCopy.textContent = '✓ Código copiado!';
      this.btnCopy.classList.add('copied');
      
      setTimeout(() => {
        this.btnCopy.textContent = 'Copiar código Pix';
        this.btnCopy.classList.remove('copied');
      }, 3000);
    });
  }
};

const CreditContactModal = {
  backdrop: null,

  init() {
    this.backdrop = document.getElementById('cc-contact-backdrop');
    if (!this.backdrop) return;

    this.backdrop.addEventListener('click', (event) => {
      if (event.target === this.backdrop) {
        this.close();
      }
    });

    this.backdrop.querySelector('.cc-contact-close')?.addEventListener('click', () => this.close());
    this.backdrop.querySelector('.cc-contact-button')?.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = 'http://wa.me/41999214859';
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.backdrop.hidden) {
        this.close();
      }
    });
  },

  open() {
    if (!this.backdrop) return;
    this.backdrop.hidden = false;
    document.body.classList.add('modal-open');
  },

  close() {
    if (!this.backdrop) return;
    this.backdrop.hidden = true;
    document.body.classList.remove('modal-open');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
  PaymentModal.init();
  PixManualModal.init();
  CreditContactModal.init();
});