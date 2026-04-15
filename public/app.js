// Global Error Handler
window.onerror = function (msg, url, lineNo, columnNo, error) {
    console.error('Global Error:', msg, error);
    const app = document.getElementById('app');
    if (app) {
        app.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: white; background: var(--bg); min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                        <span class="material-symbols-rounded" style="font-size: 48px; color: var(--danger); margin-bottom: 20px;">error</span>
                        <h2 style="margin-bottom: 10px;">Ops! Algo deu errado.</h2>
                        <p style="color: var(--muted); font-size: 0.8rem; margin-bottom: 30px;">${msg}</p>
                        <button onclick="location.reload()" class="btn-action" style="background: var(--primary); padding: 12px 24px;">RECARREGAR APP</button>
                    </div>
                `;
    }
    return false;
};

const app = document.getElementById('app');
const toast = document.getElementById('toast');

// Global App State
let currentScreen = 'loading';
let initialized = false;

// ==== MODO TELA LIMPA (L??GICA OPERACIONAL) ====
window.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', `
                <button id="exit-fullscreen-float" onclick="toggleFullscreen()" style="display: none; position: fixed; top: 12px; right: 12px; z-index: 2147483647; background: rgba(239, 68, 68, 1); color: white; border: none; border-radius: 8px; padding: 8px 16px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.5); align-items: center; gap: 8px;">
                    <span class="material-symbols-rounded" style="font-size: 20px;">fullscreen_exit</span> Sair Modo Tela Limpa
                </button>
            `);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.body.classList.contains('fullscreen-mode')) {
                toggleFullscreen();
            }
        }
    });
});

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Erro ao entrar em fullscreen: ${err.message}`);
        });
        document.body.classList.add('fullscreen-mode');
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
        document.body.classList.remove('fullscreen-mode');
    }
}

// Listener para sincronizar classe CSS se sair pelo ESC nativo
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        document.body.classList.remove('fullscreen-mode');
    }
});

// Registro de Service Worker para PWA com Limpeza de Emergência
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Detectar se o app falhou em carregar anteriormente (pode ser cache quebrado)
        if (localStorage.getItem('app_load_error')) {
            console.log('Detectada falha de carregamento prévia. Limpando Service Workers...');
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let registration of registrations) {
                    registration.unregister();
                }
            });
            localStorage.removeItem('app_load_error');
        }

        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('SW registrado com sucesso:', reg.scope);
        }).catch(err => {
            console.log('Falha ao registrar SW:', err);
        });
    });
}
// ========================================================

// ERP Blindagem Constants
let isFinalizing = false;
let isSyncing = false;

function generateUniqueId(prefix) {
    const now = new Date();
    const ddmm = now.getDate().toString().padStart(2, '0') + (now.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `${prefix}-${ddmm}-${random}`;
}

// Auxiliar para gerar ID de execução técnica (idempotência)
function generateExecutionId() {
    return 'exec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

async function revertStockMovement(sessionId, row, operatorId) {
    try {
        showToast(`Iniciando estorno para ${row.descricao}...`);
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'movimento',
                tipo: 'ESTORNO',
                id_interno: row.id_interno,
                local: '1_ANDAR',
                quantidade: row.qtd_conferida || row.qtd_separada || 0,
                usuario: operatorId,
                origem: `REVERSAO-${sessionId}`,
                observacao: `Correção de erro operacional da sessao ${sessionId}`
            })
        });
        showToast(`Estorno concluído (visualização apenas, sincronização em background).`);
    } catch (err) {
        console.error("Estorno Falhou:", err);
        showToast("Erro ao processar estorno!");
    }
}

function criarStatusConexao() {

    const status = document.createElement("div")
    status.id = "statusConexao"

    status.style.fontSize = "13px"
    status.style.fontWeight = "600"
    status.style.marginRight = "10px"

    function atualizar() {

        if (navigator.onLine) {
            status.innerHTML = "🟢 Online"
            status.style.color = "#4ade80"
        } else {
            status.innerHTML = "🔴 Offline"
            status.style.color = "#4ade80"
        }

    }

    window.addEventListener("online", atualizar)
    window.addEventListener("offline", atualizar)

    atualizar()

    return status
}

// URLs das imagens locais
const LOGO_URL = '/imagens/icon-512-black.png';
const LOGO_SMALL_URL = '/imagens/icon-192-black.png';

// Função para garantir que links do Drive funcionem como imagem direta
function formatImageUrl(url) {
    if (!url) return '';
    if (url.includes('drive.google.com')) {
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            return `https://drive.google.com/uc?id=${match[1]}`;
        }
    }
    return url;
}

let toastTimeout;
let hasCriticalStock = false;
let cameraStream = null;

const SPREADSHEET_ID = '1NK_rmdEfZYQPnFEil5pDWF1rIt9adajd1GpkcObSkv0';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbznHLTXr_--3PrR8GAz4-TrtX4jttC5cg7CH8cPa7KzoRQPQMZrmtEPBAMWE5KqMTUXwA/exec'; // URL do Google Apps Script para salvar dados

let appData = {
    users: [],
    products: [],
    channels: [],
    separacao: [],
    conferencia: [],
    estoque: [],
    movimentacoes: [],
    entradas_nf: [],
    inventario: [],
    isLoading: true,
    lastSyncTime: null,
    currentInventory: null
};

let operacoesPendentes = 0;

function atualizarPendentes() {
    const el = document.getElementById("pendentesSync");
    if (!el) return;
    el.innerHTML = `📦 ${operacoesPendentes}`;
}

function adicionarPendencia() {
    operacoesPendentes++;
    atualizarPendentes();
}

function atualizarStatusConexao() {
    const status = document.getElementById("statusConexao");
    if (!status) return;

    if (navigator.onLine) {
        status.innerHTML = "🟢 Online";
        status.style.color = "#4ade80";
    } else {
        status.innerHTML = "🔴 Offline";
        status.style.color = "#ef4444";
    }
}

window.addEventListener("online", atualizarStatusConexao);
window.addEventListener("offline", atualizarStatusConexao);

function initApp() {
    if (initialized) return;
    
    atualizarStatusConexao();
    processSyncQueue();
    loadUsersOnly().then(() => {
        if (currentScreen === 'login') renderLogin();
    });
    
    // Configurar sincronização periódica silenciosa (a cada 5 minutos)
    setInterval(() => {
        if (navigator.onLine) {
            loadAllData(true);
        }
    }, 5 * 60 * 1000);

    initialized = true;
    console.log('App Initialized');
}

document.addEventListener("DOMContentLoaded", initApp);

async function processSyncQueue() {
    if (!navigator.onLine || isSyncing) return;

    let queue = JSON.parse(localStorage.getItem('pending_sync_queue') || '[]');
    if (queue.length === 0) {
        operacoesPendentes = 0;
        atualizarPendentes();
        return;
    }

    isSyncing = true;
    console.log(`Operando Sincronização Atômica: ${queue.length} pendentes`);

    // Processamento Individual para garantir que sucesso seja removido IMEDIATAMENTE
    // Evita duplicação se o app fechar durante o processo
    while (queue.length > 0) {
        const item = queue[0];
        operacoesPendentes = queue.length;
        atualizarPendentes();

        try {
            // Garantir que o payload tenha um executionId se não tiver
            if (!item.payload.executionId) {
                item.payload.executionId = item.id;
            }

            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.payload)
            });

            // SUCESSO REAL: Remove do topo e persiste IMEDIATAMENTE (FIFO Estrito)
            queue.shift();
            localStorage.setItem('pending_sync_queue', JSON.stringify(queue));
            console.log(`Sincronizado: ${item.id}`);
        } catch (error) {
            console.error(`Pausa na sincronização (Rede):`, error);
            break;
        }
    }

    operacoesPendentes = queue.length;
    atualizarPendentes();
    isSyncing = false;

    if (queue.length === 0) {
        if (queue.length === 0) {
            showToast("Sincronização concluída com sucesso!");
            isSyncing = false; // Reset lock
            loadAllData(true); // Sincronização de fundo após fila limpa deve ser silenciosa
        } else {
            isSyncing = false; // Reset lock mesmo se houver remanescentes
        }
    }
}

async function safePost(payload) {
    const executionId = generateExecutionId();
    const syncItem = {
        id: executionId,
        timestamp: new Date().toISOString(),
        payload: { ...payload, executionId }
    };

    if (!navigator.onLine) {
        const queue = JSON.parse(localStorage.getItem('pending_sync_queue') || '[]');
        queue.push(syncItem);
        localStorage.setItem('pending_sync_queue', JSON.stringify(queue));
        operacoesPendentes = queue.length;
        atualizarPendentes();
        showToast("Offline: Salvo para sincronizar.");
        return false;
    }

    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncItem.payload)
        });
        return true;
    } catch (error) {
        const queue = JSON.parse(localStorage.getItem('pending_sync_queue') || '[]');
        queue.push(syncItem);
        localStorage.setItem('pending_sync_queue', JSON.stringify(queue));
        operacoesPendentes = queue.length;
        atualizarPendentes();
        showToast("Erro de rede: Salvo em fila.");
        return false;
    }
}

function sincronizarSistema() {
    processSyncQueue();
    loadAllData(true); // Sincronização manual do cabeçalho também deve ser silenciosa para não resetar tela
}

async function fetchSheetData(sheetName) {
    const url = `${SCRIPT_URL}?action=list&sheet=${encodeURIComponent(sheetName)}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const result = await response.json();
        if (!result.ok) {
            console.error(`Apps Script Error (${sheetName}):`, result.error);
            return null;
        }

        const data = result.data || [];

        // Mapear dados retornados pelo GAS para o formato esperado pelo app
        // O GAS retorna objetos com as chaves sendo o nome exato dos cabeçalhos
        return data.map(record => {
            const obj = {};
            Object.entries(record).forEach(([key, value], index) => {
                const colLetter = getColumnLetter(index);
                // Normalização consistente com o formato anterior
                const colName = key.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');

                obj[colName] = value;
                obj[`col_${colLetter}`] = value;
                obj[`col_${colLetter.toLowerCase()}`] = value;
                obj[`col_${index}`] = value;
            });
            return obj;
        }).filter(row => {
            // Manter filtro de linhas vazias (usando primeira coluna mapeada como 'col_0' ou 'col_A')
            const firstColValue = row.col_0 || row.col_a || "";
            return String(firstColValue).trim() !== "";
        });
    } catch (error) {
        console.error(`Error fetching sheet ${sheetName} via GAS:`, error);
        return null;
    }
}

function getColumnLetter(index) {
    let letter = '';
    while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
    }
    return letter;
}

function getTopBarHTML(currentUser, backAction = null) {
    return `
                <header class="top-bar">
                    <div class="top-bar-left">
                        ${backAction ? `
                            <button class="btn-back-top" onclick="${backAction}">
                                <span class="material-symbols-rounded">arrow_back</span>
                            </button>
                        ` : ''}
                        <img src="${LOGO_SMALL_URL}" alt="DY AutoParts" class="top-bar-logo-img" onerror="this.onerror=null; this.src='/imagens/icon-192-black.png';">
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 8px;">

                    <span id="statusConexao" style="font-size:13px;font-weight:600;">
                    🟢 Online
                    </span>

                    <span style="opacity:0.5;">|</span>

                    <button onclick="sincronizarSistema()" class="btn-sync-header" title="Sincronizar agora" style="background: transparent; border: none; color: var(--primary); cursor:pointer;">
                    <span class="material-symbols-rounded" style="font-size:20px;">sync</span>
                    </button>

                    <span style="opacity:0.5;">|</span>

                    <span id="pendentesSync" style="font-size:13px;font-weight:600;">
                    <span class="material-symbols-rounded" style="font-size:16px;">inventory_2</span> 0
                    </span>

                    </div>

                    <div style="display: flex; align-items: center; gap: 16px;">
                        <span class="top-bar-info" style="font-weight: 700; color: white;">${currentUser}</span>
                        <button class="btn-logout" onclick="toggleFullscreen()" title="Modo Tela Limpa" style="color: var(--primary);">
                            <span class="material-symbols-rounded" style="font-size: 22px;">fullscreen</span>
                        </button>
                        <button class="btn-logout" onclick="logout()" title="Sair">
                            <span class="material-symbols-rounded" style="font-size: 22px;">power_settings_new</span>
                        </button>
                    </div>
                </header>
            `;
}

function startClock() {
    // Clock removed from UI
}

async function loadUsersOnly() {
    const data = await fetchSheetData('USUARIOS');
    if (data) appData.users = data;
}

async function loadAllData(silent = false) {
    if (!silent) {
        appData.isLoading = true;
        renderLoading(0);
    }

    const sheets = [
        { name: 'PRODUTOS', key: 'products' },
        { name: 'CANAIS_ENVIO', key: 'channels' },
        { name: 'separacao', key: 'separacao' },
        { name: 'CONFERENCIA', key: 'conferencia' },
        { name: 'ESTOQUE_ATUAL', key: 'estoque' },
        { name: 'MOVIMENTOS', key: 'movimentacoes' },
        { name: 'ENTRADAS_NF', key: 'entradas_nf' },
        { name: 'INVENTARIOS', key: 'inventario' },
        { name: 'INVENTARIO_ITENS', key: 'inventario_itens' },
        { name: 'CATEGORIAS', key: 'categorias' }
    ];

    try {
        let completed = 0;
        const total = sheets.length;

        // Fetch all sheets in parallel for maximum speed
        await Promise.all(sheets.map(async (sheet) => {
            const data = await fetchSheetData(sheet.name);
            if (data) appData[sheet.key] = data;
            completed++;
            if (!silent) {
                const progress = Math.round((completed / total) * 100);
                updateLoadingProgress(progress);
            }
        }));

        // Check for critical stock
        if (appData.products && appData.products.length > 0) {
            hasCriticalStock = appData.products.some(p => {
                const stock = parseFloat((p.estoque_atual || p.estoque_minimo || 0).toString().replace(',', '.'));
                const min = parseFloat((p.estoque_minimo || 0).toString().replace(',', '.'));
                return stock <= min && min > 0;
            });
        }

        appData.lastSyncTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        console.error('Error loading data:', error);
        if (!silent) showToast("Erro ao carregar dados da planilha.");
    } finally {
        if (!silent) {
            setTimeout(() => {
                appData.isLoading = false;
                // Só renderiza o menu se estivermos na tela de loading, login ou ja no menu
                if (currentScreen === 'login' || currentScreen === 'loading' || currentScreen === 'menu') {
                    renderMenu();
                }
            }, 400);
        }
    }
}

function renderSplash() {
    app.innerHTML = `
                <div style="background: var(--bg); min-height: 100vh; width: 100%;"></div>
            `;
}

function renderLoading(progress = 0, message = "Sincronizando Dados") {
    currentScreen = 'loading';
    app.innerHTML = `
                <div class="login-screen fade-in" style="justify-content: center; background: var(--bg);">
                    <div class="login-logo-container" style="min-height: auto; margin-bottom: 40px; display: flex; justify-content: center; width: 100%;">
                        <img src="${LOGO_URL}" alt="DY AutoParts" class="login-logo-img" onerror="this.onerror=null; this.src='/imagens/icon-512-black.png';">
                    </div>
                    <div style="text-align: center; width: 100%; max-width: 320px; padding: 0 20px;">
                        <p style="margin-bottom: 20px; font-weight: 700; color: var(--muted); letter-spacing: 0.2em; font-size: 0.7rem; text-transform: uppercase;">${message}</p>
                        <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: 10px; overflow: hidden; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.05);">
                            <div id="loading-bar" style="width: ${progress}%; height: 100%; background: var(--primary); transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px var(--primary);"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 0.6rem; color: var(--muted); font-weight: 600;">CARREGANDO...</span>
                            <span id="loading-percent" style="font-size: 0.8rem; font-weight: 800; color: var(--primary); font-variant-numeric: tabular-nums;">${progress}%</span>
                        </div>
                    </div>
                </div>
            `;
}

function updateLoadingProgress(progress) {
    const bar = document.getElementById('loading-bar');
    const percent = document.getElementById('loading-percent');
    if (bar) bar.style.width = `${progress}%`;
    if (percent) percent.innerText = `${progress}%`;
}

function showToast(message) {
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function playBeep(type) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // Handle both boolean and string types
        const isSuccess = type === true || type === 'success';
        const isError = type === false || type === 'error';

        if (isSuccess) {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.1);
        } else if (isError) {
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.3);
        }
    } catch (e) {
        console.error("Error playing beep:", e);
    }
}

async function setUser(userName) {
    localStorage.setItem('currentUser', userName);
    // Full synchronization only happens after user selection
    await loadAllData();
}
function logout() {
    localStorage.removeItem('currentUser');
    renderLogin();
}

// Status Handlers moved to global section early in file


function renderLogin() {
    currentScreen = 'login';
    const fallbackUsers = [
        "Alexandre Kawai",
        "Daniel Yanagihara",
        "Fabio Kanashiro",
        "Rafael Costa"
    ];

    // Strictly look for Column B (col_B) as requested, starting from row 2 (handled by headers=1)
    let usersToRender = [];
    if (appData.users && appData.users.length > 0) {
        usersToRender = appData.users
            .map(u => u.col_B || u.col_b || u.nome || u.NOME)
            .filter(name => name !== null && name !== undefined && String(name).trim() !== '');
    }

    if (usersToRender.length === 0) {
        usersToRender = fallbackUsers;
    }

    // Se já estiver na tela de login, apenas atualiza a grid para evitar a piscada
    const existingLogin = document.querySelector('.login-screen');
    const userGridHTML = `
                <div class="user-grid">
                    ${usersToRender.map(name => `
                        <div class="user-card" onclick="setUser('${name}')">
                            <span class="name">${name}</span>
                        </div>
                    `).join('')}
                </div>
            `;

    if (existingLogin && !appData.isLoading) {
        const gridContainer = existingLogin.querySelector('.user-grid');
        if (gridContainer) {
            gridContainer.outerHTML = userGridHTML;
            return;
        }
    }

    app.innerHTML = `
                <div class="login-screen fade-in">
                    <div class="login-logo-container">
                        <img src="${LOGO_URL}" alt="DY AutoParts" class="login-logo-img" onerror="this.onerror=null; this.src='/imagens/icon-512-black.png';">
                    </div>
                    <div class="container" style="padding-top: 60px;">
                        ${userGridHTML}
                    </div>
                </div>
            `;
}

function getNextInternalId() {
    if (!appData.products || appData.products.length === 0) return "DY-000.001";

    let maxNum = 0;
    let prefix = "DY-000.";

    appData.products.forEach(p => {
        const idVal = String(p.id_interno || p.col_a || p.col_A || p.col_0 || "");
        if (idVal && idVal.trim() !== "") {
            // Extract numeric part. 
            // For "DY-000.197", we want 197.
            // We look for the last sequence of digits.
            const match = idVal.match(/(\d+)$/);
            if (match) {
                const num = parseInt(match[1]);
                if (!isNaN(num) && num > maxNum) {
                    maxNum = num;
                    // Update prefix based on what we found (everything before the number)
                    prefix = idVal.substring(0, idVal.length - match[1].length);
                }
            }
        }
    });

    const nextNum = maxNum + 1;
    // Pad with at least 3 zeros if it was padded before
    const paddedNum = nextNum.toString().padStart(3, '0');
    return `${prefix}${paddedNum}`;
}

function renderMenu() {
    stopScanner(); // Garantir que a câmera desliga ao voltar pro menu
    currentScreen = 'menu';
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        renderLogin();
        return;
    }

    const modoRapidoAtivo = localStorage.getItem('config_modo_rapido') === 'true';

    const menuItems = [
        { id: 'produtos', label: 'PRODUTOS', icon: 'inventory_2' },
        { id: 'pick', label: 'SEPARAÇÃO (PICK)', icon: 'conveyor_belt' },
        { id: 'pack', label: 'CONFERÊNCIA (PACK)', icon: 'package_2', disabled: modoRapidoAtivo, badge: modoRapidoAtivo ? 'Desativado' : null },
        { id: 'nf', label: 'ENTRADA DE NF', icon: 'description', disabled: true, badge: 'Em breve' },
        { id: 'compras', label: 'COMPRAS', icon: 'shopping_bag', disabled: true, badge: 'Em breve' },
        { id: 'movimentacoes', label: 'MOVIMENTAÇÕES', icon: 'swap_horiz' },
        { id: 'financeiro', label: 'FINANCEIRO', icon: 'payments', disabled: true, badge: 'Em breve' },
        { id: 'inventario', label: 'INVENTÁRIO', icon: 'list_alt' },
        { id: 'configuracoes', label: 'CONFIGURAÇÕES', icon: 'settings' },
        { id: 'dashboard', label: 'DASHBOARD', icon: 'dashboard' },
        { id: 'pedido', label: 'PEDIDO', icon: 'shopping_cart', disabled: true, badge: 'Em breve' }
    ];

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser)}

                    <main class="container">
                        <div class="menu-grid">
                            ${menuItems.map(item => `
                                <div class="menu-card ${item.disabled ? 'disabled' : ''}" 
                                     onclick="${item.disabled ? '' : (
            item.id === 'dashboard' ? 'renderDashboard()' :
                item.id === 'produtos' ? 'renderProductSubMenu()' :
                    item.id === 'pick' ? 'renderPickMenu()' :
                        item.id === 'pack' ? 'renderPackMenu()' :
                            item.id === 'compras' ? 'renderComprasSubMenu()' :
                                item.id === 'movimentacoes' ? 'renderMovimentacoesSubMenu()' :
                                    item.id === 'inventario' ? 'renderInventarioSubMenu()' :
                                        item.id === 'nf' ? 'renderNFSubMenu()' :
                                            item.id === 'financeiro' ? 'renderFinanceiroSubMenu()' :
                                                item.id === 'configuracoes' ? 'renderConfigSubMenu()' :
                                                    `handleMenuClick('${item.label}')`
        )}">
                                    ${item.badge ? `<span class="badge">${item.badge}</span>` : ''}
                                    <span class="material-symbols-rounded icon">${item.icon}</span>
                                    <span class="label">${item.label}</span>
                                </div>
                            `).join('')}
                        </div>
                    </main>
                </div>
            `;
}

