/** Validação de CPF, máscaras de CPF e telefone */
const Validators = {
  validateCPF(cpf) {
    const c = (cpf || '').replace(/\D/g, '');
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    const calc = (offset) => {
      let sum = 0, len = 9 + offset;
      for (let i = 0; i < len; i++) sum += parseInt(c[i]) * (len + 1 - i);
      const rem = (sum * 10) % 11;
      return rem >= 10 ? 0 : rem;
    };
    return calc(0) === parseInt(c[9]) && calc(1) === parseInt(c[10]);
  },

  formatCPF(value) {
    return (value || '').replace(/\D/g, '').slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  },

  formatPhone(value) {
    const d = (value || '').replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2)  return d.replace(/(\d{0,2})/, '($1');
    if (d.length <= 7)  return d.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  },

  stripMask(str) { return (str || '').replace(/\D/g, ''); },

  validatePhone(phone) {
    const d = this.stripMask(phone);
    return d.length >= 10 && d.length <= 11;
  },

  validateName(name) {
    const t = (name || '').trim();
    return t.length >= 3 && t.split(/\s+/).filter(w => w.length > 0).length >= 2;
  },

  applyMask(input, formatter) {
    const start = input.selectionStart;
    const prev = input.value.length;
    input.value = formatter(input.value);
    const diff = input.value.length - prev;
    input.setSelectionRange(start + diff, start + diff);
  }
};
