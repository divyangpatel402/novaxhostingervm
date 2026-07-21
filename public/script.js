let instances = [];
let selectedInstanceId = null;
let refreshInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  const cursor = document.querySelector('.cursor');
  const follower = document.querySelector('.cursor-follower');

  document.addEventListener('mousemove', (e) => {
    cursor.style.transform = `translate(${e.clientX - 4}px, ${e.clientY - 4}px)`;
    follower.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 20}px)`;
  });

  document.addEventListener('mouseenter', () => {
    cursor.style.opacity = '1';
    follower.style.opacity = '0.3';
  });

  document.addEventListener('mouseleave', () => {
    cursor.style.opacity = '0';
    follower.style.opacity = '0';
  });

  createParticles();

  loadInstances();
  updateNavStatus();

  refreshInterval = setInterval(loadInstances, 10000);
});

function createParticles() {
  const container = document.getElementById('particles');
  for (let i = 0; i < 50; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDuration = (10 + Math.random() * 20) + 's';
    particle.style.animationDelay = Math.random() * 20 + 's';
    particle.style.width = particle.style.height = (1 + Math.random() * 3) + 'px';
    container.appendChild(particle);
  }
}

async function loadInstances() {
  try {
    const res = await fetch('/api/instances');
    const data = await res.json();

    if (!data.success) {
      showToast('AWS Connection Error: ' + data.error, 'error');
      updateNavStatus(false);
      return;
    }

    instances = data.instances;
    updateStats();
    renderTable();
    updateNavStatus(true);
  } catch (err) {
    showToast('Failed to connect to server', 'error');
    updateNavStatus(false);
  }
}

function updateNavStatus(connected) {
  const indicator = document.getElementById('navStatus');
  const text = document.getElementById('navStatusText');

  if (connected === undefined) {
    text.textContent = 'Checking...';
    return;
  }

  if (connected) {
    indicator.style.background = 'var(--state-running)';
    text.textContent = 'Connected';
  } else {
    indicator.style.background = 'var(--state-stopped)';
    text.textContent = 'Disconnected';
  }
}

function updateStats() {
  const total = instances.length;
  const running = instances.filter(i => i.State === 'running').length;
  const stopped = instances.filter(i => i.State === 'stopped').length;
  const pending = instances.filter(i => ['pending', 'starting', 'stopping'].includes(i.State)).length;

  document.getElementById('totalInstances').textContent = total;
  document.getElementById('runningInstances').textContent = running;
  document.getElementById('stoppedInstances').textContent = stopped;
  document.getElementById('pendingInstances').textContent = pending;
}

function renderTable() {
  const tbody = document.getElementById('instanceTableBody');
  const searchTerm = (document.getElementById('searchInput').value || '').toLowerCase();

  const filtered = instances.filter(i =>
    i.Name.toLowerCase().includes(searchTerm) ||
    i.InstanceId.toLowerCase().includes(searchTerm) ||
    i.PublicIp.toLowerCase().includes(searchTerm)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="loading-cell">
          <i class="fas fa-search" style="font-size:32px;color:var(--text-muted);margin-bottom:12px;display:block;"></i>
          <span>No instances found</span>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(inst => {
    const stateClass = ['running', 'stopped'].includes(inst.State) ? inst.State : 'pending';
    const stateIcon = inst.State === 'running' ? 'fa-play-circle' :
                      inst.State === 'stopped' ? 'fa-stop-circle' : 'fa-clock';

    return `
      <tr>
        <td><span class="instance-name">${inst.Name}</span></td>
        <td><span class="instance-id">${inst.InstanceId}</span></td>
        <td>${inst.InstanceType}</td>
        <td><span class="state-badge ${stateClass}"><i class="fas ${stateIcon}"></i> ${inst.State}</span></td>
        <td>${inst.PublicIp}</td>
        <td>${inst.PrivateIp}</td>
        <td>
          <div class="action-btns">
            ${inst.State !== 'running' ? `<button class="btn-sm start" onclick="quickAction('${inst.InstanceId}', 'start')" title="Start"><i class="fas fa-play"></i></button>` : ''}
            ${inst.State === 'running' ? `<button class="btn-sm stop" onclick="quickAction('${inst.InstanceId}', 'stop')" title="Stop"><i class="fas fa-stop"></i></button>` : ''}
            ${inst.State === 'running' ? `<button class="btn-sm reboot" onclick="quickAction('${inst.InstanceId}', 'reboot')" title="Reboot"><i class="fas fa-sync-alt"></i></button>` : ''}
            <button class="btn-sm details" onclick="openDetails('${inst.InstanceId}')" title="Details"><i class="fas fa-info-circle"></i></button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function filterInstances() {
  renderTable();
}

async function quickAction(id, action) {
  const actionMap = { start: 'Starting', stop: 'Stopping', reboot: 'Rebooting' };
  showToast(`${actionMap[action]} instance ${id}...`, 'success');

  try {
    const res = await fetch(`/api/instance/${id}/${action}`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      showToast(`${actionMap[action]} ${id} - Success!`, 'success');
      setTimeout(loadInstances, 2000);
    } else {
      showToast(`Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Failed to execute action', 'error');
  }
}

let currentDetailId = null;

async function openDetails(id) {
  currentDetailId = id;
  selectedInstanceId = id;
  document.getElementById('detailModal').classList.add('active');
  document.getElementById('modalTitle').textContent = `Loading ${id}...`;
  document.querySelector('.modal-actions').style.display = 'none';

  try {
    const res = await fetch(`/api/instance/${id}`);
    const data = await res.json();

    if (!data.success) {
      showToast('Error loading details: ' + data.error, 'error');
      return;
    }

    document.getElementById('modalTitle').textContent = `Instance: ${id}`;
    document.getElementById('detId').textContent = data.InstanceId || '-';
    document.getElementById('detName').textContent = id;
    document.getElementById('detType').textContent = data.InstanceType || '-';
    document.getElementById('detState').textContent = data.State || '-';
    document.getElementById('detLaunch').textContent = data.LaunchTime ? new Date(data.LaunchTime).toLocaleString() : '-';
    document.getElementById('detPublicIp').textContent = data.PublicIp || '-';
    document.getElementById('detPrivateIp').textContent = data.PrivateIp || '-';
    document.getElementById('detVpcId').textContent = data.VpcId || '-';
    document.getElementById('detSubnetId').textContent = data.SubnetId || '-';

    if (data.metrics) {
      document.getElementById('detCpu').textContent = data.metrics.CPUUtilization + '%';
      document.getElementById('detNetIn').textContent = formatBytes(data.metrics.NetworkIn) + '/s';
      document.getElementById('detNetOut').textContent = formatBytes(data.metrics.NetworkOut) + '/s';
    }

    const actions = document.querySelector('.modal-actions');
    actions.style.display = 'flex';
    const state = data.State;

    document.querySelector('.btn-start').style.display = state !== 'running' ? 'flex' : 'none';
    document.querySelector('.btn-stop').style.display = state === 'running' ? 'flex' : 'none';
    document.querySelector('.btn-reboot').style.display = state === 'running' ? 'flex' : 'none';

  } catch (err) {
    showToast('Error loading instance details', 'error');
  }
}

function closeModal() {
  document.getElementById('detailModal').classList.remove('active');
  currentDetailId = null;
}

async function instanceAction(action) {
  if (!currentDetailId) return;
  await quickAction(currentDetailId, action);
  setTimeout(() => openDetails(currentDetailId), 2000);
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
    ${message}
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