function renderDashboard() {
    const currentUser = localStorage.getItem('currentUser');

    // 1. Cálculos de Produtos e Estoque
    const totalProducts = appData.products.length;

    let totalInventoryValue = 0;
    let criticalStockCount = 0;

    appData.products.forEach(p => {
        const stock = parseFloat((p.estoque_atual || 0).toString().replace(',', '.'));
        const min = parseFloat((p.estoque_minimo || 0).toString().replace(',', '.'));
        const cost = parseFloat((p.preco_custo || 0).toString().replace('R$', '').replace('.', '').replace(',', '.').trim());

        if (!isNaN(stock) && !isNaN(cost)) {
            totalInventoryValue += stock * cost;
        }

        if (stock <= min && min > 0) {
            criticalStockCount++;
        }
    });

    // 2. Cálculos de Envios (Hoje)
    const today = new Date().toLocaleDateString('pt-BR');
    const shipmentsToday = appData.separacao.filter(s => s.data_separacao === today || s.finalizado_em?.includes(today));

    const channelStats = shipmentsToday.reduce((acc, s) => {
        const channel = s.canal_nome || 'Outros';
        acc[channel] = (acc[channel] || 0) + 1;
        return acc;
    }, {});

    const totalShipmentsToday = shipmentsToday.length;

    // 3. Cálculos de Notas Fiscais (Últimos 7 dias)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentNFs = (appData.entradas_nf || []).filter(nf => {
        if (!nf.data) return false;
        const [day, month, year] = nf.data.split('/');
        const nfDate = new Date(year, month - 1, day);
        return nfDate >= sevenDaysAgo;
    });

    const totalNFQtyRecent = recentNFs.reduce((sum, nf) => sum + parseFloat((nf.qtd || 0).toString().replace(',', '.')), 0);

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMenu()')}

                    <main class="container">
                        <div class="sub-menu-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">DASHBOARD ESTRATÉGICO</h2>
                            <button onclick="loadAllData().then(() => renderDashboard())" class="btn-sync-header" title="Sincronizar agora" style="background: rgba(255,255,255,0.05); border: none; color: var(--primary); cursor: pointer; display: flex; align-items: center; padding: 10px; border-radius: 14px; transition: all 0.2s;">
                                <span class="material-symbols-rounded" style="font-size: 22px;">sync</span>
                            </button>
                        </div>

                        <!-- Cards de Resumo Principal -->
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px;">
                            <div style="background: var(--surface); padding: 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05);">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <span class="material-symbols-rounded" style="font-size: 18px; color: #3b82f6;">inventory_2</span>
                                    <span style="font-size: 0.6rem; color: var(--muted); font-weight: 700; text-transform: uppercase;">Produtos</span>
                                </div>
                                <div style="font-size: 1.4rem; font-weight: 800; color: white;">${totalProducts}</div>
                                <div style="font-size: 0.55rem; color: ${criticalStockCount > 0 ? 'var(--danger)' : '#22c55e'}; font-weight: 700; margin-top: 4px;">
                                    ${criticalStockCount > 0 ? `${criticalStockCount} ABAIXO DO MÍNIMO` : 'ESTOQUE EM DIA'}
                                </div>
                            </div>
                            
                            <div style="background: var(--surface); padding: 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05);">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <span class="material-symbols-rounded" style="font-size: 18px; color: #22c55e;">local_shipping</span>
                                    <span style="font-size: 0.6rem; color: var(--muted); font-weight: 700; text-transform: uppercase;">Envios Hoje</span>
                                </div>
                                <div style="font-size: 1.4rem; font-weight: 800; color: white;">${totalShipmentsToday}</div>
                                <div style="font-size: 0.55rem; color: var(--muted); font-weight: 700; margin-top: 4px;">TOTAL DE PEDIDOS</div>
                            </div>

                            <div style="background: var(--surface); padding: 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05);">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <span class="material-symbols-rounded" style="font-size: 18px; color: #eab308;">payments</span>
                                    <span style="font-size: 0.6rem; color: var(--muted); font-weight: 700; text-transform: uppercase;">Valor Estoque</span>
                                </div>
                                <div style="font-size: 1.1rem; font-weight: 800; color: white;">${totalInventoryValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                <div style="font-size: 0.55rem; color: var(--muted); font-weight: 700; margin-top: 4px;">CUSTO TOTAL</div>
                            </div>

                            <div style="background: var(--surface); padding: 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05);">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <span class="material-symbols-rounded" style="font-size: 18px; color: #a855f7;">description</span>
                                    <span style="font-size: 0.6rem; color: var(--muted); font-weight: 700; text-transform: uppercase;">Entradas (7d)</span>
                                </div>
                                <div style="font-size: 1.4rem; font-weight: 800; color: white;">${recentNFs.length}</div>
                                <div style="font-size: 0.55rem; color: var(--muted); font-weight: 700; margin-top: 4px;">+${totalNFQtyRecent} ITENS RECEBIDOS</div>
                            </div>
                        </div>

                        <!-- Gráfico e Performance por Canal -->
                        <div style="background: var(--surface); padding: 24px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 20px;">
                            <h3 style="font-size: 0.75rem; font-weight: 700; color: var(--muted); text-transform: uppercase; margin-bottom: 20px; letter-spacing: 0.05em; display: flex; justify-content: space-between;">
                                Performance por Canal <span>HOJE</span>
                            </h3>
                            
                            <div style="display: flex; flex-direction: column; gap: 20px;">
                                <div style="height: 200px; width: 100%;">
                                    <canvas id="shipmentsChart"></canvas>
                                </div>

                                <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">
                                    ${Object.entries(channelStats).length > 0 ? Object.entries(channelStats).sort((a, b) => b[1] - a[1]).map(([channel, count]) => {
        const percent = totalShipmentsToday > 0 ? Math.round((count / totalShipmentsToday) * 100) : 0;
        return `
                                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                                    <span style="font-size: 0.75rem; font-weight: 700; color: white;">${channel}</span>
                                                    <div style="display: flex; align-items: center; gap: 8px;">
                                                        <span style="font-size: 0.75rem; font-weight: 800; color: var(--primary);">${count}</span>
                                                        <span style="font-size: 0.6rem; color: var(--muted); font-weight: 600;">(${percent}%)</span>
                                                    </div>
                                                </div>
                                                <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: 10px; overflow: hidden;">
                                                    <div style="width: ${percent}%; height: 100%; background: var(--primary); border-radius: 10px;"></div>
                                                </div>
                                            </div>
                                        `;
    }).join('') : `
                                        <div style="text-align: center; padding: 20px; color: var(--muted); font-size: 0.75rem; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">
                                            Nenhum envio registrado hoje.
                                        </div>
                                    `}
                                </div>
                            </div>
                        </div>

                        <!-- Alertas e Decisões -->
                        <div style="background: var(--surface); padding: 20px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 40px;">
                            <h3 style="font-size: 0.75rem; font-weight: 700; color: var(--muted); text-transform: uppercase; margin-bottom: 16px; letter-spacing: 0.05em;">Alertas de Decisão</h3>
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                ${criticalStockCount > 0 ? `
                                    <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(225, 29, 72, 0.1); border-radius: 14px; border: 1px solid rgba(225, 29, 72, 0.2);" onclick="renderStockCritical()">
                                        <span class="material-symbols-rounded" style="color: var(--danger);">warning</span>
                                        <div style="flex: 1;">
                                            <div style="font-size: 0.75rem; font-weight: 700; color: white;">Reposição Necessária</div>
                                            <div style="font-size: 0.6rem; color: var(--muted);">${criticalStockCount} produtos abaixo do estoque mínimo.</div>
                                        </div>
                                        <span class="material-symbols-rounded" style="font-size: 18px; color: var(--muted);">chevron_right</span>
                                    </div>
                                ` : ''}
                                
                                <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(59, 130, 246, 0.1); border-radius: 14px; border: 1px solid rgba(59, 130, 246, 0.2);" onclick="renderNFHistory()">
                                    <span class="material-symbols-rounded" style="color: #3b82f6;">description</span>
                                    <div style="flex: 1;">
                                        <div style="font-size: 0.75rem; font-weight: 700; color: white;">Entradas Recentes</div>
                                        <div style="font-size: 0.6rem; color: var(--muted);">${recentNFs.length} Notas Fiscais processadas nos últimos 7 dias.</div>
                                    </div>
                                    <span class="material-symbols-rounded" style="font-size: 18px; color: var(--muted);">chevron_right</span>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            `;

    // Inicializar gráfico se houver dados
    if (Object.keys(channelStats).length > 0) {
        setTimeout(() => {
            const ctx = document.getElementById('shipmentsChart').getContext('2d');
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(channelStats),
                    datasets: [{
                        data: Object.values(channelStats),
                        backgroundColor: [
                            '#E30613', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'
                        ],
                        borderWidth: 2,
                        borderColor: '#242424'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    cutout: '75%'
                }
            });
        }, 100);
    }
}

function renderProductSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    const subItems = [
        { id: 'buscar', label: 'BUSCAR PRODUTO', icon: 'search' },
        { id: 'cadastrar', label: 'CADASTRAR PRODUTO', icon: 'add_box' },
        { id: 'editar', label: 'EDITAR PRODUTO', icon: 'edit_note' },
        { id: 'guia_lampada', label: 'GUIA DE LÂMPADAS', icon: 'lightbulb' },
        { id: 'estoque_atual', label: 'ESTOQUE ATUAL', icon: 'database' },
        { id: 'estoque_min', label: hasCriticalStock ? 'ESTOQUE CRÍTICO' : 'ESTOQUE MÍNIMO', icon: hasCriticalStock ? 'report' : 'low_priority', critical: hasCriticalStock }
    ];

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">PRODUTOS</h2>
                        </div>
                        <div class="menu-grid">
                            ${subItems.map(item => `
                                <div class="menu-card ${item.critical ? 'critical' : ''}" onclick="${item.id === 'buscar' ? 'renderSearchProduct()' :
            item.id === 'cadastrar' ? 'renderAddProduct()' :
                item.id === 'editar' ? 'renderEditProductSearch()' :
                    item.id === 'guia_lampada' ? 'renderGuiaLampada()' :
                        item.id === 'estoque_atual' ? 'renderEstoqueAtual()' :
                            item.id === 'estoque_min' ? 'renderStockCritical()' :
                                `handleMenuClick('${item.label}')`
        }">
                                    <span class="material-symbols-rounded icon">${item.icon}</span>
                                    <span class="label">${item.label}</span>
                                </div>
                            `).join('')}
                        </div>
                    </main>
                </div>
            `;
}

