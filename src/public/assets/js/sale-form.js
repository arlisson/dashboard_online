'use strict';

const form = document.querySelector('#sale-form');
if (form) {
  const quantity = form.querySelector('#quantity'), unit = form.querySelector('#unit-value'), total = form.querySelector('#total-value');
  const parseBrazilianMoney = (value) => {
    const normalized = String(value || '').replace(/R\$|\s/g, '').replace(/\./g, '').replace(',', '.');
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  };
  const maskBrazilianMoney = (value, complete = false) => {
    const raw = String(value || '').replace(/R\$|\s/g, '');
    if (!raw) return '';
    const [integerRaw, decimalRaw = ''] = raw.replace(/\./g, ',').split(',');
    const integer = integerRaw.replace(/\D/g, '') || '0';
    const decimal = decimalRaw.replace(/\D/g, '').slice(0, 2);
    if (complete) return `${integer},${decimal.padEnd(2, '0')}`;
    return raw.includes(',') ? `${integer},${decimal}` : integer;
  };
  const formatBrazilianMoney = (amount) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount || 0);
  const calculate = () => {
    const value = parseBrazilianMoney(unit.value);
    total.value = formatBrazilianMoney(Math.max(0, Number(quantity.value) || 0) * (value === null ? 0 : value));
  };
  unit.value = maskBrazilianMoney(unit.value, Boolean(unit.value));
  quantity.addEventListener('input', calculate);
  unit.addEventListener('input', () => { unit.value = maskBrazilianMoney(unit.value); calculate(); });
  unit.addEventListener('blur', () => { if (unit.value) unit.value = maskBrazilianMoney(unit.value, true); calculate(); });
  form.addEventListener('submit', () => { const value = parseBrazilianMoney(unit.value); if (value !== null) unit.value = value.toFixed(2); });
  calculate();
  form.querySelector('#cnpj').addEventListener('input', (event) => { const value = event.target.value.replace(/\D/g,'').slice(0,14); event.target.value = value.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2'); });
  form.querySelector('#sale-now').addEventListener('click', () => { const now = new Date(); form.querySelector('#sale-date').value = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(now); form.querySelector('#sale-time').value = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(now); });
}