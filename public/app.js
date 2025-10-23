// Modified frontend for static-address demo
let token = localStorage.getItem('jwt') || null;
const api = (path, opts = {}) => {
  opts.headers = opts.headers || {};
  if (token) opts.headers.Authorization = 'Bearer ' + token;
  if (!opts.headers['Content-Type'] && !(opts.body instanceof FormData)) opts.headers['Content-Type'] = 'application/json';
  return fetch('/api' + path, opts).then(async r => {
    const t = await r.text();
    try { return JSON.parse(t); } catch(e) { return { raw: t }; }
  });
};

const qs = s => document.querySelector(s);
const cartKey = 'demo_cart_v1';
function loadCart() { return JSON.parse(localStorage.getItem(cartKey) || '[]'); }
function saveCart(c) { localStorage.setItem(cartKey, JSON.stringify(c)); renderCart(); }

async function register() {
  const email = qs('#email').value;
  const password = qs('#password').value;
  const res = await api('/register', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (res.error) return alert('Register error: ' + res.error);
  alert('Registered. Now login.');
}
async function login() {
  const email = qs('#email').value;
  const password = qs('#password').value;
  const res = await api('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (res.error) return alert('Login error: ' + (res.error || JSON.stringify(res)));
  token = res.token;
  localStorage.setItem('jwt', token);
  renderAuth();
}
function logout() {
  token = null;
  localStorage.removeItem('jwt');
  renderAuth();
}

async function loadProducts() {
  const prods = await api('/products');
  const container = qs('#product-list');
  container.innerHTML = '';
  if (!Array.isArray(prods)) return;
  prods.forEach(p => {
    const div = document.createElement('div');
    div.className = 'product';
    div.innerHTML = `<div><strong>${p.title}</strong><div>${p.description || ''}</div></div>
      <div><div>$${(p.price_cents/100).toFixed(2)}</div><div><button data-id="${p.id}">Add</button></div></div>`;
    container.appendChild(div);
  });
  container.querySelectorAll('button[data-id]').forEach(b => {
    b.addEventListener('click', () => {
      const id = Number(b.getAttribute('data-id'));
      const cur = loadCart();
      const existing = cur.find(x => x.productId === id);
      if (existing) existing.quantity++;
      else cur.push({ productId: id, quantity: 1 });
      saveCart(cur);
    });
  });
}

function renderCart() {
  const items = loadCart();
  const out = qs('#cart-items');
  out.innerHTML = '';
  if (items.length === 0) out.textContent = 'Cart is empty';
  else {
    items.forEach(i => {
      const div = document.createElement('div');
      div.className = 'cart-line';
      div.innerHTML = `<span>Product ${i.productId} x ${i.quantity}</span><span><button class="dec">-</button><button class="inc">+</button><button class="rem">Remove</button></span>`;
      out.appendChild(div);
      div.querySelector('.dec').addEventListener('click', () => {
        i.quantity = Math.max(1, i.quantity - 1); saveCart(items);
      });
      div.querySelector('.inc').addEventListener('click', () => { i.quantity++; saveCart(items);});
      div.querySelector('.rem').addEventListener('click', () => {
        const idx = items.indexOf(i); items.splice(idx,1); saveCart(items);
      });
    });
  }
  qs('#cart-total').textContent = 'Note: demo shows static crypto addresses. No automatic detection of on-chain payments.';
}

async function checkout() {
  if (!token) { alert('You must login first'); return; }
  const items = loadCart();
  if (items.length === 0) { alert('Empty cart'); return; }
  const pay = document.querySelector('input[name=pay]:checked').value;
  const res = await api('/checkout', { method: 'POST', body: JSON.stringify({ cart: items, paymentMethod: pay }) });
  if (res.error) return alert('Checkout error: ' + (res.error || JSON.stringify(res)));
  const out = qs('#checkout-result');
  out.innerHTML = `<pre>${JSON.stringify(res, null, 2)}</pre>`;
  if (res.payment && res.payment.method === 'XMR') {
    out.innerHTML += `<div>Send XMR to address: <b>${res.payment.address}</b></div>`;
    if (res.payment.payment_id) out.innerHTML += `<div>Use payment id: <b>${res.payment.payment_id}</b></div>`;
  } else if (res.payment && res.payment.method === 'BTC') {
    out.innerHTML += `<div>Send BTC to address: <b>${res.payment.address}</b></div>`;
    if (res.payment.bip21) out.innerHTML += `<div>BIP21: <code>${res.payment.bip21}</code></div>`;
  }

  // Show a button to simulate marking paid (demo-only)
  out.innerHTML += `<div style="margin-top:8px"><button id="btn-sim-pay">I've paid (simulate)</button></div>`;
  qs('#btn-sim-pay').addEventListener('click', async () => {
    const r = await api(`/order/${res.orderId}/mark-paid`, { method: 'POST' });
    if (r.error) alert('Mark-paid error: ' + r.error);
    else {
      alert('Order marked as paid (demo).');
      clearCartAfterPaid();
    }
  });
}

function clearCartAfterPaid() {
  localStorage.removeItem(cartKey);
  renderCart();
}

function renderAuth() {
  if (token) {
    qs('#login-form').style.display = 'none';
    qs('#user-info').style.display = 'block';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      qs('#user-email').textContent = payload.email || 'user';
    } catch(e) { qs('#user-email').textContent = 'user'; }
  } else {
    qs('#login-form').style.display = 'block';
    qs('#user-info').style.display = 'none';
  }
}

// Bind events
qs('#btn-register').addEventListener('click', register);
qs('#btn-login').addEventListener('click', login);
qs('#btn-logout').addEventListener('click', logout);
qs('#btn-checkout').addEventListener('click', checkout);

renderAuth();
loadProducts();
renderCart();