function renderEstoqueAtual() {
    const currentUser = localStorage.getItem('currentUser');

    // Consolidate stock by id_interno
    const consolidated = {};

    // Use appData.estoque (mapped from ESTOQUE_ATUAL)
    (appData.estoque || []).forEach(item => {
        const id = (item.id_interno || item.col_a || '').toString();
        if (!id) return;

        if (!consolidated[id]) {
            // Find product details for SKU and description
            const product = appData.products.find(p => (p.id_interno || p.col_a || '').toString() === id);
            consolidated[id] = {
                id_interno: id,
                sku: product ? (product.sku_fornecedor || product.col_c || '-') : '-',
                descricao: product ? (product.descricao_base || product.nome || product.col_b) : (item.descricao || item.col_b || 'Sem Descrição'),
                saldo_total: 0,
                saldo_disponivel: 0,
                saldo_reservado: 0,
                saldo_em_transito: 0,
                locations: []
            };
        }

        const total = parseFloat((item.saldo_total || item.col_f || 0).toString().replace(',', '.'));
        const disponivel = parseFloat((item.saldo_disponivel || item.col_c || 0).toString().replace(',', '.'));
        const reservado = parseFloat((item.saldo_reservado || item.col_d || 0).toString().replace(',', '.'));
        const transito = parseFloat((item.saldo_em_transito || item.col_e || 0).toString().replace(',', '.'));

        consolidated[id].saldo_total += isNaN(total) ? 0 : total;
        consolidated[id].saldo_disponivel += isNaN(disponivel) ? 0 : disponivel;
        consolidated[id].saldo_reservado += isNaN(reservado) ? 0 : reservado;
        consolidated[id].saldo_em_transito += isNaN(transito) ? 0 : transito;

        const localName = item.local || item.col_b;
        if (localName) {
            consolidated[id].locations.push({
                local: localName,
                total: isNaN(total) ? 0 : total,
                disponivel: isNaN(disponivel) ? 0 : disponivel
            });
        }
    });

    // Convert to array and sort
    const stockList = Object.values(consolidated).sort((a, b) => a.descricao.localeCompare(b.descricao));

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderProductSubMenu()')}
                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">ESTOQUE ATUAL</h2>
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                            ${stockList.length === 0 ? `
                                <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                                    <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">database</span>
                                    <p style="color: var(--muted);">Nenhum estoque registrado.</p>
                                </div>
                            ` : stockList.map(item => {
        return `
                                    <div style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                                            <div style="flex: 1; padding-right: 12px;">
                                                <div style="font-weight: 800; color: white; font-size: 0.9rem; margin-bottom: 4px; line-height: 1.2;">${item.descricao}</div>
                                                <div style="display: flex; gap: 8px;">
                                                    <div style="font-size: 0.65rem; color: var(--muted); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">SKU: ${item.sku}</div>
                                                    <div style="font-size: 0.65rem; color: var(--muted); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">ID: ${item.id_interno}</div>
                                                </div>
                                            </div>
                                            <div style="text-align: right;">
                                                <div style="font-size: 1.2rem; font-weight: 800; color: var(--primary);">${item.saldo_total}</div>
                                                <div style="font-size: 0.55rem; color: var(--muted); text-transform: uppercase; font-weight: 700;">Total Geral</div>
                                            </div>
                                        </div>
                                        
                                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                                            <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; text-align: center;">
                                                <div style="font-size: 0.5rem; color: var(--muted); text-transform: uppercase;">Disponível</div>
                                                <div style="font-size: 0.8rem; font-weight: 700; color: #22c55e;">${item.saldo_disponivel}</div>
                                            </div>
                                            <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; text-align: center;">
                                                <div style="font-size: 0.5rem; color: var(--muted); text-transform: uppercase;">Reservado</div>
                                                <div style="font-size: 0.8rem; font-weight: 700; color: #f59e0b;">${item.saldo_reservado}</div>
                                            </div>
                                            <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; text-align: center;">
                                                <div style="font-size: 0.5rem; color: var(--muted); text-transform: uppercase;">Trânsito</div>
                                                <div style="font-size: 0.8rem; font-weight: 700; color: #3b82f6;">${item.saldo_em_transito}</div>
                                            </div>
                                        </div>

                                        ${item.locations.length > 0 ? `
                                            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                                                <div style="font-size: 0.55rem; color: var(--muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Locais:</div>
                                                ${item.locations.map(loc => `
                                                    <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--muted); margin-bottom: 2px;">
                                                        <span>${loc.local}</span>
                                                        <span style="font-weight: 700; color: white;">${loc.total} <span style="font-size: 0.55rem; opacity: 0.6;">(Disp: ${loc.disponivel})</span></span>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
    }).join('')}
                        </div>
                    </main>
                </div>
            `;
}

function renderModuleScreen(config) {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, config.backFunc)}
                    <main class="container">
                        <div class="sub-menu-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">${config.title}</h2>
                            ${config.headerAction ? `<button class="btn-action" style="min-width: auto; padding: 8px 16px;" onclick="${config.headerAction.onclick}">${config.headerAction.label}</button>` : ''}
                        </div>
                        <div class="module-content">
                            ${config.content}
                        </div>
                    </main>
                </div>
            `;
}

function getPlaceholderList(items, columns) {
    if (!items || items.length === 0) {
        return `
                    <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                        <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">inventory_2</span>
                        <p style="color: var(--muted);">Nenhum registro encontrado.</p>
                    </div>
                `;
    }
    return `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${items.map(item => `
                        <div style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-weight: 800; color: white; font-size: 0.9rem;">${item[columns[0]]}</div>
                                <div style="font-size: 0.65rem; color: var(--muted);">${item[columns[1]] || ''}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: 700; color: var(--primary); font-size: 0.85rem;">${item[columns[2]] || ''}</div>
                                <div style="font-size: 0.6rem; color: var(--muted);">${item[columns[3]] || ''}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
}

function getPlaceholderForm(fields) {
    return `
                <div class="form-grid" style="background: var(--surface); padding: 24px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                    ${fields.map(f => `
                        <div class="input-group ${f.fullWidth ? 'full-width' : ''}">
                            <label>${f.label}</label>
                            ${f.type === 'select' ? `
                                <select class="input-field" style="width: 100%; appearance: none;">
                                    ${f.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                                </select>
                            ` : f.type === 'textarea' ? `
                                <textarea class="input-field" style="min-height: 80px;" placeholder="${f.placeholder || ''}"></textarea>
                            ` : `
                                <input type="${f.type || 'text'}" class="input-field" placeholder="${f.placeholder || ''}">
                            `}
                        </div>
                    `).join('')}
                    <div style="grid-column: 1 / -1; display: flex; gap: 16px; margin-top: 24px;">
                        <button class="btn-action" style="flex: 1; justify-content: center;" onclick="showToast('Dados salvos com sucesso!')">
                            <span class="material-symbols-rounded">save</span>
                            Salvar Registro
                        </button>
                    </div>
                </div>
            `;
}

function renderComprasSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    const subItems = [
        {
            id: 'novo_pedido', label: 'NOVO PEDIDO', icon: 'add_shopping_cart', type: 'form', fields: [
                { label: 'Fornecedor', type: 'select', options: ['Selecione...', 'Distribuidora A', 'Importadora B', 'Fábrica C'] },
                { label: 'Data Prevista', type: 'date' },
                { label: 'Condição Pagto', type: 'select', options: ['30 Dias', '60 Dias', 'À Vista'] },
                { label: 'Observações', type: 'textarea', fullWidth: true }
            ]
        },
        {
            id: 'pedidos_aberto', label: 'PEDIDOS EM ABERTO', icon: 'shopping_cart', type: 'list', items: [
                { ref: 'PED-001', provider: 'Distribuidora A', status: 'Aguardando', date: '25/02/2026' },
                { ref: 'PED-002', provider: 'Importadora B', status: 'Em Trânsito', date: '24/02/2026' }
            ], cols: ['ref', 'provider', 'status', 'date']
        },
        {
            id: 'recebimento_pendente', label: 'RECEBIMENTO PENDENTE', icon: 'inventory_2', type: 'list', items: [
                { nf: 'NF-8821', provider: 'Fábrica C', qty: '150 itens', date: '25/02/2026' }
            ], cols: ['nf', 'provider', 'qty', 'date']
        },
        {
            id: 'sugestao_compra', label: 'SUGESTÃO DE COMPRA', icon: 'lightbulb', type: 'list', items: [
                { prod: 'Amortecedor Diant.', reason: 'Estoque Baixo', sug: '20 un', priority: 'ALTA' }
            ], cols: ['prod', 'reason', 'sug', 'priority']
        },
        {
            id: 'cotacao', label: 'COTAÇÃO DE PREÇOS', icon: 'request_quote', type: 'form', fields: [
                { label: 'Produto', placeholder: 'Buscar produto...' },
                { label: 'Quantidade', type: 'number' },
                { label: 'Fornecedores (IDs)', placeholder: '101, 105, 110' }
            ]
        },
        {
            id: 'fornecedores', label: 'FORNECEDORES', icon: 'domain', type: 'list', items: [
                { name: 'Distribuidora A', city: 'São Paulo - SP', contact: '(11) 9999-9999', rating: '⭐⭐⭐⭐⭐' },
                { name: 'Importadora B', city: 'Curitiba - PR', contact: '(41) 8888-8888', rating: '⭐⭐⭐⭐' }
            ], cols: ['name', 'city', 'contact', 'rating']
        },
        { id: 'historico_compras', label: 'HISTÓRICO DE COMPRAS', icon: 'history', type: 'list', items: [], cols: [] }
    ];

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">COMPRAS</h2>
                        </div>
                        <div class="menu-grid">
                            ${subItems.map(item => `
                                <div class="menu-card" onclick="handleModuleClick(${JSON.stringify(item).replace(/"/g, '&quot;')}, 'renderComprasSubMenu()')">
                                    <span class="material-symbols-rounded icon">${item.icon}</span>
                                    <span class="label">${item.label}</span>
                                </div>
                            `).join('')}
                        </div>
                    </main>
                </div>
            `;
}

function handleModuleClick(item, backFunc) {
    let content = '';
    if (item.type === 'form') {
        content = getPlaceholderForm(item.fields);
    } else if (item.type === 'list') {
        content = getPlaceholderList(item.items, item.cols);
    } else {
        content = `<div style="text-align: center; padding: 40px; color: var(--muted);">Funcionalidade em desenvolvimento para ${item.label}</div>`;
    }

    renderModuleScreen({
        title: item.label,
        backFunc: backFunc,
        content: content
    });
}

function renderMovimentacoesSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    const subItems = [
        { id: 'transferencia', label: 'TRANSFERÊNCIA', icon: 'swap_horiz', onclick: 'renderTransferenciaForm()' },
        { id: 'defeito', label: 'DEFEITO/AVARIA', icon: 'report_problem', onclick: 'renderDefeitoForm()' },
        { id: 'historico_mov', label: 'HISTÓRICO', icon: 'history', onclick: 'renderMovimentacoesHistory()' }
    ];

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">MOVIMENTAÇÕES</h2>
                        </div>
                        <div class="menu-grid">
                            ${subItems.map(item => `
                                <div class="menu-card" onclick="${item.onclick}">
                                    <span class="material-symbols-rounded icon">${item.icon}</span>
                                    <span class="label">${item.label}</span>
                                </div>
                            `).join('')}
                        </div>
                    </main>
                </div>
            `;
}

function renderTransferenciaForm() {
    const currentUser = localStorage.getItem('currentUser');
    const locals = ['TERREO', '1_ANDAR', 'MOSTRUARIO', 'DEFEITO'];

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')}
                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">TRANSFERÊNCIA</h2>
                        </div>
                        <div class="form-grid" style="background: var(--surface); padding: 24px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                            <div class="input-group full-width">
                                <label>Produto (EAN ou ID)</label>
                                <div style="display: flex; gap: 12px;">
                                    <input type="text" id="mov-search" class="input-field" style="flex: 1;" placeholder="Bipe ou digite..." oninput="searchProductForMov()">
                                </div>
                                <div id="mov-search-results" style="margin-top: 8px; max-height: 150px; overflow-y: auto;"></div>
                            </div>
                            <div id="mov-selected-info" class="hidden full-width" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; margin-bottom: 16px; border: 1px solid var(--primary);"></div>
                            
                            <div class="input-group">
                                <label>Origem</label>
                                <select id="mov-origem" class="input-field">
                                    ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
                                </select>
                            </div>
                            <div class="input-group">
                                <label>Destino</label>
                                <select id="mov-destino" class="input-field">
                                    ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
                                </select>
                            </div>
                            <div class="input-group">
                                <label>Quantidade</label>
                                <input type="number" id="mov-qty" class="input-field" placeholder="0">
                            </div>
                            <div class="input-group">
                                <label>Observação</label>
                                <input type="text" id="mov-obs" class="input-field" placeholder="Opcional">
                            </div>
                            
                            <div style="display: flex; gap: 16px; margin-top: 24px; width: 100%;">
                                <button class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="renderMovimentacoesSubMenu()">Cancelar</button>
                                <button class="btn-action" style="flex: 2; justify-content: center;" onclick="saveMovimentacao('TRANSFERÊNCIA')">Confirmar</button>
                            </div>
                        </div>
                    </main>
                </div>
            `;
}

function renderDefeitoForm() {
    const currentUser = localStorage.getItem('currentUser');
    const locals = ['TERREO', '1_ANDAR', 'MOSTRUARIO', 'DEFEITO'];

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')}
                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">DEFEITO / AVARIA</h2>
                        </div>
                        <div class="form-grid" style="background: var(--surface); padding: 24px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                            <div class="input-group full-width">
                                <label>Produto (EAN ou ID)</label>
                                <div style="display: flex; gap: 12px;">
                                    <input type="text" id="mov-search" class="input-field" style="flex: 1;" placeholder="Bipe ou digite..." oninput="searchProductForMov()">
                                </div>
                                <div id="mov-search-results" style="margin-top: 8px; max-height: 150px; overflow-y: auto;"></div>
                            </div>
                            <div id="mov-selected-info" class="hidden full-width" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; margin-bottom: 16px; border: 1px solid var(--danger);"></div>
                            
                            <div class="input-group">
                                <label>Local de Origem</label>
                                <select id="mov-origem" class="input-field">
                                    ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
                                </select>
                                <input type="hidden" id="mov-destino" value="DEFEITO">
                            </div>
                            <div class="input-group">
                                <label>Quantidade</label>
                                <input type="number" id="mov-qty" class="input-field" placeholder="0">
                            </div>
                            <div class="input-group full-width">
                                <label>Motivo / Observação</label>
                                <input type="text" id="mov-obs" class="input-field" placeholder="Descreva o defeito...">
                            </div>
                            
                            <div style="display: flex; gap: 16px; margin-top: 24px; width: 100%;">
                                <button class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="renderMovimentacoesSubMenu()">Cancelar</button>
                                <button class="btn-action" style="flex: 2; justify-content: center; background: var(--danger) !important;" onclick="saveMovimentacao('ENVIO_DEFEITO')">Registrar Defeito</button>
                            </div>
                        </div>
                    </main>
                </div>
            `;
}

let selectedProductForMov = null;
function searchProductForMov() {
    const searchInput = document.getElementById('mov-search');
    const resultsDiv = document.getElementById('mov-search-results');
    
    if (!searchInput || !resultsDiv) return;
    
    const query = searchInput.value.trim().toLowerCase();
    if (query.length < 2) { 
        resultsDiv.innerHTML = ''; 
        return; 
    }

    const results = appData.products.filter(p =>
        (p.descricao_base || '').toLowerCase().includes(query) ||
        (p.ean || '').toString().includes(query) ||
        (p.id_interno || '').toString().includes(query)
    ).slice(0, 5);

    resultsDiv.innerHTML = results.map(p => `
                <div style="padding: 10px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;" onclick="selectProductForMov('${p.ean || p.id_interno}')">
                    <div style="font-weight: 700; font-size: 0.8rem; color: white;">${p.descricao_base || p.nome || p.col_b}</div>
                    <div style="font-size: 0.65rem; color: var(--muted);">SKU: ${p.id_interno || p.col_a}</div>
                </div>
            `).join('');
}

function selectProductForMov(id) {
    selectedProductForMov = appData.products.find(p => p.ean == id || p.id_interno == id);
    if (!selectedProductForMov) return;
    
    const infoDiv = document.getElementById('mov-selected-info');
    const resultsDiv = document.getElementById('mov-search-results');
    const searchInput = document.getElementById('mov-search');

    if (infoDiv) {
        infoDiv.classList.remove('hidden');
        infoDiv.innerHTML = `
                    <div style="font-weight: 800; color: white; font-size: 0.85rem;">${selectedProductForMov.descricao_base || selectedProductForMov.nome || selectedProductForMov.col_b}</div>
                    <div style="font-size: 0.65rem; color: var(--muted);">ID: ${selectedProductForMov.id_interno || selectedProductForMov.col_a}</div>
                `;
    }
    
    if (resultsDiv) resultsDiv.innerHTML = '';
    if (searchInput) searchInput.value = selectedProductForMov.descricao_base || selectedProductForMov.nome || selectedProductForMov.col_b;
}

async function saveMovimentacao(tipo) {
    if (isFinalizing) return;
    isFinalizing = true;

    const qtyInput = document.getElementById('mov-qty');
    const obsInput = document.getElementById('mov-obs');
    const origemInput = document.getElementById('mov-origem');
    const destinoInput = document.getElementById('mov-destino');

    if (!qtyInput || !origemInput) {
        showToast("Erro: Campos de movimentação não encontrados.");
        return;
    }

    const qty = parseFloat(qtyInput.value);
    const obs = obsInput ? obsInput.value.trim() : "";
    const localOrigem = origemInput.value;
    const localDestino = destinoInput?.value || '';

    if (!selectedProductForMov || isNaN(qty) || qty <= 0) {
        showToast("Selecione o produto e a quantidade.");
        return;
    }

    const movData = {
        action: 'movimento',
        tipo: tipo === 'TRANSFERÊNCIA' ? 'TRANSFERENCIA' : tipo,
        id_interno: selectedProductForMov.id_interno || selectedProductForMov.col_a,
        local: localOrigem, // Para tipos que usam apenas 'local' no script
        local_origem: localOrigem,
        local_destino: localDestino,
        quantidade: qty,
        usuario: localStorage.getItem('currentUser'),
        origem: 'APP_MOBILE',
        observacao: obs
    };

    showToast("Processando movimento...");

    if (SCRIPT_URL) {
        try {
            const success = await safePost(movData);

            if (success) {
                showToast("Movimento registrado!");
            }

            // Atualização local otimista para o histórico
            if (!appData.movimentacoes) appData.movimentacoes = [];
            appData.movimentacoes.unshift({
                movimento_id: 'MOV-' + Date.now(),
                data: new Date().toLocaleString('pt-BR'),
                ...movData
            });

            setTimeout(() => renderMovimentacoesSubMenu(), 1500);
        } catch (e) {
            console.error(e);
            showToast("Erro ao processar movimento.");
        } finally {
            isFinalizing = false;
        }
    } else {
        showToast("Modo offline: SCRIPT_URL não configurado.");
    }
}

function renderMovimentacoesHistory() {
    const currentUser = localStorage.getItem('currentUser');
    const history = (appData.movimentacoes || []).sort((a, b) => b.movimento_id.localeCompare(a.movimento_id));

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')}
                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">HISTÓRICO DE MOVIMENTAÇÕES</h2>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                            ${history.length === 0 ? `
                                <div style="text-align: center; padding: 40px; color: var(--muted);">Nenhuma movimentação encontrada.</div>
                            ` : history.map(m => `
                                <div style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                        <div style="font-size: 0.65rem; color: var(--primary); font-weight: 800;">${m.tipo}</div>
                                        <div style="font-size: 0.65rem; color: var(--muted);">${m.data}</div>
                                    </div>
                                    <div style="font-size: 0.85rem; font-weight: 700; color: white; margin-bottom: 4px;">ID: ${m.id_interno} | Qtd: ${m.quantidade}</div>
                                    <div style="font-size: 0.65rem; color: var(--muted);">De: ${m.local_origem} -> Para: ${m.local_destino}</div>
                                    <div style="font-size: 0.65rem; color: var(--muted); margin-top: 4px;">Por: ${m.usuario} | Obs: ${m.observacao || '-'}</div>
                                </div>
                            `).join('')}
                        </div>
                    </main>
                </div>
            `;
}

let isStartingInventory = false;
async function startInventarioInicial() {
    if (isStartingInventory) return;

    // Verificar se já existe inventário ABERTO no mesmo local (padrão TERREO)
    const localPadrao = 'TERREO';
    const aberto = (appData.inventario || []).find(inv => inv.status === 'ABERTO' && (inv.local === localPadrao || inv.col_c === localPadrao));
    if (aberto) {
        showToast(`Já existe um inventário ABERTO no local ${localPadrao}!`, 'error');
        viewInventoryDetails(aberto.inventario_id || aberto.col_a);
        return;
    }

    isStartingInventory = true;
    try {
        const count = (appData.inventario || []).length + 1;
        const seq = String(count).padStart(3, '0');
        const dateStr = new Date().getFullYear() +
            String(new Date().getMonth() + 1).padStart(2, '0') +
            String(new Date().getDate()).padStart(2, '0');

        const sessionId = `INV-INI-${dateStr}-${seq}`;
        const currentUser = localStorage.getItem('currentUser');

        const sessionData = {
            id: sessionId,
            user: currentUser,
            date: new Date().toISOString(),
            items: [],
            local: localPadrao,
            type: 'INICIAL',
            filter: 'TOTAL',
            status: 'ABERTO'
        };

        appData.currentInventory = sessionData;

        // Create session on server
        await saveInventorySessionSummary(sessionId, 'ABERTO');

        renderInventarioInicialScreen(sessionId);
    } finally {
        isStartingInventory = false;
    }
}

async function startInventarioGeral() {
    if (isStartingInventory) return;

    // Verificar se já existe inventário ABERTO no mesmo local (padrão TERREO)
    const localPadrao = 'TERREO';
    const aberto = (appData.inventario || []).find(inv => inv.status === 'ABERTO' && (inv.local === localPadrao || inv.col_c === localPadrao));
    if (aberto) {
        showToast(`Já existe um inventário ABERTO no local ${localPadrao}!`, 'error');
        viewInventoryDetails(aberto.inventario_id || aberto.col_a);
        return;
    }

    isStartingInventory = true;
    try {
        const count = (appData.inventario || []).length + 1;
        const seq = String(count).padStart(3, '0');
        const dateStr = new Date().getFullYear() +
            String(new Date().getMonth() + 1).padStart(2, '0') +
            String(new Date().getDate()).padStart(2, '0');

        const sessionId = `INV-GER-${dateStr}-${seq}`;
        const currentUser = localStorage.getItem('currentUser');

        const sessionData = {
            id: sessionId,
            user: currentUser,
            date: new Date().toISOString(),
            items: [],
            local: localPadrao,
            type: 'GERAL',
            filter: 'TOTAL',
            status: 'ABERTO'
        };

        appData.currentInventory = sessionData;

        // Create session on server
        await saveInventorySessionSummary(sessionId, 'ABERTO');

        renderInventarioInicialScreen(sessionId);
    } finally {
        isStartingInventory = false;
    }
}

async function startInventarioParcial(category, brand, location, inventoryLocal) {
    if (isStartingInventory) return;

    // Verificar se já existe inventário ABERTO no mesmo local
    const aberto = (appData.inventario || []).find(inv => inv.status === 'ABERTO' && (inv.local === inventoryLocal || inv.col_c === inventoryLocal));
    if (aberto) {
        showToast(`Já existe um inventário ABERTO no local ${inventoryLocal}!`, 'error');
        viewInventoryDetails(aberto.inventario_id || aberto.col_a);
        return;
    }

    isStartingInventory = true;
    try {
        const count = (appData.inventario || []).length + 1;
        const seq = String(count).padStart(3, '0');
        const dateStr = new Date().getFullYear() +
            String(new Date().getMonth() + 1).padStart(2, '0') +
            String(new Date().getDate()).padStart(2, '0');

        const sessionId = `INV-PAR-${dateStr}-${seq}`;
        const currentUser = localStorage.getItem('currentUser');

        const filterParts = [];
        if (category !== 'TODAS') filterParts.push(`Cat: ${category}`);
        if (brand !== 'TODAS') filterParts.push(`Marca: ${brand}`);
        if (location !== 'TODAS') filterParts.push(`Loc: ${location}`);

        const filterDesc = filterParts.join(' | ') || 'TOTAL';

        const sessionData = {
            id: sessionId,
            user: currentUser,
            date: new Date().toISOString(),
            items: [],
            local: inventoryLocal,
            type: 'PARCIAL',
            filter: filterDesc,
            status: 'ABERTO'
        };

        appData.currentInventory = sessionData;

        // Create session on server
        await saveInventorySessionSummary(sessionId, 'ABERTO');

        renderInventarioInicialScreen(sessionId);
    } finally {
        isStartingInventory = false;
    }
}

function renderInventarioInicialScreen(sessionId) {
    const currentUser = localStorage.getItem('currentUser');
    if (!appData.currentInventory || appData.currentInventory.id !== sessionId) {
        appData.currentInventory = {
            id: sessionId,
            user: currentUser,
            date: new Date().toISOString(),
            local: 'TÉRREO',
            items: [],
            type: 'GERAL',
            filter: '-'
        };
    }

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderInventarioSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <button class="btn-back" onclick="renderInventarioSubMenu()">
                                <span class="material-symbols-rounded">arrow_back</span>
                            </button>
                            <h2 style="font-size: 1.2rem; font-weight: 700;">INVENTÁRIO INICIAL</h2>
                        </div>

                        <div class="search-container" style="background: var(--surface); padding: 20px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 20px;">
                            <div class="form-grid" style="margin-bottom: 20px;">
                                <div class="input-group">
                                    <label>Local do Inventário</label>
                                    <select id="inv-local" class="input-field" onchange="appData.currentInventory.local = this.value">
                                        <option value="TERREO" ${appData.currentInventory.local === 'TERREO' ? 'selected' : ''}>TERREO</option>
                                        <option value="1_ANDAR" ${appData.currentInventory.local === '1_ANDAR' ? 'selected' : ''}>1_ANDAR</option>
                                        <option value="MOSTRUARIO" ${appData.currentInventory.local === 'MOSTRUARIO' ? 'selected' : ''}>MOSTRUARIO</option>
                                        <option value="DEFEITO" ${appData.currentInventory.local === 'DEFEITO' ? 'selected' : ''}>DEFEITO</option>
                                    </select>
                                </div>
                                <div class="input-group">
                                    <label>Sessão ID</label>
                                    <input type="text" class="input-field" value="${sessionId}" disabled style="opacity: 0.6;">
                                </div>
                            </div>

                            <div class="input-group" style="margin-bottom: 0;">
                                <label style="margin-bottom: 12px; display: block; font-size: 0.7rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Bipar ou Digitar EAN</label>
                                <div style="display: flex; gap: 12px;">
                                    <input type="text" id="inv-ean-input" class="input-field" style="flex: 1;" placeholder="EAN do Produto..." onkeydown="if(event.key === 'Enter') { event.preventDefault(); addInventoryItem(); }">
                                    <button class="btn-action" style="padding: 0 20px; min-width: auto; background: var(--primary);" onclick="startScanner(false, false, true)">
                                        <span class="material-symbols-rounded">photo_camera</span>
                                    </button>
                                </div>
                            </div>
                            <div id="scanner-container-inv" class="hidden" style="margin-top: 20px; overflow: hidden; border-radius: 16px; border: 2px solid var(--primary); background: black; position: relative;">
                                <div id="reader-inv" style="width: 100%;"></div>
                                <div style="position: absolute; top: 10px; right: 10px; z-index: 10;">
                                    <button class="btn-action btn-secondary" style="padding: 8px; min-width: auto; border-radius: 50%;" onclick="stopScanner()">
                                        <span class="material-symbols-rounded">close</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div id="inv-items-list" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px;">
                            <!-- Items will be rendered here -->
                        </div>

                        <button id="btn-finish-inv" class="btn-action" style="width: 100%; justify-content: center; padding: 16px; font-size: 1rem; background: #22c55e !important; color: white !important; border: none !important; border-radius: 12px !important; font-weight: bold !important;" onclick="finishInventorySession()">
                            <span class="material-symbols-rounded">check_circle</span>
                            FINALIZAR E SALVAR AGORA
                        </button>
                    </main>
                </div>
            `;
    updateInventoryItemsList();
    document.getElementById('inv-ean-input').focus();
}

async function addInventoryItem(scannedEan = null) {
    const eanInput = document.getElementById('inv-ean-input');
    const ean = (scannedEan || eanInput.value.trim()).toString();
    if (!ean) return;

    const product = appData.products.find(p =>
        (p.ean && p.ean.toString() === ean) ||
        (p.sku_fornecedor && p.sku_fornecedor.toString() === ean) ||
        (p.id_interno && p.id_interno.toString() === ean) ||
        (p.col_a && p.col_a.toString() === ean) ||
        (p.col_b && p.col_b.toString() === ean) ||
        (p.col_c && p.col_c.toString() === ean) ||
        (p.col_A && p.col_A.toString() === ean) ||
        (p.col_B && p.col_B.toString() === ean) ||
        (p.col_C && p.col_C.toString() === ean)
    );

    if (!product) {
        playBeep(false);
        showToast("PRODUTO NÃO ENCONTRADO!");
        if (confirm(`PRODUTO NÃO CADASTRADO!\nCódigo: ${ean}\nDeseja CADASTRAR este produto agora?`)) {
            renderAddProduct(ean);
        } else if (confirm(`Deseja incluir no inventário como "NÃO CADASTRADO" mesmo assim?`)) {
            const newItem = {
                ean: ean,
                name: 'PRODUTO NÃO CADASTRADO',
                brand: 'N/A',
                qty: 1,
                is_new: true,
                id_interno: 'N/A'
            };
            appData.currentInventory.items.unshift(newItem);
            eanInput.value = '';
            eanInput.focus();
            playBeep(true);
            updateInventoryItemsList();
            showToast(`Adicionado (Não Cadastrado): ${ean}`);

            // Save to server
            saveInventoryItemToServer(newItem);
        } else {
            eanInput.value = '';
            eanInput.focus();
        }
        return;
    }

    let itemToSave = null;
    const existingItem = appData.currentInventory.items.find(item => item.ean.toString() === (product.ean || product.col_a || product.col_A || ean).toString());
    if (existingItem) {
        existingItem.qty += 1;
        itemToSave = existingItem;
    } else {
        const descCompleta = product.col_aa || product.col_26 || product.descricao_completa || product.nome || product.col_b || 'S/ DESCRIÇÃO';

        const newItem = {
            ean: product.ean || product.col_a || product.col_A || ean,
            name: descCompleta,
            brand: product.marca || product.col_c || product.col_C || 'S/ MARCA',
            qty: 1,
            id_interno: product.id_interno || product.col_a || ''
        };
        appData.currentInventory.items.unshift(newItem);
        itemToSave = newItem;
    }

    eanInput.value = '';
    eanInput.focus();
    playBeep(true);
    updateInventoryItemsList();
    showToast(`Adicionado: ${product.nome || product.col_b || product.col_B || product.col_1 || 'Produto'}`);

    // Save to server immediately
    saveInventoryItemToServer(itemToSave);
}

async function saveInventoryItemToServer(item) {
    if (!SCRIPT_URL) return;

    const inv = appData.currentInventory;
    const product = appData.products.find(p => p.ean == item.ean || p.id_interno == item.id_interno);

    // Buscar saldo_sistema da aba ESTOQUE_ATUAL (appData.products)
    const systemStock = product ? parseFloat((product.estoque_atual || 0).toString().replace(',', '.')) : 0;
    const physicalStock = Number(item.qty || 0);
    const diferenca = physicalStock - systemStock;

    const valorUnitario = product ? parseFloat((product.preco_custo || product.custo || 0).toString().replace(',', '.')) : 0;
    const valorDiferenca = diferenca * valorUnitario;

    const formatBR = (iso) => {
        const d = new Date(iso);
        return d.toLocaleString('pt-BR');
    };

    const data = {
        inventario_id: inv.id,
        id_interno: item.id_interno || '',
        local: inv.local,
        saldo_sistema: systemStock,
        saldo_fisico: physicalStock,
        diferenca: diferenca,
        valor_unitario: valorUnitario,
        valor_diferenca: valorDiferenca,
        auditado_em: formatBR(new Date().toISOString()),
        usuario: localStorage.getItem('currentUser')
    };

    console.log("Saving inventory item to server:", data);
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'append',
                sheet: 'INVENTARIO_ITENS',
                data: data
            })
        });
    } catch (e) {
        console.error("Error saving inventory item:", e);
    }
}

async function saveInventorySessionSummary(sessionId, status = 'ABERTO') {
    if (!SCRIPT_URL) return false;

    const inv = appData.currentInventory;
    const user = localStorage.getItem('currentUser');

    const formatBR = (iso) => {
        const d = new Date(iso);
        return d.toLocaleString('pt-BR');
    };

    const data = {
        inventario_id: sessionId,
        tipo: inv.type,
        filtro: inv.filter || '-',
        data_inicio: formatBR(inv.date),
        data_fim: status === 'FECHADO' ? formatBR(new Date().toISOString()) : '-',
        status: status,
        criado_por: user,
        total_skus: inv.items.length,
        total_itens_contados: inv.items.reduce((acc, item) => acc + Number(item.qty || 0), 0),
        total_divergencias: inv.total_divergencias || 0,
        valor_ajuste_positivo: inv.valor_ajuste_positivo || 0,
        valor_ajuste_negativo: inv.valor_ajuste_negativo || 0
    };

    console.log(`Saving inventory session summary (${status}):`, data);
    try {
        // Se o inventário já existe no appData.inventario, usamos update, senão append
        const exists = (appData.inventario || []).some(i => (i.inventario_id || i.col_a) === sessionId);
        const action = exists ? 'update' : 'append';

        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: action,
                sheet: 'INVENTARIOS',
                keyField: action === 'update' ? 'inventario_id' : undefined,
                keyValue: action === 'update' ? sessionId : undefined,
                data: data
            })
        });

        // Update local state to prevent duplicate appends
        if (action === 'append') {
            if (!appData.inventario) appData.inventario = [];
            appData.inventario.push({
                ...data,
                // Map to column names if needed by other parts of the app
                col_a: data.inventario_id,
                col_b: data.criado_por,
                col_c: inv.local,
                col_d: inv.date,
                status: data.status
            });
        } else {
            const localInv = appData.inventario.find(i => (i.inventario_id || i.col_a) === sessionId);
            if (localInv) {
                Object.assign(localInv, data);
            }
        }

        return true;
    } catch (e) {
        console.error("Error saving session summary:", e);
        return false;
    }
}

function updateInventoryItemsList() {
    const listContainer = document.getElementById('inv-items-list');
    if (!listContainer) return;

    if (appData.currentInventory.items.length === 0) {
        listContainer.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: var(--muted); background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.1);">
                        <p>Nenhum item bipado ainda.</p>
                    </div>
                `;
        return;
    }

    listContainer.innerHTML = appData.currentInventory.items.map((item, index) => `
                <div class="fade-in" style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid ${item.is_new ? 'var(--danger)' : 'rgba(255,255,255,0.05)'}; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 4px; color: ${item.is_new ? 'var(--danger)' : 'white'};">${item.name}</div>
                        <div style="font-size: 0.7rem; color: var(--muted); font-family: 'Roboto Mono', monospace; margin-bottom: 2px;">SKU: ${item.id_interno || '-'}</div>
                        <div style="font-size: 0.7rem; color: var(--muted); font-family: 'Roboto Mono', monospace;">EAN: ${item.ean}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="display: flex; align-items: center; background: rgba(255,255,255,0.05); border-radius: 12px; padding: 4px;">
                            <button style="background: transparent; border: none; color: white; padding: 8px; cursor: pointer;" onclick="adjustInventoryQty(${index}, -1)">
                                <span class="material-symbols-rounded" style="font-size: 20px;">remove</span>
                            </button>
                            <span style="font-weight: 700; min-width: 30px; text-align: center; font-family: 'Roboto Mono', monospace;">${item.qty}</span>
                            <button style="background: transparent; border: none; color: white; padding: 8px; cursor: pointer;" onclick="adjustInventoryQty(${index}, 1)">
                                <span class="material-symbols-rounded" style="font-size: 20px;">add</span>
                            </button>
                        </div>
                        <button style="background: rgba(225, 29, 72, 0.1); border: none; color: var(--danger); padding: 8px; border-radius: 10px; cursor: pointer;" onclick="removeInventoryItem(${index})">
                            <span class="material-symbols-rounded" style="font-size: 20px;">delete</span>
                        </button>
                    </div>
                </div>
            `).join('');
}

async function adjustInventoryQty(index, delta) {
    const item = appData.currentInventory.items[index];
    item.qty = Math.max(1, item.qty + delta);
    updateInventoryItemsList();

    // Update server
    saveInventoryItemToServer(item);
}

async function removeInventoryItem(index) {
    const item = appData.currentInventory.items[index];
    if (confirm(`Deseja remover o item ${item.name} do inventário?`)) {
        appData.currentInventory.items.splice(index, 1);
        updateInventoryItemsList();

        // For removal, we could send a special action or just ignore it.
        // Usually, the final summary will be the source of truth.
        // But since we are saving beeps, we'll just show a toast.
        showToast("Item removido localmente. O ajuste final considerará apenas os itens presentes.");
    }
}

window.finishInventorySession = async function () {
    if (isFinalizing) return;
    isFinalizing = true;

    if (appData.currentInventory.items.length === 0) {
        showToast("Não é possível fechar um inventário sem itens!", "error");
        isFinalizing = false;
        return;
    }

    const btn = document.getElementById('btn-finish-inv');
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.innerHTML = '<span class="material-symbols-rounded animate-spin">sync</span> PROCESSANDO...';
    }

    try {
        const sessionId = appData.currentInventory.id;
        const type = appData.currentInventory.type;
        const local = appData.currentInventory.local;
        const user = localStorage.getItem('currentUser');
        const dateEnd = new Date().toISOString();

        const formatBR = (iso) => {
            const d = new Date(iso);
            return d.toLocaleString('pt-BR');
        };

        // 1. Session Totals Calculation
        const totalSkus = appData.currentInventory.items.length;
        const totalItemsCounted = appData.currentInventory.items.reduce((acc, item) => acc + Number(item.qty || 0), 0);

        let totalDivergencias = 0;
        let valorAjustePositivo = 0;
        let valorAjusteNegativo = 0;

        const inventoryItems = appData.currentInventory.items.map(item => {
            const product = appData.products.find(p => p.ean == item.ean || p.id_interno == item.id_interno);
            const systemStock = product ? parseFloat((product.estoque_atual || 0).toString().replace(',', '.')) : 0;
            const physicalStock = Number(item.qty || 0);
            const diferenca = physicalStock - systemStock;

            const valorUnitario = product ? parseFloat((product.preco_custo || product.custo || 0).toString().replace(',', '.')) : 0;
            const valorDiferenca = diferenca * valorUnitario;

            if (diferenca !== 0) totalDivergencias++;
            if (valorDiferenca > 0) valorAjustePositivo += valorDiferenca;
            if (valorDiferenca < 0) valorAjusteNegativo += Math.abs(valorDiferenca);

            return {
                inventario_id: sessionId,
                id_interno: product ? (product.id_interno || product.col_a || '') : '',
                local: local,
                saldo_sistema: systemStock,
                saldo_fisico: physicalStock,
                diferenca: diferenca,
                valor_unitario: valorUnitario,
                valor_diferenca: valorDiferenca,
                auditado_em: formatBR(dateEnd),
                usuario: user
            };
        });

        // Update current inventory object with totals for summary
        appData.currentInventory.total_divergencias = totalDivergencias;
        appData.currentInventory.valor_ajuste_positivo = valorAjustePositivo;
        appData.currentInventory.valor_ajuste_negativo = valorAjusteNegativo;

        // 2. Update Session Summary on Server
        showToast("Finalizando sessão no servidor...");

        if (SCRIPT_URL) {
            // Update session status to FECHADO
            await saveInventorySessionSummary(sessionId, 'FECHADO');

            const itemsWithDiff = inventoryItems.filter(item => item.diferenca !== 0);
            const totalSteps = itemsWithDiff.length;
            let currentStep = 0;

            const updateProgress = () => {
                currentStep++;
                if (btn) {
                    const percent = Math.round((currentStep / totalSteps) * 100);
                    btn.innerHTML = `<span class="material-symbols-rounded animate-spin">sync</span> AJUSTANDO ESTOQUE ${percent}%...`;
                }
            };

            // 3. Gerar movimentos de AJUSTE_INVENTARIO para divergências
            // Usando safePost para garantir sincronização mesmo com queda de rede no meio do loop
            for (const item of itemsWithDiff) {
                try {
                    await safePost({
                        action: 'movimento',
                        tipo: 'AJUSTE_INVENTARIO',
                        id_interno: item.id_interno,
                        local: local,
                        quantidade: item.diferenca,
                        usuario: user,
                        origem: 'APP_INVENTARIO',
                        observacao: `Ajuste via Inventário ${type} ${sessionId}`
                    });
                } catch (e) {
                    console.error("Erro ao enfileirar movimento:", e);
                }
                updateProgress();
            }

            showToast("Inventário finalizado com sucesso!");
            renderInventorySuccessScreen();
            loadAllData(true); // Silent reload
        } else {
            window.alert('ERRO: URL do servidor não configurada.');
        }
    } catch (err) {
        console.error("Erro crítico no salvamento:", err);
        window.alert('ERRO AO SALVAR: ' + err.message);
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.innerHTML = '<span class="material-symbols-rounded">check_circle</span> FINALIZAR E SALVAR AGORA';
        }
    } finally {
        isFinalizing = false;
    }
}

function renderInventorySuccessScreen() {
    const currentUser = localStorage.getItem('currentUser');
    appData.currentInventory = null; // Limpa o inventário atual

    app.innerHTML = `
                <div class="dashboard-screen fade-in" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; text-align: center; padding: 20px;">
                    <div style="background: var(--surface); padding: 40px; border-radius: 24px; border: 1px solid var(--primary); box-shadow: 0 20px 40px rgba(0,0,0,0.4); max-width: 400px; width: 100%;">
                        <span class="material-symbols-rounded" style="font-size: 80px; color: #22c55e; margin-bottom: 20px;">check_circle</span>
                        <h2 style="font-size: 1.8rem; margin-bottom: 10px; color: white;">INVENTÁRIO SALVO!</h2>
                        <p style="color: var(--muted); margin-bottom: 20px;">Os dados foram enviados para a planilha.</p>
                        
                        <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 16px; margin-bottom: 30px; text-align: left;">
                            <div style="display: flex; align-items: center; gap: 10px; color: #38bdf8; font-size: 0.8rem; font-weight: 700; margin-bottom: 8px;">
                                <span class="material-symbols-rounded" style="font-size: 18px;">info</span>
                                DICA DE SINCRONIZAÇÃO
                            </div>
                            <p style="font-size: 0.75rem; color: var(--muted); line-height: 1.4;">
                                O estoque está sendo atualizado em segundo plano. Recomendamos clicar no ícone de <b>sincronização</b> no menu principal após alguns instantes para garantir que todos os dados locais estejam 100% atualizados.
                            </p>
                        </div>

                        <button class="btn-action" style="width: 100%; justify-content: center; padding: 16px; background: var(--primary) !important;" onclick="renderInventarioSubMenu()">
                            <span class="material-symbols-rounded">inventory_2</span>
                            VOLTAR AO INVENTÁRIO
                        </button>
                    </div>
                </div>
            `;

    playBeep(true);
}

function renderInventarioSubMenu() {
    stopScanner();
    const currentUser = localStorage.getItem('currentUser');
    const subItems = [
        { id: 'inv_inicial', label: 'INVENTÁRIO INICIAL', icon: 'package_2', onclick: 'startInventarioInicial()' },
        { id: 'inv_geral', label: 'INVENTÁRIO GERAL', icon: 'fact_check', onclick: 'startInventarioGeral()' },
        { id: 'inv_parcial', label: 'INVENTÁRIO PARCIAL', icon: 'analytics', onclick: 'renderInventarioParcialForm()' },
        { id: 'historico_inv', label: 'HISTÓRICO', icon: 'receipt_long', onclick: 'renderInventarioHistory()' }
    ];

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">INVENTÁRIO</h2>
                        </div>
                        <div class="menu-grid">
                            ${subItems.map(item => `
                                <div class="menu-card" onclick="${item.onclick}">
                                    <span class="material-symbols-rounded icon">${item.icon}</span>
                                    <span class="label">${item.label}</span>
                                </div>
                            `).join('')}
                        </div>
                    </main>
                </div>
            `;
}

function renderInventarioParcialForm() {
    const currentUser = localStorage.getItem('currentUser');

    // Extrair valores únicos dos produtos para os filtros
    const categories = [...new Set(appData.products.map(p => p.categoria || p.col_j || p.col_J).filter(Boolean))].sort();
    const brands = [...new Set(appData.products.map(p => p.marca || p.col_c || p.col_C).filter(Boolean))].sort();
    const locations = [...new Set(appData.products.map(p => p.localizacao || p.col_v || p.col_V).filter(Boolean))].sort();

    const inventoryLocals = ['TERREO', '1_ANDAR', 'MOSTRUARIO', 'DEFEITO'];

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderInventarioSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">CONFIGURAR PARCIAL</h2>
                        </div>

                        <div style="background: var(--surface); padding: 24px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                            <div style="margin-bottom: 20px;">
                                <label style="display: block; font-size: 0.7rem; color: var(--muted); margin-bottom: 8px; font-weight: 800;">FILTRAR POR CATEGORIA</label>
                                <select id="parcial-cat" style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 14px; border-radius: 12px; font-size: 1rem;">
                                    <option value="TODAS">TODAS AS CATEGORIAS</option>
                                    ${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                                </select>
                            </div>

                            <div style="margin-bottom: 20px;">
                                <label style="display: block; font-size: 0.7rem; color: var(--muted); margin-bottom: 8px; font-weight: 800;">FILTRAR POR MARCA</label>
                                <select id="parcial-brand" style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 14px; border-radius: 12px; font-size: 1rem;">
                                    <option value="TODAS">TODAS AS MARCAS</option>
                                    ${brands.map(brand => `<option value="${brand}">${brand}</option>`).join('')}
                                </select>
                            </div>

                            <div style="margin-bottom: 20px;">
                                <label style="display: block; font-size: 0.7rem; color: var(--muted); margin-bottom: 8px; font-weight: 800;">FILTRAR POR LOCALIZAÇÃO / SETOR</label>
                                <select id="parcial-loc" style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 14px; border-radius: 12px; font-size: 1rem;">
                                    <option value="TODAS">TODAS AS LOCALIZAÇÕES</option>
                                    ${locations.map(loc => `<option value="${loc}">${loc}</option>`).join('')}
                                </select>
                            </div>

                            <div style="margin-bottom: 24px;">
                                <label style="display: block; font-size: 0.7rem; color: var(--muted); margin-bottom: 8px; font-weight: 800;">LOCAL DO INVENTÁRIO (DEPÓSITO)</label>
                                <select id="parcial-inv-local" style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 14px; border-radius: 12px; font-size: 1rem;">
                                    ${inventoryLocals.map(l => `<option value="${l}">${l}</option>`).join('')}
                                </select>
                            </div>

                            <button class="btn-action" style="width: 100%; justify-content: center; padding: 16px;" onclick="startInventarioParcial(
                                document.getElementById('parcial-cat').value, 
                                document.getElementById('parcial-brand').value,
                                document.getElementById('parcial-loc').value,
                                document.getElementById('parcial-inv-local').value
                            )">
                                <span class="material-symbols-rounded">play_arrow</span>
                                INICIAR INVENTÁRIO PARCIAL
                            </button>
                        </div>
                    </main>
                </div>
            `;
}

function renderInventarioHistory() {
    const currentUser = localStorage.getItem('currentUser');

    // Função para limpar a data confusa do Google Sheets (Reutilizada)
    const formatViewDate = (dateVal) => {
        if (!dateVal) return '-';
        if (typeof dateVal === 'string' && dateVal.includes('Date(')) {
            const parts = dateVal.match(/\d+/g);
            if (parts) {
                // Google Sheets Date(Y,M,D) where M is 0-indexed
                const d = new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0);
                return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            }
        }
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) {
            // Try parsing common Sheets formats if standard fails
            return dateVal;
        }
        return d.toLocaleString('pt-BR');
    };

    const safeParseDate = (dateVal) => {
        if (!dateVal) return 0;
        if (typeof dateVal === 'string' && dateVal.includes('Date(')) {
            const parts = dateVal.match(/\d+/g);
            if (parts) return new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0).getTime();
        }
        const d = new Date(dateVal);
        return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    const history = (appData.inventario || []).sort((a, b) => {
        const dateA = safeParseDate(a.data_inicio || a.date || a.col_d);
        const dateB = safeParseDate(b.data_inicio || b.date || b.col_d);
        return dateB - dateA;
    });

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderInventarioSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">HISTÓRICO DE INVENTÁRIO</h2>
                        </div>

                        ${history.length === 0 ? `
                            <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">history</span>
                                <p style="color: var(--muted);">Nenhum inventário encontrado.</p>
                            </div>
                        ` : `
                            <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                                ${history.map(item => {
        const id = item.inventario_id || item.session_id || item.col_a;
        const date = item.data_inicio || item.date || item.col_d;
        const user = item.criado_por || item.user || item.col_b;
        const status = item.status || 'CONCLUÍDO';

        return `
                                        <div style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); cursor: pointer;" onclick="viewInventoryDetails('${id}')">
                                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                                <div>
                                                    <div style="font-weight: 800; color: white; font-size: 0.9rem;">${id || '-'}</div>
                                                    <div style="font-size: 0.65rem; color: var(--muted);">${formatViewDate(date)}</div>
                                                </div>
                                                <div style="background: rgba(34, 197, 94, 0.1); color: #22c55e; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 800;">
                                                    ${status}
                                                </div>
                                            </div>
                                            <div style="font-size: 0.65rem; color: var(--muted); margin-top: 4px;">Por: ${user || '-'}</div>
                                        </div>
                                    `;
    }).join('')}
                            </div>
                        `}
                    </main>
                </div>
            `;
}

function viewInventoryDetails(sessionId) {
    const currentUser = localStorage.getItem('currentUser');
    const session = appData.inventario.find(s => (s.inventario_id || s.session_id || s.col_a) === sessionId);
    const items = (appData.inventario_itens || []).filter(i => (i.inventario_id || i.session_id || i.col_a) === sessionId);
    const status = session ? (session.status || 'CONCLUÍDO') : 'CONCLUÍDO';

    // Função para limpar a data confusa do Google Sheets
    const formatViewDate = (dateVal) => {
        if (!dateVal) return '-';
        if (typeof dateVal === 'string' && dateVal.includes('Date(')) {
            // Converte Date(2026,2,3,...) para objeto Date real
            const parts = dateVal.match(/\d+/g);
            if (parts) {
                const d = new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0);
                return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            }
        }
        const d = new Date(dateVal);
        return isNaN(d.getTime()) ? dateVal : d.toLocaleString('pt-BR');
    };

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderInventarioHistory()')}

                    <main class="container">
                        <div class="sub-menu-header" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="font-size: 0.7rem; color: var(--primary); font-weight: 800; letter-spacing: 0.1em;">DETALHES DO INVENTÁRIO</div>
                            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                                <h2 style="font-size: 1.2rem; font-weight: 700;">${sessionId}</h2>
                                <div style="background: ${status === 'ABERTO' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)'}; color: ${status === 'ABERTO' ? '#3b82f6' : '#22c55e'}; padding: 4px 12px; border-radius: 99px; font-size: 0.7rem; font-weight: 800;">
                                    ${status}
                                </div>
                            </div>
                        </div>

                        <div style="background: var(--surface); padding: 20px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 20px;">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                                <div>
                                    <div style="font-size: 0.6rem; color: var(--muted); text-transform: uppercase;">Início</div>
                                    <div style="font-size: 0.85rem; color: white; font-weight: 600;">${formatViewDate(session ? (session.data_inicio || session.date) : null)}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.6rem; color: var(--muted); text-transform: uppercase;">Responsável</div>
                                    <div style="font-size: 0.85rem; color: white; font-weight: 600;">${session ? (session.criado_por || session.user || session.col_b) : '-'}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.6rem; color: var(--muted); text-transform: uppercase;">Total Itens (Peças)</div>
                                    <div style="font-size: 0.85rem; color: white; font-weight: 600;">${session ? (session.total_items || items.reduce((acc, i) => acc + Number(i.saldo_fisico || 0), 0)) : 0}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.6rem; color: var(--muted); text-transform: uppercase;">Produtos Únicos</div>
                                    <div style="font-size: 0.85rem; color: white; font-weight: 600;">${items.length}</div>
                                </div>
                            </div>
                        </div>

                        ${status === 'ABERTO' ? `
                            <button class="btn-action" style="width: 100%; justify-content: center; padding: 16px; margin-bottom: 20px; background: var(--primary);" onclick="continueInventory('${sessionId}')">
                                <span class="material-symbols-rounded">play_arrow</span>
                                CONTINUAR CONTAGEM
                            </button>
                        ` : ''}

                        <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                            ${items.map(item => {
        const prod = item.descricao_completa || item.produto || item.product || item.col_f || 'Produto';
        const ean = item.ean || item.col_e || '-';
        const sku = item.id_interno || item.col_d || '-';
        const fis = item.saldo_fisico || item.qty || item.col_h || 0;
        const sis = item.saldo_sistema || item.col_g || 0;
        const dif = item.diferenca || item.col_i || 0;

        return `
                                    <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                            <div style="flex: 1; padding-right: 12px;">
                                                <div style="font-size: 0.85rem; font-weight: 700; color: white; line-height: 1.2; margin-bottom: 6px;">${prod}</div>
                                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                                    <span style="font-size: 0.65rem; color: var(--muted); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; width: fit-content;">SKU: ${sku}</span>
                                                    <span style="font-size: 0.65rem; color: var(--muted); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; width: fit-content;">EAN: ${ean}</span>
                                                </div>
                                            </div>
                                            <div style="text-align: right;">
                                                <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary);">${fis}</div>
                                                <div style="font-size: 0.55rem; color: var(--muted); text-transform: uppercase;">Contado</div>
                                            </div>
                                        </div>
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px; margin-top: 8px;">
                                            <div style="font-size: 0.6rem; color: var(--muted);">SISTEMA: <span style="color: white;">${sis}</span></div>
                                            <div style="font-size: 0.6rem; color: var(--muted);">DIF: <span style="${dif < 0 ? 'color: #ef4444;' : 'color: #22c55e;'}">${dif > 0 ? '+' : ''}${dif}</span></div>
                                        </div>
                                    </div>
                                `;
    }).join('')}
                        </div>
                    </main>
                </div>
            `;
}

