(async () => {
  const qs = s => document.querySelector(s);
  const adminTokenKey = 'demo_admin_token_v1';

  function getToken() {
    return localStorage.getItem(adminTokenKey) || '';
  }
  function setToken(t) {
    if (!t) localStorage.removeItem(adminTokenKey);
    else localStorage.setItem(adminTokenKey, t);
  }

  const tokenInput = qs('#admin-token');
  const btnSave = qs('#btn-save-token');
  const btnRefresh = qs('#btn-refresh');
  const btnLogout = qs('#btn-logout');
  const ordersList = qs('#orders-list');
  const detailDiv = qs('#order-detail');

  // populate token input
  tokenInput.value = getToken();

  btnSave.addEventListener('click', () => {
    setToken(tokenInput.value.trim());
    alert('Saved token to localStorage.');
  });
  btnLogout.addEventListener('click', () => {
    setToken('');
    tokenInput.value = '';
    renderOrders();
  });

  btnRefresh.addEventListener('click', () => renderOrders());

  function headers() {
    const h = { 'Content-Type': 'application/json' };
    const t = getToken();
    if (t) h['X-Admin-Token'] = t;
    return h;
  }

  async function api(path, opts = {}) {
    opts.headers = Object.assign({}, headers(), opts.headers || {});
    const res = await fetch('/api' + path, opts);
    const txt = await res.text();
    try { return JSON.parse(txt); } catch (e) { return { error: 'Invalid JSON', raw: txt }; }
  }

  async function renderOrders() {
    ordersList.innerHTML = 'Loading...';
    detailDiv.style.display = 'none';
    const res = await api('/admin/orders');
    if (res && res.error) {
      ordersList.innerHTML = `<div style="color:red">Error loading orders: ${res.error}</div>`;
      return;
    }
    if (!Array.isArray(res)) {
      ordersList.innerHTML = `<div>No orders or invalid response.</div>`;
      return;
    }
    if (res.length === 0) {
      ordersList.innerHTML = '<div>No orders yet.</div>';
      return;
    }
    const table = document.createElement('table');
    table.className = 'orders';
    table.innerHTML = `<thead><tr><th>ID</th><th>User</th><th>Status</th><th>Total</th><th>Currency</th><th>Created</th><th>Items</th><th>Note</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    res.forEach(order => {
      const tr = document.createElement('tr');
      tr.className = 'order-row';
      tr.innerHTML = `<td>${order.id}</td>
                      <td>${order.user_id}</td>
                      <td>${order.status}</td>
                      <td>$${(order.total_cents/100).toFixed(2)}</td>
                      <td>${order.currency}</td>
                      <td>${order.created_at}</td>
                      <td>${order.items ? order.items.length : 0}</td>
                      <td class="note">${order.admin_note ? order.admin_note : ''}</td>`;
      tr.addEventListener('click', () => showOrder(order.id));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    ordersList.innerHTML = '';
    ordersList.appendChild(table);
  }

  async function showOrder(id) {
    detailDiv.style.display = 'block';
    detailDiv.innerHTML = 'Loading...';
    const res = await api('/admin/order/' + id);
    if (res && res.error) {
      detailDiv.innerHTML = `<div style="color:red">Error: ${res.error}</div>`;
      return;
    }
    const order = res;
    let html = `<div class="order-details">
      <h3>Order ${order.id} — Status: <strong>${order.status}</strong></h3>
      <div><b>User ID:</b> ${order.user_id} &nbsp; <b>Created:</b> ${order.created_at}</div>
      <div><b>Total:</b> $${(order.total_cents/100).toFixed(2)} (${order.currency})</div>
      <div style="margin-top:8px;"><b>Payment info:</b><pre>${JSON.stringify(order.payment_info || '', null, 2)}</pre></div>
      <div style="margin-top:8px;"><b>Items:</b>
        <ul>${(order.items || []).map(i => `<li>${i.title} (sku:${i.sku}) x ${i.quantity} — $${(i.price_cents/100).toFixed(2)}</li>`).join('')}</ul>
      </div>
      <div style="margin-top:8px;">
        <label>Status:
          <select id="admin-status">
            <option value="pending">pending</option>
            <option value="paid">paid</option>
            <option value="cancelled">cancelled</option>
            <option value="error">error</option>
            <option value="refunded">refunded</option>
          </select>
        </label>
      </div>
      <div style="margin-top:8px;">
        <label>Admin note:<br/><textarea id="admin-note" style="width:100%;height:80px;">${order.admin_note ? order.admin_note : ''}</textarea></label>
      </div>
      <div style="margin-top:8px;">
        <button id="btn-save-order">Save changes</button>
        <button id="btn-refresh-order">Refresh</button>
      </div>
    </div>`;
    detailDiv.innerHTML = html;
    qs('#admin-status').value = order.status;
    qs('#btn-save-order').addEventListener('click', async () => {
      const newStatus = qs('#admin-status').value;
      const note = qs('#admin-note').value;
      const upd = await api('/admin/order/' + order.id + '/update', {
        method: 'POST',
        body: JSON.stringify({ status: newStatus, admin_note: note })
      });
      if (upd && upd.error) {
        alert('Update failed: ' + upd.error);
      } else {
        alert('Updated.');
        renderOrders();
        showOrder(order.id);
      }
    });
    qs('#btn-refresh-order').addEventListener('click', () => showOrder(order.id));
  }

  // initial render
  renderOrders();
})();
