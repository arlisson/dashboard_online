'use strict';
const form = document.querySelector('#sale-form');
if (form) {
  const quantity = form.querySelector('#quantity'), unit = form.querySelector('#unit-value'), total = form.querySelector('#total-value');
  const calculate = () => { const value = Number(String(unit.value).replace(',', '.')); total.value = (Math.max(0, Number(quantity.value) || 0) * (Number.isFinite(value) ? value : 0)).toFixed(2); };
  quantity.addEventListener('input', calculate); unit.addEventListener('input', calculate); calculate();
  form.querySelector('#cnpj').addEventListener('input', (event) => { const value = event.target.value.replace(/\D/g,'').slice(0,14); event.target.value = value.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2'); });
  form.querySelector('#sale-now').addEventListener('click', () => { const now = new Date(); form.querySelector('#sale-date').value = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(now); form.querySelector('#sale-time').value = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(now); });
}