function continueInventory(sessionId) {
    const session = appData.inventario.find(s => (s.inventario_id || s.session_id || s.col_a) === sessionId);
    const items = (appData.inventario_itens || []).filter(i => (i.inventario_id || i.session_id || i.col_a) === sessionId);

    if (!session) {
        showToast("Sessão não encontrada!", "error");
        return;
    }

    // Reconstruir o objeto currentInventory
    appData.currentInventory = {
        id: sessionId,
        user: session.criado_por || session.user || session.col_b,
        date: session.data_inicio || session.date || new Date().toISOString(),
        local: session.local || session.col_c || 'TERREO',
        type: session.tipo || 'GERAL',
        filter: session.filtro || '-',
        status: 'ABERTO',
        items: items.map(i => ({
            ean: i.ean || i.col_e,
            name: i.descricao_completa || i.produto || i.col_f,
            brand: 'S/ MARCA',
            qty: Number(i.saldo_fisico || i.qty || i.col_h || 0),
            id_interno: i.id_interno || i.col_d
        }))
    };

    renderInventarioInicialScreen(sessionId);
}

function renderStockCritical() {
    const currentUser = localStorage.getItem('currentUser');
    const criticalProducts = appData.products.filter(p => {
        const stock = parseFloat((p.estoque_atual || p.estoque_minimo || 0).toString().replace(',', '.'));
        const min = parseFloat((p.estoque_minimo || 0).toString().replace(',', '.'));
        return stock <= min && min > 0;
    });

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderProductSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">${hasCriticalStock ? 'ESTOQUE CRÍTICO' : 'ESTOQUE MÍNIMO'}</h2>
                        </div>

                        <div id="critical-results">
                            ${criticalProducts.length === 0 ? `
                                <div style="text-align: center; padding: 40px; background: var(--surface); border-radius: 20px; color: var(--muted);">
                                    <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 16px; color: #22c55e;">check_circle</span>
                                    <p>Nenhum produto com estoque crítico.</p>
                                </div>
                            ` : `
                                <div style="display: flex; flex-direction: column; gap: 16px;">
                                    <p style="font-size: 0.8rem; font-weight: 700; color: var(--muted); text-transform: uppercase;">Produtos abaixo do mínimo (${criticalProducts.length})</p>
                                    ${criticalProducts.map(p => `
                                        <div class="menu-card" style="flex-direction: row; justify-content: flex-start; padding: 16px; gap: 20px; min-height: auto; text-align: left; border-left: 4px solid var(--danger);" onclick="showProductDetails('${p.ean}')">
                                            <div style="width: 60px; height: 60px; background: rgba(255,255,255,0.05); border-radius: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                                                ${p.url_imagem ? `<img src="${formatImageUrl(p.url_imagem)}" style="width: 100%; height: 100%; object-fit: cover;">` : `<span class="material-symbols-rounded" style="color: var(--muted)">image</span>`}
                                            </div>
                                            <div style="flex: 1;">
                                                <div style="font-weight: 700; color: white; font-size: 0.9rem; margin-bottom: 4px;">${p.descricao_base || 'Sem Descrição'}</div>
                                                <div style="font-size: 0.75rem; color: var(--muted);">SKU: ${p.sku_fornecedor || '-'} | EAN: ${p.ean || '-'}</div>
                                                <div style="display: flex; gap: 10px; margin-top: 8px;">
                                                    <span style="background: var(--danger); color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: 700;">EST: ${p.estoque_atual || p.estoque_minimo || '0'}</span>
                                                    <span style="background: rgba(255,255,255,0.1); color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: 700;">MIN: ${p.estoque_minimo || '0'}</span>
                                                </div>
                                            </div>
                                            <span class="material-symbols-rounded" style="color: var(--muted)">chevron_right</span>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                        </div>
                    </main>
                </div>
            `;
}

function renderSearchProduct() {
    currentScreen = 'search';
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderProductSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">BUSCAR PRODUTO</h2>
                        </div>

                        <div class="search-container" style="background: var(--surface); padding: 20px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                            <div class="input-group" style="margin-bottom: 0;">
                                <label style="margin-bottom: 12px; display: block; font-size: 0.7rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">EAN ou Descrição do Produto</label>
                                <div style="display: flex; gap: 12px; position: relative;">
                                    <div style="position: relative; flex: 1;">
                                        <span class="material-symbols-rounded" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 20px;">search</span>
                                        <input type="text" id="search-input" class="input-field" style="width: 100%; padding-left: 48px;" placeholder="Digite EAN, SKU ou Nome..." oninput="performSearch()" onkeypress="if(event.key === 'Enter') handleSearchEnter(event)">
                                    </div>
                                    <button class="btn-action" style="padding: 0 20px; min-width: auto; background: var(--primary);" onclick="startScanner()">
                                        <span class="material-symbols-rounded">photo_camera</span>
                                    </button>
                                </div>
                            </div>

                            <div id="scanner-container" class="hidden" style="margin-top: 20px; overflow: hidden; border-radius: 16px; border: 2px solid var(--primary); background: black; position: relative; transition: border-color 0.3s ease;">
                                <div id="reader" style="width: 100%;"></div>
                                <div id="scanner-feedback" style="position: absolute; inset: 0; z-index: 5; display: none; align-items: center; justify-content: center; pointer-events: none; transition: background 0.3s ease;">
                                    <div id="scanner-feedback-icon" class="material-symbols-rounded" style="font-size: 80px; color: white; text-shadow: 0 0 20px rgba(0,0,0,0.5);"></div>
                                </div>
                                <div style="position: absolute; top: 10px; right: 10px; z-index: 10;">
                                    <button class="btn-action btn-secondary" style="padding: 8px; min-width: auto; border-radius: 50%;" onclick="stopScanner()">
                                        <span class="material-symbols-rounded">close</span>
                                    </button>
                                </div>
                                <div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 10; background: rgba(0,0,0,0.6); padding: 4px 12px; border-radius: 20px; color: white; font-size: 0.7rem; font-weight: 700; white-space: nowrap;">
                                    POSICIONE O CÓDIGO DE BARRAS
                                </div>
                            </div>
                        </div>

                        <div id="search-results" style="margin-top: 24px;"></div>
                    </main>
                </div>
            `;

    // Focus search input
    setTimeout(() => document.getElementById('search-input')?.focus(), 100);
}

let html5QrCode = null;
let lastScanTime = 0;
let isScannerStarting = false;

async function startScanner(isPicking = false, isConference = false, isInventory = false) {
    if (isScannerStarting) return;
    isScannerStarting = true;

    // Use specific IDs based on context to avoid conflicts
    let containerId = 'scanner-container';
    let readerId = 'reader';
    let inputId = 'search-input';

    if (isInventory) {
        containerId = 'scanner-container-inv';
        readerId = 'reader-inv';
        inputId = 'inv-ean-input';
    } else if (isPicking) {
        containerId = 'scanner-container-pick';
        readerId = 'reader-pick';
        inputId = 'pick-ean-input';
    } else if (isConference) {
        containerId = 'scanner-container-pack';
        readerId = 'reader-pack';
        inputId = 'pack-ean-input';
    }

    const scannerContainer = document.getElementById(containerId);
    const inputField = document.getElementById(inputId);

    if (!scannerContainer) {
        isScannerStarting = false;
        return;
    }

    // Prevent keyboard from opening during scanning
    if (inputField) {
        inputField.setAttribute('inputmode', 'none');
        inputField.blur();
    }

    // Ensure any previous scanner is fully stopped
    try {
        await stopScanner();
        await stopManualNFScanner();
        // Small delay to allow hardware to release
        await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
        console.warn("Error during pre-scan cleanup:", e);
    }

    scannerContainer.classList.remove('hidden');
    scannerContainer.style.borderColor = 'var(--primary)';

    html5QrCode = new Html5Qrcode(readerId);

    // Optimized config for mobile barcode reading
    const config = {
        fps: 25, // Increased FPS for faster detection
        qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.8);
            return { width: size, height: size * 0.5 }; // Wider box for barcodes
        },
        aspectRatio: 1.0,
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
        }
    };

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            async (decodedText) => {
                const now = Date.now();
                if (now - lastScanTime < 1500) return; // Increased debounce to 1.5s
                lastScanTime = now;

                console.log(`Code matched = ${decodedText}`);

                // Check if product exists
                const product = appData.products.find(p =>
                    (p.ean && p.ean.toString() === decodedText.toString()) ||
                    (p.sku_fornecedor && p.sku_fornecedor.toString() === decodedText.toString()) ||
                    (p.id_interno && p.id_interno.toString() === decodedText.toString()) ||
                    (p.col_B && p.col_B.toString() === decodedText.toString())
                );

                if (product) {
                    playBeep('success');
                    await showScannerFeedback('success', containerId);

                    if (isInventory) {
                        addInventoryItem(decodedText);
                    } else if (isPicking) {
                        addPickItem(decodedText);
                    } else if (isConference) {
                        addPackScan(decodedText);
                    } else {
                        await stopScanner();
                        const codeToPass = decodedText.toString().trim();
                        setTimeout(() => showProductDetailsByCode(codeToPass), 100);
                    }
                } else {
                    playBeep('error');
                    await showScannerFeedback('error', containerId);

                    // Reset search input as requested
                    const searchInput = document.getElementById('search-input');
                    if (searchInput) {
                        searchInput.value = '';
                        performSearch();
                    }
                    showToast(`Produto não cadastrado: ${decodedText}`);
                }
            },
            (errorMessage) => {
                // parse error, ignore it.
            }
        );
    } catch (err) {
        console.error("Scanner error:", err);
        showToast("Câmera em uso ou não disponível. Tente novamente.");
        scannerContainer.classList.add('hidden');
    } finally {
        isScannerStarting = false;
    }
}

async function showScannerFeedback(type, containerId = 'scanner-container') {
    const container = document.getElementById(containerId);
    const feedback = document.getElementById('scanner-feedback');
    const icon = document.getElementById('scanner-feedback-icon');

    if (!container || !feedback || !icon) return;

    if (type === 'success') {
        container.style.borderColor = '#22c55e'; // Green
        feedback.style.background = 'rgba(254, 240, 138, 0.3)'; // Light yellow background
        icon.innerText = 'check_circle';
        icon.style.color = '#854d0e'; // Darker yellow icon

        // Show "PRODUTO OK" text if picking or conference
        const feedbackText = document.createElement('div');
        feedbackText.innerText = 'PRODUTO OK';
        feedbackText.style.position = 'absolute';
        feedbackText.style.top = '15%'; // Positioned at the top
        feedbackText.style.background = '#fef08a'; // Light yellow background
        feedbackText.style.color = '#854d0e'; // Darker yellow text
        feedbackText.style.padding = '8px 24px';
        feedbackText.style.borderRadius = '99px';
        feedbackText.style.fontWeight = '900';
        feedbackText.style.fontSize = '1.2rem';
        feedbackText.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
        feedback.appendChild(feedbackText);

        setTimeout(() => feedbackText.remove(), 1200);
    } else {
        container.style.borderColor = '#eab308'; // Yellow
        feedback.style.background = 'rgba(234, 179, 8, 0.4)';
        icon.innerText = 'warning';
    }

    feedback.style.display = 'flex';

    // Wait for feedback to be visible
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Reset feedback
    feedback.style.display = 'none';
    container.style.borderColor = 'var(--primary)';
}

async function stopScanner() {
    if (html5QrCode) {
        try {
            if (html5QrCode.isScanning) {
                await html5QrCode.stop();
            }
        } catch (err) {
            console.error("Error stopping scanner:", err);
        } finally {
            html5QrCode = null;
        }
    }

    // Restore inputmode
    const inputs = ['search-input', 'pick-ean-input', 'pack-ean-input'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.removeAttribute('inputmode');
    });

    // Hide all potential scanner containers
    const containers = [
        'scanner-container',
        'scanner-container-pick',
        'scanner-container-pack'
    ];

    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.classList.add('hidden');
            container.style.borderColor = 'var(--primary)';
        }
    });
}

function showProductDetailsByCode(code) {
    if (!code) return;
    const searchCode = code.toString().trim().toLowerCase();
    
    const product = appData.products.find(p =>
        (p.ean && p.ean.toString().toLowerCase() === searchCode) ||
        (p.sku_fornecedor && p.sku_fornecedor.toString().toLowerCase() === searchCode) ||
        (p.id_interno && p.id_interno.toString().toLowerCase() === searchCode) ||
        (p.col_B && p.col_B.toString().toLowerCase() === searchCode)
    );

    if (product) {
        renderProductDetails(product);
    } else {
        playBeep('error');
        showToast(`PRODUTO NÃO CADASTRADO: ${code}`);
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.value = '';
            performSearch();
            searchInput.focus();
        }
    }
}

function performSearch() {
    if (currentScreen !== 'search') return;
    
    const input = document.getElementById('search-input');
    const resultsContainer = document.getElementById('search-results');
    
    if (!input) return;
    
    const query = input.value.trim().toLowerCase();

    if (!query || query.length < 2) {
        if (resultsContainer) resultsContainer.innerHTML = '';
        return;
    }

    // Auto-open if exact EAN match (likely a scan)
    if (/^\d{8,14}$/.test(query)) {
        const exactProduct = appData.products.find(p => (p.ean || '').toString() === query);
        if (exactProduct) {
            showProductDetails(exactProduct.ean || exactProduct.id_interno);
            input.value = '';
            if (resultsContainer) resultsContainer.innerHTML = '';
            return;
        }
    }

    const results = appData.products.filter(p => {
        const ean = (p.ean || '').toString().toLowerCase();
        const desc = (p.descricao_base || p.descricao_completa || '').toString().toLowerCase();
        const sku = (p.sku_fornecedor || '').toString().toLowerCase();
        const brand = (p.marca || '').toString().toLowerCase();
        const id = (p.id_interno || p.col_a || p.col_A || '').toString().toLowerCase();

        return ean.includes(query) || 
               desc.includes(query) || 
               sku.includes(query) || 
               brand.includes(query) || 
               id.includes(query);
    });

    renderSearchResults(results);
}

function handleSearchEnter(event) {
    if (event.key === 'Enter') {
        const query = event.target.value.trim().toLowerCase();
        const resultsContainer = document.getElementById('search-results');
        
        if (!query) return;

        // Find exact match first
        const product = appData.products.find(p =>
            (p.ean && p.ean.toString().toLowerCase() === query) ||
            (p.id_interno && p.id_interno.toString().toLowerCase() === query) ||
            (p.sku_fornecedor && p.sku_fornecedor.toString().toLowerCase() === query)
        );

        if (product) {
            showProductDetails(product.ean || product.id_interno);
            event.target.value = ''; // Clear input
            if (resultsContainer) resultsContainer.innerHTML = '';
            return;
        }

        // Se não houver correspondência exata, performSearch já filtrou a lista.
        // Se houver apenas um resultado, podemos abrir.
        const results = appData.products.filter(p => {
             const ean = (p.ean || '').toString().toLowerCase();
             const desc = (p.descricao_base || p.descricao_completa || '').toString().toLowerCase();
             return ean.includes(query) || desc.includes(query);
        });

        if (results.length === 1) {
            showProductDetails(results[0].ean || results[0].id_interno);
            event.target.value = '';
            if (resultsContainer) resultsContainer.innerHTML = '';
        }
    }
}

function renderSearchResults(results) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;

    if (results.length === 0) {
        resultsContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px; background: var(--surface); border-radius: 20px; color: var(--muted);">
                        <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 16px;">search_off</span>
                        <p>Nenhum produto encontrado.</p>
                    </div>
                `;
        return;
    }

    resultsContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <p style="font-size: 0.8rem; font-weight: 700; color: var(--muted); text-transform: uppercase;">Resultados (${results.length})</p>
                    ${results.map(p => `
                        <div class="menu-card search-product-card" onclick="showProductDetails('${p.ean || p.id_interno || p.col_A}')">
                            <div class="product-img-container" style="background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.1); border-radius: 50%; overflow: hidden; cursor: pointer;" onclick="event.stopPropagation(); if('${p.url_imagem}') openImageModal(formatImageUrl('${p.url_imagem}'))">
                                ${p.url_imagem ? `<img src="${formatImageUrl(p.url_imagem)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` : `<span class="material-symbols-rounded" style="color: var(--muted)">image</span>`}
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div class="product-title" style="font-weight: 800; color: white; line-height: 1.2; word-break: break-word;">${p.descricao_completa || p.col_aa || p.descricao_base || 'Sem Descrição'}</div>
                                <div class="product-info" style="color: var(--muted);"><span style="color: #fca5a5;">SKU:</span> ${p.sku_fornecedor || '-'} | <span style="color: #fca5a5;">EAN:</span> ${p.ean || '-'}</div>
                                <div class="product-info" style="color: var(--muted);"><span style="color: #fca5a5;">COR:</span> ${p.cor || '-'} | <span style="color: #fca5a5;">MARCA:</span> ${p.marca || '-'}</div>
                                <div style="display: flex; gap: 10px; margin-top: 12px;">
                                    <span class="product-id-badge" style="background: #fef08a; color: #000000; border-radius: 4px; font-weight: 800;">ID: ${p.id_interno || p.col_a || p.col_A || '-'}</span>
                                </div>
                            </div>
                            <span class="material-symbols-rounded" style="color: var(--muted)">chevron_right</span>
                        </div>
                    `).join('')}
                </div>
            `;
}

function showProductDetails(id) {
    const product = appData.products.find(p => p.ean == id || p.id_interno == id);
    if (!product) return;
    renderProductDetails(product);
}

function openImageModal(url) {
    const modal = document.createElement('div');
    modal.id = 'image-modal';
    modal.className = 'image-modal';
    modal.onclick = (e) => { if (e.target.id === 'image-modal') closeImageModal(); };
    modal.innerHTML = `
                <div class="image-modal-content">
                    <button class="image-modal-close" onclick="closeImageModal()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                    <img src="${url}" style="max-width: 100%; max-height: 80vh; border-radius: 12px; display: block; margin: 0 auto;">
                </div>
            `;
    document.body.appendChild(modal);
}

function closeImageModal() {
    const modal = document.getElementById('image-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

function renderProductDetails(p) {
    const currentUser = localStorage.getItem('currentUser');

    // Get stock data from the new ESTOQUE sheet
    const productStockEntries = (appData.estoque || []).filter(s =>
        (s.id_interno && s.id_interno.toString() === (p.id_interno || p.col_A || '').toString())
    );

    // Calculate total stock from ESTOQUE sheet
    const totalStock = productStockEntries.reduce((acc, curr) => {
        const saldo = parseFloat((curr.saldo || '0').toString().replace(',', '.'));
        return acc + (isNaN(saldo) ? 0 : saldo);
    }, 0);

    // Get related products (same description/category but different brands/EANs)
    const relatedProducts = getRelatedProducts(p);
    const hasVariations = relatedProducts.length > 0;

    const pdfUrl = p.url_pdf || p.col_z || p.col_Z || p.col_ab || p.col_AB;

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderSearchProduct()')}

                    <main class="container">
                        <div class="sub-menu-header" style="display: flex; justify-content: space-between; align-items: center;">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">DETALHES DO PRODUTO</h2>
                            ${pdfUrl ? `
                                <button class="btn-action" style="background: #ef4444; padding: 8px 16px; min-width: auto; font-size: 0.7rem;" onclick="window.open('${pdfUrl}', '_blank')">
                                    <span class="material-symbols-rounded" style="font-size: 18px;">picture_as_pdf</span>
                                    PDF PRODUTO
                                </button>
                            ` : ''}
                        </div>

                        <div style="background: var(--surface); border-radius: 24px; padding: 24px; border: 1px solid rgba(255,255,255,0.05);">
                            <div style="display: flex; flex-direction: column; gap: 20px;">
                                <!-- Cabeçalho com Imagem e Título -->
                                <div style="display: flex; gap: 16px; align-items: flex-start;">
                                    <div class="product-img-container" style="width: 80px; height: 80px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); border-radius: 50%; overflow: hidden;" onclick="${p.url_imagem ? `openImageModal(formatImageUrl('${p.url_imagem}'))` : ''}">
                                        ${p.url_imagem ? `<img src="${formatImageUrl(p.url_imagem)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` : `<span class="material-symbols-rounded" style="font-size: 24px; color: var(--muted)">image</span>`}
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <h3 style="font-size: 1rem; font-weight: 800; color: white; margin-bottom: 4px; line-height: 1.2; word-break: break-word;">${p.descricao_completa || p.col_aa || p.descricao_base || 'Sem Descrição'}</h3>
                                        <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 4px;">
                                            <span style="background: #fef08a; color: #000000; font-size: 0.6rem; padding: 1px 6px; border-radius: 4px; font-weight: 800;">ID: ${p.id_interno || p.col_a || p.col_A || '-'}</span>
                                            <span style="color: var(--muted); font-size: 0.65rem;">| <span style="color: #fca5a5;">SKU:</span> ${p.sku_fornecedor || '-'} | <span style="color: #fca5a5;">EAN:</span> ${p.ean || '-'}</span>
                                        </div>
                                        <p style="color: var(--muted); font-size: 0.65rem; margin-top: 2px;"><span style="color: #fca5a5;">MARCA:</span> ${p.marca || '-'} | <span style="color: #fca5a5;">COR:</span> ${p.cor || '-'}</p>
                                    </div>
                                </div>

                                <!-- 1. Preço Varejo (Topo) -->
                                <div style="background: linear-gradient(135deg, var(--primary), #991b1b); padding: 16px; border-radius: 16px; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);">
                                    <div style="font-size: 0.65rem; color: rgba(255,255,255,0.8); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; margin-bottom: 2px;">Preço Varejo</div>
                                    <div style="font-size: 1.5rem; font-weight: 900; color: white;">${(p.preco_varejo || '0,00').toString().includes('R$') ? '' : 'R$ '}${p.preco_varejo || '0,00'}</div>
                                </div>

                                <!-- 2. Estoque Geral (Azul) -->
                                <div style="background: #2563eb; padding: 16px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);">
                                    <div>
                                        <div style="font-size: 0.7rem; color: rgba(255,255,255,0.9); text-transform: uppercase; font-weight: 900; letter-spacing: 0.05em;">Estoque Geral (Total)</div>
                                        <div style="font-size: 1.6rem; font-weight: 900; color: white;">${totalStock} <span style="font-size: 0.9rem;">${p.unidade || 'UN'}</span></div>
                                    </div>
                                    <div style="background: rgba(255,255,255,0.2); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                        <span class="material-symbols-rounded" style="color: white;">inventory_2</span>
                                    </div>
                                </div>

                                <!-- 3. Detalhamento por Localização (Aba ESTOQUE) -->
                                <div style="background: rgba(255,255,255,0.03); padding: 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05);">
                                    <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; font-weight: 800; margin-bottom: 16px; letter-spacing: 0.05em; display: flex; align-items: center; gap: 8px;">
                                        <span class="material-symbols-rounded" style="font-size: 16px; color: #FACC15;">location_on</span>
                                        Distribuição por Localização:
                                    </div>
                                    <div style="display: flex; flex-direction: column; gap: 12px;">
                                        ${productStockEntries.length > 0 ? productStockEntries.map(entry => `
                                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                                                <div style="display: flex; flex-direction: column;">
                                                    <span style="color: white; font-weight: 800; font-size: 0.85rem;">${entry.local || 'S/L'}</span>
                                                </div>
                                                <div style="text-align: right;">
                                                    <div style="font-weight: 900; color: #FACC15; font-size: 1.1rem;">${entry.saldo || '0'}</div>
                                                    <div style="font-size: 0.6rem; color: var(--muted); font-weight: 800;">${p.unidade || 'UN'}</div>
                                                </div>
                                            </div>
                                        `).join('') : `
                                            <div style="text-align: center; color: var(--muted); font-size: 0.75rem; padding: 10px;">Nenhum estoque registrado nesta aba.</div>
                                        `}
                                    </div>
                                </div>

                                <!-- 4. Marcas Disponíveis (Grupo Técnico) -->
                                ${hasVariations ? `
                                    <div style="background: rgba(255,255,255,0.03); padding: 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; font-weight: 800; margin-bottom: 16px; letter-spacing: 0.05em; display: flex; align-items: center; gap: 8px;">
                                            <span class="material-symbols-rounded" style="font-size: 16px; color: var(--primary);">branding_watermark</span>
                                            Outras Marcas / Variações:
                                        </div>
                                        <div style="display: flex; flex-direction: column; gap: 12px;">
                                            ${[p, ...relatedProducts].map(item => `
                                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid ${item.ean === p.ean ? 'rgba(250, 204, 21, 0.3)' : 'transparent'}" onclick="showProductDetailsByCode('${item.ean || item.id_interno}')">
                                                    <div style="display: flex; flex-direction: column;">
                                                        <span style="color: white; font-weight: 800; font-size: 0.85rem;">${item.marca || 'S/M'}</span>
                                                        <span style="color: var(--muted); font-size: 0.65rem;">EAN: ${item.ean || '-'}</span>
                                                    </div>
                                                    <div style="text-align: right;">
                                                        <span class="material-symbols-rounded" style="font-size: 18px; color: var(--muted);">chevron_right</span>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>

                            <!-- Informações Técnicas e Outros Preços -->
                            <div class="form-grid" style="margin-top: 32px;">
                                <div class="form-section-title">Informações Técnicas</div>
                                <div class="input-group">
                                    <label>Categoria</label>
                                    <div class="input-field" style="background: transparent; border-color: rgba(255,255,255,0.05);">${p.categoria || '-'} / ${p.subcategoria || '-'}</div>
                                </div>
                                <div class="input-group">
                                    <label>Cor</label>
                                    <div class="input-field" style="background: transparent; border-color: rgba(255,255,255,0.05);">${p.cor || '-'}</div>
                                </div>
                                
                                ${p.atributo1 ? `
                                <div class="input-group">
                                    <label>${p.atributo1}</label>
                                    <div class="input-field" style="background: transparent; border-color: rgba(255,255,255,0.05);">${p.valor1 || '-'}</div>
                                </div>` : ''}
                                ${p.atributo2 ? `
                                <div class="input-group">
                                    <label>${p.atributo2}</label>
                                    <div class="input-field" style="background: transparent; border-color: rgba(255,255,255,0.05);">${p.valor2 || '-'}</div>
                                </div>` : ''}
                                
                                <div class="form-section-title">Outros Preços</div>
                                <div class="input-group">
                                    <label>Atacado</label>
                                    <div class="input-field" style="background: transparent; border-color: rgba(255,255,255,0.05);">${(p.preco_atacado || '0,00').toString().includes('R$') ? '' : 'R$ '}${p.preco_atacado || '0,00'} (Mín. ${p.qtd_minima_atacado || '1'})</div>
                                </div>
                                <div class="input-group">
                                    <label>Custo</label>
                                    <div class="input-field" style="background: transparent; border-color: rgba(255,255,255,0.05);">${(p.preco_custo || '0,00').toString().includes('R$') ? '' : 'R$ '}${p.preco_custo || '0,00'}</div>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            `;
    window.scrollTo(0, 0);
}

function getRelatedProducts(p) {
    if (!appData.products) return [];
    return appData.products.filter(other => {
        // Don't include itself
        if (other.ean === p.ean && other.id_interno === p.id_interno) return false;

        // Match rule: description, color, category
        const matchDesc = (other.descricao_base || '').toLowerCase() === (p.descricao_base || '').toLowerCase();
        const matchColor = (other.cor || '').toLowerCase() === (p.cor || '').toLowerCase();
        const matchCategory = (other.categoria || '').toLowerCase() === (p.categoria || '').toLowerCase();

        return matchDesc && matchColor && matchCategory;
    }).slice(0, 5); // Limit to 5 related products
}

function renderAddProduct(initialEan = '') {
    const currentUser = localStorage.getItem('currentUser');
    const nextId = getNextInternalId();

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderProductSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">CADASTRAR PRODUTO</h2>
                        </div>

                        <div class="form-grid">
                            <div class="form-section-title">Identificação</div>
                            <div class="input-group">
                                <label>ID Interno (Automático)</label>
                                <input type="text" class="input-field" value="${nextId}" readonly disabled style="background: rgba(255,255,255,0.02); color: var(--primary); font-weight: 800; opacity: 1; cursor: not-allowed;">
                            </div>
                            <div class="input-group">
                                <label>EAN / Código de Barras</label>
                                <input type="text" id="add-ean" class="input-field" placeholder="EAN13" value="${initialEan}">
                            </div>
                            <div class="input-group">
                                <label>SKU Fornecedor</label>
                                <input type="text" id="add-sku" class="input-field" placeholder="Código do Fornecedor">
                            </div>
                            <div class="input-group full-width">
                                <label>Descrição Base</label>
                                <input type="text" id="add-desc" class="input-field" placeholder="Nome principal do produto">
                            </div>

                            <div class="form-section-title">Características</div>
                            <div class="input-group">
                                <label>Marca</label>
                                <input type="text" id="add-marca" class="input-field" placeholder="Ex: Cofap">
                            </div>
                            <div class="input-group">
                                <label>Cor</label>
                                <input type="text" id="add-cor" class="input-field" placeholder="Ex: Preto">
                            </div>
                            <div class="input-group">
                                <label>Categoria</label>
                                <input type="text" id="add-cat" class="input-field" placeholder="Ex: Suspensão">
                            </div>
                            <div class="input-group">
                                <label>Subcategoria</label>
                                <input type="text" id="add-subcat" class="input-field" placeholder="Ex: Amortecedores">
                            </div>
                            <div class="input-group">
                                <label>Unidade</label>
                                <input type="text" id="add-uni" class="input-field" placeholder="UN, PC, JG, etc">
                            </div>

                            <div class="form-section-title">Atributos Técnicos</div>
                            <div class="input-group">
                                <label>Atributo 1 (Nome)</label>
                                <input type="text" id="add-attr1" class="input-field" placeholder="Ex: Lado">
                            </div>
                            <div class="input-group">
                                <label>Valor 1</label>
                                <input type="text" id="add-val1" class="input-field" placeholder="Ex: Esquerdo">
                            </div>
                            <div class="input-group">
                                <label>Atributo 2 (Nome)</label>
                                <input type="text" id="add-attr2" class="input-field" placeholder="Ex: Posição">
                            </div>
                            <div class="input-group">
                                <label>Valor 2</label>
                                <input type="text" id="add-val2" class="input-field" placeholder="Ex: Dianteiro">
                            </div>

                            <div class="form-section-title">Preços e Estoque</div>
                            <div class="input-group">
                                <label>Preço de Custo (R$)</label>
                                <input type="number" id="add-custo" step="0.01" class="input-field" placeholder="0,00">
                            </div>
                            <div class="input-group">
                                <label>Preço Varejo (R$)</label>
                                <input type="number" id="add-varejo" step="0.01" class="input-field" placeholder="0,00">
                            </div>
                            <div class="input-group">
                                <label>Preço Atacado (R$)</label>
                                <input type="number" id="add-atacado" step="0.01" class="input-field" placeholder="0,00">
                            </div>
                            <div class="input-group">
                                <label>Estoque Mínimo</label>
                                <input type="number" id="add-min" class="input-field" placeholder="0">
                            </div>
                            <div class="input-group">
                                <label>Qtd Mínima Atacado</label>
                                <input type="number" id="add-min-at" class="input-field" placeholder="1">
                            </div>

                            <div class="form-section-title">Logística e Status</div>
                            <div class="input-group">
                                <label>Status</label>
                                <select id="add-status" class="input-field" style="width: 100%; appearance: none;">
                                    <option value="ativo">Ativo</option>
                                    <option value="inativo">Inativo</option>
                                    <option value="esgotado">Esgotado</option>
                                </select>
                            </div>
                            <div class="input-group">
                                <label>Localização</label>
                                <input type="text" id="add-loc" class="input-field" placeholder="Ex: A-12-03">
                            </div>
                            <div class="input-group full-width">
                                <label>Observações</label>
                                <textarea id="add-obs" class="input-field" style="min-height: 80px; resize: vertical;" placeholder="Detalhes adicionais..."></textarea>
                            </div>

                            <div class="form-section-title">Mídia e Documentação</div>
                            <div class="input-group">
                                <label>URL da Imagem</label>
                                <input type="url" id="add-img" class="input-field" placeholder="https://...">
                            </div>
                            <div class="input-group">
                                <label>URL PDF Manual</label>
                                <input type="url" id="add-pdf" class="input-field" placeholder="https://...">
                            </div>
                        </div>

                        <div style="display: flex; gap: 16px; margin-top: 20px; padding-bottom: 40px;">
                            <button class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="renderProductSubMenu()">
                                Cancelar
                            </button>
                            <button class="btn-action" style="flex: 2; justify-content: center;" onclick="saveNewProduct()">
                                <span class="material-symbols-rounded">save</span>
                                Salvar Produto
                            </button>
                        </div>
                    </main>
                </div>
            `;
}

async function saveNewProduct() {
    const nextId = getNextInternalId();
    const product = {
        id_interno: nextId,
        ean: document.getElementById('add-ean').value.trim(),
        sku_fornecedor: document.getElementById('add-sku').value.trim(),
        descricao_base: document.getElementById('add-desc').value.trim(),
        marca: document.getElementById('add-marca').value.trim(),
        cor: document.getElementById('add-cor').value.trim(),
        categoria: document.getElementById('add-cat').value.trim(),
        subcategoria: document.getElementById('add-subcat').value.trim(),
        unidade: document.getElementById('add-uni').value.trim(),
        custo: document.getElementById('add-custo').value,
        varejo: document.getElementById('add-varejo').value,
        atacado: document.getElementById('add-atacado').value,
        estoque_minimo: document.getElementById('add-min').value,
        localizacao: document.getElementById('add-loc').value.trim(),
        status: document.getElementById('add-status').value,
        url_imagem: document.getElementById('add-img').value.trim(),
        url_pdf: document.getElementById('add-pdf').value.trim()
    };

    if (!product.descricao_base) {
        showToast("A descrição base é obrigatória.");
        return;
    }

    showToast("Salvando produto...");

    // Add to local appData
    appData.products.push(product);

    if (SCRIPT_URL) {
        try {
            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'append',
                    sheet: 'PRODUTOS',
                    data: product
                })
            });
            showToast("Produto enviado para a planilha!");
        } catch (e) {
            console.error("Error saving product:", e);
            showToast("Erro ao enviar para a planilha.");
        }
    }

    playBeep('success');
    setTimeout(() => renderProductSubMenu(), 1500);
}

async function saveEditProduct(originalId) {
    const product = {
        id_interno: originalId,
        ean: document.getElementById('edit-ean').value.trim(),
        sku_fornecedor: document.getElementById('edit-sku').value.trim(),
        descricao_base: document.getElementById('edit-desc').value.trim(),
        marca: document.getElementById('edit-marca').value.trim(),
        cor: document.getElementById('edit-cor').value.trim(),
        categoria: document.getElementById('edit-cat').value.trim(),
        subcategoria: document.getElementById('edit-subcat').value.trim(),
        unidade: document.getElementById('edit-uni').value.trim(),
        custo: document.getElementById('edit-custo').value,
        varejo: document.getElementById('edit-varejo').value,
        atacado: document.getElementById('edit-atacado').value,
        estoque_minimo: document.getElementById('edit-min').value,
        localizacao: document.getElementById('edit-loc').value.trim(),
        status: document.getElementById('edit-status').value
    };

    showToast("Atualizando produto...");

    // Update local appData
    const index = appData.products.findIndex(p => (p.id_interno || p.col_A) == originalId);
    if (index !== -1) {
        appData.products[index] = { ...appData.products[index], ...product };
    }

    if (SCRIPT_URL) {
        try {
            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update',
                    sheet: 'PRODUTOS',
                    keyField: 'id_interno',
                    keyValue: originalId,
                    data: product
                })
            });
            showToast("Atualização enviada para a planilha!");
        } catch (e) {
            console.error("Error updating product:", e);
        }
    }

    playBeep('success');
    setTimeout(() => renderProductSubMenu(), 1500);
}
function renderEditProductSearch() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderProductSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">EDITAR PRODUTO</h2>
                        </div>

                        <div class="search-container" style="background: var(--surface); padding: 20px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                            <div class="input-group" style="margin-bottom: 0;">
                                <label style="margin-bottom: 12px; display: block; font-size: 0.7rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Digite o ID Interno ou EAN para Editar</label>
                                <div style="display: flex; gap: 12px;">
                                    <input type="text" id="edit-search-input" class="input-field" style="flex: 1;" placeholder="ID ou EAN..." onkeypress="if(event.key === 'Enter') loadProductToEdit()" oninput="handleEditSearchInput(this)">
                                    <button class="btn-action" style="padding: 0 20px; min-width: auto; background: var(--primary);" onclick="loadProductToEdit()">
                                        <span class="material-symbols-rounded">search</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            `;
    setTimeout(() => document.getElementById('edit-search-input')?.focus(), 100);
}

function handleEditSearchInput(input) {
    const query = input.value.trim();
    if (query.length >= 8 && /^\d+$/.test(query)) {
        const product = appData.products.find(p => p.ean == query);
        if (product) {
            playBeep('success');
            renderEditProductForm(product);
        }
    }
}

function loadProductToEdit() {
    const input = document.getElementById('edit-search-input');
    const query = input.value.trim();
    if (!query) return;

    const product = appData.products.find(p => {
        const id = (p.id_interno || '').toString().toLowerCase();
        const ean = (p.ean || '').toString().toLowerCase();
        const colA = (p.col_A || '').toString().toLowerCase();
        const q = query.toLowerCase();

        return id === q || ean === q || colA === q;
    });

    if (product) {
        playBeep('success');
        renderEditProductForm(product);
    } else {
        playBeep('error');
        showToast("Produto não encontrado para edição.");
    }
}

function renderEditProductForm(p) {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderEditProductSearch()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">EDITAR: ${p.descricao_base || p.id_interno}</h2>
                        </div>

                        <div class="form-grid">
                            <div class="form-section-title">Identificação</div>
                            <div class="input-group">
                                <label>ID Interno (Editável)</label>
                                <input type="text" id="edit-id" class="input-field" value="${p.id_interno || p.col_A || ''}">
                            </div>
                            <div class="input-group">
                                <label>EAN / Código de Barras</label>
                                <input type="text" id="edit-ean" class="input-field" value="${p.ean || ''}">
                            </div>
                            <div class="input-group">
                                <label>SKU Fornecedor</label>
                                <input type="text" id="edit-sku" class="input-field" value="${p.sku_fornecedor || ''}">
                            </div>
                            <div class="input-group full-width">
                                <label>Descrição Base</label>
                                <input type="text" id="edit-desc" class="input-field" value="${p.descricao_base || ''}">
                            </div>

                            <div class="form-section-title">Características</div>
                            <div class="input-group">
                                <label>Marca</label>
                                <input type="text" id="edit-marca" class="input-field" value="${p.marca || ''}">
                            </div>
                            <div class="input-group">
                                <label>Cor</label>
                                <input type="text" id="edit-cor" class="input-field" value="${p.cor || ''}">
                            </div>
                            <div class="input-group">
                                <label>Categoria</label>
                                <input type="text" id="edit-cat" class="input-field" value="${p.categoria || ''}">
                            </div>
                            <div class="input-group">
                                <label>Subcategoria</label>
                                <input type="text" id="edit-subcat" class="input-field" value="${p.subcategoria || ''}">
                            </div>
                            <div class="input-group">
                                <label>Unidade</label>
                                <input type="text" id="edit-uni" class="input-field" value="${p.unidade || ''}">
                            </div>

                            <div class="form-section-title">Preços e Estoque</div>
                            <div class="input-group">
                                <label>Preço de Custo (R$)</label>
                                <input type="number" id="edit-custo" step="0.01" class="input-field" value="${p.preco_custo || ''}">
                            </div>
                            <div class="input-group">
                                <label>Preço Varejo (R$)</label>
                                <input type="number" id="edit-varejo" step="0.01" class="input-field" value="${p.preco_varejo || ''}">
                            </div>
                            <div class="input-group">
                                <label>Preço Atacado (R$)</label>
                                <input type="number" id="edit-atacado" step="0.01" class="input-field" value="${p.preco_atacado || ''}">
                            </div>
                            <div class="input-group">
                                <label>Estoque Mínimo</label>
                                <input type="number" id="edit-min" class="input-field" value="${p.estoque_minimo || ''}">
                            </div>

                            <div class="form-section-title">Logística e Status</div>
                            <div class="input-group">
                                <label>Status</label>
                                <select id="edit-status" class="input-field" style="width: 100%; appearance: none;">
                                    <option value="ativo" ${p.status === 'ativo' ? 'selected' : ''}>Ativo</option>
                                    <option value="inativo" ${p.status === 'inativo' ? 'selected' : ''}>Inativo</option>
                                    <option value="esgotado" ${p.status === 'esgotado' ? 'selected' : ''}>Esgotado</option>
                                </select>
                            </div>
                            <div class="input-group">
                                <label>Localização</label>
                                <input type="text" id="edit-loc" class="input-field" value="${p.localizacao || ''}">
                            </div>
                        </div>

                        <div style="display: flex; gap: 16px; margin-top: 20px; padding-bottom: 40px;">
                            <button class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="renderEditProductSearch()">
                                Voltar
                            </button>
                            <button class="btn-action" style="flex: 2; justify-content: center;" onclick="saveEditProduct('${p.id_interno || p.col_A}')">
                                <span class="material-symbols-rounded">save</span>
                                Salvar Alterações
                            </button>
                        </div>
                    </main>
                </div>
            `;
}

function renderNFSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    const subItems = [
        { id: 'import_xml', label: 'IMPORTAR XML', icon: 'upload_file' },
        { id: 'nf_manual', label: 'ENTRADA MANUAL', icon: 'edit_note' },
        { id: 'nf_history', label: 'HISTÓRICO DE ENTRADAS', icon: 'history' },
        { id: 'nf_pending', label: 'NOTAS PENDENTES', icon: 'pending' }
    ];

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">ENTRADA DE NF</h2>
                        </div>
                        <div class="menu-grid">
                            <div class="menu-card" onclick="renderImportXML()">
                                <span class="material-symbols-rounded icon">upload_file</span>
                                <span class="label">IMPORTAR XML</span>
                            </div>
                            <div class="menu-card" onclick="renderManualNFEntry()">
                                <span class="material-symbols-rounded icon">edit_note</span>
                                <span class="label">ENTRADA MANUAL</span>
                            </div>
                            <div class="menu-card" onclick="renderNFHistory()">
                                <span class="material-symbols-rounded icon">history</span>
                                <span class="label">HISTÓRICO DE ENTRADAS</span>
                            </div>
                            <div class="menu-card" onclick="renderNFPending()">
                                <span class="material-symbols-rounded icon">pending</span>
                                <span class="label">NOTAS PENDENTES</span>
                            </div>
                        </div>
                    </main>
                </div>
            `;
}

function renderImportXML() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderNFSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">IMPORTAR XML</h2>
                        </div>

                        <div class="search-container" style="background: var(--surface); padding: 30px; border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1); text-align: center;">
                            <span class="material-symbols-rounded" style="font-size: 48px; color: var(--primary); margin-bottom: 16px;">upload_file</span>
                            <p style="color: var(--muted); margin-bottom: 24px;">Selecione o arquivo XML da Nota Fiscal para importar os produtos e atualizar o estoque.</p>
                            
                            <input type="file" id="xml-input" accept=".xml" style="display: none;" onchange="handleXMLFile(this)">
                            <button class="btn-action" style="margin: 0 auto; padding: 0 30px;" onclick="document.getElementById('xml-input').click()">
                                <span class="material-symbols-rounded">add</span>
                                Selecionar Arquivo
                            </button>
                        </div>

                        <div id="xml-preview" style="margin-top: 24px;"></div>
                    </main>
                </div>
            `;
}

async function handleXMLFile(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const xmlContent = e.target.result;
        parseNFXML(xmlContent);
    };
    reader.readAsText(file);
}

let currentParsedXMLItems = [];

function parseNFXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // Basic validation
    const nfe = xmlDoc.getElementsByTagName("infNFe")[0];
    if (!nfe) {
        showToast("Arquivo XML inválido ou não é uma NF-e.");
        return;
    }

    const nNF = xmlDoc.getElementsByTagName("nNF")[0]?.textContent || "S/N";
    const items = xmlDoc.getElementsByTagName("det");
    currentParsedXMLItems = [];

    for (let i = 0; i < items.length; i++) {
        const prod = items[i].getElementsByTagName("prod")[0];
        if (prod) {
            const ean = prod.getElementsByTagName("cEAN")[0]?.textContent || "";
            const code = prod.getElementsByTagName("cProd")[0]?.textContent || "";
            const desc = prod.getElementsByTagName("xProd")[0]?.textContent || "";
            const qty = parseFloat(prod.getElementsByTagName("qCom")[0]?.textContent || "0");
            const price = parseFloat(prod.getElementsByTagName("vUnCom")[0]?.textContent || "0");

            // Try to find product in our database
            const matchedProduct = appData.products.find(p =>
                (p.ean && p.ean.toString() === ean.toString()) ||
                (p.sku_fornecedor && p.sku_fornecedor.toString() === code.toString())
            );

            currentParsedXMLItems.push({
                ean,
                code,
                desc,
                qty,
                price,
                matchedProduct
            });
        }
    }

    renderXMLPreview(nNF);
}

function saveToPending(nNF) {
    let pendingNotes = JSON.parse(localStorage.getItem('pending_xml_notes') || '[]');
    // Remove if already exists to update
    pendingNotes = pendingNotes.filter(n => n.nNF !== nNF);
    pendingNotes.push({
        nNF,
        items: currentParsedXMLItems,
        date: new Date().toISOString()
    });
    localStorage.setItem('pending_xml_notes', JSON.stringify(pendingNotes));
    showToast("Nota salva em 'Notas Pendentes'.");
    renderNFSubMenu();
}

function renderXMLPreview(nNF) {
    const previewContainer = document.getElementById('xml-preview');
    const items = currentParsedXMLItems;
    const allMatched = items.every(item => item.matchedProduct);

    previewContainer.innerHTML = `
                <div style="background: var(--surface); border-radius: 24px; padding: 24px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <div>
                            <h3 style="font-size: 1rem; font-weight: 800; color: white;">NF-e: ${nNF}</h3>
                            <p style="font-size: 0.7rem; color: var(--muted);">${items.length} itens encontrados</p>
                        </div>
                        ${!allMatched ? `
                            <div style="background: rgba(234, 179, 8, 0.1); color: #eab308; padding: 4px 12px; border-radius: 20px; font-size: 0.65rem; font-weight: 700;">
                                ALGUNS PRODUTOS NÃO CADASTRADOS
                            </div>
                        ` : ''}
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
                        ${items.map((item, idx) => `
                            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px solid ${item.matchedProduct ? 'rgba(255,255,255,0.05)' : 'rgba(234, 179, 8, 0.3)'}">
                                <div style="flex: 1;">
                                    <div style="font-weight: 700; font-size: 0.85rem; color: white;">${item.desc}</div>
                                    <div style="font-size: 0.65rem; color: var(--muted);">EAN: ${item.ean || '-'} | Cód: ${item.code || '-'}</div>
                                    ${item.matchedProduct ? `
                                        <div style="font-size: 0.65rem; color: #22c55e; font-weight: 700; margin-top: 4px;">Vinculado a: ${item.matchedProduct.descricao_base}</div>
                                    ` : `
                                        <div style="font-size: 0.65rem; color: #eab308; font-weight: 700; margin-top: 4px;">Produto não encontrado no cadastro</div>
                                    `}
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-weight: 900; color: var(--primary); font-size: 1rem;">${item.qty}</div>
                                    <div style="font-size: 0.6rem; color: var(--muted);">R$ ${item.price.toFixed(2)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <div style="display: flex; gap: 16px;">
                            <button class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="renderImportXML()">
                                Limpar
                            </button>
                            <button class="btn-action" style="flex: 2; justify-content: center;" onclick="processXMLImport('${nNF}')" ${items.length === 0 ? 'disabled' : ''}>
                                <span class="material-symbols-rounded">check_circle</span>
                                Confirmar Entrada
                            </button>
                        </div>
                        ${!allMatched ? `
                            <button class="btn-action" style="background: #eab308; color: black; justify-content: center;" onclick="saveToPending('${nNF}')">
                                <span class="material-symbols-rounded">pending</span>
                                Salvar em Notas Pendentes
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
}

async function processXMLImport(nNF) {
    const items = currentParsedXMLItems;
    const matchedItems = items.filter(item => item.matchedProduct);
    if (matchedItems.length === 0) {
        showToast("Nenhum produto vinculado para importar.");
        return;
    }

    showToast(`Processando entrada da NF ${nNF}...`);

    // Simulate stock update
    // In a real app, we would send this to the server
    // For now, we update local appData and try to save if SCRIPT_URL exists

    const stockUpdates = matchedItems.map(item => ({
        id_interno: item.matchedProduct.id_interno || item.matchedProduct.col_A,
        local: 'TÉRREO', // Default location for new entries
        saldo: item.qty,
        tipo: 'ENTRADA',
        origem: `NF-${nNF}`
    }));

    // Update local appData.estoque
    if (!appData.estoque) appData.estoque = [];

    stockUpdates.forEach(update => {
        // Find existing entry for this product and location
        const existing = appData.estoque.find(s => s.id_interno == update.id_interno && s.local == update.local);
        if (existing) {
            const currentSaldo = parseFloat((existing.saldo || '0').toString().replace(',', '.'));
            existing.saldo = (currentSaldo + update.saldo).toString().replace('.', ',');
        } else {
            appData.estoque.push({
                id_interno: update.id_interno,
                local: update.local,
                saldo: update.saldo.toString().replace('.', ',')
            });
        }
    });

    // If SCRIPT_URL exists, try to save the transaction
    if (SCRIPT_URL) {
        try {
            const currentUser = localStorage.getItem('currentUser');
            for (const item of matchedItems) {
                const idInterno = item.matchedProduct.id_interno || item.matchedProduct.col_a || item.matchedProduct.col_A;
                await fetch(SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'movimento',
                        tipo: 'CHEGADA_COMPRA',
                        id_interno: idInterno,
                        local: 'TERREO',
                        quantidade: item.qty,
                        usuario: currentUser,
                        origem: `XML-NF-${nNF}`,
                        observacao: `Importação XML NF ${nNF}`
                    })
                });
            }
        } catch (e) {
            console.error("Error saving stock entry:", e);
        }
    }

    // Update History locally
    if (!appData.entradas_nf) appData.entradas_nf = [];
    matchedItems.forEach(item => {
        appData.entradas_nf.unshift({
            data: new Date().toLocaleDateString('pt-BR'),
            hora: new Date().toLocaleTimeString('pt-BR'),
            nf: nNF,
            id_interno: item.matchedProduct.id_interno || item.matchedProduct.col_A,
            descricao: item.matchedProduct.descricao_base,
            qtd: item.qty,
            local: 'TÉRREO',
            usuario: localStorage.getItem('currentUser')
        });
    });

    playBeep('success');
    alert(`ENTRADA CONCLUÍDA!\nNF: ${nNF}\n${matchedItems.length} produtos atualizados no estoque.`);

    // Clear pending if it was one
    let pendingNotes = JSON.parse(localStorage.getItem('pending_xml_notes') || '[]');
    pendingNotes = pendingNotes.filter(n => n.nNF !== nNF);
    localStorage.setItem('pending_xml_notes', JSON.stringify(pendingNotes));

    renderNFSubMenu();
}

function renderManualNFEntry() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderNFSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">ENTRADA MANUAL</h2>
                        </div>

                        <div class="form-grid">
                            <div class="form-section-title">Dados da Nota / Documento</div>
                            <div class="input-group">
                                <label>Número do Documento</label>
                                <input type="text" id="manual-nf-num" class="input-field" placeholder="Ex: NF-12345">
                            </div>
                            <div class="input-group">
                                <label>Local de Destino</label>
                                <select id="manual-nf-loc" class="input-field" style="width: 100%;">
                                    <option value="TÉRREO">TÉRREO</option>
                                    <option value="1º ANDAR">1º ANDAR</option>
                                </select>
                            </div>

                            <div class="form-section-title">Produto</div>
                            <div class="input-group full-width">
                                <label>Buscar Produto (EAN ou Nome)</label>
                                <div style="display: flex; gap: 12px;">
                                    <input type="text" id="manual-nf-search" class="input-field" style="flex: 1;" placeholder="Digite para buscar..." oninput="searchProductForManualNF()" onkeypress="if(event.key === 'Enter') handleManualNFSearchEnter(event)">
                                    <button class="btn-action" style="padding: 0 20px; min-width: auto; background: var(--primary);" onclick="startScannerForManualNF()">
                                        <span class="material-symbols-rounded">photo_camera</span>
                                    </button>
                                </div>
                                <div id="manual-nf-search-results" style="margin-top: 10px; max-height: 200px; overflow-y: auto;"></div>
                            </div>

                            <div id="selected-product-info" class="hidden full-width" style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 16px; margin-top: 10px; border: 1px solid var(--primary);">
                                <!-- Selected product details here -->
                            </div>

                            <div class="input-group">
                                <label>Quantidade de Entrada</label>
                                <input type="number" id="manual-nf-qty" class="input-field" placeholder="0">
                            </div>
                            <div class="input-group">
                                <label>Preço Unitário (Opcional)</label>
                                <input type="number" id="manual-nf-price" step="0.01" class="input-field" placeholder="0,00">
                            </div>
                        </div>

                        <div style="display: flex; gap: 16px; margin-top: 24px; padding-bottom: 40px;">
                            <button class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="renderNFSubMenu()">
                                Cancelar
                            </button>
                            <button class="btn-action" style="flex: 2; justify-content: center;" onclick="saveManualNFEntry()">
                                <span class="material-symbols-rounded">save</span>
                                Confirmar Entrada
                            </button>
                        </div>
                    </main>
                </div>
            `;
}

let selectedProductForNF = null;

function searchProductForManualNF() {
    const input = document.getElementById('manual-nf-search');
    const query = input.value.trim().toLowerCase();
    const resultsDiv = document.getElementById('manual-nf-search-results');

    if (query.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }

    // Auto-select if exact EAN match (likely a scan)
    if (/^\d{8,14}$/.test(query)) {
        const exactProduct = appData.products.find(p => p.ean == query);
        if (exactProduct) {
            selectProductForNF(exactProduct.ean || exactProduct.id_interno);
            input.value = '';
            resultsDiv.innerHTML = '';
            return;
        }
    }

    const results = appData.products.filter(p =>
        (p.descricao_base || '').toLowerCase().includes(query) ||
        (p.ean || '').toString().includes(query) ||
        (p.id_interno || '').toString().includes(query)
    ).slice(0, 5);

    resultsDiv.innerHTML = results.map(p => `
                <div style="padding: 10px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;" onclick="selectProductForNF('${p.ean || p.id_interno}')">
                    <div style="font-weight: 700; font-size: 0.8rem; color: white;">${p.descricao_base}</div>
                    <div style="font-size: 0.65rem; color: var(--muted);">EAN: ${p.ean || '-'} | SKU: ${p.sku_fornecedor || '-'}</div>
                </div>
            `).join('');
}

function handleManualNFSearchEnter(event) {
    if (event.key === 'Enter') {
        const query = event.target.value.trim();
        if (!query) return;

        const product = appData.products.find(p => p.ean == query || p.id_interno == query || p.sku_fornecedor == query);
        if (product) {
            selectProductForNF(product.ean || product.id_interno);
            event.target.value = '';
            document.getElementById('manual-nf-search-results').innerHTML = '';
        } else {
            const results = appData.products.filter(p =>
                (p.descricao_base || '').toLowerCase().includes(query.toLowerCase()) ||
                (p.ean || '').toString().includes(query) ||
                (p.id_interno || '').toString().includes(query)
            );
            if (results.length === 1) {
                selectProductForNF(results[0].ean || results[0].id_interno);
                event.target.value = '';
                document.getElementById('manual-nf-search-results').innerHTML = '';
            }
        }
    }
}

function selectProductForNF(id) {
    selectedProductForNF = appData.products.find(p => p.ean == id || p.id_interno == id);
    if (!selectedProductForNF) return;

    const infoDiv = document.getElementById('selected-product-info');
    infoDiv.classList.remove('hidden');
    infoDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.1); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <span class="material-symbols-rounded" style="color: var(--primary)">check_circle</span>
                    </div>
                    <div>
                        <div style="font-weight: 800; color: white; font-size: 0.9rem;">${selectedProductForNF.descricao_base}</div>
                        <div style="font-size: 0.7rem; color: var(--muted);">Marca: ${selectedProductForNF.marca || '-'} | Cor: ${selectedProductForNF.cor || '-'}</div>
                    </div>
                </div>
            `;
    document.getElementById('manual-nf-search-results').innerHTML = '';
    document.getElementById('manual-nf-search').value = selectedProductForNF.descricao_base;
}

async function saveManualNFEntry() {
    const nfNum = document.getElementById('manual-nf-num').value.trim();
    const qty = parseFloat(document.getElementById('manual-nf-qty').value);
    const loc = document.getElementById('manual-nf-loc').value;
    const price = parseFloat(document.getElementById('manual-nf-price').value || '0');

    if (!nfNum || !selectedProductForNF || isNaN(qty) || qty <= 0) {
        showToast("Preencha todos os campos obrigatórios.");
        return;
    }

    const update = {
        id_interno: selectedProductForNF.id_interno || selectedProductForNF.col_A,
        local: loc,
        saldo: qty,
        tipo: 'ENTRADA_MANUAL',
        origem: nfNum
    };

    // Update local
    if (!appData.estoque) appData.estoque = [];
    const existing = appData.estoque.find(s => s.id_interno == update.id_interno && s.local == update.local);
    if (existing) {
        const currentSaldo = parseFloat((existing.saldo || '0').toString().replace(',', '.'));
        existing.saldo = (currentSaldo + update.saldo).toString().replace('.', ',');
    } else {
        appData.estoque.push({
            id_interno: update.id_interno,
            local: update.local,
            saldo: update.saldo.toString().replace('.', ',')
        });
    }

    // Save to history
    const historyEntry = {
        data: new Date().toLocaleDateString('pt-BR'),
        hora: new Date().toLocaleTimeString('pt-BR'),
        nf: nfNum,
        id_interno: update.id_interno,
        descricao: selectedProductForNF.descricao_base,
        qtd: qty,
        local: loc,
        usuario: localStorage.getItem('currentUser')
    };
    if (!appData.entradas_nf) appData.entradas_nf = [];
    appData.entradas_nf.unshift(historyEntry);

    if (SCRIPT_URL) {
        try {
            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'movimento',
                    tipo: 'CHEGADA_COMPRA',
                    id_interno: update.id_interno,
                    local: loc,
                    quantidade: qty,
                    usuario: localStorage.getItem('currentUser'),
                    origem: `MANUAL-NF-${nfNum}`,
                    observacao: `Entrada Manual NF ${nfNum}`
                })
            });
        } catch (e) {
            console.error("Error saving manual entry:", e);
        }
    }

    playBeep('success');
    alert("Entrada manual registrada com sucesso!");
    renderNFSubMenu();
}

function renderNFHistory() {
    const currentUser = localStorage.getItem('currentUser');
    // Filter out empty or invalid entries
    const history = (appData.entradas_nf || []).filter(item => item && (item.nf || item.NF || item.descricao || item.DESCRICAO));

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderNFSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">HISTÓRICO DE ENTRADAS</h2>
                        </div>

                        ${history.length === 0 ? `
                            <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">history</span>
                                <p style="color: var(--muted);">Nenhuma entrada registrada recentemente.</p>
                            </div>
                        ` : `
                            <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                                ${history.map(item => {
        const nf = item.nf || item.NF || '-';
        const data = item.data || item.DATA || '-';
        const hora = item.hora || item.HORA || '';
        const qtd = item.qtd || item.QTD || '0';
        const desc = item.descricao || item.DESCRICAO || '-';
        const local = item.local || item.LOCAL || '-';
        const usuario = item.usuario || item.USUARIO || '-';

        return `
                                        <div style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                                <div>
                                                    <div style="font-weight: 800; color: white; font-size: 0.9rem;">NF: ${nf}</div>
                                                    <div style="font-size: 0.65rem; color: var(--muted);">${data} ${hora ? `às ${hora}` : ''}</div>
                                                </div>
                                                <div style="background: rgba(34, 197, 94, 0.1); color: #22c55e; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 800;">
                                                    +${qtd}
                                                </div>
                                            </div>
                                            <div style="font-size: 0.8rem; color: white; font-weight: 600;">${desc}</div>
                                            <div style="font-size: 0.65rem; color: var(--muted); margin-top: 4px;">Local: ${local} | Por: ${usuario}</div>
                                        </div>
                                    `;
    }).join('')}
                            </div>
                        `}
                    </main>
                </div>
            `;
}

function renderNFPending() {
    const currentUser = localStorage.getItem('currentUser');
    // Pending notes are XMLs that were uploaded but have unmatched items
    const pendingNotes = JSON.parse(localStorage.getItem('pending_xml_notes') || '[]');

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderNFSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">NOTAS PENDENTES</h2>
                        </div>
                        
                        <div style="background: rgba(234, 179, 8, 0.1); padding: 16px; border-radius: 16px; border: 1px solid rgba(234, 179, 8, 0.2); margin-bottom: 20px;">
                            <p style="font-size: 0.75rem; color: #eab308; font-weight: 600;">Notas pendentes são arquivos XML que possuem produtos não identificados no sistema. Cadastre os produtos para liberar a entrada.</p>
                        </div>

                        ${pendingNotes.length === 0 ? `
                            <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">check_circle</span>
                                <p style="color: var(--muted);">Nenhuma nota pendente no momento.</p>
                            </div>
                        ` : `
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                ${pendingNotes.map(note => `
                                    <div class="menu-card" style="flex-direction: row; justify-content: space-between; padding: 20px; height: auto;" onclick="resumePendingXML('${note.nNF}')">
                                        <div style="text-align: left;">
                                            <div style="font-weight: 800; color: white;">NF: ${note.nNF}</div>
                                            <div style="font-size: 0.7rem; color: var(--muted);">${note.items.length} itens | Pendente</div>
                                        </div>
                                        <span class="material-symbols-rounded" style="color: #eab308">warning</span>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </main>
                </div>
            `;
}

function resumePendingXML(nNF) {
    const pendingNotes = JSON.parse(localStorage.getItem('pending_xml_notes') || '[]');
    const note = pendingNotes.find(n => n.nNF === nNF);
    if (note) {
        // Re-parse or just re-match items in case they were registered now
        note.items.forEach(item => {
            if (!item.matchedProduct) {
                item.matchedProduct = appData.products.find(p =>
                    (p.ean && p.ean.toString() === item.ean.toString()) ||
                    (p.sku_fornecedor && p.sku_fornecedor.toString() === item.code.toString())
                );
            }
        });
        currentParsedXMLItems = note.items;
        renderXMLPreview(nNF);
    }
}

function startScannerForManualNF() {
    const scannerContainer = document.createElement('div');
    scannerContainer.id = 'manual-nf-scanner-container';
    scannerContainer.style.position = 'fixed';
    scannerContainer.style.top = '0';
    scannerContainer.style.left = '0';
    scannerContainer.style.width = '100%';
    scannerContainer.style.height = '100%';
    scannerContainer.style.zIndex = '2000';
    scannerContainer.style.background = 'black';

    scannerContainer.innerHTML = `
                <div id="manual-nf-reader" style="width: 100%; height: 100%;"></div>
                <div style="position: absolute; bottom: 40px; left: 0; width: 100%; display: flex; justify-content: center; z-index: 2001;">
                    <button class="btn-action btn-secondary" onclick="stopManualNFScanner()">Fechar Câmera</button>
                </div>
                <div id="manual-nf-scanner-feedback" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2002; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s;">
                    <div style="width: 250px; height: 250px; border: 4px solid #22c55e; border-radius: 20px;"></div>
                </div>
            `;
    document.body.appendChild(scannerContainer);

    const html5QrCode = new Html5Qrcode("manual-nf-reader");
    window.manualNFScanner = html5QrCode;

    html5QrCode.start(
        { facingMode: "environment" },
        {
            fps: 20,
            qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
            const feedback = document.getElementById('manual-nf-scanner-feedback');
            feedback.style.opacity = '1';
            playBeep('success');

            setTimeout(() => {
                feedback.style.opacity = '0';
                stopManualNFScanner();
                selectProductForNF(decodedText);
            }, 500);
        }
    ).catch(err => {
        console.error(err);
        showToast("Erro ao abrir câmera.");
        stopManualNFScanner();
    });
}

async function stopManualNFScanner() {
    if (window.manualNFScanner) {
        try {
            await window.manualNFScanner.stop();
        } catch (err) {
            console.error("Error stopping manual NF scanner:", err);
        } finally {
            const container = document.getElementById('manual-nf-scanner-container');
            if (container) container.remove();
            window.manualNFScanner = null;
        }
    } else {
        const container = document.getElementById('manual-nf-scanner-container');
        if (container) container.remove();
    }
}

function renderConfigSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    const subItems = [
        {
            id: 'create_user', label: 'CRIAR USUÁRIO', icon: 'person_add', type: 'form', fields: [
                { label: 'Nome Completo', placeholder: 'Ex: João Silva' },
                { label: 'Usuário/Login', placeholder: 'Ex: joao.silva' },
                { label: 'Senha', type: 'password' },
                { label: 'Perfil', type: 'select', options: ['Operador', 'Gerente', 'Admin'] }
            ]
        },
        {
            id: 'manage_users', label: 'GERENCIAR USUÁRIOS', icon: 'group', type: 'list', items: [
                { name: 'Rafael Costa', role: 'Admin', last: 'Ativo agora' },
                { name: 'Operador 01', role: 'Operador', last: 'Há 2 horas' }
            ], cols: ['name', 'role', 'last']
        },
        {
            id: 'company_data', label: 'DADOS DA EMPRESA', icon: 'business', type: 'form', fields: [
                { label: 'Razão Social', placeholder: 'LY Auto Parts LTDA' },
                { label: 'CNPJ', placeholder: '00.000.000/0001-00' },
                { label: 'Endereço', fullWidth: true }
            ]
        },
        {
            id: 'system_logs', label: 'LOGS DO SISTEMA', icon: 'terminal', type: 'list', items: [
                { event: 'Login efetuado', user: 'rafael', time: '09:45:12' },
                { event: 'XML Importado', user: 'rafael', time: '09:30:05' }
            ], cols: ['event', 'user', 'time']
        }
    ];

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">CONFIGURAÇÕES</h2>
                        </div>
                        <div class="menu-grid">
                            ${subItems.map(item => `
                                <div class="menu-card" onclick="handleModuleClick(${JSON.stringify(item).replace(/"/g, '&quot;')}, 'renderConfigSubMenu()')">
                                    <span class="material-symbols-rounded icon">${item.icon}</span>
                                    <span class="label">${item.label}</span>
                                </div>
                            `).join('')}
                        </div>

                        <div style="margin-top: 30px; padding: 20px; background: var(--surface); border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                            <h3 style="font-size: 0.8rem; font-weight: 700; color: var(--muted); text-transform: uppercase; margin-bottom: 20px; letter-spacing: 0.05em;">Operação do Sistema</h3>
                            
                            <div style="display: flex; flex-direction: column; gap: 16px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 16px;">
                                    <div>
                                        <div style="font-weight: 700; color: white;">Modo Rápido</div>
                                        <div style="font-size: 0.7rem; color: var(--muted);">Desativa fluxo de separação. Apenas Conferência.</div>
                                    </div>
                                    <button class="btn-action ${localStorage.getItem('config_modo_rapido') === 'true' ? 'btn-danger' : 'btn-secondary'}" style="min-width: 80px;" onclick="toggleConfig('config_modo_rapido', this)">
                                        ${localStorage.getItem('config_modo_rapido') === 'true' ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                                
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-weight: 700; color: white;">Permitir estoque negativo na separação</div>
                                        <div style="font-size: 0.7rem; color: var(--muted);">Separa mesmo sem saldo (apenas exibe alerta visual).</div>
                                    </div>
                                    <button class="btn-action ${localStorage.getItem('config_estoque_negativo') === 'true' ? 'btn-danger' : 'btn-secondary'}" style="min-width: 80px;" onclick="toggleConfig('config_estoque_negativo', this)">
                                        ${localStorage.getItem('config_estoque_negativo') === 'true' ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            `;
}

function toggleConfig(key, btnElement) {
    const current = localStorage.getItem(key) === 'true';
    localStorage.setItem(key, !current);
    btnElement.innerText = !current ? 'ON' : 'OFF';
    btnElement.className = `btn-action ${!current ? 'btn-danger' : 'btn-secondary'}`;
    showToast(`Configuração '${key}' ${!current ? 'ativada' : 'desativada'}.`);
}

function renderFinanceiroSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    const subItems = [
        {
            id: 'contas_pagar', label: 'CONTAS A PAGAR', icon: 'money_off', type: 'list', items: [
                { desc: 'Aluguel Galpão', value: 'R$ 5.000,00', due: '05/03/2026' },
                { desc: 'Energia Elétrica', value: 'R$ 450,00', due: '10/03/2026' }
            ], cols: ['desc', 'value', 'due']
        },
        {
            id: 'contas_receber', label: 'CONTAS A RECEBER', icon: 'payments', type: 'list', items: [
                { client: 'Oficina do Zé', value: 'R$ 1.200,00', due: '28/02/2026' }
            ], cols: ['client', 'value', 'due']
        },
        {
            id: 'fluxo_caixa', label: 'FLUXO DE CAIXA', icon: 'account_balance_wallet', type: 'list', items: [
                { date: '25/02', in: '+ R$ 15.000', out: '- R$ 8.000', bal: 'R$ 7.000' }
            ], cols: ['date', 'in', 'out', 'bal']
        },
        {
            id: 'conciliacao', label: 'CONCILIAÇÃO BANCÁRIA', icon: 'account_balance', type: 'form', fields: [
                { label: 'Banco', type: 'select', options: ['Itaú', 'Bradesco', 'Santander'] },
                { label: 'Arquivo Extrato (OFX)', type: 'file' }
            ]
        },
        {
            id: 'relatorios_fin', label: 'RELATÓRIOS', icon: 'assessment', type: 'list', items: [
                { name: 'DRE Simplificado', type: 'PDF', period: 'Mensal' },
                { name: 'Inadimplência', type: 'XLS', period: 'Semanal' }
            ], cols: ['name', 'type', 'period']
        }
    ];

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">FINANCEIRO</h2>
                        </div>
                        <div class="menu-grid">
                            ${subItems.map(item => `
                                <div class="menu-card" onclick="handleModuleClick(${JSON.stringify(item).replace(/"/g, '&quot;')}, 'renderFinanceiroSubMenu()')">
                                    <span class="material-symbols-rounded icon">${item.icon}</span>
                                    <span class="label">${item.label}</span>
                                </div>
                            `).join('')}
                        </div>
                    </main>
                </div>
            `;
}


function getChannelConfig(label) {
    const l = String(label).toUpperCase();
    if (l.includes('FLEX')) return { icon: 'bolt', color: 'flex' };
    if (l.includes('SHOPEE')) return { icon: 'shopping_bag', color: 'shopee' };
    if (l.includes('MERCADO') || l.includes('ML')) return { icon: 'local_shipping', color: 'ml' };
    if (l.includes('MAGALU')) return { icon: 'inventory_2', color: 'magalu' };
    if (l.includes('CORREIOS')) return { icon: 'mail', color: 'correios' };
    if (l.includes('ULTRA')) return { icon: 'speed', color: 'ultra' };
    if (l.includes('FULL')) return { icon: 'flash_on', color: 'full' };
    if (l.includes('PDV') || l.includes('BALCÃO')) return { icon: 'store', color: 'pdv' };
    return { icon: 'storefront', color: 'pdv' };
}

function renderPickMenu() {
    const currentUser = localStorage.getItem('currentUser');

    const fallbackChannels = [
        { id: 'flex', label: 'FLEX', icon: 'bolt', color: 'flex' },
        { id: 'shopee', label: 'SHOPEE AGÊNCIA', icon: 'shopping_bag', color: 'shopee' },
        { id: 'ml', label: 'MERCADO LIVRE COLETA', icon: 'local_shipping', color: 'ml' },
        { id: 'magalu', label: 'MAGALU', icon: 'inventory_2', color: 'magalu' },
        { id: 'correios', label: 'CORREIOS', icon: 'mail', color: 'correios' },
        { id: 'ultra', label: 'ULTRA RÁPIDO', icon: 'speed', color: 'ultra' },
        { id: 'full', label: 'FULL', icon: 'flash_on', color: 'full' },
        { id: 'pdv', label: 'PDV (BALCÃO)', icon: 'store', color: 'pdv' }
    ];

    let channels = fallbackChannels;
    if (appData.channels.length > 0) {
        const uniqueLabels = new Set();
        channels = appData.channels.map(c => {
            const label = c.col_B || c.nome || c.Nome || c.label || Object.values(c)[0];
            const config = getChannelConfig(label);
            return {
                id: c.id || (c.col_B ? String(c.col_B).toLowerCase() : 'chan'),
                label: label,
                icon: c.icon || config.icon,
                color: c.color || config.color
            };
        }).filter(c => {
            if (!c.label || uniqueLabels.has(String(c.label).trim().toUpperCase())) return false;
            uniqueLabels.add(String(c.label).trim().toUpperCase());
            return true;
        });
    }

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMenu()')}

                    <main class="container">
                        <div class="sub-menu-header" style="display: flex; justify-content: space-between; align-items: center;">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">SEPARAÇÃO (PICK)</h2>
                            <button class="btn-action" style="padding: 8px 16px; min-width: auto; font-size: 0.7rem; background: var(--surface); border: 1px solid rgba(255,255,255,0.1);" onclick="renderPickHistory()">
                                <span class="material-symbols-rounded" style="font-size: 18px;">history</span>
                                HISTÓRICO
                            </button>
                        </div>
                        <div class="menu-grid">
                            ${channels.map(item => `
                                <div class="menu-card channel-card" data-channel="${item.color}" onclick="startPickingSession('${item.label}', '${item.color}')">
                                    <div class="icon-box">
                                        <span class="material-symbols-rounded icon">${item.icon}</span>
                                    </div>
                                    <span class="label">${item.label}</span>
                                </div>
                            `).join('')}
                        </div>
                    </main>
                </div>
            `;
}

function renderPickHistory() {
    const currentUser = localStorage.getItem('currentUser');
    const history = (appData.separacao || []).sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderPickMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">HISTÓRICO DE SEPARAÇÃO</h2>
                        </div>

                        ${history.length === 0 ? `
                            <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">history</span>
                                <p style="color: var(--muted);">Nenhuma separação encontrada.</p>
                            </div>
                        ` : `
                            <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                                ${history.map(item => `
                                    <div style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                            <div>
                                                <div style="font-weight: 800; color: white; font-size: 0.9rem;">${item.rom_id || '-'}</div>
                                                <div style="font-size: 0.65rem; color: var(--muted);">${new Date(item.criado_em).toLocaleString('pt-BR')}</div>
                                            </div>
                                            <div style="background: ${item.status === 'CONCLUÍDO' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)'}; color: ${item.status === 'CONCLUÍDO' ? '#22c55e' : '#eab308'}; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 800;">
                                                ${item.status || 'PENDENTE'}
                                            </div>
                                        </div>
                                        <div style="font-size: 0.8rem; color: white; font-weight: 600;">Canal: ${item.canal_nome || '-'}</div>
                                        <div style="font-size: 0.65rem; color: var(--muted); margin-top: 4px;">Por: ${item.criado_por || '-'}</div>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </main>
                </div>
            `;
}

function startPickingSession(channelLabel, channelColor) {
    const currentUser = localStorage.getItem('currentUser');
    const draftStr = localStorage.getItem('draft_pick_session');
    if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft.channelColor === channelColor) {
            currentSessionItems = draft.items || [];
            renderPickingScreen(draft.sessionId, draft.channelLabel, draft.channelColor);
            updatePickItemsList();
            return;
        } else {
            if (!confirm(`Sessão ativa detectada em ${draft.channelLabel}. Para manter a integridade, você deve concluí-la ou limpar o rascunho atual. Deseja RETOMAR essa sessão agora?`)) {
                return;
            }
            currentSessionItems = draft.items || [];
            renderPickingScreen(draft.sessionId, draft.channelLabel, draft.channelColor);
            updatePickItemsList();
            return;
        }
    }

    const now = new Date();
    const ddmm = now.getDate().toString().padStart(2, '0') + (now.getMonth() + 1).toString().padStart(2, '0');
    const todayStr = now.toLocaleDateString('pt-BR');

    const cleanChannel = channelLabel.split(' ')[0].toUpperCase();

    let countInSheet = 0;
    if (appData.separacao && Array.isArray(appData.separacao)) {
        countInSheet = appData.separacao.filter(row => {
            const rowDate = row.data_separacao || row.col_d || row.col_D;
            const rowChannel = row.canal_nome || row.col_c || row.col_C;
            return rowDate === todayStr && rowChannel === channelLabel;
        }).length;
    }

    const seq = countInSheet + 1;
    const sessionId = `SEP-${cleanChannel}-${ddmm}-${seq.toString().padStart(2, '0')}`;

    currentSessionItems = [];
    localStorage.setItem('draft_pick_session', JSON.stringify({
        sessionId, channelLabel, channelColor, items: [],
        operatorId: currentUser, status: 'in_progress', timestamp: now.toISOString()
    }));

    renderPickingScreen(sessionId, channelLabel, channelColor);
}

let currentSessionItems = [];

function renderPickingScreen(sessionId, channelLabel, channelColor) {
    const currentUser = localStorage.getItem('currentUser');

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderPickMenu()')}

                    <main class="container">
                        <div class="sub-menu-header" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="font-size: 0.7rem; color: var(--primary); font-weight: 800; letter-spacing: 0.1em;">${channelLabel}</div>
                            <h2 style="font-size: 1.2rem; font-weight: 700;">${sessionId}</h2>
                        </div>

                        <div class="search-container" style="background: var(--surface); padding: 20px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 20px;">
                            <div class="input-group" style="margin-bottom: 0;">
                                <label style="margin-bottom: 12px; display: block; font-size: 0.7rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Bipar ou Digitar EAN</label>
                                <div style="display: flex; gap: 12px;">
                                    <input type="text" id="pick-ean-input" class="input-field" style="flex: 1;" placeholder="EAN do Produto..." onkeypress="if(event.key === 'Enter') addPickItem()">
                                    <button class="btn-action" style="padding: 0 20px; min-width: auto; background: var(--primary);" onclick="startScanner(true)">
                                        <span class="material-symbols-rounded">photo_camera</span>
                                    </button>
                                </div>
                            </div>
                            <div id="scanner-container-pick" class="hidden" style="margin-top: 20px; overflow: hidden; border-radius: 16px; border: 2px solid var(--primary); background: black; position: relative; transition: border-color 0.3s ease;">
                                <div id="reader-pick" style="width: 100%;"></div>
                                <div id="scanner-feedback" style="position: absolute; inset: 0; z-index: 5; display: none; align-items: center; justify-content: center; pointer-events: none; transition: background 0.3s ease;">
                                    <div id="scanner-feedback-icon" class="material-symbols-rounded" style="font-size: 80px; color: white; text-shadow: 0 0 20px rgba(0,0,0,0.5);"></div>
                                </div>
                                <div style="position: absolute; top: 10px; right: 10px; z-index: 10;">
                                    <button class="btn-action btn-secondary" style="padding: 8px; min-width: auto; border-radius: 50%;" onclick="stopScanner()">
                                        <span class="material-symbols-rounded">close</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div id="pick-items-list" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px;">
                            <div style="text-align: center; padding: 30px; color: var(--muted); background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.1);">
                                <p>Nenhum item bipado ainda.</p>
                            </div>
                        </div>

                        <button class="btn-action" style="width: 100%; justify-content: center; padding: 16px; font-size: 1rem;" onclick="finishPickingSession('${sessionId}', '${channelLabel}', '${channelColor}')">
                            <span class="material-symbols-rounded">check_circle</span>
                            Finalizar Separação
                        </button>
                    </main>
                </div>
            `;
    document.getElementById('pick-ean-input').focus();
}

function addPickItem(scannedEan = null) {
    const input = document.getElementById('pick-ean-input');
    const ean = (scannedEan || input.value.trim()).toString();
    if (!ean) return;

    const product = appData.products.find(p =>
        (p.ean && p.ean.toString() === ean) ||
        (p.sku_fornecedor && p.sku_fornecedor.toString() === ean) ||
        (p.id_interno && p.id_interno.toString() === ean) ||
        (p.col_a && p.col_a.toString() === ean) ||
        (p.col_A && p.col_A.toString() === ean)
    );

    if (product) {
        const allowNegative = localStorage.getItem('config_estoque_negativo') === 'true';
        const itemEstoque = (appData.estoque || []).find(e => (e.id_interno || e.col_a) == (product.id_interno || product.col_a));
        const stock = itemEstoque ? parseFloat((itemEstoque.saldo_disponivel || itemEstoque.col_c || 0).toString().replace(',', '.')) : 0;
        const existingItemForQty = currentSessionItems.find(item => item.ean == product.ean || item.id_interno == product.id_interno);
        const currentDraftQty = existingItemForQty ? existingItemForQty.qty : 0;

        if (stock < (currentDraftQty + 1)) {
            if (!allowNegative) {
                playBeep('error');
                showToast(`ESTOQUE INSUFICIENTE para ${product.descricao_base || 'este item'}`);
                input.value = '';
                input.focus();
                return;
            } else {
                showToast(`⚠️ AVISO: Estoque negativo para ${product.descricao_base || 'este item'}`);
            }
        }

        playBeep('success');

        const existingItem = currentSessionItems.find(item => item.ean == product.ean || item.id_interno == product.id_interno);
        if (existingItem) {
            existingItem.qty = (existingItem.qty || 1) + 1;
            existingItem.scanTime = new Date().toLocaleTimeString();
        } else {
            currentSessionItems.unshift({
                ...product,
                qty: 1,
                scanTime: new Date().toLocaleTimeString()
            });
        }

        const draft = JSON.parse(localStorage.getItem('draft_pick_session') || '{}');
        draft.items = currentSessionItems;
        draft.timestamp = new Date().toISOString();
        localStorage.setItem('draft_pick_session', JSON.stringify(draft));

        showToast(`Item adicionado: ${product.descricao_base || product.col_aa || 'Produto'}`);
        if (currentPackSession) {
            currentPackSession.items = currentSessionItems;
            localStorage.setItem('draft_pack_session', JSON.stringify(currentPackSession));
        }
    } else {
        playBeep('error');
        showToast(`PRODUTO NÃO CADASTRADO: ${ean}`);
    }

    input.value = '';
    input.focus();
    updatePickItemsList();
}

function updatePickItemsList() {
    const container = document.getElementById('pick-items-list');
    if (currentSessionItems.length === 0) {
        container.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: var(--muted); background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.1);">
                        <p>Nenhum item bipado ainda.</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = currentSessionItems.map((item, index) => `
                <div class="fade-in" style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: center; position: relative;">
                        <span class="material-symbols-rounded" style="color: var(--primary)">inventory_2</span>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 700; font-size: 0.9rem; color: white;">${item.descricao_base}</div>
                        <div style="font-size: 0.7rem; color: var(--muted);"><span style="color: #fca5a5;">EAN:</span> ${item.ean} | <span style="color: #fca5a5;">SKU:</span> ${item.sku_fornecedor || '-'}</div>
                    </div>
                    ${item.qty > 1 ? `<div style="font-weight: 800; color: var(--primary); font-size: 1.1rem; margin-right: 8px;">${item.qty}</div>` : ''}
                    <button onclick="removePickItem(${index})" style="background: transparent; border: none; color: #ef4444; cursor: pointer;">
                        <span class="material-symbols-rounded">delete</span>
                    </button>
                </div>
            `).join('');
}

function removePickItem(index) {
    const item = currentSessionItems[index];
    if (item && item.qty > 1) {
        item.qty--;
    } else {
        currentSessionItems.splice(index, 1);
    }
    updatePickItemsList();
    const draft = JSON.parse(localStorage.getItem('draft_pick_session') || '{}');
    draft.items = currentSessionItems;
    draft.timestamp = new Date().toISOString();
    localStorage.setItem('draft_pick_session', JSON.stringify(draft));
}


async function finishPickingSession(sessionId, channelLabel, channelColor) {
    if (isFinalizing) return;
    isFinalizing = true;

    const submitBtn = document.querySelector(`button[onclick^="finishPickingSession"]`);
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = 'Salvando...'; }

    try {
        if (currentSessionItems.length === 0) {
            showToast("Adicione pelo menos um item para finalizar.");
            return;
        }

        const currentUser = localStorage.getItem('currentUser');
        const now = new Date().toISOString();
        const modoRapidoAtivo = localStorage.getItem('config_modo_rapido') === 'true';

        const pickingData = {
            rom_id: sessionId,
            canal_id: channelColor,
            canal_nome: channelLabel,
            data_separacao: new Date().toLocaleDateString('pt-BR'),
            status: modoRapidoAtivo ? 'CONCLUÍDO' : 'SEPARADO',
            criado_por: currentUser,
            criado_em: now,
            finalizado_em: now,
            observacao: modoRapidoAtivo ? 'SAIDA_RAPIDA AUTOMATICA' : ''
        };

        const groupedItems = currentSessionItems.reduce((acc, item) => {
            if (!acc[item.ean]) acc[item.ean] = { ...item, qty: 0 };
            acc[item.ean].qty++;
            return acc;
        }, {});

        const conferenceRows = Object.values(groupedItems).map(item => ({
            rom_id: sessionId,
            id_interno: item.id_interno || '',
            ean: item.ean,
            descricao: item.descricao_base,
            qtd_separada: item.qty,
            qtd_conferida: modoRapidoAtivo ? item.qty : 0,
            divergencia: modoRapidoAtivo ? 'OK' : 'FALTA',
            conferido_por: modoRapidoAtivo ? currentUser : '',
            conferido_em: modoRapidoAtivo ? now : '',
            processed: false
        }));

        const session = {
            id: sessionId,
            channel: channelLabel,
            channelColor: channelColor,
            items: currentSessionItems,
            user: currentUser,
            time: now,
            pickingData,
            conferenceRows
        };

        if (SCRIPT_URL) {
            showToast("Salvando na planilha...");
            const separacaoPromise = safePost({
                action: 'append',
                sheet: 'separacao',
                data: pickingData
            });

            let movementPromises = [];
            if (modoRapidoAtivo) {
                movementPromises = conferenceRows.map(row => {
                    if (row.processed) return Promise.resolve(true);
                    row.processed = true;

                    return safePost({
                        action: 'movimento',
                        tipo: 'SAIDA_RAPIDA',
                        id_interno: row.id_interno,
                        local: '1_ANDAR',
                        quantidade: row.qtd_separada,
                        usuario: currentUser,
                        origem: `RAPIDO-${sessionId}`,
                        observacao: `Baixa automática (Modo Rápido) da separação ${sessionId}`,
                        itens_afetados: JSON.stringify([{ id: row.id_interno, qtd: row.qtd_separada }])
                    });
                });
            }

            await Promise.all([separacaoPromise, ...movementPromises]);
        }

        if (!modoRapidoAtivo) {
            let activeSessions = JSON.parse(localStorage.getItem('active_pick_sessions') || '[]');
            activeSessions.push(session);
            localStorage.setItem('active_pick_sessions', JSON.stringify(activeSessions));
        }

        localStorage.removeItem('draft_pick_session');
        showToast(`Separação ${sessionId} finalizada!`);
        renderMenu();

    } catch (error) {
        console.error("Error saving to sheet:", error);
        showToast("Erro ao finalizar separação!");
    } finally {
        isFinalizing = false;
        const submitBtn = document.querySelector(`button[onclick^="finishPickingSession"]`);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<span class="material-symbols-rounded">check_circle</span> Finalizar Separação'; }
    }
}
function renderPackMenu() {
    const currentUser = localStorage.getItem('currentUser');
    const modoRapidoAtivo = localStorage.getItem('config_modo_rapido') === 'true';

    if (modoRapidoAtivo) {
        showToast("Acesso negado: Conferência desativada no Modo Rápido.");
        renderMenu();
        return;
    }
    const activeSessions = JSON.parse(localStorage.getItem('active_pick_sessions') || '[]');

    // Group sessions by channel
    const channelsWithSessions = [];
    const channelMap = {};

    activeSessions.forEach(s => {
        if (!channelMap[s.channel]) {
            channelMap[s.channel] = {
                name: s.channel,
                color: s.channelColor || getChannelConfig(s.channel).color,
                icon: getChannelConfig(s.channel).icon,
                count: 0
            };
            channelsWithSessions.push(channelMap[s.channel]);
        }
        channelMap[s.channel].count++;
    });

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderMenu()')}

                    <main class="container">
                        <div class="sub-menu-header" style="display: flex; justify-content: space-between; align-items: center;">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">CONFERÊNCIA (PACK)</h2>
                            <button class="btn-action" style="padding: 8px 16px; min-width: auto; font-size: 0.7rem; background: var(--surface); border: 1px solid rgba(255,255,255,0.1);" onclick="renderPackHistory()">
                                <span class="material-symbols-rounded" style="font-size: 18px;">history</span>
                                HISTÓRICO
                            </button>
                        </div>
                        
                        ${channelsWithSessions.length === 0 ? `
                            <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">pending_actions</span>
                                <p style="color: var(--muted);">Nenhuma separação aguardando conferência.</p>
                            </div>
                        ` : `
                            <div class="menu-grid">
                                ${channelsWithSessions.map(chan => `
                                    <div class="menu-card channel-card" data-channel="${chan.color}" onclick="renderPackSessionsList('${chan.name}')">
                                        <div class="icon-box">
                                            <span class="material-symbols-rounded icon">${chan.icon}</span>
                                        </div>
                                        <span class="label">${chan.name}</span>
                                        <span style="position: absolute; top: 12px; right: 12px; background: var(--primary); color: white; font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 99px;">${chan.count}</span>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </main>
                </div>
            `;
}

function renderPackHistory() {
    const currentUser = localStorage.getItem('currentUser');
    const history = (appData.conferencia || []).sort((a, b) => new Date(b.conferido_em) - new Date(a.conferido_em));

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderPackMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">HISTÓRICO de CONFERÊNCIA</h2>
                        </div>

                        ${history.length === 0 ? `
                            <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">history</span>
                                <p style="color: var(--muted);">Nenhuma conferência encontrada.</p>
                            </div>
                        ` : `
                            <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                                ${history.map(item => `
                                    <div style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                            <div>
                                                <div style="font-weight: 800; color: white; font-size: 0.9rem;">${item.rom_id || '-'}</div>
                                                <div style="font-size: 0.65rem; color: var(--muted);">${new Date(item.conferido_em).toLocaleString('pt-BR')}</div>
                                            </div>
                                            <div style="background: ${item.divergencia === 'OK' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color: ${item.divergencia === 'OK' ? '#22c55e' : '#ef4444'}; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 800;">
                                                ${item.divergencia || 'OK'}
                                            </div>
                                        </div>
                                        <div style="font-size: 0.8rem; color: white; font-weight: 600;">${item.descricao || '-'}</div>
                                        <div style="font-size: 0.65rem; color: var(--muted); margin-top: 4px;">Qtd: ${item.qtd_conferida || 0} | Por: ${item.conferido_por || '-'}</div>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </main>
                </div>
            `;
}

function renderPackSessionsList(channelName) {
    const currentUser = localStorage.getItem('currentUser');
    const activeSessions = JSON.parse(localStorage.getItem('active_pick_sessions') || '[]')
        .filter(s => s.channel === channelName);

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderPackMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">SESSÕES: ${channelName}</h2>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            ${activeSessions.map(session => `
                                <div class="menu-card" style="flex-direction: row; align-items: center; justify-content: space-between; padding: 16px 20px; height: auto; cursor: default;">
                                    <div style="text-align: left; flex: 1; cursor: pointer;" onclick="renderPackSessionDetails('${session.id}')">
                                        <div style="font-weight: 800; color: white; display: flex; align-items: center; gap: 8px;">
                                            ${session.id}
                                            <span style="font-size: 0.6rem; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; color: var(--muted);">AGUARDANDO</span>
                                        </div>
                                        <div style="font-size: 0.7rem; color: var(--muted); margin-top: 4px;">Separado por: ${session.user}</div>
                                    </div>
                                    <div style="display: flex; gap: 8px;">
                                        <button class="btn-action" style="padding: 8px; min-width: auto; background: var(--primary); border-radius: 12px;" onclick="renderPackSessionDetails('${session.id}')" title="Conferir">
                                            <span class="material-symbols-rounded" style="font-size: 20px;">fact_check</span>
                                        </button>
                                        <button class="btn-action" style="padding: 8px; min-width: auto; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px;" onclick="event.stopPropagation(); deletePickingSession('${session.id}', '${channelName.replace(/'/g, "'")}')" title="Excluir">
                                            <span class="material-symbols-rounded" style="font-size: 20px;">delete</span>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </main>
                </div>
            `;
}

function deletePickingSession(sessionId, channelName) {
    if (!confirm(`Tem certeza que deseja excluir a separação ${sessionId}?\nEsta ação não pode ser desfeita.`)) {
        return;
    }

    let activeSessions = JSON.parse(localStorage.getItem('active_pick_sessions') || '[]');
    activeSessions = activeSessions.filter(s => s.id !== sessionId);
    localStorage.setItem('active_pick_sessions', JSON.stringify(activeSessions));

    showToast(`Separação ${sessionId} excluída.`);

    // Re-render the list or the menu
    if (channelName) {
        renderPackSessionsList(channelName);
    } else {
        renderPackMenu();
    }
}

let currentPackSession = null;

function renderPackSessionDetails(sessionId) {
    const currentUser = localStorage.getItem('currentUser');
    const activeSessions = JSON.parse(localStorage.getItem('active_pick_sessions') || '[]');
    currentPackSession = activeSessions.find(s => s.id === sessionId);

    if (!currentPackSession) {
        showToast("Sessão não encontrada.");
        renderPackMenu();
        return;
    }

    // Ensure conferenceRows exist (they should if saved recently)
    if (!currentPackSession.conferenceRows) {
        const groupedItems = currentPackSession.items.reduce((acc, item) => {
            if (!acc[item.ean]) {
                acc[item.ean] = { ...item, qty: 0 };
            }
            acc[item.ean].qty++;
            return acc;
        }, {});

        currentPackSession.conferenceRows = Object.values(groupedItems).map(item => ({
            rom_id: sessionId,
            id_interno: item.id_interno || '',
            ean: item.ean,
            descricao: item.descricao_base,
            qtd_separada: item.qty,
            qtd_conferida: 0,
            divergencia: 'FALTA',
            conferido_por: '',
            conferido_em: ''
        }));
    }

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, "renderPackSessionsList('" + currentPackSession.channel + "')")}

                    <main class="container">
                        <div class="sub-menu-header" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="font-size: 0.7rem; color: var(--primary); font-weight: 800; letter-spacing: 0.1em;">CONFERÊNCIA</div>
                            <h2 style="font-size: 1.2rem; font-weight: 700;">${sessionId}</h2>
                        </div>

                        <div class="search-container" style="background: var(--surface); padding: 20px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 20px;">
                            <div class="input-group" style="margin-bottom: 0;">
                                <label style="margin-bottom: 12px; display: block; font-size: 0.7rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Bipar ou Digitar EAN para Conferir</label>
                                <div style="display: flex; gap: 12px;">
                                    <input type="text" id="pack-ean-input" class="input-field" style="flex: 1;" placeholder="EAN do Produto..." onkeypress="if(event.key === 'Enter') addPackScan()">
                                    <button class="btn-action" style="padding: 0 20px; min-width: auto; background: var(--primary);" onclick="startScanner(false, true)">
                                        <span class="material-symbols-rounded">photo_camera</span>
                                    </button>
                                </div>
                            </div>
                            <div id="scanner-container-pack" class="hidden" style="margin-top: 20px; overflow: hidden; border-radius: 16px; border: 2px solid var(--primary); background: black; position: relative; transition: border-color 0.3s ease;">
                                <div id="reader-pack" style="width: 100%;"></div>
                                <div id="scanner-feedback" style="position: absolute; inset: 0; z-index: 5; display: none; align-items: center; justify-content: center; pointer-events: none; transition: background 0.3s ease;">
                                    <div id="scanner-feedback-icon" class="material-symbols-rounded" style="font-size: 80px; color: white; text-shadow: 0 0 20px rgba(0,0,0,0.5);"></div>
                                </div>
                                <div style="position: absolute; top: 10px; right: 10px; z-index: 10;">
                                    <button class="btn-action btn-secondary" style="padding: 8px; min-width: auto; border-radius: 50%;" onclick="stopScanner()">
                                        <span class="material-symbols-rounded">close</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div id="pack-items-list" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px;">
                            ${renderPackItemsListHTML()}
                        </div>

                        <button class="btn-action" style="width: 100%; justify-content: center; padding: 16px; font-size: 1rem;" onclick="finishConferenceSession()">
                            <span class="material-symbols-rounded">check_circle</span>
                            Finalizar Conferência
                        </button>
                    </main>
                </div>
            `;
    document.getElementById('pack-ean-input').focus();
}

function renderPackItemsListHTML() {
    // Filter to show only items that have been scanned at least once
    const scannedRows = currentPackSession.conferenceRows.filter(row => row.qtd_conferida > 0);

    if (scannedRows.length === 0) {
        return `
                    <div style="text-align: center; padding: 30px; color: var(--muted); background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.1);">
                        <p>Nenhum item conferido ainda.</p>
                    </div>
                `;
    }

    return scannedRows.map(row => {
        return `
                    <div class="fade-in" style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 12px;">
                        <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-rounded" style="color: var(--primary)">check_circle</span>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 700; font-size: 0.9rem; color: white;">${row.descricao}</div>
                            <div style="font-size: 0.7rem; color: var(--muted);"><span style="color: #fca5a5;">EAN:</span> ${row.ean}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 0.6rem; color: var(--muted); text-transform: uppercase; font-weight: 800;">CONFERIDO</div>
                            <div style="font-weight: 800; font-size: 1.1rem; color: white;">
                                <span style="color: var(--primary)">${row.qtd_conferida}</span>
                            </div>
                        </div>
                    </div>
                `;
    }).join('');
}

function addPackScan(scannedEan = null) {
    const input = document.getElementById('pack-ean-input');
    const ean = (scannedEan || input.value.trim()).toString();
    if (!ean) return;

    let row = currentPackSession.conferenceRows.find(r =>
        (r.ean && r.ean.toString() === ean) ||
        (r.id_interno && r.id_interno.toString() === ean)
    );

    if (row) {
        playBeep('success');
        row.qtd_conferida++;

        // Update divergence
        if (row.qtd_conferida === row.qtd_separada) {
            row.divergencia = 'OK';
        } else if (row.qtd_conferida > row.qtd_separada) {
            row.divergencia = 'SOBRA';
        } else {
            row.divergencia = 'FALTA';
        }
        showToast(`Conferido: ${row.descricao}`);
    } else {
        // Item scanned but not in picking session (SOBRA)
        playBeep('error');
        showToast("Item não encontrado nesta separação! Registrado como SOBRA.");

        // Try to find product info in appData.products
        const product = appData.products.find(p =>
            (p.ean && p.ean.toString() === ean) ||
            (p.sku_fornecedor && p.sku_fornecedor.toString() === ean) ||
            (p.id_interno && p.id_interno.toString() === ean) ||
            (p.col_a && p.col_a.toString() === ean) ||
            (p.col_A && p.col_A.toString() === ean)
        );

        row = {
            rom_id: currentPackSession.id,
            id_interno: product ? (product.id_interno || product.col_a || product.col_A || '') : '',
            ean: ean,
            descricao: product ? (product.descricao_base || product.col_aa || 'PRODUTO NÃO IDENTIFICADO') : 'PRODUTO NÃO IDENTIFICADO',
            qtd_separada: 0,
            qtd_conferida: 1,
            divergencia: 'SOBRA',
            conferido_por: '',
            conferido_em: ''
        };
        currentPackSession.conferenceRows.push(row);
    }

    input.value = '';
    input.focus();
    document.getElementById('pack-items-list').innerHTML = renderPackItemsListHTML();
}

function renderConferenceResult() {
    const currentUser = localStorage.getItem('currentUser');
    const hasDivergence = currentPackSession.conferenceRows.some(r => r.divergencia !== 'OK');

    app.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, "renderPackSessionDetails('" + currentPackSession.id + "')")}

                    <main class="container">
                        <div class="sub-menu-header" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="font-size: 0.7rem; color: var(--primary); font-weight: 800; letter-spacing: 0.1em;">RESULTADO DA CONFERÊNCIA</div>
                            <h2 style="font-size: 1.2rem; font-weight: 700;">${currentPackSession.id}</h2>
                        </div>

                        <div style="margin-bottom: 24px; padding: 20px; border-radius: 20px; background: ${hasDivergence ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'}; border: 1px solid ${hasDivergence ? '#ef4444' : '#22c55e'}; text-align: center;">
                            <span class="material-symbols-rounded" style="font-size: 48px; color: ${hasDivergence ? '#ef4444' : '#22c55e'}; margin-bottom: 12px;">
                                ${hasDivergence ? 'warning' : 'check_circle'}
                            </span>
                            <h3 style="font-size: 1.1rem; font-weight: 700; color: white;">
                                ${hasDivergence ? 'Divergências Encontradas' : 'Conferência 100% OK!'}
                            </h3>
                            <p style="font-size: 0.8rem; color: var(--muted); margin-top: 4px;">
                                ${hasDivergence ? 'Revise os itens abaixo antes de finalizar.' : 'Tudo pronto para o envio.'}
                            </p>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px;">
                            ${currentPackSession.conferenceRows.map((row, index) => {
        if (row.divergencia === 'OK' && !hasDivergence) return ''; // Hide OK rows if everything is OK to keep it clean

        let statusColor = '#ef4444'; // FALTA
        if (row.divergencia === 'OK') statusColor = '#22c55e';
        if (row.divergencia === 'SOBRA') statusColor = '#f59e0b';

        return `
                                    <div class="fade-in" style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                                            <div style="width: 32px; height: 32px; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                                <span class="material-symbols-rounded" style="font-size: 18px; color: ${statusColor}">${row.divergencia === 'OK' ? 'check_circle' : 'error'}</span>
                                            </div>
                                            <div style="flex: 1;">
                                                <div style="font-weight: 700; font-size: 0.85rem; color: white;">${row.descricao}</div>
                                                <div style="font-size: 0.65rem; color: var(--muted);">EAN: ${row.ean}</div>
                                            </div>
                                            <div style="text-align: right; font-size: 0.7rem; font-weight: 800; color: ${statusColor};">
                                                ${row.divergencia}
                                            </div>
                                        </div>
                                        
                                        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px;">
                                            <div style="font-size: 0.7rem; color: var(--muted);">
                                                Esperado: <span style="color: white; font-weight: 700;">${row.qtd_separada}</span>
                                            </div>
                                            
                                            <div style="display: flex; align-items: center; gap: 15px;">
                                                <button onclick="adjustConferenceRow(${index}, -1)" style="width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: white; display: flex; align-items: center; justify-content: center;">
                                                    <span class="material-symbols-rounded" style="font-size: 18px;">remove</span>
                                                </button>
                                                <div style="font-weight: 800; font-size: 1rem; color: var(--primary); min-width: 20px; text-align: center;">
                                                    ${row.qtd_conferida}
                                                </div>
                                                <button onclick="adjustConferenceRow(${index}, 1)" style="width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: white; display: flex; align-items: center; justify-content: center;">
                                                    <span class="material-symbols-rounded" style="font-size: 18px;">add</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                `;
    }).join('')}
                        </div>

                        <div style="display: flex; gap: 12px;">
                            <button class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="renderPackSessionDetails('${currentPackSession.id}')">
                                Voltar
                            </button>
                            <button class="btn-action" style="flex: 2; justify-content: center;" onclick="confirmFinishConference()">
                                <span class="material-symbols-rounded">check_circle</span>
                                Confirmar e Salvar
                            </button>
                        </div>
                    </main>
                </div>
            `;
}

function adjustConferenceRow(index, delta) {
    const row = currentPackSession.conferenceRows[index];
    row.qtd_conferida = Math.max(0, row.qtd_conferida + delta);

    // Update divergence
    if (row.qtd_conferida === row.qtd_separada) {
        row.divergencia = 'OK';
    } else if (row.qtd_conferida > row.qtd_separada) {
        row.divergencia = 'SOBRA';
    } else {
        row.divergencia = 'FALTA';
    }

    renderConferenceResult();
}

async function finishConferenceSession() {
    // Instead of finishing directly, show the blind result screen
    renderConferenceResult();
}

function startFastPackSession(channelLabel, channelColor) {
    const currentUser = localStorage.getItem('currentUser');
    const now = new Date();
    const ddmm = now.getDate().toString().padStart(2, '0') + (now.getMonth() + 1).toString().padStart(2, '0');
    const todayStr = now.toLocaleDateString('pt-BR');
    const cleanChannel = channelLabel.split(' ')[0].toUpperCase();

    let countInSheet = 0;
    if (appData.conferencia && Array.isArray(appData.conferencia)) {
        // Approximate by looking at unique rom_ids in conferencia today
        const todayConf = appData.conferencia.filter(row => row.rom_id && row.rom_id.includes(`SEP-${cleanChannel}-${ddmm}`));
        const uniques = new Set(todayConf.map(r => r.rom_id));
        countInSheet = uniques.size;
    }
    const seq = countInSheet + 1;
    const sessionId = `SEP-${cleanChannel}-${ddmm}-${seq.toString().padStart(2, '0')}`;

    currentPackSession = {
        id: sessionId,
        channel: channelLabel,
        channelColor: channelColor || 'var(--primary)',
        items: [],
        pickingData: {
            rom_id: sessionId,
            canal_id: channelColor || '',
            canal_nome: channelLabel,
            data_separacao: todayStr,
            status: 'SEPARADO',
            criado_por: currentUser,
            criado_em: now.toISOString(),
            finalizado_em: now.toISOString(),
            observacao: 'MODO CONFERÊNCIA DIRETA'
        },
        conferenceRows: [],
        isFastMode: true
    };

    renderPackSessionDetails(sessionId);
}

async function confirmFinishConference() {
    if (isFinalizing) return;
    isFinalizing = true;

    const submitBtn = document.querySelector(`button[onclick^="confirmFinishConference"]`);
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = 'Salvando...'; }

    try {
        const currentUser = localStorage.getItem('currentUser');
        const now = new Date().toISOString();

        // Update conference rows with final info
        currentPackSession.conferenceRows.forEach(row => {
            row.conferido_por = currentUser;
            row.conferido_em = now;
        });

        // Update picking status
        currentPackSession.pickingData.status = 'SEPARADO';
        currentPackSession.pickingData.finalizado_em = now;

        // Attempt to save to Google Sheets if SCRIPT_URL is provided
        if (SCRIPT_URL) {
            showToast("Salvando conferência...");

            // 1. Save movements of type CONFIRMACAO_SAIDA (Parallel for speed)
            const movementPromises = currentPackSession.conferenceRows
                .filter(row => row.qtd_conferida > 0 && !row.processed)
                .map(row => {
                    row.processed = true;
                    return safePost({
                        action: 'movimento',
                        tipo: 'CONFIRMACAO_SAIDA',
                        id_interno: row.id_interno,
                        local: '1_ANDAR', // Confirming from main stock
                        quantidade: row.qtd_conferida,
                        usuario: currentUser,
                        origem: `PACK-${currentPackSession.id}`,
                        observacao: `Baixa definitiva via conferência ${currentPackSession.id}`,
                        itens_afetados: JSON.stringify([{ id: row.id_interno, qtd: row.qtd_conferida }]) // Auditoria
                    });
                });

            // 2. Save to CONFERENCIA sheet for history (Parallel for speed)
            const historyPromises = currentPackSession.conferenceRows.map(row => safePost({
                action: 'append',
                sheet: 'CONFERENCIA',
                data: row
            }));

            // 3. Update or Append picking status in 'separacao' sheet
            let statusPromise;
            if (currentPackSession.isFastMode) {
                currentPackSession.pickingData.status = 'CONCLUÍDO';
                currentPackSession.pickingData.finalizado_em = now;
                statusPromise = safePost({
                    action: 'append',
                    sheet: 'separacao',
                    data: currentPackSession.pickingData
                });
            } else {
                statusPromise = safePost({
                    action: 'update',
                    sheet: 'separacao',
                    keyField: 'rom_id',
                    keyValue: currentPackSession.id,
                    data: { status: 'CONCLUÍDO', finalizado_em: now }
                });
            }

            // Execute all in parallel
            await Promise.all([...movementPromises, ...historyPromises, statusPromise]);
        }

        // Remove from active sessions
        let activeSessions = JSON.parse(localStorage.getItem('active_pick_sessions') || '[]');
        activeSessions = activeSessions.filter(s => s.id !== currentPackSession.id);
        localStorage.setItem('active_pick_sessions', JSON.stringify(activeSessions));

        showToast(`Conferência ${currentPackSession.id} finalizada!`);
        renderPackMenu();
    } catch (error) {
        console.error("Error saving conference:", error);
        showToast("Erro ao salvar conferência na planilha.");
    } finally {
        isFinalizing = false;
        const submitBtn = document.querySelector(`button[onclick^="confirmFinishConference"]`);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<span class="material-symbols-rounded">check_circle</span> Confirmar e Salvar'; }
    }
}

function handleMenuClick(label) {
    showToast(`${label} em breve!`);
}

function renderGuiaLampada() {
    const currentUser = localStorage.getItem('currentUser');
    const appContainer = document.getElementById('app');
    
    if (!appContainer) return;

    appContainer.innerHTML = `
                <div class="dashboard-screen fade-in">
                    ${getTopBarHTML(currentUser, 'renderProductSubMenu()')}
                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">GUIA DE LÂMPADAS</h2>
                        </div>
                        
                        <div style="margin-bottom: 24px;">
                            <div class="input-group">
                                <label>PESQUISAR VEÍCULO (EX: GOL G5)</label>
                                <div style="display: flex; gap: 10px;">
                                    <input type="text" id="guia-lampada-input" class="input-field" placeholder="Digite o modelo do carro..." style="flex: 1;" onkeyup="if(event.key==='Enter') performGuiaLampadaSearch()">
                                    <button onclick="performGuiaLampadaSearch()" class="btn-action" style="padding: 10px 20px;">
                                        <span class="material-symbols-rounded">search</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div id="guia-lampada-results">
                            <div style="text-align: center; padding: 40px; color: var(--muted); background: var(--surface); border-radius: 20px; border: 1px dashed rgba(255,255,255,0.1);">
                                <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">directions_car</span>
                                <p>Digite um modelo para ver as lâmpadas compatíveis.</p>
                            </div>
                        </div>
                    </main>
                </div>
            `;
    const input = document.getElementById('guia-lampada-input');
    if (input) input.focus();
}

async function performGuiaLampadaSearch() {
    const input = document.getElementById('guia-lampada-input');
    const resultsContainer = document.getElementById('guia-lampada-results');

    if (!input || !resultsContainer) return;

    const term = input.value.trim();
    if (!term) return;

    resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <span class="material-symbols-rounded" style="font-size: 48px; color: var(--primary); animation: spin 2s linear infinite;">sync</span>
                    <p style="margin-top: 10px; color: var(--muted);">Buscando especificações...</p>
                </div>
            `;

    try {
        const response = await fetch(`${SCRIPT_URL}?action=guia_lampada&termo=${encodeURIComponent(term)}`);
        const result = await response.json();

        if (!result.ok || !result.data || result.data.length === 0) {
            resultsContainer.innerHTML = `
                        <div style="text-align: center; padding: 40px; background: var(--surface); border-radius: 20px; color: var(--muted);">
                            <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 16px;">search_off</span>
                            <p>Nenhuma especificação encontrada para "${term}".</p>
                        </div>
                    `;
            return;
        }

        resultsContainer.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${result.data.map(item => `
                            <div style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                                <div style="flex: 1;">
                                    <div style="font-size: 0.85rem; font-weight: 800; color: white;">${item.veiculo}</div>
                                    <div style="font-size: 0.75rem; color: var(--primary); font-weight: 700; margin-top: 4px;">${item.lampada}</div>
                                </div>
                                <div style="background: rgba(255,255,255,0.05); padding: 8px 16px; border-radius: 8px; font-weight: 800; color: #fef08a; border: 1px solid rgba(254, 240, 138, 0.2);">
                                    ${item.codigo}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
    } catch (err) {
        console.error("Erro na busca do Guia de Lâmpadas:", err);
        showToast("Erro ao conectar com a base de dados.");
        resultsContainer.innerHTML = `<p style="text-align: center; padding: 20px; color: var(--danger);">Falha na conexão.</p>`;
    }
}

// Initial Route - Bootstrap Seguro para evitar Tela Branca
window.onload = async () => {
    try {
        const appContainer = document.getElementById('app');
        if (!appContainer) throw new Error("Elemento #app não encontrado no DOM.");

        // Sincronizar qualquer pendência offline se houver rede no carregamento
        if (navigator.onLine) {
            processSyncQueue();
        }

        // Ouvinte global para processar fila assim que voltar online
        window.addEventListener('online', processSyncQueue);

        // Always clear current user on fresh load to force user selection screen
        localStorage.removeItem('currentUser');

        // Show immediate login screen with fallback users
        renderLogin();

        // Load users list in the background
        try {
            await loadUsersOnly();
            renderLogin(); // Refresh if users loaded
        } catch (userErr) {
            console.error("Aviso: Falha ao carregar usuários dinâmicos, usando fallbacks.", userErr);
            renderLogin();
        }

        console.log('Bootstrap da aplicação concluído com sucesso.');
    } catch (fatalErr) {
        console.error("ERRO CRÍTICO NO BOOTSTRAP:", fatalErr);
        localStorage.setItem('app_load_error', 'true'); // Sinalizar falha para limpeza de SW no próximo boot

        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.innerHTML = `
                        <div style="padding: 40px; text-align: center; color: white; background: var(--bg); min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                            <span class="material-symbols-rounded" style="font-size: 64px; color: var(--primary); margin-bottom: 24px; animation: pulse 2s infinite;">sync_problem</span>
                            <h2 style="margin-bottom: 12px; font-weight: 800;">Recuperando Sistema...</h2>
                            <p style="color: var(--muted); font-size: 0.85rem; margin-bottom: 32px; max-width: 300px; line-height: 1.6;">
                                Detectamos um problema na inicialização. O Service Worker será resetado para garantir integridade.
                            </p>
                            <button onclick="location.reload()" class="btn-action" style="background: var(--primary); padding: 16px 32px; border-radius: 12px; font-weight: 700;">TENTAR NOVAMENTE</button>
                        </div>
                    `;
        }
    }
};