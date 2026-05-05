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

// ==== AUXILIARY FUNCTIONS ====
function normalizeText(text) {
    if (!text) return "";
    return text.toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==== INTELLIGENT SCANNING & INPUT CLASSIFICATION ====
function classifyProductInput(rawValue) {
    const value = String(rawValue || '').trim();
    const clean = value.replace(/\s+/g, '');

    if (!clean) return { type: 'empty', value: '' };

    const idNorm = clean.toUpperCase();

    // ID Interno: DY-000.000 ou DY-000000
    if (/^DY[-.]?\d{3}[.]?\d{3}$/.test(idNorm) || /^DY\d{6}$/.test(idNorm)) {
        return {
            type: 'id_interno',
            value: normalizeDyId(idNorm)
        };
    }

    // EAN: 8, 12, 13, 14 dígitos
    if (/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(clean)) {
        return {
            type: 'ean',
            value: clean
        };
    }

    // Code 128 / SKU Fornecedor (Alfanumérico com números)
    if (/^[A-Z0-9\-_.]{4,}$/i.test(clean) && /\d/.test(clean)) {
        return {
            type: 'code128',
            value: clean.toUpperCase()
        };
    }

    // Texto Comum (Qualquer coisa com letras)
    if (/[a-zA-ZÀ-ÿ]/.test(value)) {
        return {
            type: 'text',
            value
        };
    }

    return { type: 'invalid', value };
}

function normalizeDyId(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 6) return String(value || '').toUpperCase();
    return `DY-${digits.slice(0, 3)}.${digits.slice(3)}`;
}

function playFeedbackSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'success') {
            osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
        } else if (type === 'warning') {
            osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
        } else if (type === 'error') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        }
    } catch (err) {
        console.warn('[AUDIO] feedback indisponível', err);
    }
}

function showScanFeedback(type, message) {
    // Remover feedbacks antigos
    document.querySelectorAll('.scan-feedback').forEach(el => el.remove());

    const feedback = document.createElement('div');
    feedback.className = `scan-feedback ${type}`;

    let iconName = 'check_circle';
    if (type === 'warning') iconName = 'warning';
    if (type === 'error') iconName = 'error';

    feedback.innerHTML = `
        <span class="material-symbols-rounded icon">${iconName}</span>
        <span class="msg">${message}</span>
    `;

    document.body.appendChild(feedback);

    playFeedbackSound(type);

    setTimeout(() => {
        feedback.classList.add('fade-out');
        setTimeout(() => feedback.remove(), 400);
    }, 2000);
}

async function handleProductScan(rawValue, context = 'search') {
    const classification = classifyProductInput(rawValue);
    console.log(`[SCAN] Classificação:`, classification);

    if (classification.type === 'text') {
        // Se for texto na busca, apenas performSearch normal
        if (context === 'search') {
            const input = document.getElementById('search-input');
            if (input) {
                input.value = rawValue;
                performSearch();
            }
        }
        return;
    }

    if (classification.type === 'invalid' || classification.type === 'empty') {
        showScanFeedback('error', 'Código Inválido');
        return;
    }

    // Buscar match exato
    await ensureProdutosLoaded();
    const val = classification.value;

    const product = appData.products.find(p => {
        const pEan = String(p.ean || '').trim();
        const pId = normalizeDyId(p.id_interno);
        const pSku = String(p.sku_fornecedor || '').toUpperCase().trim();

        if (classification.type === 'ean') return pEan === val;
        if (classification.type === 'id_interno') return pId === val;
        if (classification.type === 'code128') {
            return pEan === val || pSku === val || pId === val;
        }
        return false;
    });

    if (product) {
        showScanFeedback('success', 'Produto Encontrado');
        
        // Se estiver na busca, abre detalhes
        if (context === 'search') {
            const input = document.getElementById('search-input');
            if (input) input.value = '';
            
            // Pequeno delay para o usuário ver o feedback verde antes do modal
            setTimeout(() => {
                stopScanner();
                renderProductDetails(product);
            }, 600);
        }
        
        return product;
    } else {
        showScanFeedback('warning', 'Produto não cadastrado');
        return null;
    }
}


// Global App State
let currentScreen = 'loading';
let initialized = false;
let currentPackSession = null;
let currentPickSession = null;
let currentSessionItems = [];
let isModoRapido = false;

// ==== NAVIGATION MANAGEMENT ====
// Permite que o botão voltar do navegador (e do Android) funcione corretamente
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.screen) {
        console.log('[NAV] Popstate para:', event.state.screen);
        renderScreenByName(event.state.screen, false);
    } else if (initialized) {
        renderMenu(false);
    }
});

function pushNav(screen) {
    if (!screen) return;
    // Evita duplicar o mesmo estado no topo do histórico
    if (history.state && history.state.screen === screen) return;
    console.log('[NAV] PushState:', screen);
    history.pushState({ screen }, '', '');
}

function goBack() {
    // Se tivermos um estado no histórico, usamos a navegação do navegador
    if (history.state && history.state.screen && history.state.screen !== 'login') {
        console.log('[NAV] history.back()');
        history.back();
    } else {
        // Fallback lógico para garantir que o usuário nunca fique preso
        if (currentScreen === 'search') renderMenu();
        else if (currentScreen === 'menu') renderLogin();
        else renderMenu();
    }
}

function renderScreenByName(name, push = true) {
    switch (name) {
        case 'menu': renderMenu(push); break;
        case 'search': renderSearchScreen(push); break;
        case 'login': renderLogin(push); break;
        case 'config': renderConfigSubMenu(push); break;
        default: renderMenu(push);
    }
}

// ==== MODO TELA LIMPA (LÓGICA OPERACIONAL) ====
window.handleUserClick = function(e) {
    if(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    console.log('CLICK USUARIO OK');
    showToast('CLICK USUARIO OK', 'success'); // Opcional, feedback no sistema do app
    
    // Ação real solicitada pela interface
    if (typeof renderConfigSubMenu === 'function') {
        renderConfigSubMenu();
    } else {
        alert('CLICK USUARIO OK');
    }
};

window.addEventListener('DOMContentLoaded', () => {


    // Fullscreen controls removed: Handled by getTopBarHTML and CSS toggles

    // Footer logic simplified: CSS will handle the layout
    const footer = document.querySelector('.menu-footer');
    if (footer) {
        const menuScreen = document.querySelector('.dashboard-screen.menu-screen');
        if (menuScreen) {
            menuScreen.classList.add('menu-footer-visible'); // Default to visible for now, CSS Grid will handle scaling
        }
    }


    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.body.classList.contains('fullscreen-mode')) {
                toggleFullscreen();
            }
        }
    });

});

// goBack centralizado acima

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
    const controls = document.getElementById('fullscreen-controls');
    if (!document.fullscreenElement) {
        document.body.classList.remove('fullscreen-mode');
        if (controls) controls.style.display = 'none';
    } else {
        document.body.classList.add('fullscreen-mode');
        if (controls) controls.style.display = 'flex';
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        if (localStorage.getItem('app_load_error')) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let registration of registrations) {
                    registration.unregister();
                }
            });
            localStorage.removeItem('app_load_error');
            localStorage.removeItem('loginBackgroundImage');
            window.loginCustomBgImage = null;
        }

        navigator.serviceWorker.register('/sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        if (confirm('Nova versão disponível. Atualizar?')) {
                            newWorker.postMessage({action: 'skipWaiting'});
                            window.location.reload();
                        }
                    }
                });
            });
        }).catch(err => {
            console.log('SW error:', err);
        });
    });
}
// ========================================================

let isFinalizing = false;
let isSyncing = false;
let isAppLoading = false;

const SYNC_TRACE_ENABLED = true;
const syncTraceLog = [];

function addSyncTrace(origin, action, details = '') {
    if (!SYNC_TRACE_ENABLED) return;
    const entry = {
        time: new Date().toISOString().substr(11, 12),
        origin,
        action,
        details,
        stack: new Error().stack.split('\n').slice(2, 5).join(' | ')
    };
    syncTraceLog.unshift(entry);
    if (syncTraceLog.length > 50) syncTraceLog.pop();
    console.log(`[SYNC TRACE] ${entry.time} | ${origin} -> ${action} | ${details}`);
}

function dumpSyncTrace() {
    console.log('=== SYNC TRACE DUMP ===');
    syncTraceLog.forEach((e, i) => console.log(`${i+1}. ${e.time} | ${e.origin} -> ${e.action} | ${e.details} | ${e.stack}`));
    console.log('=======================');
}

function generateUniqueId(prefix) {
    const now = new Date();
    const ddmm = now.getDate().toString().padStart(2, '0') + (now.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `${prefix}-${ddmm}-${random}`;
}

async function copyToClipboard(text, elementId = null) {
    try {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            showToast("Copiado: " + text);
        } else {
            showToast("Copiado: " + text);
        }
        
        if (elementId) {
            const el = document.getElementById(elementId);
            if (el) {
                const originalContent = el.innerHTML;
                el.innerHTML = '<span class="material-symbols-rounded" style="font-size: 14px;">check</span>';
                el.style.color = "#4ade80";
                setTimeout(() => {
                    el.innerHTML = originalContent;
                    el.style.color = "";
                }, 2000);
            }
        }
    } catch (err) {
        console.error("Erro ao copiar:", err);
        showToast("Erro ao copiar para a área de transferência.");
    }
}

function toggleAllStock() {
    const grid = document.querySelector('.location-distribution-grid');
    const btn = document.getElementById('btn-toggle-stock');
    if (grid && btn) {
        const isShowingAll = grid.classList.toggle('show-all');
        btn.innerHTML = isShowingAll ? 
            '<span class="material-symbols-rounded">expand_less</span> VER MENOS' : 
            '<span class="material-symbols-rounded">expand_more</span> VER TODOS';
    }
}

// ==== API & CONNECTION UTILS ====



/**
 * Realce de texto para busca
 */
function highlightText(text, term) {
    if (!term) return text;
    const cleanTerm = normalizar(term);
    if (!cleanTerm) return text;
    
    // Regex para encontrar o termo ignorando acentos e caixa
    // Nota: Para manter o texto original mas com tags, usamos uma abordagem mais simplificada
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<b>$1</b>');
}

/**
 * Realiza uma requisição GET para a API_BASE com parâmetros
 */
async function dyGet(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            query.append(key, value);
        }
    });

    try {
        const response = await fetch(`${API_BASE}?${query.toString()}`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error("dyGet Error:", err);
        return { ok: false, error: err.message };
    }
}

// Alias for backwards compatibility or specific usage
async function safeGet(queryString) {
    let params;
    if (typeof queryString === 'string') {
        // Parse query string properly
        params = Object.fromEntries(new URLSearchParams(queryString));
    } else {
        params = queryString;
    }
    console.log("[safeGet] params:", params);
    return dyGet(params);
}

/**
 * Verifica a conexão com a planilha
 */
async function verificarConexao() {
    try {
        const res = await dyGet({ action: "ping" });
        if (res.ok) {
            console.log("Planilha conectada");
            return true;
        } else {
            console.error("Erro ao conectar com a planilha:", res.error);
            return false;
        }
    } catch (err) {
        console.error("Erro fatal ao verificar conexão:", err);
        return false;
    }
}

/**
 * Normaliza textos para busca (minúsculas, sem acentos, sem espaços extras)
 */
function normalizar(texto) {
    return (texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

/**
 * Busca Kit Lâmpada na API com os parâmetros informados
 */
async function buscarKitLampada(termo, ano, montadora) {
    return dyGet({
        action: "kit_lampada",
        termo: normalizar(termo),
        ano: normalizar(ano),
        montadora: normalizar(montadora)
    });
}

// Auxiliar para gerar ID de execução técnica (idempotência)
function generateExecutionId() {
    return 'exec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

/**
 * Camada de Normalização Contextual: Garante que valores respeitem as validações da ABA específica
 */
function normalizeSheetValue(sheet, field, value) {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    const lower = str.toLowerCase();

    // Regras por ABA e CAMPO (Explícitas)
    
    // ABA: Produtos
    if (sheet === 'produtos' && field === 'status') {
        return (lower === 'inativo') ? 'inativo' : 'ativo';
    }

    // ABA: Usuarios / Canais
    if ((sheet === 'usuarios' || sheet === 'canais_envio') && field === 'ativo') {
        return (lower === 'sim' || lower === 's' || lower === 'true') ? 'sim' : 'nao';
    }

    // ABA: Estoque Atual (Locais)
    if (sheet === 'estoque_atual' && field === 'local') {
        if (lower.includes('terr') || lower === 'trreo') return 'terreo';
        if (lower.includes('mostru') || lower === 'mostrurio') return 'mostruario';
        if (lower.includes('1') && lower.includes('andar')) return '1andar';
        if (lower === 'defeito') return 'defeito';
        return lower;
    }

    // ABA: Movimentos
    if (sheet === 'movimentos') {
        if (field === 'tipo') {
            const valid = ['entrada', 'saida', 'transferencia', 'reserva', 'confirmacao_saida', 'ajuste_inventario'];
            return valid.includes(lower) ? lower : 'saida'; // fallback seguro
        }
        if (field === 'local_origem' || field === 'local_destino' || field === 'local') {
            if (lower.includes('terr') || lower === 'trreo') return 'terreo';
            if (lower.includes('mostru') || lower === 'mostrurio') return 'mostruario';
            if (lower.includes('1') && lower.includes('andar')) return '1andar';
            return lower;
        }
    }

    // ABA: Separacao
    if (sheet === 'separacao' && field === 'status') {
        const valid = ['rascunho', 'aberta', 'em_separacao', 'separado', 'finalizada', 'cancelada'];
        if (lower === 'aberto') return 'aberta';
        return valid.includes(lower) ? lower : 'rascunho';
    }

    // ABA: Conferencia
    if (sheet === 'conferencia' && field === 'status') {
        const valid = ['rascunho', 'em_conferencia', 'conferido', 'finalizada', 'cancelada'];
        return valid.includes(lower) ? lower : 'rascunho';
    }

    // ABA: Inventarios
    if (sheet === 'inventarios') {
        if (field === 'tipo') {
            const valid = ['inicial', 'geral', 'parcial', 'ajuste'];
            return valid.includes(lower) ? lower : 'geral';
        }
        if (field === 'status') {
            return (lower === 'finalizada' || lower === 'concluido') ? 'finalizada' : 'aberta';
        }
    }

    return str;
}

function normalizePayloadForSheet(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const normalized = { ...payload };

    // Determinar o contexto da aba
    let sheetContext = payload.sheet || payload.action || '';
    if (sheetContext === 'movimento') sheetContext = 'movimentos';

    // Lista de campos que PODEM precisar de normalização
    const fieldsToCheck = [
        'status', 'tipo', 'local', 'local_origem', 'local_destino', 
        'ativo', 'perfil'
    ];

    Object.keys(normalized).forEach(key => {
        if (fieldsToCheck.includes(key)) {
            normalized[key] = normalizeSheetValue(sheetContext, key, normalized[key]);
        }
    });

    // Normalizar também campos aninhados em 'data'
    if (normalized.data && typeof normalized.data === 'object') {
        const dataNormalized = { ...normalized.data };
        Object.keys(dataNormalized).forEach(key => {
            if (fieldsToCheck.includes(key)) {
                dataNormalized[key] = normalizeSheetValue(sheetContext, key, dataNormalized[key]);
            }
        });
        normalized.data = dataNormalized;
    }

    // Tratamento especial para KIT_LAMPADA (apenas 10 campos permitidos)
    if (sheetContext === 'kit_lampada') {
        const allowed = [
            'kit_lampada_id', 'montadora', 'modelo', 'ano_inicio', 'ano_fim',
            'lampada_baixo', 'lampada_alto', 'lampada_neblina', 'url', 'observacao',
            'action', 'sheet', 'executionId'
        ];
        Object.keys(normalized).forEach(key => {
            if (!allowed.includes(key)) delete normalized[key];
        });
    }

    return normalized;
}

async function revertStockMovement(sessionId, row, operatorId) {
    try {
        showToast(`Iniciando estorno para ${row.descricao}...`);
        const now = new Date().toISOString();
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(normalizePayloadForSheet({
                action: 'movimento',
                tipo: 'saida', // Normalizado para 'saida' (estorno é uma saída de correção)
                id_interno: row.id_interno,
                local: '1andar', // Canonical 1andar
                quantidade: row.qtd_conferida, 
                data_hora: now,
                usuario: operatorId,
                origem: `REVERSAO-${sessionId}`,
                observacao: `Correção de erro operacional da sessao ${sessionId}`
            }))
        });
        showToast(`Estorno concluído (sincronizado).`);
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
const LOGO_SMALL_URL = '/imagens/icon-512-black.png';
const LOGO_BLACK = '/imagens/icon-512-black.png';
const LOGO_WHITE = '/imagens/icon-512-white.png';

// Função para selecionar o logo baseado na cor do topo/header (REALIDADE VISUAL)
// Fundo PRETO/ESCURO → logo icon-512-black.png (contém texto BRANCO)
// Fundo BRANCO/CLARO → logo icon-512-white.png (contém texto PRETO)
function getLogoForHeader(headerBgColor) {
    if (!headerBgColor) {
        return LOGO_WHITE; // Padrão agora é o white (que é dark) para fundo claro
    }
    
    const bg = headerBgColor.toLowerCase().trim();
    
    // Fundo escuro (preto) → usar asset 'black' (pois ele é a versão Light/texto branco)
    if (bg === '#101018' || bg === '#000000' || bg === 'transparent' || bg.startsWith('rgba(16,')) {
        return LOGO_BLACK;
    }
    
    // Fundo claro (branco) → usar asset 'white' (pois ele é a versão Dark/texto preto)
    if (bg === '#ffffff' || bg === '#fff' || bg.startsWith('rgba(255,')) {
        return LOGO_WHITE;
    }
    
    // Padrão
    return LOGO_WHITE;
}




// Função para garantir que links do Drive funcionem como imagem direta
function formatImageUrl(url) {
    if (!url) return '';
    
    // Se for um path do Supabase (não é URL completa), gerar URL pública
    if (url.startsWith('produtos/') || url.startsWith('branding/')) {
        try {
            const publicUrl = getPublicUrl(url);
            if (publicUrl) return publicUrl;
        } catch (e) {
            console.log('[formatImageUrl] Erro ao gerar URL pública:', e);
        }
    }
    
    if (url.includes('drive.google.com')) {
        // Handle various Drive link formats (preview, file, view, id=, etc)
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                      url.match(/id=([a-zA-Z0-9_-]+)/) ||
                      url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            return `https://drive.google.com/uc?id=${match[1]}`;
        }
    }
    return url;
}

const attributeNameMap = {
    voltagem: "Voltagem",
    potencia: "Potência",
    tipo_lampada: "Tipo da lâmpada",
    temperatura_cor: "Temperatura de cor",
    lumens: "Lumens",
    encaixe: "Encaixe",
    codigo_equivalente: "Código equivalente",
    linha: "Linha",
    ip_rate: "IP Rate",
    chip_led: "Chip LED",
    dissipador: "Dissipador",
    cooler: "Cooler",
    driver: "Driver",
    material_lente: "Material da lente",
    textura_lente: "Textura da lente",
    material_carcaca: "Material da carcaça",
    regulagem: "Regulagem",
    modelo_botao: "Modelo do botão",
    cor_botao: "Cor do botão",
    veiculo: "Veículo",
    ano_aplicacao: "Ano de aplicação"
};

const attributeValueReplacements = [
    [/(\d+)v/gi, '$1V'],
    [/(\d+)w/gi, '$1W'],
    [/(\d+)k/gi, '$1K'],
    [/(\d+)lm/gi, '$1LM'],
    [/_/g, ' / '],
    [/(\d+)_(\d+)/g, '$1 a $2'],
    [/^com_/i, 'Com '],
    [/^sem_/i, 'Sem '],
    [/^a_prova_d/i, 'À prova d'],
    [/_/g, ' / ']
];

function safeParseAtributos(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function formatAttributeName(key) {
    if (!key) return '';
    const k = String(key).toLowerCase().trim();
    return attributeNameMap[k] || key.charAt(0).toUpperCase() + key.slice(1);
}

function formatAttributeValue(value) {
    if (!value) return '';
    let formatted = String(value).trim();
    attributeValueReplacements.forEach(([regex, replacement]) => {
        formatted = formatted.replace(regex, replacement);
    });
    return formatted;
}

function isValidUrl(value) {
    if (!value) return false;
    const s = String(value).trim();
    const low = s.toLowerCase();
    
    // Bloqueio de valores vazios ou placeholders comuns vindos de bancos de dados
    if (!s || low === 'null' || low === 'undefined' || low === 'n/a' || low === 'vazio') return false;
    
    try {
        // Aceita URLs absolutas HTTP/HTTPS
        const url = new URL(s);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
        // Aceita caminhos relativos internos (começando com /)
        return s.startsWith('/');
    }
}

function formatPrice(value, prefix = 'R$ ') {
    if (!value && value !== 0) return 'R$ 0,00';
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (isNaN(num)) return 'R$ 0,00';
    return prefix + num.toFixed(2).replace('.', ',');
}

function formatUnityWithQty(unidade, qtdEmbalagem) {
    const u = unidade || 'UN';
    const q = parseInt(qtdEmbalagem) || 1;
    return q === 1 ? u : `${u} / ${q}`;
}

function handleImageError(img, fallbackIcon = 'directions_car') {
    img.onerror = null; // Prevent infinite loops
    img.src = '/imagens/icon-512-black.png'; // Use logo as immediate fallback
    // Or if you want to replace with an icon:
    const parent = img.parentElement;
    if (parent) {
        parent.innerHTML = `<span class="material-symbols-rounded" style="color: var(--muted)">${fallbackIcon}</span>`;
    }
}

let toastTimeout;
let hasCriticalStock = false;
let cameraStream = null;

const SPREADSHEET_ID = '1NK_rmdEfZYQPnFEil5pDWF1rIt9adajd1GpkcObSkv0';
const CACHE_NAME = 'dy-autoparts-v9';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbznHLTXr_--3PrR8GAz4-TrtX4jttC5cg7CH8cPa7KzoRQPQMZrmtEPBAMWE5KqMTUXwA/exec'; // URL do Google Apps Script para salvar dados
const API_BASE = "https://script.google.com/macros/s/AKfycbznHLTXr_--3PrR8GAz4-TrtX4jttC5cg7CH8cPa7KzoRQPQMZrmtEPBAMWE5KqMTUXwA/exec";

let appData;
try {
    appData = JSON.parse(localStorage.getItem('appData')) || {
        users: [],
        products: [],
        channels: [],
        separacao: [],
        conferencia: [],
        estoque: [],
        movimentacoes: [],
        inventario: [],
        isLoading: false,
        lastSyncTime: null,
        lastSyncTimestamp: 0,
        currentInventory: null,
        kit_lampada: []
    };
} catch (e) {
    console.error("[Bootstrap] Erro ao carregar appData do localStorage:", e);
    appData = {
        users: [],
        products: [],
        channels: [],
        separacao: [],
        conferencia: [],
        estoque: [],
        movimentacoes: [],
        inventario: [],
        isLoading: false,
        lastSyncTime: null,
        lastSyncTimestamp: 0,
        currentInventory: null,
        kit_lampada: []
    };
}


// Diagnóstico inicial e Limpeza de cache de produtos legado
if (appData.products && appData.products.length > 0) {
    console.log(`[Cache] Detectados ${appData.products.length} produtos no localStorage. Limpando para garantir carga fresca do Supabase.`);
    appData.products = []; // Força a limpeza para evitar uso de dados legados das planilhas
}

console.log("[DIAGNOSTICO] appData inicial:", {
    productsCount: appData.products ? appData.products.length : 0,
    lastSync: appData.lastSyncTime
});

const DATA_MAX_AGE_MS = 5 * 60 * 1000; // 5 Minutos de validade para processos críticos

function isDataFresh() {
    if (!appData.lastSyncTimestamp) return false;
    const age = Date.now() - appData.lastSyncTimestamp;
    return age < DATA_MAX_AGE_MS;
}

/**
 * Interceptor para garantir dados novos em processos críticos
 */
async function ensureFreshData(callback) {
    if (isDataFresh()) {
        addTechnicalLog('SYNC_CHECK', 'FRESH', 'Dados dentro da janela de 5min');
        return callback();
    }

    addTechnicalLog('SYNC_CHECK', 'STALE', 'Dados antigos. Disparando sync obrigatória...');
    
    // Mostra loader somente nos casos críticos
    const success = await loadAllData(false); 
    
    if (success) {
        callback();
    } else {
        showToast("⚠️ Falha na sincronização. Verifique sua conexão.");
    }
}

/**
 * Log Técnico Interno (Background)
 */
function addTechnicalLog(action, status, details = "") {
    const logs = JSON.parse(localStorage.getItem('tech_logs') || '[]');
    logs.unshift({
        timestamp: new Date().toISOString(),
        action,
        status,
        details
    });
    // Manter apenas os últimos 100 logs
    localStorage.setItem('tech_logs', JSON.stringify(logs.slice(0, 100)));
    console.log(`[TECH-LOG] ${action}: ${status} ${details}`);
}

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

// ==========================================
// BOOTSTRAP RESILIENTE COM TIMEOUT E FALLBACK CONTROLADO
// ==========================================

const BOOT_CONFIG = {
    TIMEOUT_MS: 10000,        // 10s timeout por etapa
    MAX_RETRIES: 1,          // máximo 1 retry
    BOOT_TIMEOUT_MS: 30000    // 30s timeout total do bootstrap
};

let bootstrapState = {
    running: false,
    completed: false,
    abortController: null,
    startTime: null
};

function hideSplash() {
    const splash = document.querySelector('.splash-preloader');
    if (splash) {
        splash.style.display = 'none';
        console.log('[BOOT] Splash ocultado');
    }
}

function showBootstrapError(message) {
    console.error('[BOOT] Erro:', message);
    hideSplash();
    if (typeof renderLogin === 'function') {
        renderLogin();
    }
}

function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`[BOOT] Timeout em ${label} (${ms}ms)`));
        }, ms);
        promise
            .then(result => {
                clearTimeout(timeout);
                resolve(result);
            })
            .catch(err => {
                clearTimeout(timeout);
                reject(err);
            });
    });
}

async function initApp() {
    applyAppFont();
    window.loginCustomBgImage = null;
    
    try {
        loadFromIndexedDB('loginBgImage', function(data) {
            if (data && typeof data === 'string' && data.startsWith('data:image')) {
                window.loginCustomBgImage = data;
            }
        });
    } catch (e) {
        console.log('[INIT] Error loading custom bg, using default');
    }
    
    // 1. GUARDA DE REENTRADA - impedir múltiplas inicializações
    if (bootstrapState.running) {
        console.log('[BOOT] Reentrada bloqueada - bootstrap já em execução');
        addSyncTrace('initApp', 'BLOCK', 'reentrada');
        return;
    }
    if (bootstrapState.completed) {
        console.log('[BOOT] Reentrada bloqueada - bootstrap já concluído');
        addSyncTrace('initApp', 'BLOCK', 'já completado');
        return;
    }

    // 2. INICIAR BOOTSTRAP
    bootstrapState.running = true;
    bootstrapState.startTime = Date.now();
    bootstrapState.abortController = new AbortController();

    console.log('[BOOT] ==========================================');
    console.log('[BOOT] INÍCIO DO BOOTSTRAP');
    console.log('[BOOT] ==========================================');

    // 3. TIMEOUT TOTAL DO BOOTSTRAP
    const totalTimeout = setTimeout(() => {
        if (bootstrapState.running && !bootstrapState.completed) {
            console.error('[BOOT] TIMEOUT TOTAL DE INICIALIZAÇÃO');
            bootstrapState.abortController.abort();
            showBootstrapError('Timeout de inicialização');
        }
    }, BOOT_CONFIG.BOOT_TIMEOUT_MS);

    try {
        // 4. ESCONDER SPLASH IMEDIATAMENTE
        hideSplash();

        // 5. VERIFICAR SUPABASE (não bloqueante)
        console.log('[BOOT] Verificando Supabase...');
        try {
            if (typeof testeSupabase === 'function') {
                testeSupabase();
            }
        } catch (se) {
            console.warn('[BOOT] Supabase não disponível:', se.message);
        }

        atualizarStatusConexao();

        // 6. CARREGAR USUÁRIOS COM TIMEOUT E FALLBACK ÚNICO
        console.log('[BOOT] Carregando usuários...');
        const usersLoaded = await loadUsersWithFallback();
        
        if (usersLoaded) {
            console.log(`[BOOT] Usuários carregados: ${appData.users?.length || 0}`);
        } else {
            console.warn('[BOOT] Usuários não carregados, usando fallback');
        }

        // 7. CARGA INICIAL (separacao) - apenas se necessário
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            console.log('[BOOT] Carregando dados mínimos (separacao)...');
            try {
                await withTimeout(
                    loadAllData(true, 'initApp'),
                    BOOT_CONFIG.TIMEOUT_MS,
                    'loadAllData'
                );
            } catch (e) {
                console.warn('[BOOT] loadAllData falhou:', e.message);
            }
        }

        // 8. RENDERIZAR LOGIN SEMPRE
        console.log('[BOOT] Renderizando tela de login...');
        renderLogin();
        
        // 9. CONCLUIR BOOTSTRAP
        clearTimeout(totalTimeout);
        bootstrapState.completed = true;
        bootstrapState.running = false;
        
        const elapsed = Date.now() - bootstrapState.startTime;
        console.log('[BOOT] ==========================================');
        console.log(`[BOOT] BOOTSTRAP CONCLUÍDO (${elapsed}ms)`);
        console.log('[BOOT] ==========================================');
        addSyncTrace('initApp', 'COMPLETE', `sucesso em ${elapsed}ms`);

    } catch (err) {
        clearTimeout(totalTimeout);
        console.error('[BOOT] Erro crítico no bootstrap:', err);
        addSyncTrace('initApp', 'ERROR', err.message);
        
        // SEMPRE renderizar login em caso de erro
        hideSplash();
        try {
            renderLogin();
        } catch (e2) {
            console.error('[BOOT] Também falhou renderLogin:', e2);
        }
        
        bootstrapState.completed = true;
        bootstrapState.running = false;
    }
}

async function loadUsersWithFallback() {
    // TENTATIVA ÚNICA: Supabase (SSOT)
    console.log('[BOOT] Carregando usuários do Supabase...');
    try {
        const data = await withTimeout(
            DataClient.fetchUsuariosSupabase(),
            BOOT_CONFIG.TIMEOUT_MS,
            'fetchUsuariosSupabase'
        );
        
        if (data && data.length > 0) {
            appData.users = data.map(u => ({
                ...u,
                avatar_url: (u.avatar_url && !['sim', 'nao', 'não'].includes(String(u.avatar_url).toLowerCase()) && (String(u.avatar_url).startsWith('http') || String(u.avatar_url).startsWith('data:'))) ? u.avatar_url : ''
            }));
            console.log(`[DATA] usuarios -> Supabase (${appData.users.length} usuários)`);
            console.log(`[DATA] Google Sheets ignorado para 'usuarios'`);
            return true;
        }
        
        console.error('[BOOT] Supabase retornou vazio para usuários (SSOT FALHOU)');
    } catch (e) {
        console.error(`[BOOT] Erro crítico ao carregar usuários do Supabase: ${e.message}`);
    }

    // SEM FALLBACK PARA SHEETS (Consolidado)
    addSyncTrace('loadUsersWithFallback', 'ABORT', 'Supabase falhou e Sheets está desativado como fallback');
    return false;
}



// Inicialização segura baseada no estado do documento

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    // Usar setTimeout para evitar bloqueio síncrono
    setTimeout(initApp, 0);
}

let lastProcessSyncQueueCall = 0;
const PROCESS_SYNC_QUEUE_DEBOUNCE_MS = 3000;

async function processSyncQueue(caller = 'unknown') {
    const now = Date.now();
    if (now - lastProcessSyncQueueCall < PROCESS_SYNC_QUEUE_DEBOUNCE_MS) {
        console.log(`[SYNC] processSyncQueue ignorado (debounce): ${caller} | Última: ${now - lastProcessSyncQueueCall}ms`);
        addSyncTrace('processSyncQueue', 'DEBOUNCE', caller);
        return;
    }
    lastProcessSyncQueueCall = now;

    if (!navigator.onLine || isSyncing) {
        addSyncTrace('processSyncQueue', 'BLOCK', `online=${navigator.onLine} isSyncing=${isSyncing}`);
        return;
    }
    
    addSyncTrace('processSyncQueue', 'START', caller);
    console.log(`[SYNC] processSyncQueue disparado por: ${caller}`);

    let queue = JSON.parse(localStorage.getItem('pending_sync_queue') || '[]');
    const initialQueueLength = queue.length;

    if (queue.length === 0) {
        operacoesPendentes = 0;
        atualizarPendentes();
        addSyncTrace('processSyncQueue', 'EMPTY', 'fila vazia');
        return;
    }

    isSyncing = true;
    console.log(`Processando fila de sincronia: ${queue.length} itens`);

    try {
        while (queue.length > 0) {
            const item = queue[0];
            operacoesPendentes = queue.length;
            atualizarPendentes();

            try {
                if (!item.payload.executionId) {
                    item.payload.executionId = item.id;
                }

                await fetch(SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item.payload)
                });

                queue.shift();
                localStorage.setItem('pending_sync_queue', JSON.stringify(queue));
            } catch (error) {
                console.warn(`Pausa na sincronia (Rede/GAS):`, error);
                break;
            }
        }
    } finally {
        const itemsProcessed = initialQueueLength - (queue.length);
        isSyncing = false;
        operacoesPendentes = queue.length;
        atualizarPendentes();

        // Só recarrega dados se realmente houve mudança (itens processados)
        if (queue.length === 0 && itemsProcessed > 0) {
            console.log(`[SYNC] Fila limpa (${itemsProcessed} itens). Atualizando dados locais...`);
            addSyncTrace('processSyncQueue', 'CALL', `loadAllData (fila processada: ${itemsProcessed} itens)`);
            showToast("Sincronizado com sucesso!");
            loadAllData(true, 'processSyncQueue_success');
        } else if (queue.length === 0) {
            console.log(`[SYNC] Fila já estava vazia. Nenhuma carga adicional necessária.`);
            addSyncTrace('processSyncQueue', 'SKIP', 'fila vazia');
        }
        addSyncTrace('processSyncQueue', 'COMPLETE', `processados=${itemsProcessed} restantes=${queue.length}`);
    }
}

async function safePost(payload) {
    const executionId = generateExecutionId();
    // Aplicar a Camada de Normalização imediatamente
    const normalizedPayload = normalizePayloadForSheet({ ...payload, executionId });

    const syncItem = {
        id: executionId,
        timestamp: new Date().toISOString(),
        payload: normalizedPayload
    };

    // Log para debug - útil para identificar problemas de comunicação
    console.log("[safePost] Enviando para SCRIPT_URL:", SCRIPT_URL);
    console.log("[safePost] Payload:", JSON.stringify(syncItem.payload, null, 2));

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
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncItem.payload)
        });
        
        // Com no-cors, não podemos ver a resposta, mas se não threw erro, considera-se sucesso
        console.log("[safePost] Envio concluído com sucesso (mode: no-cors)");
        return true;
    } catch (error) {
        console.error("[safePost] Erro na requisição:", error);
        
        // Adicionar à fila mesmo em caso de erro
        const queue = JSON.parse(localStorage.getItem('pending_sync_queue') || '[]');
        queue.push(syncItem);
        localStorage.setItem('pending_sync_queue', JSON.stringify(queue));
        operacoesPendentes = queue.length;
        atualizarPendentes();
        
        // Mostrar erro mais específico
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showToast("Erro de conexão: Salvando em fila local.");
        } else if (error.name === 'AbortError') {
            showToast("Timeout: Operação cancelada. Salvando em fila.");
        } else {
            showToast("Erro ao salvar: " + error.message);
        }
        return false;
    }
}

function sincronizarSistema() {
    if (isSyncing) return;
    processSyncQueue('manual');
    loadAllData(true, 'manual');
}

async function fetchSheetData(sheetName, timeoutMs = 20000) {
    const url = `${SCRIPT_URL}?action=list&sheet=${encodeURIComponent(sheetName)}`;

    // Controlador de timeout para evitar travamento infinito
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const result = await response.json();
        if (!result.ok) {
            console.error(`[BACKEND] Erro na aba '${sheetName}':`, result.error);
            showToast(`Erro na aba '${sheetName}': ${result.error}`, "error");
            return null;
        }

        console.log(`[BACKEND] Dados recebidos de '${sheetName}':`, {
            count: (result.data || []).length,
            firstRow: (result.data || [])[0]
        });

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
        console.error(`Error fetching sheet ${sheetName}:`, error);
        
        if (sheetName === 'estoque_atual') return null;

        if (error.name === 'AbortError') {
            showToast(`Timeout ao buscar dados de '${sheetName}'`, "error");
        } else if (error.message.includes('Failed to fetch')) {
            showToast(`Erro de conexão ao buscar '${sheetName}'`, "error");
        } else {
            showToast(`Erro ao buscar '${sheetName}': ${error.message}`, "error");
        }
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

function getTopBarHTML(currentUser, backAction = null, screenType = 'internal') {
    const isMenuScreen = screenType === 'menu';
    
    if (isMenuScreen) {
        // MENU PRINCIPAL: Aparece somente SAIR/LOGOUT (Power icon), no lado direito
        return `
            <div class="menu-top-trigger-area"></div>
            <div class="menu-floating-top-actions" style="right: 20px !important; left: auto !important;">
                <button class="btn-exit-floating" onclick="logout()" title="Sair do Sistema">
                    <span class="material-symbols-rounded">power_settings_new</span>
                </button>
            </div>
        `;
    }

    // TELAS INTERNAS: Aparece somente botão VOLTAR (Seta), no lado esquerdo
    return `
        <div class="menu-top-trigger-area"></div>
        <div class="menu-floating-top-actions" style="right: auto !important; left: 20px !important;">
            <button class="btn-exit-floating" onclick="${backAction || 'goBack()'}" title="Voltar">
                <span class="material-symbols-rounded">arrow_back</span>
            </button>
        </div>
    `;
}




function startClock() {
    // Clock removed from UI
}

async function loadUsersOnly() {
    try {
        const data = await DataClient.fetchUsuariosSupabase();
        if (data && data.length > 0) {
            appData.users = data.map(u => ({
                ...u,
                avatar_url: (u.avatar_url && !['sim', 'nao', 'não'].includes(String(u.avatar_url).toLowerCase()) && (String(u.avatar_url).startsWith('http') || String(u.avatar_url).startsWith('data:'))) ? u.avatar_url : ''
            }));
            console.log(`[BOOT] usuarios -> Supabase (${appData.users.length} usuários carregados)`);
        } else {
            console.log('[BOOT] usuários: fallback para dados em memória ou fallback');
        }
    } catch (e) {
        console.warn('[BOOT] Erro ao carregar usuarios do Supabase, tentando fetchSheetData:', e);
        try {
            const data = await fetchSheetData('usuarios');
            if (data) {
                appData.users = data
                    .filter(u => String(u.ativo).toLowerCase() === 'sim')
                    .map(u => ({
                        ...u,
                        avatar_url: (u.avatar_url && !['sim', 'nao', 'não'].includes(String(u.avatar_url).toLowerCase()) && (String(u.avatar_url).startsWith('http') || String(u.avatar_url).startsWith('data:'))) ? u.avatar_url : ''
                    }));
            }
        } catch (e2) {
            console.warn('[BOOT] Também falhou fetchSheetData:', e2);
        }
    }
}

let lastLoadAllDataCall = 0;
const LOAD_ALL_DATA_DEBOUNCE_MS = 3000;

async function loadAllData(silent = false, caller = 'unknown') {
    const now = Date.now();
    if (now - lastLoadAllDataCall < LOAD_ALL_DATA_DEBOUNCE_MS) {
        console.log(`[SYNC] loadAllData ignorado (debounce): ${caller} | Última: ${now - lastLoadAllDataCall}ms`);
        addSyncTrace('loadAllData', 'DEBOUNCE', caller);
        return false;
    }
    lastLoadAllDataCall = now;

    try {
        if (isAppLoading) {
            console.log(`[SYNC] loadAllData ignorado (isAppLoading=true): ${caller}`);
            addSyncTrace('loadAllData', 'BLOCK', `isAppLoading=true caller=${caller}`);
            return false;
        }
        isAppLoading = true;

        addSyncTrace('loadAllData', 'START', `${caller} silent=${silent}`);

        if (!silent) {
            renderLoading(0, "Carregando dados essenciais...");
        }

        addTechnicalLog('SYNC', 'START', `${silent ? 'Silent' : 'UI'} | Caller: ${caller}`);
        console.log(`[SYNC] loadAllData disparado por: ${caller} (Silent: ${silent})`);

        // Carregar apenas dados mínimos para o app funcionar (login + menu)
        // Cada módulo carregará seus próprios dados sob demanda via DataClient
        // ATENÇÃO: usuarios, canais_envio e produtos agora vem do Supabase, não mais do Google Sheets
        // separacao e separacao_itens removidos: só devem ser carregados ao entrar na tela de separação/conferência
        const essentialTables = [
        ];

        let completed = 0;
        const total = essentialTables.length;

        const promises = essentialTables.map(async (table) => {
            try {
                const data = await fetchSheetData(table);
                if (data) {
                    appData[table] = data;
                }
            } catch (e) {
                console.warn(`Error loading table ${table}:`, e);
            } finally {
                completed++;
                if (!silent) {
                    updateLoadingProgress(Math.round((completed / total) * 100));
                }
            }
        });

        await Promise.allSettled(promises);

        // Não salvar todo o appData no localStorage para evitar dados desatualizados
        // Cada módulo gerencia seu próprio cache via DataClient
        appData.lastSyncTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        appData.lastSyncTimestamp = Date.now();
        
        addTechnicalLog('SYNC', 'SUCCESS');

        // Estoque crítico será verificado quando o módulo de produtos for carregado
        // via DataClient para não impactar inicialização
        hasCriticalStock = false;
        addSyncTrace('loadAllData', 'SUCCESS', caller);
        return true;
    } catch (error) {
        addTechnicalLog('SYNC', 'ERROR', error.toString());
        console.error('Error loading data:', error);
        addSyncTrace('loadAllData', 'ERROR', error.toString());
        if (!silent) showToast("Erro ao sincronizar dados.");
        return false;
    } finally {
        isAppLoading = false;
        appData.isLoading = false;
        addSyncTrace('loadAllData', 'FINALLY', `caller=${caller} screen=${currentScreen}`);
        
        // Anti-Blink: Não atualiza a UI se for silêncioso ou se estiver no login
        if (!silent && currentScreen === 'menu') {
            renderMenu();
        }
    }
}

/**
 * Função crítica para garantir que os produtos foram carregados via DataClient
 * se ainda não estiverem no appData.
 */
async function ensureProdutosLoaded(force = false) {
    if (!force && appData.products && appData.products.length > 0) return true;
    
    try {
        const start = performance.now();
        const data = await window.DataClient.loadModule('produtos', force);
        
        if (data && data.products && data.products.length > 0) {
            console.log(`[PERF] Produtos carregados do SUPABASE em ${Math.round(performance.now() - start)}ms`);
            
            // Indexação em memória para busca instantânea
            const indexStart = performance.now();
            appData.products = data.products.map(p => {
                const searchableTerms = [
                    p.descricao_base || p.descricao || "",
                    p.descricao_completa || "",
                    p.marca || p.marque || "",
                    p.categoria || "",
                    p.subcategoria || "",
                    p.ean || "",
                    p.sku_fornecedor || p.sku || "",
                    p.id_interno || p.id || ""
                ];
                
                // Atributos também entram no índice
                const attrs = safeParseAtributos(p.atributos);
                attrs.forEach(a => {
                    searchableTerms.push(a.nome || "");
                    searchableTerms.push(a.valor || "");
                });

                return {
                    ...p,
                    _dBaseNorm: normalizeText(p.descricao_base || p.descricao || ""),
                    _dFullNorm: normalizeText(p.descricao_completa || ""),
                    _brandCatSubNorm: normalizeText(`${p.marca || ""} ${p.categoria || ""} ${p.subcategoria || ""}`),
                    _searchIndex: searchableTerms.map(normalizeText).join(" ")
                };
            });
            
            appData.estoque = data.estoque;
            console.log(`[PERF] Índice de busca criado para ${appData.products.length} produtos em ${Math.round(performance.now() - indexStart)}ms`);
            return true;
        } else {
            console.error("[DATA] ERRO: Catálogo retornou vazio ou inválido do Supabase");
            showToast("Catálogo vazio. Verifique o Supabase.", "error");
            return false;
        }
    } catch (err) {
        console.error("[DATA] ERRO FATAL ao carregar produtos:", err.message);
        showToast("Erro ao carregar Supabase: " + err.message, "error");
        return false;
    }
}

/**
 * Garante que os canais de envio foram carregados do Supabase.
 * [CANAIS DEBUG]
 */
async function ensureCanaisLoaded(force = false) {
    if (!force && appData.channels && appData.channels.length > 0) {
        console.log('[CANAIS DEBUG] Usando canais do cache appData');
        return true;
    }
    
    try {
        console.log('[CANAIS DEBUG] Supabase client disponível?', !!window.supabaseClient);
        console.log('[CANAIS DEBUG] Carregando canais do Supabase...');
        
        const data = await window.DataClient.loadModule('channels', force);
        
        if (data && data.channels) {
            appData.channels = data.channels;
            console.log(`[CANAIS DEBUG] Quantidade de canais carregados: ${appData.channels.length}`);
            console.log(`[CANAIS DEBUG] Lista de nomes carregados:`, appData.channels.map(c => c.nome || c.col_B));
            return true;
        }
        
        console.warn('[CANAIS DEBUG] Nenhum canal retornado do Supabase');
        appData.channels = [];
        return false;
    } catch (error) {
        console.error('[CANAIS DEBUG] Erro ao carregar canais:', error);
        appData.channels = [];
        return false;
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
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'success' || type === true) {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.12);
        } else if (type === 'warning') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); 
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.2);
        } else if (type === 'error' || type === false) {
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(220, audioCtx.currentTime); 
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.3);
        }
    } catch (err) {
        console.warn('[AUDIO] feedback falhou', err);
    }
}


let isSyncingFlowActive = false;

function showSyncLoader() {
    // Silent mode - UI screen removed per User request
}

function hideSyncLoader() {
    // Silent mode - UI screen removed per User request
}

async function setUser(userName, userId, userProfile) {
    if (isSyncingFlowActive) {
        addSyncTrace('setUser', 'BLOCK', 'isSyncingFlowActive=true');
        return;
    }
    isSyncingFlowActive = true;

    addSyncTrace('setUser', 'START', `user=${userName} profile=${userProfile}`);

    localStorage.setItem('currentUser', userName);
    localStorage.setItem('currentUserId', userId || '');
    localStorage.setItem('currentUserProfile', userProfile || 'Operador');

    // Entrada INSTANTÂNEA no menu
    renderMenu();

    // Sincronização silenciosa em background - COORDENADA
    if (navigator.onLine) {
        addTechnicalLog('LOGIN', 'SILENT_SYNC_START', userName);
        console.log("[SYNC] setUser coordenando sincronização inicial...");
        addSyncTrace('setUser', 'CALL', 'processSyncQueue + loadAllData');
        processSyncQueue('setUser');
        loadAllData(true, 'setUser');
    }

    isSyncingFlowActive = false;
    addSyncTrace('setUser', 'COMPLETE', userName);
}
function logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentUserId');
    localStorage.removeItem('currentUserProfile');
    localStorage.removeItem('draft_pick_session');
    
    // Limpar estados de memória
    currentPackSession = null;
    currentSessionItems = [];
    
    renderLogin();
}

/**
 * Alterna visibilidade do custo nos detalhes do produto
 */
function toggleCostVisibility() {
    const isVisible = localStorage.getItem('cost_visible') === 'true';
    localStorage.setItem('cost_visible', !isVisible);
    
    // Se o elemento existir na tela atual, atualiza na hora sem re-renderizar tudo
    const costField = document.getElementById('product-cost-field');
    const toggleIcon = document.getElementById('cost-toggle-icon');
    
    if (costField && toggleIcon) {
        if (!isVisible) {
            // Estava oculto, vai mostrar
            costField.classList.remove('cost-masked');
            toggleIcon.innerText = 'visibility';
            // Precisamos do dado do produto, mas como não temos aqui, o fallback é re-render
            const activeEan = document.querySelector('[data-ean]')?.dataset.ean;
            if (activeEan) {
                const p = appData.products.find(x => x.ean === activeEan || x.id_interno === activeEan);
                if (p) {
                   costField.innerText = ((p.preco_custo || '0,00').toString().includes('R$') ? '' : 'R$ ') + (p.preco_custo || '0,00');
                }
            } else {
                console.warn("Contexto do produto perdido para exibição do custo.");
            }
        } else {
            // Estava visível, vai ocultar
            costField.classList.add('cost-masked');
            toggleIcon.innerText = 'visibility_off';
            costField.innerText = 'R$ ••••••';
        }
    }
}

// Status Handlers moved to global section early in file


window.loginSoundPaths = [
    '/assets/audio/som1.mp3',
    '/assets/audio/som2.mp3',
    '/assets/audio/som3.mp3',
    '/assets/audio/som4.mp3'
];
window.loginSounds = [];

window.playLoginSound = function(index) {
  const soundIndex = index % window.loginSoundPaths.length;
  try {
    if (!window.loginSounds[soundIndex]) {
      window.loginSounds[soundIndex] = new Audio(window.loginSoundPaths[soundIndex]);
    }
    const sound = window.loginSounds[soundIndex];
    if (!sound) return;

    sound.pause();
    sound.currentTime = 0;
    sound.volume = 0.6;

    sound.play().catch(() => {});

    setTimeout(() => {
      sound.pause();
      sound.currentTime = 0;
    }, 1000);
  } catch (e) {
    // Audio not available, silently ignore
  }
};

function renderLogin(push = true) {
    currentScreen = 'login';
    if (push) pushNav('login');
    const fallbackUsers = [
        { id: 'f1', nome: "Alexandre Kawai", perfil: 'Operador' },
        { id: 'f2', nome: "Daniel Yanagihara", perfil: 'Operador' },
        { id: 'f3', nome: "Fabio Kanashiro", perfil: 'Operador' },
        { id: 'f4', nome: "Rafael Costa", perfil: 'Operador' }
    ];

    let usersToRender = [];

    if (appData.users && appData.users.length > 0) {
        usersToRender = appData.users
            .map(u => ({
                id: u.usuario_id || u.col_A || '',
                nome: u.nome || u.col_B || '',
                perfil: u.perfil || u.col_C || '',
                avatar_url: u.avatar_url || ''
            }))
            .filter(u => u.nome.trim() !== '');
    }

    if (usersToRender.length === 0) {
        usersToRender = fallbackUsers;
    }

    // Função para extrair iniciais (Primeira letra Nome + Primeira letra Último Sobrenome)
    const getUserInitials = (name) => {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 0) return '?';
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        const first = parts[0].charAt(0);
        const last = parts[parts.length - 1].charAt(0);
        return (first + last).toUpperCase();
    };

    // Stable color function (Deterministic based on ID or Name)
    const getUserColorClass = (id, name) => {
        const seed = id || name || 'default';
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = seed.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `avatar-color-${Math.abs(hash + seed.length) % 6}`;
    };

    const isMobile = window.innerWidth < 768;
    const bgImageSet = isMobile ? localStorage.getItem('loginBackgroundMobile') : localStorage.getItem('loginBackgroundDesktop');
    
    let backgroundStyle = '';
    if (bgImageSet && typeof bgImageSet === 'string' && bgImageSet.startsWith('data:image')) {
        backgroundStyle = `style="background: linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('${bgImageSet}') center/cover no-repeat;"`;
    }
    
    const userGridHTML = usersToRender.map((u, index) => {
        const initials = getUserInitials(u.nome);
        
        return `
                <div class="user-card" onclick="window.playLoginSound(${index}); setUser('${u.nome}', '${u.id}', '${u.perfil}')">
                    <div class="user-avatar-box">
                        <span class="user-initials">${initials}</span>
                    </div>
                </div>
            `;
    }).join('');

    const loginHTML = `
        <div class="login-screen fade-in" id="login-screen" ${backgroundStyle}>
            <div class="login-header-actions" style="position: absolute; top: 20px; right: 20px; z-index: 100;">
                <button id="btn-fullscreen-login" onclick="toggleFullscreen()" class="btn-fullscreen-toggle" title="Tela Cheia" style="background: rgba(16, 16, 24, 0.6); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.1); width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15); transition: all 0.2s; cursor: pointer;">
                    <span class="material-symbols-rounded">fullscreen</span>
                </button>
            </div>
            <img src="${LOGO_SMALL_URL}" alt="DY AutoParts" class="login-logo">
            <div class="user-grid">
                ${userGridHTML}
            </div>
        </div>
    `;

    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    // Se já estiver na tela de login, apenas atualiza a grid se houver mudanças reais para evitar flicker
    const existingScreen = appContainer.querySelector('.login-screen');
    if (existingScreen) {
        const gridContainer = existingScreen.querySelector('.user-grid');
        if (gridContainer) {
            const newContent = userGridHTML;
            if (gridContainer.innerHTML.trim().length !== newContent.trim().length) {
                gridContainer.innerHTML = newContent;
            }
            return;
        }
    }

    appContainer.innerHTML = loginHTML;
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

async function renderAlerts() {
    const currentUser = localStorage.getItem('currentUser');
    
    await ensureProdutosLoaded();
    
    const criticalProducts = (appData.products || []).filter(p => {
        if (!p.estoque_minimo || parseFloat(p.estoque_minimo) <= 0) return false;
        const stock = parseFloat((p.estoque_atual || 0).toString().replace(',', '.'));
        const min = parseFloat(p.estoque_minimo.toString().replace(',', '.'));
        return stock <= min;
    });
    
    let pendingCount = 0;
    if (appData.pickSessions && appData.pickSessions.length > 0) {
        pendingCount = appData.pickSessions.filter(s => s.status === 'pending' || s.status === 'open' || !s.status).length;
    }
    
    const criticalCount = criticalProducts.length;
    const totalAlerts = criticalCount + pendingCount;
    
    app.innerHTML = `
        <div class="dashboard-screen fade-in internal">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
            <main class="container">
                <div class="sub-menu-header">
                    <h2 style="font-size: 1.2rem; font-weight: 700;">ALERTAS OPERACIONAIS</h2>
                    ${totalAlerts > 0 ? `<span style="background: #EF4444; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.8rem; font-weight: 700;">${totalAlerts}</span>` : ''}
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 24px;">
                    <div class="menu-card" onclick="renderEstoqueAtual()" style="cursor: pointer;">
                        <span class="material-symbols-rounded icon" style="font-size: 32px; color: #EF4444;">inventory</span>
                        <div style="flex: 1;">
                            <span class="label" style="font-size: 16px; font-weight: 700;">Estoque Crítico</span>
                            <span style="display: block; font-size: 0.85rem; color: var(--muted);">Produtos abaixo do estoque mínimo</span>
                        </div>
                        ${criticalCount > 0 ? `<span style="background: #EF4444; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.9rem; font-weight: 700;">${criticalCount}</span>` : '<span class="material-symbols-rounded" style="color: #22c55e;">check_circle</span>'}
                    </div>
                    
                    <div class="menu-card" onclick="renderPickMenu()" style="cursor: pointer;">
                        <span class="material-symbols-rounded icon" style="font-size: 32px; color: #F59E0B;">conveyor_belt</span>
                        <div style="flex: 1;">
                            <span class="label" style="font-size: 16px; font-weight: 700;">Separações Pendentes</span>
                            <span style="display: block; font-size: 0.85rem; color: var(--muted);">Filas de separação aguardando</span>
                        </div>
                        ${pendingCount > 0 ? `<span style="background: #F59E0B; color: black; padding: 4px 12px; border-radius: 12px; font-size: 0.9rem; font-weight: 700;">${pendingCount}</span>` : '<span class="material-symbols-rounded" style="color: #22c55e;">check_circle</span>'}
                    </div>
                    
                    <div class="menu-card" style="opacity: 0.5; cursor: default;">
                        <span class="material-symbols-rounded icon" style="font-size: 32px; color: #94A3B8;">local_shipping</span>
                        <div style="flex: 1;">
                            <span class="label" style="font-size: 16px; font-weight: 700;">Compras a Caminho</span>
                            <span style="display: block; font-size: 0.85rem; color: var(--muted);">Pedidos de compra em trânsito</span>
                        </div>
                        <span style="background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); padding: 4px 12px; border-radius: 12px; font-size: 0.8rem;">Em breve</span>
                    </div>
                </div>
                
                ${totalAlerts === 0 ? `
                <div style="text-align: center; padding: 40px; background: var(--surface); border-radius: 20px; color: var(--muted); margin-top: 24px;">
                    <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 16px; color: #22c55e;">check_circle</span>
                    <p style="font-size: 1rem;">Nenhum alerta operacional.</p>
                </div>
                ` : ''}
            </main>
        </div>
    `;
}

// ========================================================
// CONFIGURAÇÃO CENTRALIZADA DOS MÓDULOS DO MENU
// Estrutura única: tipo = "principal" | "em_breve"
// Preparado para migrar para tabela no Supabase
// ========================================================
const menuModulesConfig = [
    { id: 'produtos', label: 'PRODUTOS', icon: 'produtos', order: 1, type: 'principal' },
    { id: 'kit_lampada', label: 'KIT LÂMPADAS', icon: 'kit_lampada', order: 2, type: 'principal' },
    { id: 'pick', label: 'SEPARAÇÃO (PICK)', icon: 'pick', order: 3, type: 'principal' },
    { id: 'pack', label: 'CONFERÊNCIA (PACK)', icon: 'pack', order: 4, type: 'principal' },
    { id: 'movimentacoes', label: 'MOVIMENTOS', icon: 'movimentacoes', order: 5, type: 'principal' },
    { id: 'inventario', label: 'INVENTÁRIO', icon: 'inventario', order: 6, type: 'principal' },
    { id: 'dashboard', label: 'DASHBOARD', icon: 'dashboard', order: 7, type: 'principal' },
    { id: 'nf', label: 'ENTRADA NF', icon: 'nf', order: 8, type: 'principal' },
    { id: 'financeiro', label: 'FINANCEIRO', icon: 'financeiro', order: 9, type: 'principal' },
    { id: 'configuracoes', label: 'CONFIG', icon: 'configuracoes', order: 10, type: 'principal' }
    // Temporariamente removidos ( Fase 1 limpa):
    // { id: 'compras', label: 'COMPRAS', icon: 'compras', order: 11, type: 'em_breve' },
    // { id: 'pedido', label: 'PEDIDO', icon: 'pedido', order: 12, type: 'em_breve' }
];

// Ícones 3D do menu (definidos uma vez)
const menu3DIcons = {
    produtos: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#DC2626"/><stop offset="50%" stop-color="#B91C1C"/><stop offset="100%" stop-color="#7F1D1D"/></linearGradient><filter id="pf1"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="10" y="14" width="44" height="36" rx="3" fill="url(#p1)" filter="url(#pf1)"/><rect x="14" y="18" width="36" height="3" rx="1" fill="#FFFFFF" opacity="0.9"/><rect x="14" y="23" width="28" height="2.5" rx="1" fill="#FFFFFF" opacity="0.7"/><rect x="14" y="27" width="32" height="2.5" rx="1" fill="#FFFFFF" opacity="0.6"/><rect x="14" y="31" width="24" height="2.5" rx="1" fill="#FFFFFF" opacity="0.5"/><rect x="14" y="35" width="20" height="2.5" rx="1" fill="#FFFFFF" opacity="0.4"/><rect x="14" y="39" width="16" height="2.5" rx="1" fill="#FFFFFF" opacity="0.3"/><path d="M10 14 L10 17 L14 17 L14 14 Z" fill="#991B1B"/></svg>',
    kit_lampada: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p2" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#FCD34D"/><stop offset="100%" stop-color="#F59E0B"/></linearGradient><filter id="pf2"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.2"/></filter></defs><ellipse cx="32" cy="38" rx="16" ry="8" fill="#F59E0B" filter="url(#pf2)"/><path d="M24 16 L32 38 L40 16 Z" fill="url(#p2)" filter="url(#pf2)"/><ellipse cx="32" cy="38" rx="10" ry="5" fill="#FEF3C7"/><circle cx="32" cy="26" r="3" fill="#FEF3C7" opacity="0.8"/></svg>',
    pick: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#1D4ED8"/></linearGradient><filter id="pf3"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.25"/></filter></defs><rect x="8" y="14" width="48" height="36" rx="3" fill="url(#p3)" filter="url(#pf3)"/><rect x="12" y="18" width="40" height="3" rx="1" fill="#FFFFFF" opacity="0.9"/><rect x="12" y="23" width="32" height="2.5" rx="1" fill="#FFFFFF" opacity="0.7"/><rect x="12" y="27" width="36" height="2.5" rx="1" fill="#FFFFFF" opacity="0.6"/><rect x="12" y="31" width="28" height="2.5" rx="1" fill="#FFFFFF" opacity="0.5"/><rect x="12" y="35" width="20" height="2.5" rx="1" fill="#FFFFFF" opacity="0.4"/><path d="M48 18 L56 12 L56 24 L48 30 Z" fill="#1E40AF"/></svg>',
    pack: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10B981"/><stop offset="100%" stop-color="#047857"/></linearGradient><filter id="pf4"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.25"/></filter></defs><rect x="8" y="14" width="48" height="36" rx="3" fill="url(#p4)" filter="url(#pf4)"/><path d="M8 22 H56" stroke="#FFFFFF" stroke-width="2.5" opacity="0.8"/><circle cx="32" cy="38" r="8" fill="#FFFFFF"/><path d="M26 38 L32 44 L42 32" stroke="#10B981" stroke-width="3" stroke-linecap="round" fill="none"/></svg>',
    movimentacoes: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p5" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#6D28D9"/></linearGradient><filter id="pf5"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.25"/></filter></defs><circle cx="20" cy="32" r="12" fill="url(#p5)" filter="url(#pf5)"/><circle cx="44" cy="32" r="12" fill="url(#p5)" filter="url(#pf5)"/><path d="M28 32 H36" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/><path d="M36 32 L44 24 M44 32 L36 40" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/></svg>',
    inventario: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p6" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F59E0B"/><stop offset="100%" stop-color="#B45309"/></linearGradient><filter id="pf6"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.25"/></filter></defs><rect x="10" y="8" width="44" height="48" rx="3" fill="url(#p6)" filter="url(#pf6)"/><rect x="14" y="14" width="36" height="2.5" rx="1" fill="#FFFFFF" opacity="0.9"/><rect x="14" y="19" width="28" height="2.5" rx="1" fill="#FFFFFF" opacity="0.8"/><rect x="14" y="24" width="32" height="2.5" rx="1" fill="#FFFFFF" opacity="0.7"/><rect x="14" y="29" width="24" height="2.5" rx="1" fill="#FFFFFF" opacity="0.6"/><rect x="14" y="34" width="20" height="2.5" rx="1" fill="#FFFFFF" opacity="0.5"/><rect x="14" y="39" width="16" height="2.5" rx="1" fill="#FFFFFF" opacity="0.4"/><rect x="14" y="44" width="12" height="2.5" rx="1" fill="#FFFFFF" opacity="0.3"/></svg>',
    dashboard: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><filter id="pf7"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.2"/></filter></defs><rect x="6" y="6" width="24" height="24" rx="3" fill="#DC2626" filter="url(#pf7)"/><rect x="34" y="6" width="24" height="24" rx="3" fill="#1E3A8A" filter="url(#pf7)"/><rect x="6" y="34" width="24" height="24" rx="3" fill="#18181B" filter="url(#pf7)"/><rect x="34" y="34" width="24" height="24" rx="3" fill="#047857" filter="url(#pf7)"/></svg>',
    configuracoes: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p8" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4B5563"/><stop offset="100%" stop-color="#1F2937"/></linearGradient><filter id="pf8"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-opacity="0.3"/></filter></defs><circle cx="32" cy="32" r="24" fill="url(#p8)" filter="url(#pf8)"/><path d="M32 12 V16 M32 48 V52 M12 32 H16 M48 32 H52 M16 16 L20 20 M44 44 L48 48 M16 48 L20 44 M44 20 L48 16" stroke="#F9FAFB" stroke-width="3.5" stroke-linecap="round" fill="none"/></svg>',
    nf: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p9" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#475569"/><stop offset="100%" stop-color="#1E293B"/></linearGradient><filter id="pf9"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.2"/></filter></defs><rect x="10" y="6" width="44" height="52" rx="3" fill="url(#p9)" filter="url(#pf9)"/><rect x="14" y="12" width="36" height="2.5" rx="1" fill="#FFFFFF" opacity="0.9"/><rect x="14" y="17" width="28" height="2.5" rx="1" fill="#FFFFFF" opacity="0.8"/><rect x="14" y="22" width="32" height="2.5" rx="1" fill="#FFFFFF" opacity="0.7"/><rect x="14" y="27" width="24" height="2.5" rx="1" fill="#FFFFFF" opacity="0.6"/><rect x="14" y="32" width="20" height="2.5" rx="1" fill="#FFFFFF" opacity="0.5"/><rect x="14" y="37" width="16" height="2.5" rx="1" fill="#FFFFFF" opacity="0.4"/><rect x="14" y="42" width="12" height="2.5" rx="1" fill="#FFFFFF" opacity="0.3"/><path d="M44 52 L52 52 L52 48 L44 48 Z" fill="#0F172A"/></svg>',
    compras: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p10" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#DC2626"/><stop offset="100%" stop-color="#991B1B"/></linearGradient><filter id="pf10"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.25"/></filter></defs><path d="M16 12 L24 12 L24 16 L16 16 Z" fill="url(#p10)" filter="url(#pf10)"/><rect x="12" y="16" width="40" height="6" rx="2" fill="url(#p10)" filter="url(#pf10)"/><rect x="16" y="22" width="32" height="30" rx="3" fill="url(#p10)" filter="url(#pf10)"/><circle cx="32" cy="37" r="8" fill="#FFFFFF" opacity="0.15"/><path d="M28 37 L32 41 L38 33" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>',
    financeiro: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p11" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10B981"/><stop offset="100%" stop-color="#047857"/></linearGradient><filter id="pf11"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-opacity="0.3"/></filter></defs><circle cx="32" cy="32" r="24" fill="url(#p11)" filter="url(#pf11)"/><circle cx="32" cy="32" r="18" fill="#064E3B"/><circle cx="32" cy="32" r="10" fill="#10B981"/><text x="32" y="37" text-anchor="middle" fill="#FFFFFF" font-size="14" font-weight="bold">$</text></svg>',
    inventario_inicial: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_inv1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#6D28D9"/></linearGradient><filter id="pf_inv1"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="12" y="8" width="40" height="48" rx="4" fill="url(#p_inv1)" filter="url(#pf_inv1)"/><rect x="18" y="16" width="28" height="3" rx="1" fill="#FFFFFF" opacity="0.9"/><rect x="18" y="22" width="20" height="3" rx="1" fill="#FFFFFF" opacity="0.7"/><rect x="18" y="28" width="24" height="3" rx="1" fill="#FFFFFF" opacity="0.6"/><rect x="18" y="34" width="16" height="3" rx="1" fill="#FFFFFF" opacity="0.5"/><rect x="18" y="40" width="12" height="3" rx="1" fill="#FFFFFF" opacity="0.4"/><circle cx="46" cy="12" r="12" fill="#A78BFA" opacity="0.3"/></svg>',
    inventario_geral: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_inv2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F59E0B"/><stop offset="100%" stop-color="#B45309"/></linearGradient><filter id="pf_inv2"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="8" y="12" width="48" height="40" rx="4" fill="url(#p_inv2)" filter="url(#pf_inv2)"/><rect x="14" y="18" width="36" height="3" rx="1" fill="#FFFFFF" opacity="0.9"/><rect x="14" y="24" width="28" height="3" rx="1" fill="#FFFFFF" opacity="0.7"/><rect x="14" y="30" width="32" height="3" rx="1" fill="#FFFFFF" opacity="0.6"/><rect x="14" y="36" width="24" height="3" rx="1" fill="#FFFFFF" opacity="0.5"/><path d="M48 8 L56 8 L56 24 L48 18 Z" fill="#B45309"/><path d="M48 8 L48 18 L56 24" fill="#78350F"/></svg>',
    inventario_parcial: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_inv3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#06B6D4"/><stop offset="100%" stop-color="#0891B2"/></linearGradient><filter id="pf_inv3"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="8" y="12" width="48" height="40" rx="4" fill="url(#p_inv3)" filter="url(#pf_inv3)"/><rect x="14" y="18" width="36" height="3" rx="1" fill="#FFFFFF" opacity="0.9"/><rect x="14" y="24" width="28" height="3" rx="1" fill="#FFFFFF" opacity="0.7"/><rect x="14" y="30" width="24" height="3" rx="1" fill="#FFFFFF" opacity="0.6"/><rect x="14" y="36" width="20" height="3" rx="1" fill="#FFFFFF" opacity="0.5"/><path d="M40 36 L48 44 L56 32" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" fill="none"/></svg>',
    historico: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_hist" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#64748B"/><stop offset="100%" stop-color="#475569"/></linearGradient><filter id="pf_hist"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="10" y="8" width="44" height="48" rx="4" fill="url(#p_hist)" filter="url(#pf_hist)"/><rect x="16" y="16" width="32" height="2" rx="1" fill="#FFFFFF" opacity="0.9"/><rect x="16" y="22" width="24" height="2" rx="1" fill="#FFFFFF" opacity="0.8"/><rect x="16" y="28" width="28" height="2" rx="1" fill="#FFFFFF" opacity="0.7"/><rect x="16" y="34" width="20" height="2" rx="1" fill="#FFFFFF" opacity="0.6"/><rect x="16" y="40" width="16" height="2" rx="1" fill="#FFFFFF" opacity="0.5"/><rect x="16" y="46" width="12" height="2" rx="1" fill="#FFFFFF" opacity="0.4"/></svg>',
    busca: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_busca" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6366F1"/><stop offset="100%" stop-color="#4F46E5"/></linearGradient><filter id="pf_busca"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><circle cx="26" cy="26" r="16" fill="url(#p_busca)" filter="url(#pf_busca)"/><circle cx="26" cy="26" r="10" fill="none" stroke="#FFFFFF" stroke-width="4"/><line x1="36" y1="36" x2="48" y2="48" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/></svg>',
    cadastrar: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_cad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10B981"/><stop offset="100%" stop-color="#059669"/></linearGradient><filter id="pf_cad"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="10" y="12" width="44" height="40" rx="4" fill="url(#p_cad)" filter="url(#pf_cad)"/><rect x="18" y="8" width="28" height="8" rx="2" fill="#059669"/><line x1="32" y1="24" x2="32" y2="44" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/><line x1="24" y1="34" x2="40" y2="34" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/></svg>',
    editar: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_edit" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F59E0B"/><stop offset="100%" stop-color="#D97706"/></linearGradient><filter id="pf_edit"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="8" y="8" width="48" height="48" rx="4" fill="url(#p_edit)" filter="url(#pf_edit)"/><path d="M20 24 L32 36 L44 20 L44 24 L32 40 L20 24 Z" fill="#FFFFFF" opacity="0.9"/><rect x="32" y="8" width="12" height="24" rx="2" fill="#FFFFFF" opacity="0.7" transform="rotate(45 38 20)"/></svg>',
    ajuste: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_ajuste" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#2563EB"/></linearGradient><filter id="pf_ajuste"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="10" y="8" width="44" height="48" rx="4" fill="url(#p_ajuste)" filter="url(#pf_ajuste)"/><path d="M22 24 L42 24 M22 32 L42 32 M22 40 L42 40" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/><circle cx="28" cy="24" r="4" fill="#FFFFFF"/><circle cx="38" cy="32" r="4" fill="#FFFFFF"/><circle cx="26" cy="40" r="4" fill="#FFFFFF"/></svg>',
    defeito: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_def" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#EF4444"/><stop offset="100%" stop-color="#991B1B"/></linearGradient><filter id="pf_def"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><path d="M32 8 L56 52 H8 Z" fill="url(#p_def)" filter="url(#pf_def)"/><text x="32" y="44" text-anchor="middle" fill="#FFFFFF" font-size="20" font-weight="bold">!</text></svg>'
};

const channel3DIcons = {
    flex: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_flex" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FCD34D"/><stop offset="100%" stop-color="#F59E0B"/></linearGradient><filter id="pf_flex"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="10" y="10" width="44" height="44" rx="10" fill="url(#p_flex)" filter="url(#pf_flex)"/><path d="M34 16 L22 36 H32 L30 48 L42 28 H32 Z" fill="#FFFFFF" opacity="0.95"/></svg>',
    shopee: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_shopee" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FF7A59"/><stop offset="100%" stop-color="#EE4D2D"/></linearGradient><filter id="pf_shopee"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="10" y="10" width="44" height="44" rx="10" fill="url(#p_shopee)" filter="url(#pf_shopee)"/><path d="M22 26 C22 18, 42 18, 42 26" stroke="#FFFFFF" stroke-width="4" fill="none" opacity="0.9"/><rect x="18" y="26" width="28" height="22" rx="3" fill="#FFFFFF" opacity="0.95"/><circle cx="26" cy="34" r="2.5" fill="#EE4D2D"/><circle cx="38" cy="34" r="2.5" fill="#EE4D2D"/></svg>',
    ml: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_ml" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#60A5FA"/><stop offset="100%" stop-color="#3483FA"/></linearGradient><filter id="pf_ml"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="10" y="10" width="44" height="44" rx="10" fill="url(#p_ml)" filter="url(#pf_ml)"/><path d="M22 30 H42 M22 38 H34" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/><path d="M24 22 L18 30 V44 H46 V30 L40 22 Z" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linejoin="round"/></svg>',
    magalu: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_magalu" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38BDF8"/><stop offset="100%" stop-color="#0086FF"/></linearGradient><filter id="pf_magalu"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="10" y="10" width="44" height="44" rx="10" fill="url(#p_magalu)" filter="url(#pf_magalu)"/><rect x="20" y="26" width="24" height="20" rx="2" fill="#FFFFFF" opacity="0.95"/><path d="M20 26 L32 18 L44 26" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round"/><path d="M26 18 V26 M38 18 V26" stroke="#FFFFFF" stroke-width="3"/></svg>',
    correios: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_correios" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FDE047"/><stop offset="100%" stop-color="#EAB308"/></linearGradient><filter id="pf_correios"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="10" y="10" width="44" height="44" rx="10" fill="url(#p_correios)" filter="url(#pf_correios)"/><rect x="16" y="22" width="32" height="20" rx="2" fill="#FFFFFF" opacity="0.95"/><path d="M16 22 L32 32 L48 22" stroke="#EAB308" stroke-width="3" fill="none"/></svg>',
    ultra: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_ultra" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FCA5A5"/><stop offset="100%" stop-color="#E30613"/></linearGradient><filter id="pf_ultra"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="10" y="10" width="44" height="44" rx="10" fill="url(#p_ultra)" filter="url(#pf_ultra)"/><path d="M26 44 L38 44 L32 20 Z" fill="#FFFFFF" opacity="0.95"/><path d="M32 20 Q44 24 38 44 Q20 24 32 20" fill="#FFFFFF" opacity="0.8"/><circle cx="32" cy="34" r="3" fill="#E30613"/></svg>',
    full: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_full" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#86EFAC"/><stop offset="100%" stop-color="#22C55E"/></linearGradient><filter id="pf_full"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="10" y="10" width="44" height="44" rx="10" fill="url(#p_full)" filter="url(#pf_full)"/><path d="M18 32 H46 M32 18 V46" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" opacity="0.4"/><path d="M34 20 L24 34 H32 L30 44 L40 30 H32 Z" fill="#FFFFFF" opacity="0.95"/></svg>',
    pdv: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="p_pdv" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#CBD5E1"/><stop offset="100%" stop-color="#64748B"/></linearGradient><filter id="pf_pdv"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.3"/></filter></defs><rect x="10" y="10" width="44" height="44" rx="10" fill="url(#p_pdv)" filter="url(#pf_pdv)"/><path d="M18 24 L22 18 H42 L46 24 V28 H18 Z" fill="#FFFFFF" opacity="0.95"/><rect x="20" y="30" width="24" height="16" fill="#FFFFFF" opacity="0.8"/><path d="M32 30 V46" stroke="#64748B" stroke-width="2"/></svg>'
};


// Função para obter os itens do menu baseados na configuração centralizada
function getMenuItemsFromConfig() {
    const modoRapidoAtivo = localStorage.getItem('config_modo_rapido') === 'true';
    
    // Aplicar lógica baseada na configuração (todos os módulos всегда visíveis)
    return menuModulesConfig
        .sort((a, b) => a.order - b.order)
        .map(module => {
            let isDisabled = false;
            let badge = null;
            
            // Lógica especial para PACK (desativado no modo rápido)
            if (module.id === 'pack' && modoRapidoAtivo) {
                isDisabled = true;
                badge = 'Desativado';
            } else if (module.type === 'em_breve') {
                badge = 'EM BREVE';
            }
            
            return {
                id: module.id,
                label: module.label,
                icon: module.icon,
                primary: module.order <= 2,
                disabled: isDisabled,
                badge: badge
            };
        });
}

// Rota mapeada para cada módulo
const menuRoutes = {
    dashboard: 'renderDashboard()',
    produtos: 'renderProductSubMenu()',
    pick: 'renderPickMenu()',
    pack: 'renderPackMenu()',
    compras: 'renderComprasSubMenu()',
    movimentacoes: 'renderMovimentacoesSubMenu()',
    inventario: 'renderInventarioSubMenu()',
    nf: 'renderNFSubMenu()',
    financeiro: 'renderFinanceiroSubMenu()',
    configuracoes: 'renderConfigSubMenu()',
    kit_lampada: 'renderGuiaLampada()',
    ajuste: 'renderInventarioAjuste()'
};

function renderMenu(push = true) {
    stopScanner();
    currentScreen = 'menu';
    if (push) pushNav('menu');
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        document.body.classList.remove('menu-active');
        renderLogin();
        return;
    }
    document.body.classList.add('menu-active');

    const modoRapidoAtivo = localStorage.getItem('config_modo_rapido') === 'true';
    const quickButtonIcon = modoRapidoAtivo ? 'bolt' : 'add';
    const quickButtonAction = modoRapidoAtivo ? 'startFastMode()' : 'toggleQuickActions()';

    // Usar configuração centralizada
    const finalMenuItems = getMenuItemsFromConfig();

    app.innerHTML = `
                <div class="dashboard-screen fade-in menu-screen">
                    ${getTopBarHTML(currentUser, null, 'menu')}

                    <main class="container">
                        <div class="menu-grid">
${finalMenuItems.map(item => {
    const routeAction = menuRoutes[item.id] || `handleMenuClick('${item.label}')`;
    return `
                                <div class="menu-card ${item.disabled ? 'disabled' : ''}" 
                                     onclick="${item.disabled ? '' : routeAction}">
                                    ${item.badge ? `<span class="badge">${item.badge}</span>` : ''}
                                    <span class="menu-icon-3d">${menu3DIcons[item.icon] || ''}</span>
                                    <span class="label">${item.label}</span>
                                </div>
                            `;
}).join('')}
                        </div>
                    </main>

                    <div class="menu-bottom-trigger-area"></div>
                    <footer class="menu-footer">
                <div class="menu-footer-content">
                    <div class="menu-footer-item" onclick="renderMovimentacoesSubMenu()">
                        <span class="material-symbols-rounded icon">swap_horiz</span>
                        <span>Movimentos</span>
                    </div>
                    <div class="menu-footer-item active" onclick="renderSearchScreen()">
                        <span class="material-symbols-rounded icon">search</span>
                        <span>Buscar</span>
                    </div>
                    <div class="menu-footer-action ${isModoRapido ? 'modo-rapido' : ''}" id="quick-action-btn" onclick="${quickButtonAction}">
                        <span id="quick-action-icon" class="material-symbols-rounded icon">${quickButtonIcon}</span>
                    </div>
                    <div class="menu-footer-item" onclick="renderAlerts()">
                        <span class="material-symbols-rounded icon">notifications</span>
                        <span>Alertas</span>
                    </div>
                    <div class="menu-footer-item" onclick="renderConfigSubMenu()">
                        <span class="material-symbols-rounded icon">settings</span>
                        <span>Config</span>
                    </div>
                </div>
            </footer>
        </div>
    `;
}

async function renderDashboard() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
        </div>
    `;
}

async function renderEstoqueAtual() {
    await ensureProdutosLoaded();
    
    console.log("[DIAGNOSTICO] renderEstoqueAtual iniciado.");
    console.log(`[DIAGNOSTICO] Itens em appData.products: ${appData.products ? appData.products.length : 0}`);
    console.log(`[DIAGNOSTICO] Itens em appData.estoque: ${appData.estoque ? appData.estoque.length : 0}`);
    
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
                <div class="dashboard-screen fade-in internal">
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
    currentScreen = 'internal';
    document.body.classList.remove('menu-active');
    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
                    ${getTopBarHTML(currentUser, config.backFunc)}
                    <main class="container">
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
                { name: 'Distribuidora A', city: 'São Paulo - SP', contact: '(11) 9999-9999', rating: '⭐ ⭐ ⭐ ⭐ ⭐ ' },
                { name: 'Importadora B', city: 'Curitiba - PR', contact: '(41) 8888-8888', rating: '⭐ ⭐ ⭐ ⭐ ' }
            ], cols: ['name', 'city', 'contact', 'rating']
        },
        { id: 'historico_compras', label: 'HISTÓRICO DE COMPRAS', icon: 'history', type: 'list', items: [], cols: [] }
    ];

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
                    ${getTopBarHTML(currentUser, 'renderMenu()')}

                    <main class="container">
                        <div class="menu-grid">
                            ${subItems.map(item => `
                                <div class="menu-card" onclick="handleModuleClick(${JSON.stringify(item).replace(/"/g, '&quot;')}, 'renderComprasSubMenu()')">
                                    <span class="menu-icon-3d">
                                        <span class="material-symbols-rounded">${item.icon}</span>
                                    </span>
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
        { id: 'transferencia', label: 'TRANSFERÊNCIA', icon: 'movimentacoes', action: 'renderTransferenciaScreen()' },
        { id: 'historico_mov', label: 'HISTÓRICO', icon: 'historico', action: 'renderMovimentacoesHistory()' }
    ];

    app.innerHTML = `
        <div class="dashboard-screen internal fade-in">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
            <main class="container">
                <div class="menu-grid">
                    ${subItems.map(item => `
                        <div class="menu-card" onclick="${item.action}">
                            <span class="menu-icon-3d">${menu3DIcons[item.icon] || ''}</span>
                            <span class="label">${item.label}</span>
                        </div>
                    `).join('')}
                </div>
            </main>
        </div>
    `;
}

function renderEnvioDefeitoForm() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')}
            <main class="container" style="display: flex; align-items: center; justify-content: center; height: calc(100vh - 80px);">
                <div style="text-align: center; color: var(--muted);">
                    <span class="material-symbols-rounded" style="font-size: 64px; margin-bottom: 20px; opacity: 0.5;">construction</span>
                    <p>Formulário de Envio para Defeito em desenvolvimento.</p>
                </div>
            </main>
        </div>
    `;
}

const STOCK_LOCALS = ['TÉRREO', 'MOSTRUÁRIO', '1º ANDAR', 'DEFEITO', 'EM GARANTIA', 'EM TRANSPORTE'];

const MOVIMENTACAO_ORIGINS = [
    { value: 'MANUAL', label: 'Manual' },
    { value: 'PEDIDO', label: 'Pedido' },
    { value: 'NOTA_FISCAL', label: 'Nota Fiscal' },
    { value: 'INVENTARIO', label: 'Inventário' },
    { value: 'CONFERENCIA', label: 'Conferência' },
    { value: 'SEPARACAO', label: 'Separação' }
];

function renderMovimentacoes() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
        </div>
    `;
}

function renderMovimentacoesList(history) {
    if (!history || history.length === 0) {
        return `
            <div style="text-align: center; padding: 40px; color: var(--muted);">
                <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 16px;">inbox</span>
                <p>Nenhuma movimentação encontrada.</p>
            </div>
        `;
    }

    const getTipoBadge = (tipo) => {
        const colors = {
            'ENTRADA': { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
            'SAIDA': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
            'SAÍDA': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
            'TRANSFERENCIA': { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
            'AJUSTE': { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
            'AJUSTE+': { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
            'AJUSTE-': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' }
        };
        const c = colors[tipo] || { bg: 'rgba(255,255,255,0.1)', color: 'white' };
        return `<span style="background: ${c.bg}; color: ${c.color}; padding: 4px 8px; border-radius: 6px; font-size: 0.65rem; font-weight: 700;">${tipo}</span>`;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return `
        <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
            ${history.map(m => `
                <div class="mov-item" style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); transition: all 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            ${getTipoBadge(m.tipo)}
                            <span style="font-size: 0.7rem; color: var(--muted);">${formatDate(m.data_hora || m.data)}</span>
                        </div>
                        <span style="font-size: 0.7rem; color: var(--primary); font-weight: 600;">${m.origem || 'MANUAL'}</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; font-size: 0.75rem;">
                        <div>
                            <span style="color: var(--muted);">Produto:</span>
                            <div style="font-weight: 600; color: white;">${m.id_interno || '-'}</div>
                        </div>
                        <div>
                            <span style="color: var(--muted);">Qtd:</span>
                            <div style="font-weight: 700; color: white;">${m.quantidade || 0}</div>
                        </div>
                        <div>
                            <span style="color: var(--muted);">De:</span>
                            <div style="font-weight: 600; color: white;">${m.local_origem || '-'}</div>
                        </div>
                        <div>
                            <span style="color: var(--muted);">Para:</span>
                            <div style="font-weight: 600; color: white;">${m.local_destino || '-'}</div>
                        </div>
                    </div>
                    ${m.observacao ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.7rem; color: var(--muted);">${m.observacao}</div>` : ''}
                    <div style="margin-top: 8px; font-size: 0.65rem; color: var(--muted);">Por: ${m.usuario || '-'}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function filterMovimentacoes() {
    const search = document.getElementById('mov-filter-search')?.value?.toLowerCase() || '';
    const tipo = document.getElementById('mov-filter-tipo')?.value || '';
    const local = document.getElementById('mov-filter-local')?.value || '';
    const origem = document.getElementById('mov-filter-origem')?.value || '';

    let filtered = appData.movimentacoes || [];

    if (search) {
        filtered = filtered.filter(m => 
            (m.id_interno || '').toLowerCase().includes(search) ||
            (m.descricao || '').toLowerCase().includes(search)
        );
    }
    if (tipo) {
        filtered = filtered.filter(m => m.tipo === tipo);
    }
    if (local) {
        filtered = filtered.filter(m => m.local_origem === local || m.local_destino === local);
    }
    if (origem) {
        filtered = filtered.filter(m => m.origem === origem);
    }

    filtered.sort((a, b) => {
        const dateA = new Date(a.data_hora || a.data || 0);
        const dateB = new Date(b.data_hora || b.data || 0);
        return dateB - dateA;
    });

    const listContainer = document.getElementById('movimentacoes-list');
    if (listContainer) {
        listContainer.innerHTML = renderMovimentacoesList(filtered);
    }
}

function openNovaMovimentacaoModal() {
    console.log('[MOV] clique em Nova movimentação');
    console.log('[MOV] abrindo modal');
    
    const modalHTML = `
        <div id="nova-mov-modal" class="modal-overlay" onclick="closeNovaMovimentacaoModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="font-size: 1.1rem; font-weight: 700; margin: 0;">Nova Movimentação</h2>
                    <button onclick="closeNovaMovimentacaoModal()" style="background: none; border: none; color: var(--muted); cursor: pointer; padding: 8px;">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </div>

                <div class="input-group" style="margin-bottom: 20px;">
                    <label style="font-size: 0.8rem; font-weight: 600; color: var(--muted); margin-bottom: 8px; display: block;">Tipo de Movimentação</label>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                        ${['ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'AJUSTE'].map(tipo => `
                            <button type="button" class="tipo-mov-btn" data-tipo="${tipo}" onclick="selectTipoMovimentacao('${tipo}', this)" style="padding: 12px 8px; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; background: rgba(255,255,255,0.02); color: white; cursor: pointer; font-size: 0.75rem; font-weight: 600; transition: all 0.2s;">
                                ${tipo === 'ENTRADA' ? 'Entrada' : tipo === 'SAIDA' ? 'Saída' : tipo === 'TRANSFERENCIA' ? 'Transferência' : 'Ajuste'}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div id="mov-form-container">
                    <div style="text-align: center; padding: 40px 20px; color: var(--muted);">
                        <span class="material-symbols-rounded" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;">touch_app</span>
                        <p style="font-size: 0.85rem;">Selecione o tipo de movimentação acima</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('nova-mov-modal');
    modal.style.opacity = '0';
    modal.style.transition = 'opacity 0.2s ease';
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
    });
}


function closeNovaMovimentacaoModal(event) {
    if (event && event.target !== event.currentTarget && !event.target.closest('.modal-content')) return;
    const modal = document.getElementById('nova-mov-modal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 200);
    }
}

let selectedTipoMovimentacao = null;
let selectedProductForMov = null;

function selectTipoMovimentacao(tipo, btn) {
    console.log(`[MOV] tipo selecionado: ${tipo}`);
    document.querySelectorAll('.tipo-mov-btn').forEach(b => {
        b.style.borderColor = 'rgba(255,255,255,0.1)';
        b.style.background = 'rgba(255,255,255,0.02)';
    });
    btn.style.borderColor = 'var(--primary)';
    btn.style.background = 'rgba(227,6,19,0.15)';
    
    selectedTipoMovimentacao = tipo;
    selectedProductForMov = null;
    
    renderMovimentacaoForm(tipo);
}

function renderMovimentacaoForm(tipo) {
    const container = document.getElementById('mov-form-container');
    const locals = STOCK_LOCALS;
    const origens = MOVIMENTACAO_ORIGINS;

    const getCommonFields = () => `
        <div class="input-group full-width">
            <label>Produto (EAN ou ID)</label>
            <input type="text" id="mov-search" class="input-field" placeholder="Bipe ou digite..." oninput="searchProductForMovInModal()">
            <div id="mov-search-results" style="margin-top: 8px; max-height: 120px; overflow-y: auto;"></div>
        </div>
        <div id="mov-selected-info" class="full-width" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; margin-bottom: 16px; border: 1px solid var(--primary); display: ${selectedProductForMov ? 'block' : 'none'};">
            <div style="font-weight: 700; color: white; font-size: 0.9rem;">${selectedProductForMov ? (selectedProductForMov.descricao_base || selectedProductForMov.nome || selectedProductForMov.col_b) : ''}</div>
            <div style="font-size: 0.7rem; color: var(--muted);">ID: ${selectedProductForMov ? (selectedProductForMov.id_interno || selectedProductForMov.col_a) : ''}</div>
        </div>
    `;

    const getOrigemField = () => `
        <div class="input-group">
            <label>Origem</label>
            <select id="mov-origem" class="input-field">
                ${origens.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
            </select>
        </div>
    `;

    const getDestinoField = () => `
        <div class="input-group">
            <label>Destino</label>
            <select id="mov-destino" class="input-field">
                ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
            </select>
        </div>
    `;

    const getLocalField = () => `
        <div class="input-group">
            <label>Local</label>
            <select id="mov-local" class="input-field">
                ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
            </select>
        </div>
    `;

    const getQuantidadeField = () => `
        <div class="input-group">
            <label>Quantidade</label>
            <input type="number" id="mov-qty" class="input-field" placeholder="0" min="1">
        </div>
    `;

    const getObservacaoField = () => `
        <div class="input-group full-width">
            <label>Observação</label>
            <input type="text" id="mov-obs" class="input-field" placeholder="Opcional">
        </div>
    `;

    const getAjusteTipoField = () => `
        <div class="input-group">
            <label>Tipo de Ajuste</label>
            <select id="mov-tipo-ajuste" class="input-field">
                <option value="positivo">Positivo (Entrada)</option>
                <option value="negativo">Negativo (Baixa)</option>
            </select>
        </div>
    `;

    const getMotivoField = () => `
        <div class="input-group full-width">
            <label>Motivo</label>
            <input type="text" id="mov-motivo" class="input-field" placeholder="Ex: Contagem inventário, ajuste sistema...">
        </div>
    `;

    let fieldsHTML = '';
    let submitLabel = '';
    let submitFunc = '';

    switch(tipo) {
        case 'ENTRADA':
            fieldsHTML = getCommonFields() + getDestinoField() + getOrigemField() + getQuantidadeField() + getObservacaoField();
            submitLabel = 'Registrar Entrada';
            submitFunc = "saveNovaMovimentacao('ENTRADA')";
            break;
        case 'SAIDA':
            fieldsHTML = getCommonFields() + getLocalField() + getOrigemField() + getQuantidadeField() + getObservacaoField();
            submitLabel = 'Registrar Saída';
            submitFunc = "saveNovaMovimentacao('SAIDA')";
            break;
        case 'TRANSFERENCIA':
            fieldsHTML = getCommonFields() + getLocalField().replace('id="mov-local"', 'id="mov-origem"') + getDestinoField() + getQuantidadeField() + getObservacaoField();
            submitLabel = 'Confirmar Transferência';
            submitFunc = "saveNovaMovimentacao('TRANSFERENCIA')";
            break;
        case 'AJUSTE':
            fieldsHTML = getCommonFields() + getLocalField() + getAjusteTipoField() + getQuantidadeField() + getMotivoField() + getObservacaoField();
            submitLabel = 'Registrar Ajuste';
            submitFunc = "saveNovaMovimentacao('AJUSTE')";
            break;
    }

    container.innerHTML = `
        <form onsubmit="event.preventDefault(); ${submitFunc}" style="display: flex; flex-direction: column; gap: 16px;">
            ${fieldsHTML}
            <div style="display: flex; gap: 12px; margin-top: 8px;">
                <button type="button" class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="closeNovaMovimentacaoModal()">Cancelar</button>
                <button type="submit" class="btn-action" style="flex: 2; justify-content: center;">${submitLabel}</button>
            </div>
        </form>
    `;
    console.log('[MOV] modal renderizado');
}


function searchProductForMovInModal() {
    const searchInput = document.getElementById('mov-search');
    const resultsDiv = document.getElementById('mov-search-results');

    if (!searchInput || !resultsDiv) return;

    const query = searchInput.value.toLowerCase();
    if (query.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }

    const results = (appData.products || []).filter(p =>
        (p.descricao_base || '').toLowerCase().includes(query) ||
        (p.ean || '').toString().toLowerCase().includes(query) ||
        (p.id_interno || '').toString().toLowerCase().includes(query)
    ).slice(0, 5);


    console.log(`[MOV] busca modal: "${query}" -> ${results.length} resultados`);

    resultsDiv.innerHTML = results.map(p => `
        <div style="padding: 10px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;" onclick="selectProductForMovInModal('${p.ean || p.id_interno}')">
            <div style="font-weight: 700; font-size: 0.8rem; color: white;">${p.descricao_base || p.nome}</div>
            <div style="font-size: 0.65rem; color: var(--muted);">SKU: ${p.id_interno || p.id}</div>
        </div>
    `).join('');
}


function selectProductForMovInModal(id) {
    console.log('[MOV] produto selecionado - ID:', id);
    selectedProductForMov = (appData.products || []).find(p => p.ean == id || p.id_interno == id);
    console.log('[MOV] selectedProduct atual:', selectedProductForMov);
    
    if (!selectedProductForMov) return;

    document.getElementById('mov-search').value = selectedProductForMov.descricao_base || selectedProductForMov.nome || '';
    document.getElementById('mov-search-results').innerHTML = '';

    const infoDiv = document.getElementById('mov-selected-info');
    if (infoDiv) {
        infoDiv.style.display = 'block';
        infoDiv.innerHTML = `
            <div style="font-weight: 700; color: white; font-size: 0.9rem;">${selectedProductForMov.descricao_base || selectedProductForMov.nome}</div>
            <div style="font-size: 0.7rem; color: var(--muted);">ID: ${selectedProductForMov.id_interno || selectedProductForMov.id}</div>
        `;
    }
    
    console.log('[MOV] produto vinculado ao state');
}

async function saveNovaMovimentacao(tipo) {
    console.log('[MOV] salvar clicado - tipo:', tipo);
    
    if (isFinalizing) {
        console.log('[MOV] Bloqueado: isFinalizing=true');
        return;
    }
    isFinalizing = true;

    // ==========================================
    // PASSO 1: LOCALIZAR E VALIDAR O PRODUTO
    // ==========================================
    console.log('========== VALIDACAO DETALHADA ==========');
    
    // Primeiro: verificar se produtos estão carregados no appData
    const produtosDisponiveis = appData.products || [];
    console.log('[MOV] produtos carregados no appData:', produtosDisponiveis.length);
    
    // Segundo: tentar encontrar o produto no state
    const searchInput = document.getElementById('mov-search');
    const inputValue = searchInput?.value?.trim() || '';
    console.log('[MOV] valor do input produto:', inputValue);
    console.log('[MOV] selectedProductForMov do state:', selectedProductForMov);
    
    // Terceiro: se não tem produto no state mas tem texto, buscar
    if (!selectedProductForMov && inputValue) {
        console.log('[MOV] trying to find product by text in appData...');
        
        // Buscar em appData.products
        const produtoEncontrado = produtosDisponiveis.find(p => {
            const idInterno = p.id_interno || p.col_a || '';
            const ean = p.ean || '';
            return idInterno.toString().trim() === inputValue || 
                   idInterno.toString().includes(inputValue) ||
                   ean.toString().trim() === inputValue;
        });
        
        if (produtoEncontrado) {
            selectedProductForMov = produtoEncontrado;
            console.log('[MOV] produto encontrado em appData.products:', selectedProductForMov.id_interno || selectedProductForMov.col_a);
        } else {
            // Se não achou em appData, tentar DataClient
            console.log('[MOV] não achou em appData, tentando DataClient...');
            try {
                const data = await DataClient.loadModule('produtos', false);
                if (data && data.products && data.products.length > 0) {
                    appData.products = data.products;
                    const produtoDataClient = data.products.find(p => {
                        const idInterno = p.id_interno || p.col_a || '';
                        return idInterno.toString().trim() === inputValue || 
                               idInterno.toString().includes(inputValue);
                    });
                    if (produtoDataClient) {
                        selectedProductForMov = produtoDataClient;
                        console.log('[MOV] produto encontrado via DataClient:', selectedProductForMov.id_interno || selectedProductForMov.col_a);
                    }
                }
            } catch (e) {
                console.log('[MOV] erro ao carregar produtos via DataClient:', e);
            }
        }
    }
    
    // Log final do produto
    console.log('[MOV] produto final para salvar:', selectedProductForMov ? (selectedProductForMov.id_interno || selectedProductForMov.col_a) : 'NULO');
    
    // ==========================================
    // PASSO 2: VALIDAR PRODUTO
    // ==========================================
    if (!selectedProductForMov) {
        console.log('[MOV] ERRO: produto NAO encontrado');
        console.log('[MOV] razao: selectedProductForMov é null');
        showToast("Produto não encontrado. Selecione da lista ou digite ID correto.");
        isFinalizing = false;
        console.log('=========================================');
        return;
    }
    console.log('[MOV] produto OK:', selectedProductForMov.id_interno || selectedProductForMov.col_a);

    // ==========================================
    // PASSO 3: LOCALIZAR E VALIDAR QUANTIDADE
    // ==========================================
    const qtyInput = document.getElementById('mov-qty');
    const qtyRaw = qtyInput?.value;
    console.log('[MOV] elemento quantidade encontrado:', qtyInput ? 'SIM' : 'NAO');
    console.log('[MOV] valor bruto quantidade:', qtyRaw);
    
    if (!qtyInput) {
        console.log('[MOV] ERRO: campo quantidade NAO encontrado no DOM');
        showToast("Erro: campo de quantidade não encontrado.");
        isFinalizing = false;
        console.log('=========================================');
        return;
    }

    const qty = parseFloat(qtyRaw);
    console.log('[MOV] quantidade parseada:', qty, 'isNaN:', isNaN(qty));

    if (isNaN(qty) || qty <= 0) {
        console.log('[MOV] ERRO: quantidade invalida');
        console.log('[MOV] razao: qty <= 0 ou isNaN');
        showToast("Quantidade inválida. Digite um número maior que 0.");
        isFinalizing = false;
        console.log('=========================================');
        return;
    }
    console.log('[MOV] quantidade OK:', qty);
    
    console.log('========== FIM VALIDACAO OK ==========');

    // ==========================================
    // PASSO 4: MONTAR PAYLOAD
    // ==========================================
    const obsInput = document.getElementById('mov-obs');
    const origemInput = document.getElementById('mov-origem');
    const destinoInput = document.getElementById('mov-destino');
    const localInput = document.getElementById('mov-local');
    const tipoAjusteInput = document.getElementById('mov-tipo-ajuste');
    const motivoInput = document.getElementById('mov-motivo');

    let localOrigem = '';
    let localDestino = '';
    let origem = 'MANUAL';
    let observacao = obsInput?.value?.trim() || '';

    if (tipo === 'ENTRADA') {
        localDestino = destinoInput?.value || '';
        origem = origemInput?.value || 'MANUAL';
    } else if (tipo === 'SAIDA') {
        localOrigem = localInput?.value || '';
        origem = origemInput?.value || 'MANUAL';
    } else if (tipo === 'TRANSFERENCIA') {
        localOrigem = document.getElementById('mov-origem')?.value || '';
        localDestino = destinoInput?.value || '';
    } else if (tipo === 'AJUSTE') {
        localOrigem = localInput?.value || '';
        const ajusteTipo = tipoAjusteInput?.value || 'positivo';
        const motivo = motivoInput?.value?.trim() || '';
        observacao = motivo ? `Ajuste ${ajusteTipo}: ${motivo}` : `Ajuste ${ajusteTipo}`;
        if (obsInput?.value?.trim()) {
            observacao += ' - ' + obsInput.value.trim();
        }
    }

    const movData = {
        tipo: tipo,
        id_interno: selectedProductForMov.id_interno || selectedProductForMov.col_a,
        local_origem: localOrigem,
        local_destino: localDestino,
        quantidade: qty,
        usuario: localStorage.getItem('currentUser'),
        origem: origem,
        observacao: observacao
    };

    console.log('[MOV] payload enviado:', JSON.stringify(movData, null, 2));

    showToast("Processando...");

    try {
        console.log('[MOV] Tentando insert em movimentos...');
        const savedMov = await DataClient.saveMovimentoSupabase(movData);
        
        if (!savedMov) {
            console.log('[MOV] ERRO: insert movimentos retornou null');
            showToast("Erro ao gravar movimento.");
            isFinalizing = false;
            return;
        }
        
        console.log('[MOV] insert movimentos sucesso:', savedMov);

        let stockSuccess = false;
        const idInterno = movData.id_interno;

        console.log(`[MOV] Atualizando estoque: tipo=${tipo} localOrigem=${localOrigem} localDestino=${localDestino}`);
        
        if (tipo === 'ENTRADA') {
            stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, movData.local_destino, 'soma', movData.quantidade);
        } else if (tipo === 'SAIDA') {
            stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, movData.local_origem, 'subtrai', movData.quantidade);
        } else if (tipo === 'TRANSFERENCIA') {
            const outOk = await DataClient.updateEstoqueSupabase(idInterno, movData.local_origem, 'subtrai', movData.quantidade);
            const inOk = await DataClient.updateEstoqueSupabase(idInterno, movData.local_destino, 'soma', movData.quantidade);
            stockSuccess = outOk && inOk;
        } else if (tipo === 'AJUSTE') {
            const ajusteTipo = tipoAjusteInput?.value || 'positivo';
            const operacao = ajusteTipo === 'positivo' ? 'soma' : 'subtrai';
            stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, movData.local_origem, operacao, movData.quantidade);
        }

        console.log('[MOV] update estoque resultado:', stockSuccess);

        if (stockSuccess) {
            console.log('[MOV] fluxo concluído com sucesso');
            console.log('[MOV] resposta de sucesso');
            showToast("Movimentação registrada com sucesso!");
            
            if (!appData.movimentacoes) appData.movimentacoes = [];
            appData.movimentacoes.unshift({
                ...savedMov,
                data: new Date(savedMov.data_hora).toLocaleString('pt-BR')
            });

            DataClient.invalidateCache('produtos');
            
            console.log('[MOV] modal fechado após sucesso');
            closeNovaMovimentacaoModal();
            
            // Pequeno delay para garantir que toast apareça antes de renderizar nova tela
            setTimeout(() => {
                renderMovimentacoes();
                console.log('[MOV] mensagem exibida - tela atualizada');
            }, 300);
        } else {
            console.log('[MOV] ERRO: movimento salvo mas estoque não atualizado');
            console.log('[MOV] resposta de erro');
            showToast("Erro: Movimento salvo, mas estoque não atualizado.");
            console.log('[MOV] mensagem exibida');
        }
    } catch (e) {
        console.error('[MOV] ERRO fatal:', e);
        showToast("Erro fatal no processamento: " + e.message);
    } finally {
        isFinalizing = false;
    }
}

function renderTransferenciaForm() {
    const currentUser = localStorage.getItem('currentUser');
    const locals = ['TERREO', '1°ANDAR', 'MOSTRUARIO', 'DEFEITO'];

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
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
                <div class="dashboard-screen fade-in internal">
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


// Função searchProductForMov

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
                    <div style="font-weight: 700; font-size: 0.8rem; color: white;">${p.descricao_base || p.nome}</div>
                    <div style="font-size: 0.65rem; color: var(--muted);">SKU: ${p.id_interno || p.id}</div>
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
                    <div style="font-weight: 800; color: white; font-size: 0.85rem;">${selectedProductForMov.descricao_base || selectedProductForMov.nome}</div>
                    <div style="font-size: 0.65rem; color: var(--muted);">ID: ${selectedProductForMov.id_interno || selectedProductForMov.id}</div>
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
        tipo: tipo === 'TRANSFERÊNCIA' ? 'TRANSFERENCIA' : tipo,
        id_interno: selectedProductForMov.id_interno || selectedProductForMov.col_a,
        local_origem: localOrigem,
        local_destino: localDestino,
        quantidade: qty,
        usuario: localStorage.getItem('currentUser'),
        origem: 'APP_MOBILE',
        observacao: obs
    };

    showToast("Processando no Supabase...");

    try {
        // 1. Gravar registro de movimento
        const savedMov = await DataClient.saveMovimentoSupabase(movData);
        if (!savedMov) {
            showToast("Erro ao gravar movimento no Supabase.");
            isFinalizing = false;
            return;
        }

        console.log("[Supabase] Movimento id: " + savedMov.movimento_id + " gravado.");

        // 2. Atualizar estoque de forma atômica conforme o tipo
        let stockSuccess = false;
        const idInterno = movData.id_interno;

        if (movData.tipo === 'ENTRADA') {
            stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, movData.local_destino, 'soma', movData.quantidade);
        } else if (movData.tipo === 'SAÍDA' || movData.tipo === 'SAIDA') {
            stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, movData.local_origem, 'subtrai', movData.quantidade);
        } else if (movData.tipo === 'AJUSTE') {
            stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, movData.local_origem, 'ajuste', movData.quantidade);
        } else if (movData.tipo === 'TRANSFERENCIA') {
            const outOk = await DataClient.updateEstoqueSupabase(idInterno, movData.local_origem, 'subtrai', movData.quantidade);
            const inOk = await DataClient.updateEstoqueSupabase(idInterno, movData.local_destino, 'soma', movData.quantidade);
            stockSuccess = outOk && inOk;
        }

        if (stockSuccess) {
            showToast("Movimento e estoque atualizados!");
            
            // Atualização local para o histórico de tela
            if (!appData.movimentacoes) appData.movimentacoes = [];
            appData.movimentacoes.unshift({
                ...savedMov,
                data: new Date(savedMov.data_hora).toLocaleString('pt-BR')
            });

            // Forçar invalidação do cache de produtos/estoque para refletir na tela
            DataClient.invalidateCache('inventory'); 
            
            setTimeout(() => renderMovimentacoesSubMenu(), 1500);
        } else {
            console.error("[Supabase] Falha Crítica: Movimento gravado, mas estoque NÃO atualizado.");
            showToast("Erro: Movimento gravado, mas o saldo não pôde ser atualizado.");
        }
    } catch (e) {
        console.error("[Supabase] Erro inesperado:", e);
        showToast("Erro fatal no processamento.");
    } finally {
        isFinalizing = false;
    }
}

async function renderMovimentacoesHistory() {
    const currentUser = localStorage.getItem('currentUser');
    
    // UI de Carregamento (Sem título redundante)
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in">
            ${getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')}
            <main class="container">
                <div id="movimentacoes-list-container" style="text-align: center; padding: 40px; color: var(--muted);">
                    <div class="loading-spinner" style="margin: 20px auto;"></div>
                    <p style="margin-top: 15px;">Buscando movimentos...</p>
                </div>
            </main>
        </div>
    `;

    try {
        console.log('[INV-DIAG] iniciando busca de movimentos...');
        const history = await DataClient.fetchTable('movimentos');
        
        // Logs de diagnóstico (history é o 'data' retornado pelo client)
        console.log('[INV-DIAG] movimentos carregados:', history?.length || 0);
        console.log('[INV-DIAG] dados movimentos:', history);

        const listContainer = document.getElementById('movimentacoes-list-container');
        if (listContainer) {
            if (!history || history.length === 0) {
                console.log('[INV-DIAG] Nenhuma movimentação encontrada no banco.');
                listContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--muted);">Nenhuma movimentação encontrada.</div>`;
            } else {
                listContainer.innerHTML = renderMovimentacoesList(history);
                listContainer.style.textAlign = 'left';
                listContainer.style.padding = '0';
            }
        }
    } catch (err) {
        console.error('[INV-DIAG] erro crítico ao processar movimentos:', err);
        const listContainer = document.getElementById('movimentacoes-list-container');
        if (listContainer) {
            listContainer.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center;">Erro ao carregar dados do servidor</div>`;
        }
    }
}

/* ===================================================
   TELA DE TRANSFERÊNCIA DE ESTOQUE (MODO CIRÚRGICO)
   =================================================== */

function normalizeLocal(local) {
    if (!local) return "";
    return local
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, '_')
        .replace('1º_ANDAR', 'PRIMEIRO_ANDAR')
        .replace('1°_ANDAR', 'PRIMEIRO_ANDAR')
        .replace('1_ANDAR', 'PRIMEIRO_ANDAR');
}

function prettyLocal(local) {
    const norm = normalizeLocal(local);
    const map = {
        'TERREO': 'TÉRREO',
        'MOSTRUARIO': 'MOSTRUÁRIO',
        'PRIMEIRO_ANDAR': '1º ANDAR',
        'DEFEITO': 'DEFEITO',
        'EM_GARANTIA': 'EM GARANTIA',
        'EM_TRANSPORTE': 'EM TRANSPORTE'
    };
    return map[norm] || norm;
}

async function renderTransferenciaScreen() {
    const currentUser = localStorage.getItem('currentUser');
    if (!appData.transferItems) appData.transferItems = [];

    // TAREFA 1 & 2: Garantir produtos carregados (Sempre aguardar para garantir)
    console.log('[INV-DIAG] Garantindo produtos carregados na Transferência...');
    
    const needsLoadingUI = !appData.products || appData.products.length === 0;
    
    if (needsLoadingUI) {
        app.innerHTML = `
            <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 20px; animation: pulse 1.5s infinite;">📦</div>
                <div style="font-weight: 800; font-size: 1.2rem;">Sincronizando Produtos...</div>
                <div style="color: #777; font-size: 0.9rem; margin-top: 8px;">Aguarde um instante.</div>
            </div>
        `;
    }
    
    await ensureProdutosLoaded(true); // TAREFA 1: Garantir carregamento real

    const locals = ['TÉRREO', 'MOSTRUÁRIO', '1º ANDAR', 'DEFEITO', 'EM GARANTIA', 'EM TRANSPORTE'];

    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')}
            <div class="transfer-screen" style="padding: 20px; color: white; max-width: 600px; margin: 0 auto;">
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                    <div>
                        <label style="font-size: 0.7rem; color: #777; text-transform: uppercase; display: block; margin-bottom: 4px;">Origem</label>
                        <select id="trans-origem" class="input-field" style="width: 100%; height: 50px; font-weight: 700;" onchange="validateTransferLocals()">
                            <option value="">Selecione...</option>
                            ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 0.7rem; color: #777; text-transform: uppercase; display: block; margin-bottom: 4px;">Destino</label>
                        <select id="trans-destino" class="input-field" style="width: 100%; height: 50px; font-weight: 700;" onchange="validateTransferLocals()">
                            <option value="">Selecione...</option>
                            ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <input type="text" id="trans-ean-input" placeholder="Bipar EAN ou Código..." style="width: 100%; padding: 20px; border-radius: 16px; border: 2px solid #333; background: #111; color: white; font-size: 1.2rem; text-align: center;" onkeypress="if(event.key === 'Enter') addTransferItem()">
                </div>
                
                <div id="transfer-items-list" style="height: calc(100vh - 420px); overflow-y: auto; padding-bottom: 100px;">
                    <!-- Preenchido via updateTransferenciaListUI -->
                </div>

                <div style="position: fixed; bottom: 0; left: 0; width: 100%; padding: 20px; background: #232323; border-top: 1px solid #333; z-index: 100;">
                    <div style="max-width: 600px; margin: 0 auto;">
                        <button id="btn-confirm-transfer" onclick="confirmTransferencia()" style="width: 100%; padding: 20px; border-radius: 16px; background: #4ade80; color: #111; font-weight: 800; font-size: 1.1rem; border: none; cursor: pointer;">CONFIRMAR TRANSFERÊNCIA</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    updateTransferenciaListUI();
    setTimeout(() => document.getElementById('trans-ean-input')?.focus(), 500);
}

function validateTransferLocals() {
    const origem = document.getElementById('trans-origem')?.value;
    const destino = document.getElementById('trans-destino')?.value;
    
    if (origem && destino && origem === destino) {
        showToast("Origem e destino devem ser diferentes!", "warning");
        return false;
    }
    return true;
}

async function addTransferItem() {
    const eanInput = document.getElementById('trans-ean-input');
    const origemInput = document.getElementById('trans-origem');
    const ean = eanInput?.value?.trim();
    const origem = origemInput?.value;

    if (!origem) {
        showToast("Selecione o local de origem primeiro!");
        return;
    }

    if (!ean) return;

    // LOG: Termo digitado
    console.log('[INV-DIAG] termo digitado:', ean);

    // TAREFA 3: Se appData.products estiver vazio, tentar carregar
    if (!appData.products || appData.products.length === 0) {
        console.log('[INV-DIAG] products vazio no bip, recarregando...');
        await ensureProdutosLoaded(true);
    }

    // TAREFA A: Buscar primeiro em appData.products
    let product = appData.products.find(p => p.ean == ean || p.id_interno == ean);
    
    // TAREFA 3: Se não encontrar e cache estiver suspeito, tentar carregar uma vez
    if (!product) {
        console.log('[INV-DIAG] produto não no cache, tentando recarga forçada...');
        await ensureProdutosLoaded(true);
        product = appData.products.find(p => p.ean == ean || p.id_interno == ean);
    }

    // LOG: Produto encontrado
    console.log('[INV-DIAG] produto encontrado:', product);

    if (!product) {
        showToast("Produto não encontrado!", "error");
        eanInput.value = '';
        return;
    }

    const idInterno = product.id_interno;
    const origemNorm = normalizeLocal(origem);

    // TAREFA B: Validar estoque_atual
    const { data: stockData, error } = await window.supabaseClient
        .from('estoque_atual')
        .select('saldo_disponivel')
        .eq('id_interno', idInterno)
        .eq('local', origemNorm)
        .maybeSingle();

    if (error) {
        showToast("Erro ao validar estoque.");
        return;
    }

    if (!stockData) {
        showToast("Produto sem estoque no local de origem", "error");
        eanInput.value = '';
        return;
    }

    const existing = appData.transferItems.find(i => i.id_interno === idInterno);

    // LOGS OBRIGATÓRIOS
    console.log('[TRANSF-DIAG] produto id_interno:', idInterno);
    console.log('[TRANSF-DIAG] origem selecionada:', origem);
    console.log('[TRANSF-DIAG] origem normalizada:', origemNorm);
    console.log('[TRANSF-DIAG] estoque origem encontrado:', stockData);
    
    const available = Number(stockData.saldo_disponivel || 0);
    const requested = Number((existing ? existing.quantidade : 0) + 1);

    console.log('[TRANSF-DIAG] saldo_disponivel origem:', available);
    console.log('[TRANSF-DIAG] quantidade solicitada:', requested);

    if (available < requested) {
        showToast("Estoque insuficiente no local de origem", "error");
        eanInput.value = '';
        return;
    }

    if (existing) {
        existing.quantidade += 1;
    } else {
        appData.transferItems.unshift({
            id_interno: idInterno,
            descricao: product.descricao_base || product.nome,
            quantidade: 1
        });
    }

    eanInput.value = '';
    eanInput.focus();
    updateTransferenciaListUI();
}

function updateTransferenciaListUI() {
    const list = document.getElementById('transfer-items-list');
    if (!list) return;

    if (!appData.transferItems || appData.transferItems.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; color: #555; padding: 40px 20px;">
                <span class="material-symbols-rounded" style="font-size: 48px; display: block; margin-bottom: 12px; opacity: 0.2;">swap_horiz</span>
                <div style="font-weight: 700;">Nenhum item na lista</div>
                <div style="font-size: 0.8rem; margin-top: 4px;">Bipe produtos para transferir</div>
            </div>
        `;
        return;
    }

    list.innerHTML = appData.transferItems.map((item, index) => `
        <div class="transfer-item" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px;">
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 700; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.descricao}</div>
                <div style="font-size: 0.7rem; color: #777;">ID: ${item.id_interno}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; background: #111; padding: 4px; border-radius: 8px; border: 1px solid #333;">
                <button onclick="adjustTransferItemQty(${index}, -1)" style="width: 32px; height: 32px; border-radius: 6px; border: none; background: #222; color: white; font-weight: 800; cursor: pointer;">-</button>
                <span style="min-width: 24px; text-align: center; font-weight: 800; color: #4ade80;">${item.quantidade}</span>
                <button onclick="adjustTransferItemQty(${index}, 1)" style="width: 32px; height: 32px; border-radius: 6px; border: none; background: #222; color: white; font-weight: 800; cursor: pointer;">+</button>
            </div>
            <button onclick="removeTransferItem(${index})" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: none; width: 36px; height: 36px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                <span class="material-symbols-rounded" style="font-size: 18px;">delete</span>
            </button>
        </div>
    `).join('');
}

async function adjustTransferItemQty(index, delta) {
    const item = appData.transferItems[index];
    const origem = document.getElementById('trans-origem')?.value;

    if (delta > 0) {
        const origemNorm = normalizeLocal(origem);
        const { data: stockData, error } = await window.supabaseClient
            .from('estoque_atual')
            .select('saldo_disponivel')
            .eq('id_interno', item.id_interno)
            .eq('local', origemNorm)
            .maybeSingle();

        const available = Number(stockData ? stockData.saldo_disponivel : 0);
        const requested = Number(item.quantidade + delta);

        console.log('[TRANSF-DIAG] produto id_interno:', item.id_interno);
        console.log('[TRANSF-DIAG] origem selecionada:', origem);
        console.log('[TRANSF-DIAG] origem normalizada:', origemNorm);
        console.log('[TRANSF-DIAG] estoque origem encontrado:', stockData);
        console.log('[TRANSF-DIAG] saldo_disponivel origem:', available);
        console.log('[TRANSF-DIAG] quantidade solicitada:', requested);

        if (available < requested) {
            showToast("Estoque insuficiente no local de origem", "error");
            return;
        }
    }

    item.quantidade += delta;
    if (item.quantidade <= 0) {
        appData.transferItems.splice(index, 1);
    }
    updateTransferenciaListUI();
}

function removeTransferItem(index) {
    appData.transferItems.splice(index, 1);
    updateTransferenciaListUI();
}

async function confirmTransferencia() {
    const origem = document.getElementById('trans-origem')?.value;
    const destino = document.getElementById('trans-destino')?.value;
    const items = appData.transferItems;

    if (!origem || !destino || items.length === 0) {
        showToast("Verifique origem, destino e itens.", "warning");
        return;
    }
    if (origem === destino) {
        showToast("Origem e destino devem ser diferentes!", "warning");
        return;
    }

    const confirmBtn = document.getElementById('btn-confirm-transfer');
    confirmBtn.disabled = true;
    confirmBtn.innerText = "PROCESSANDO...";
    
    showToast("Iniciando transferência...");
    const client = window.supabaseClient;

    try {
        const origemNorm = normalizeLocal(origem);
        const destinoNorm = normalizeLocal(destino);

        for (const item of items) {
            console.log('[TRANSF-DIAG] item confirmando:', item);
            console.log('[TRANSF-DIAG] origem:', origemNorm);
            console.log('[TRANSF-DIAG] destino:', destinoNorm);
            console.log('[TRANSF-DIAG] quantidade:', item.quantidade);

            const qty = Number(item.quantidade);

            // 1. BUSCAR ESTOQUE DA ORIGEM
            const { data: estoqueOrigem, error: fetchOrigemErr } = await client
                .from('estoque_atual')
                .select('*')
                .eq('id_interno', item.id_interno)
                .eq('local', origemNorm)
                .maybeSingle();

            if (fetchOrigemErr) {
                console.error('[TRANSF-DIAG] erro busca origem:', fetchOrigemErr);
                throw new Error("Erro ao buscar origem: " + fetchOrigemErr.message);
            }
            
            const saldoOrigemAntes = Number(estoqueOrigem?.saldo_disponivel || 0);

            console.log('[TRANSF-DIAG] estoque origem encontrado:', estoqueOrigem);
            console.log('[TRANSF-DIAG] saldo_disponivel origem:', saldoOrigemAntes);
            console.log('[TRANSF-DIAG] quantidade solicitada:', qty);

            // 2. VERIFICAR SALDO SUFICIENTE
            if (!estoqueOrigem || saldoOrigemAntes < qty) {
                throw new Error(`Estoque insuficiente no local de origem para o produto ${item.id_interno}. Saldo atual: ${saldoOrigemAntes}`);
            }

            // 3. BUSCAR/VALIDAR DESTINO
            const { data: currentDestino, error: fetchDestinoErr } = await client
                .from('estoque_atual')
                .select('*')
                .eq('id_interno', item.id_interno)
                .eq('local', destinoNorm)
                .maybeSingle();

            if (fetchDestinoErr) {
                console.error('[TRANSF-DIAG] erro busca destino:', fetchDestinoErr);
                throw new Error("Erro ao validar destino: " + fetchDestinoErr.message);
            }

            // 4. MONTAR PAYLOAD DO MOVIMENTO
            const movPayload = {
                movimento_id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                tipo: 'TRANSFERENCIA',
                id_interno: item.id_interno,
                quantidade: item.quantidade,
                local_origem: origemNorm,
                local_destino: destinoNorm,
                data_hora: new Date().toISOString(),
                origem: 'APP_TRANSFERENCIA',
                observacao: 'Transferência manual',
                usuario: localStorage.getItem('currentUser')
            };

            console.log('[TRANSF-DIAG] validação ok:', item.id_interno);

            // 5. EXECUTAR UPDATES/INSERTS
            
            // ATUALIZA ORIGEM
            const novoSaldoOrigem = saldoOrigemAntes - qty;
            const novoSaldoTotalOrigem = novoSaldoOrigem + parseFloat(estoqueOrigem.saldo_reservado || 0) + parseFloat(estoqueOrigem.saldo_em_transito || 0);

            const payloadOrigem = { 
                saldo_disponivel: novoSaldoOrigem,
                saldo_total: novoSaldoTotalOrigem,
                atualizado_em: new Date().toISOString()
            };
            console.log('[TRANSF-DIAG] origem update payload:', payloadOrigem);

            const { data: resultOrigem, error: updateOrigemErr } = await client
                .from('estoque_atual')
                .update(payloadOrigem)
                .eq('id_interno', item.id_interno)
                .eq('local', origemNorm)
                .select();

            if (updateOrigemErr) {
                console.error('[TRANSF-DIAG] origem update error:', updateOrigemErr);
                throw new Error("Erro ao debitar origem: " + updateOrigemErr.message);
            }
            console.log('[TRANSF-DIAG] origem update result:', resultOrigem);

            // ATUALIZA DESTINO
            let resultDestino;
            if (currentDestino) {
                const novoSaldoDestino = parseFloat(currentDestino.saldo_disponivel || 0) + item.quantidade;
                const novoSaldoTotalDestino = novoSaldoDestino + parseFloat(currentDestino.saldo_reservado || 0) + parseFloat(currentDestino.saldo_em_transito || 0);

                const payloadDestino = { 
                    saldo_disponivel: novoSaldoDestino,
                    saldo_total: novoSaldoTotalDestino,
                    atualizado_em: new Date().toISOString()
                };
                console.log('[TRANSF-DIAG] destino payload (update):', payloadDestino);

                const { data, error } = await client
                    .from('estoque_atual')
                    .update(payloadDestino)
                    .eq('id_interno', item.id_interno)
                    .eq('local', destinoNorm)
                    .select();
                
                if (error) {
                    console.error('[TRANSF-DIAG] destino error (update):', error);
                    throw new Error("Erro ao creditar destino (update): " + error.message);
                }
                resultDestino = data;
            } else {
                const payloadDestino = {
                    id_interno: item.id_interno,
                    local: destinoNorm,
                    saldo_disponivel: item.quantidade,
                    saldo_reservado: 0,
                    saldo_em_transito: 0,
                    saldo_total: item.quantidade,
                    atualizado_em: new Date().toISOString()
                };
                console.log('[TRANSF-DIAG] destino payload (insert):', payloadDestino);

                const { data, error } = await client
                    .from('estoque_atual')
                    .insert([payloadDestino])
                    .select();
                
                if (error) {
                    console.error('[TRANSF-DIAG] destino error (insert):', error);
                    throw new Error("Erro ao creditar destino (insert): " + error.message);
                }
                resultDestino = data;
            }
            console.log('[TRANSF-DIAG] destino result:', resultDestino);

            // CRIA MOVIMENTO
            console.log('[TRANSF-DIAG] movimento payload:', movPayload);
            const { data: resultMov, error: movErr } = await client
                .from('movimentos')
                .insert([movPayload])
                .select();

            if (movErr) {
                console.error('[TRANSF-DIAG] movimento error:', movErr);
                throw new Error("Erro ao criar movimento: " + movErr.message);
            }
            console.log('[TRANSF-DIAG] movimento result:', resultMov);
        }

        showToast("Transferência realizada com sucesso!");
        appData.transferItems = [];
        renderTransferenciaScreen();

    } catch (err) {
        console.error('[TRANSF-DIAG] Erro fatal na transferência:', err);
        showToast("ERRO: " + (err.message || "Falha no servidor"), "error");
        
        alert("FALHA NA TRANSFERÊNCIA: \n" + err.message + "\n\nSe houve uma falha parcial, o estoque pode estar inconsistente. \nPor favor, confira o estoque_atual manualmente no local de origem e destino.");
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerText = "CONFIRMAR TRANSFERÊNCIA";
    }
}


/* ===================================================
   LÓGICA DE INVENTÁRIO (SESSÃO E SCANNING)
   =================================================== */

let isStartingInventory = false;

async function startInventarioInicial() {
    renderInventorySetup('inicial');
}

async function startInventarioGeral() {
    renderInventorySetup('geral');
}

function renderInventarioParcialForm() {
    renderInventorySetup('parcial');
}

async function renderInventorySetup(type) {
    const currentUser = localStorage.getItem('currentUser');
    
    // UI de Carregamento inicial
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderInventarioSubMenu()')}
            <div id="inventory-setup-content" style="padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: calc(100vh - 80px);">
                <div class="loading-spinner"></div>
                <p style="color: #aaa; margin-top: 15px;">Validando sessões no servidor...</p>
            </div>
        </div>
    `;

    try {
        // TAREFA 1 — Logs de diagnóstico
        console.log('[INV-DIAG] Entrando em setup para:', type);
        console.log('[INV-DIAG] Produtos em cache:', appData.products?.length || 0);
        console.log('[INV-DIAG] Inventários no histórico local:', appData.inventario?.length || 0);

        // 1. Validar/Limpar sessões fantasmas locais
        checkGhostInventorySession();

        // 2. Carregar inventários frescos do servidor
        const data = await DataClient.loadModule('inventarios', true);
        if (data && data.inventario) {
            appData.inventario = data.inventario;
            console.log('[INV-DIAG] Inventários carregados do Supabase:', appData.inventario.length);
        }

        // 3. Verificar se existe inventário ABERTO real para este tipo
        const aberto = (appData.inventario || []).find(inv => {
            const status = (inv.status || inv.col_h || inv.col_H || inv.col_7 || '').toString().toUpperCase();
            const invType = (inv.tipo || inv.col_d || inv.col_D || inv.col_4 || '').toString().toUpperCase();
            return (status === 'ABERTO' || status === 'ABERTA') && invType === type.toUpperCase();
        });

        console.log('[INV-DIAG] Sessão aberta encontrada?', aberto ? `SIM (${aberto.inventario_id})` : 'NÃO');

        const content = document.getElementById('inventory-setup-content');
        if (!content) return;

        if (aberto) {
            const id = aberto.inventario_id || aberto.col_a || aberto.col_A || aberto.col_0;
            const localRaw = aberto.local || aberto.col_c || aberto.col_C || aberto.col_2 || 'N/A';
            const local = prettyLocal(localRaw);
            const dataInicio = aberto.data_inicio || aberto.col_b || aberto.col_B || aberto.col_1;
            
            content.innerHTML = `
                <div style="text-align: center; max-width: 400px; width: 100%;">
                    <span class="material-symbols-rounded" style="font-size: 64px; color: #fbbf24; margin-bottom: 20px;">warning</span>
                    <h2 style="color: white; margin-bottom: 10px;">Inventário Aberto Detectado</h2>
                    <p style="color: #aaa; margin-bottom: 30px;">Já existe uma sessão de inventário <b>${type.toUpperCase()}</b> aberta no local <b>${local}</b>.</p>
                    
                    <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 16px; margin-bottom: 30px; text-align: left; border: 1px solid rgba(255,255,255,0.1);">
                        <div style="font-size: 0.7rem; color: #888; text-transform: uppercase; font-weight: 700;">ID da Sessão</div>
                        <div style="color: #4ade80; font-weight: 800; margin-bottom: 12px; font-size: 1.1rem;">${id}</div>
                        <div style="font-size: 0.7rem; color: #888; text-transform: uppercase; font-weight: 700;">Iniciado por</div>
                        <div style="color: white; margin-bottom: 12px;">${aberto.usuario || aberto.col_d || 'Desconhecido'}</div>
                        <div style="font-size: 0.7rem; color: #888; text-transform: uppercase; font-weight: 700;">Data de Início</div>
                        <div style="color: white;">${dataInicio ? new Date(dataInicio).toLocaleString('pt-BR') : 'N/A'}</div>
                    </div>

                    <button onclick="resumeInventorySession('${id}', '${type}')" style="width: 100%; padding: 18px; border-radius: 14px; border: none; background: #4ade80; color: #111; font-weight: 800; margin-bottom: 15px; cursor: pointer; font-size: 1rem;">
                        CONTINUAR INVENTÁRIO
                    </button>
                    
                    <button onclick="confirmCancelInventory('${id}')" style="width: 100%; padding: 18px; border-radius: 14px; border: 2px solid #ef4444; background: transparent; color: #ef4444; font-weight: 800; cursor: pointer; font-size: 1rem;">
                        CANCELAR E LIMPAR SESSÃO
                    </button>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div style="text-align: center; max-width: 400px; width: 100%;">
                    <div style="background: rgba(74, 222, 128, 0.1); width: 100px; height: 100px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                        <span class="material-symbols-rounded" style="font-size: 48px; color: #4ade80;">inventory</span>
                    </div>
                    <h2 style="color: white; margin-bottom: 8px;">Novo Inventário ${type.toUpperCase()}</h2>
                    <p style="color: #aaa; margin-bottom: 32px;">Selecione o local para iniciar a contagem.</p>
                    
                    <div style="text-align: left; margin-bottom: 32px; width: 100%;">
                        <label style="color: #888; font-size: 0.75rem; display: block; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Local do Inventário</label>
                        <select id="setup-local" style="width: 100%; padding: 18px; border-radius: 14px; background: #111; border: 2px solid #333; color: white; font-size: 1.1rem; appearance: none; cursor: pointer;">
                            <option value="TÉRREO">TÉRREO</option>
                            <option value="MOSTRUÁRIO">MOSTRUÁRIO</option>
                            <option value="1º ANDAR">1º ANDAR</option>
                            <option value="DEFEITO">DEFEITO</option>
                            <option value="EM_GARANTIA">EM GARANTIA</option>
                        </select>
                    </div>

                    <button onclick="createNewInventorySession('${type}')" style="width: 100%; padding: 20px; border-radius: 14px; border: none; background: #4ade80; color: #111; font-weight: 800; font-size: 1.1rem; cursor: pointer; box-shadow: 0 4px 20px rgba(74, 222, 128, 0.2);">
                        INICIAR INVENTÁRIO
                    </button>
                </div>
            `;
        }
    } catch (e) {
        console.error(e);
        showToast("Erro de conexão", 'error');
        renderInventarioSubMenu();
    }
}

function checkGhostInventorySession() {
    if (appData.currentInventory && (!appData.currentInventory.items || appData.currentInventory.items.length === 0)) {
        appData.currentInventory = null;
    }
}

async function createNewInventorySession(type) {
    if (isStartingInventory) return;
    const localRaw = document.getElementById('setup-local')?.value || 'TÉRREO';
    const local = normalizeLocal(localRaw);
    isStartingInventory = true;
    try {
        const date = new Date();
        const dateStr = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
        const prefix = type === 'inicial' ? 'INI' : (type === 'geral' ? 'GER' : 'PAR');
        
        // TAREFA 4 — Numeração inteligente baseada no maior ID do dia
        const sameDayPrefix = `INV-${prefix}-${dateStr}-`;
        const sameDayInventories = (appData.inventario || []).filter(inv => {
            const id = (inv.inventario_id || inv.col_a || '').toString();
            return id.startsWith(sameDayPrefix);
        });

        let nextSeq = 1;
        if (sameDayInventories.length > 0) {
            const lastSeqs = sameDayInventories.map(inv => {
                const id = (inv.inventario_id || inv.col_a || '').toString();
                const parts = id.split('-');
                return parseInt(parts[parts.length - 1]) || 0;
            });
            nextSeq = Math.max(...lastSeqs) + 1;
        }
        
        const seq = String(nextSeq).padStart(3, '0');
        const sessionId = `INV-${prefix}-${dateStr}-${seq}`;
        
        console.log('[INV-DIAG] Criando nova sessão:', sessionId);
        console.log('[INV-DIAG] Maior seq encontrado hoje:', nextSeq - 1);

        appData.currentInventory = {
            id: sessionId,
            user: localStorage.getItem('currentUser'),
            date: date.toISOString(),
            items: [],
            local: local,
            type: type,
            filter: 'TOTAL',
            status: 'ABERTO'
        };

        const client = window.supabaseClient;
        if (!client) {
            alert('Erro: Supabase não conectado');
            return;
        }

        const payload = {
            inventario_id: sessionId,
            tipo: type,
            status: 'ABERTO',
            criado_por: localStorage.getItem('currentUser'),
            usuario_responsavel: localStorage.getItem('currentUser'),
            data_inicio: new Date().toISOString(),
            local: local
        };

        console.log('[INV-DIAG] payload insert inventarios:', payload);

        const { data, error } = await client
            .from('inventarios')
            .insert([payload]);

        console.log('[INV-DIAG] insert result inventarios:', { data, error });

        if (error) {
            console.error('[INV-DIAG] Erro real Supabase inventario:', error);
            alert('Erro ao iniciar sessão: ' + error.message);
            return;
        }

        await renderInventarioInicialScreen(sessionId);
    } catch (e) {
        console.error("Erro no catch createNewInventorySession:", e);
        showToast("Erro ao iniciar sessão", 'error');
    } finally {
        isStartingInventory = false;
    }
}

async function resumeInventorySession(sessionId, type) {
    try {
        console.log('[INV-DIAG] resumeInventorySession id:', sessionId);
        showToast("Carregando itens...");
        const client = window.supabaseClient;
        if (!client) { showToast("Supabase nao disponivel", 'error'); return; }

        // TAREFA 3 — Buscar cabeçalho (Header)
        const { data: invData, error: headerErr } = await client
            .from('inventarios')
            .select('*')
            .eq('inventario_id', sessionId)
            .maybeSingle();

        if (headerErr) {
            console.error('[INV-DIAG] erro header:', headerErr);
            showToast('Erro ao carregar cabeçalho');
            return;
        }

        if (!invData) {
            console.error('[INV-DIAG] inventário não encontrado no banco:', sessionId);
            showToast('Sessão não encontrada no servidor');
            return;
        }

        // TAREFA 3 — Buscar Itens
        console.log('[INV-DIAG] buscando itens para inventario:', sessionId);
        const { data: itens, error: itensErr } = await client
            .from('inventarios_itens')
            .select('*')
            .eq('inventario_id', sessionId);

        console.log('[INV-DIAG] itens retornados:', itens);

        if (itensErr) {
            console.error('[INV-DIAG] Erro ao buscar itens:', itensErr);
            showToast('Erro ao carregar itens do servidor');
            return;
        }

        appData.currentInventory = {
            id: sessionId,
            user: invData.usuario_responsavel || invData.criado_por || localStorage.getItem('currentUser'),
            date: invData.data_inicio || new Date().toISOString(),
            local: invData.local || 'TÉRREO',
            type: invData.tipo || type,
            status: 'ABERTO',
            items: []
        };

        await ensureProdutosLoaded(true);

        appData.currentInventory.items = (itens || []).map(i => {
            const product = appData.products?.find(p => p.id_interno == i.id_interno);
            return {
                id_interno: i.id_interno,
                qty: Number(i.saldo_fisico || 0),
                saldo_sistema: Number(i.saldo_sistema || 0),
                diferenca: Number(i.diferenca || 0),
                ean: product?.ean || i.id_interno,
                name: product?.descricao_completa || product?.nome || `PRODUTO ID: ${i.id_interno} (NÃO CARREGADO)`,
                brand: product?.marca || ''
            };
        });

        console.log('[INV-DIAG] currentInventory.items após map:', appData.currentInventory.items.length);

        await renderInventarioInicialScreen(sessionId);
    } catch (e) {
        console.error('[INV-DIAG] Erro crítico ao retomar:', e);
        showToast("Erro técnico ao retomar", 'error');
    }
}
async function confirmCancelInventory(sessionId) {
    if (confirm("ATENÇÃO: Deseja realmente CANCELAR este inventário?")) {
        try {
            const client = window.supabaseClient;
            if (client) {
                await client.from('inventarios').update({
                    status: 'CANCELADO',
                    data_fim: new Date().toISOString(),
                    atualizado_em: new Date().toISOString()
                }).eq('inventario_id', sessionId);
            }
            appData.currentInventory = null;
            renderInventarioSubMenu();
        } catch (e) {
            showToast("Erro ao cancelar", 'error');
        }
    }
}

async function renderInventarioInicialScreen(sessionId, mode = 'edit') {
    const currentUser = localStorage.getItem('currentUser');
    const inv = appData.currentInventory;
    if (!inv || inv.id !== sessionId) { renderInventorySetup('inicial'); return; }

    const isView = mode === 'view';

    // TAREFA 3 — Corrigir loading “Sincronizando Produtos”
    // Só mostrar tela de sincronização se appData.products estiver realmente vazio
    if (!appData.products || appData.products.length === 0) {
        console.log('[INV-DIAG] Cache de produtos vazio, carregando antes de renderizar...');
        app.innerHTML = `
            <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 20px; animation: pulse 1.5s infinite;">📦</div>
                <div style="font-weight: 800; font-size: 1.2rem;">Sincronizando Produtos...</div>
                <div style="color: #777; font-size: 0.9rem; margin-top: 8px;">Isso levará apenas alguns segundos.</div>
            </div>
        `;
        await ensureProdutosLoaded(true);
    } else {
        // Se já existem produtos, garante carregamento em background se for necessário, sem bloquear ou piscar tela
        ensureProdutosLoaded(); 
    }

    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderInventarioSubMenu()')}
            <div class="inventory-scanning-screen" style="padding: 20px; color: white; max-width: 600px; margin: 0 auto;">
                <div style="background: rgba(255,255,255,0.03); padding: 20px; border-radius: 16px; margin-bottom: 24px; border: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between;">
                    <div><div style="font-size: 0.7rem; color: #777; text-transform: uppercase;">Sessão</div><div style="font-weight: 800; color: #4ade80;">${inv.id}</div></div>
                    <div style="text-align: right;"><div style="font-size: 0.7rem; color: #777; text-transform: uppercase;">Local</div><div style="font-weight: 800;">${inv.local}</div></div>
                </div>
                <input type="text" id="inv-ean-input" ${isView ? 'disabled' : ''} placeholder="${isView ? 'MODO VISUALIZAÇÃO' : 'Bipar EAN ou Código...'}" style="width: 100%; padding: 20px; border-radius: 16px; border: 2px solid #333; background: #111; color: white; font-size: 1.2rem; text-align: center;" onkeypress="if(event.key === 'Enter') addInventoryItem()">
                <div id="inventory-items-list" style="height: calc(100vh - 420px); overflow-y: auto; margin-top: 20px;"></div>
                <div style="position: fixed; bottom: 0; left: 0; width: 100%; padding: 20px; background: #232323; border-top: 1px solid #333;">
                    <div style="max-width: 600px; margin: 0 auto;">
                        ${isView ? 
                            `
                            <div style="display: flex; gap: 12px;">
                                ${inv.status === 'FECHADO' ? `
                                    <!-- Revisão pausada temporariamente -->
                                    <button onclick="cancelClosedInventory('${inv.id}')" style="flex: 1; padding: 20px; border-radius: 16px; background: #ef4444; color: white; font-weight: 800; font-size: 0.9rem; border: none; cursor: pointer;">ANULAR</button>
                                ` : `
                                    <button disabled style="width: 100%; padding: 20px; border-radius: 16px; background: #333; color: #777; font-weight: 800; font-size: 1rem; border: none;">SESSÃO ${inv.status}</button>
                                `}
                            </div>
                            ` :
                            `<button id="btn-finish-inv" onclick="finishInventorySession()" style="width: 100%; padding: 20px; border-radius: 16px; background: #4ade80; color: #111; font-weight: 800; font-size: 1.1rem; border: none; cursor: pointer;">FINALIZAR INVENTÁRIO</button>`
                        }
                    </div>
                </div>
            </div>
        </div>
    `;
    await updateInventoryItemsList();
    if (!isView) setTimeout(() => document.getElementById('inv-ean-input')?.focus(), 500);
}

async function updateInventoryItemsList() {
    const list = document.getElementById('inventory-items-list');
    if (!list) return;
    
    if (!appData.currentInventory?.items || appData.currentInventory.items.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; color: #555; padding: 60px 20px;">
                <span class="material-symbols-rounded" style="font-size: 56px; display: block; margin-bottom: 16px; opacity: 0.2;">inventory_2</span>
                <div style="font-weight: 700; color: #666;">Nenhum item encontrado</div>
                <div style="font-size: 0.8rem; margin-top: 5px;">Inicie a contagem bipando um produto.</div>
            </div>
        `;
        return;
    }
    const isView = appData.currentInventory?.mode === 'view' || appData.currentInventory?.status === 'FECHADO' || appData.currentInventory?.status === 'ANULADO';

    list.innerHTML = appData.currentInventory.items.map((item, index) => `
        <div class="inventory-item">
            <div class="inventory-item-info" style="flex: 1; overflow: hidden;">
                <div style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div>
                <div style="font-size: 0.7rem; color: #777;">ID: ${item.id_interno}</div>
            </div>
            <div class="inventory-item-actions" style="display: flex; align-items: center; gap: 10px;">
                <div style="display: flex; align-items: center; background: #111; border-radius: 10px; border: 1px solid #333; opacity: ${isView ? '0.5' : '1'};">
                    <button onclick="${isView ? '' : `adjustInventoryQty(${index}, -1)`}" style="padding: 5px 10px; color: white; background: transparent; border: none; cursor: ${isView ? 'default' : 'pointer'};">-</button>
                    <span style="min-width: 30px; text-align: center; font-weight: 800; color: #4ade80;">${item.qty}</span>
                    <button onclick="${isView ? '' : `adjustInventoryQty(${index}, 1)`}" style="padding: 5px 10px; color: white; background: transparent; border: none; cursor: ${isView ? 'default' : 'pointer'};">+</button>
                </div>
                ${isView ? '' : `<button onclick="removeInventoryItem(${index})" style="color: #ef4444; background: rgba(239, 68, 68, 0.1); border: none; padding: 8px; border-radius: 8px;"><span class="material-symbols-rounded" style="font-size: 18px;">delete</span></button>`}
            </div>
        </div>
    `).join('');
}

async function addInventoryItem(scannedEan = null) {
    const eanInput = document.getElementById('inv-ean-input');
    const ean = (scannedEan || eanInput?.value?.trim() || '').toString();
    if (!ean) return;

    console.log('[INV-DIAG] currentInventory.id:', appData.currentInventory?.id);
    console.log('[INV-DIAG] bipado ean:', ean);

    // Fallback: Se por algum motivo appData estiver vazio, carregar agora
    if (!appData.products || appData.products.length === 0) {
        showToast("Carregando banco de produtos...", "info");
        await ensureProdutosLoaded(true);
    }

    let product = appData.products.find(p => (p.ean?.toString() === ean) || (p.id_interno?.toString() === ean) || (p.sku_fornecedor?.toString() === ean));

    console.log('[INV-DIAG] produto encontrado:', product ? `${product.id_interno} - ${product.descricao_completa}` : 'NÃO');

    if (!product) {
        console.log(`[INV-DIAG] Produto ${ean} não encontrado no cache. Tentando recarregar banco...`);
        await ensureProdutosLoaded(true);
        product = appData.products.find(p => (p.ean?.toString() === ean) || (p.id_interno?.toString() === ean) || (p.sku_fornecedor?.toString() === ean));
    }

    if (!product) { 
        console.warn('[INV-DIAG] Produto não encontrado em definitivo:', ean);
        playBeep(false); 
        showToast("PRODUTO NÃO ENCONTRADO!", "error"); 
        if(eanInput) eanInput.value = ''; 
        return; 
    }

    const existing = appData.currentInventory.items.find(i => i.id_interno === product.id_interno);
    let itemToSave = null;
    if (existing) { existing.qty += 1; itemToSave = existing; }
    else {
        itemToSave = { ean: product.ean || product.id_interno, name: product.descricao_completa || product.nome || 'Produto', brand: product.marca || '', qty: 1, id_interno: product.id_interno };
        appData.currentInventory.items.unshift(itemToSave);
    }
    
    if(eanInput) eanInput.value = ''; 
    if(eanInput) eanInput.focus(); 
    playBeep(true); 
    updateInventoryItemsList(); 
    
    console.log('[INV-DIAG] inventario atual:', appData.currentInventory.id);
    console.log('[INV-DIAG] salvando item:', {
      inventario_id: appData.currentInventory.id,
      id_interno: product.id_interno
    });

    await saveInventoryItemToServer(itemToSave);
}

async function saveInventoryItemToServer(item) {
    const client = window.supabaseClient;
    if (!client) { console.error('[INV-DIAG] Supabase client não encontrado'); return; }
    const inv = appData.currentInventory;
    if (!inv || !inv.id) { console.error('[INV-DIAG] Sessão de inventário inválida'); return; }

    // Buscar saldo_sistema REAL do Supabase (id_interno + local)
    const estoqueReal = await DataClient.fetchEstoqueItemLocalSupabase(item.id_interno, inv.local);
    const saldo_sistema = estoqueReal ? parseFloat(estoqueReal.saldo_disponivel || 0) : 0;
    const saldo_fisico = Number(item.qty || 0);
    const diferenca = saldo_fisico - saldo_sistema;

    const product = appData.products.find(p => p.id_interno == item.id_interno);
    const valor_unitario = product ? parseFloat((product.preco_custo || product.custo || 0).toString().replace(',', '.')) : 0;

    const payload = {
        inventario_id: inv.id,
        id_interno: item.id_interno,
        local: inv.local,
        saldo_sistema: saldo_sistema,
        saldo_fisico: saldo_fisico,
        diferenca: diferenca,
        valor_unitario: valor_unitario,
        valor_diferenca: diferenca * valor_unitario,
        auditado_em: new Date().toISOString()
    };

    console.log('[INV-DIAG] payload inventarios_itens:', payload);

    try {
        // TAREFA 3 e 4 — Lógica segura (SELECT -> UPDATE ou INSERT)
        // Não dependemos de constraint UNIQUE para funcionar
        const { data: existing, error: selectErr } = await client
            .from('inventarios_itens')
            .select('id_interno')
            .eq('inventario_id', inv.id)
            .eq('id_interno', item.id_interno)
            .maybeSingle();

        if (selectErr) console.error('[INV-DIAG] erro ao verificar existência:', selectErr);

        let result;
        if (existing) {
            console.log('[INV-DIAG] item já existe, executando UPDATE...');
            result = await client
                .from('inventarios_itens')
                .update(payload)
                .eq('inventario_id', inv.id)
                .eq('id_interno', item.id_interno);
        } else {
            console.log('[INV-DIAG] item novo, executando INSERT...');
            result = await client
                .from('inventarios_itens')
                .insert([payload]);
        }

        if (result.error) {
            console.error('[INV-DIAG] Erro ao persistir no banco:', result.error.message);
            showToast("Erro ao salvar: " + result.error.message, "error");
        } else {
            console.log('[INV-DIAG] Persistência OK. Iniciando confirmação imediata...');
            
            // TAREFA 1 e 2 — Query de confirmação imediata
            const { data: check, error: checkError } = await client
                .from('inventarios_itens')
                .select('*')
                .eq('inventario_id', inv.id)
                .eq('id_interno', item.id_interno);

            console.log('[INV-DIAG] confirmação inventarios_itens:', check, checkError);

            if (!check || check.length === 0) {
                console.error('[INV-DIAG] FALHA CRÍTICA: Item não encontrado após salvamento!');
                showToast("Item NÃO foi salvo no banco!", "error");
                // TAREFA 5 — Bloqueio se não salvar
                throw new Error("Persistência falhou");
            } else {
                console.log('[INV-DIAG] Confirmação FINALIZADA COM SUCESSO.');
            }
        }
    } catch (e) {
        console.error('[INV-DIAG] Erro inesperado ao salvar item:', e);
    }
}



window.finishInventorySession = async function () {
    if (isFinalizing) return;
    if (!appData.currentInventory?.items?.length) { showToast("Não é possível fechar um inventário vazio!", "error"); return; }
    isFinalizing = true;

    const client = window.supabaseClient;
    if (!client) { showToast("Supabase não disponível", 'error'); isFinalizing = false; return; }

    const btn = document.getElementById('btn-finish-inv');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.innerHTML = 'PROCESSANDO...'; }

    try {
        const sessionId = appData.currentInventory.id;
        const local = appData.currentInventory.local;
        const user = localStorage.getItem('currentUser');
        
        // TAREFA 2 — Buscar itens reais do banco antes de processar
        console.log('[INV-DIAG] buscando itens reais para finalizar:', sessionId);
        const { data: dbItems, error: fetchErr } = await client
            .from('inventarios_itens')
            .select('*')
            .eq('inventario_id', sessionId);

        if (fetchErr || !dbItems || dbItems.length === 0) {
            console.error('[INV-DIAG] erro ou nenhum item encontrado:', fetchErr);
            showToast("Nenhum item salvo no banco para este inventário!", "error");
            isFinalizing = false;
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = 'FINALIZAR INVENTÁRIO'; }
            return;
        }

        console.log('[INV-DIAG] itens para finalizar:', dbItems.length);

        let total_skus = dbItems.length;
        let total_itens = 0;
        let total_itens_contados = 0;
        let total_divergencias = 0;
        let valor_ajuste_positivo = 0;
        let valor_ajuste_negativo = 0;

        let step = 0;
        for (const item of dbItems) {
            step++;
            if (btn) btn.innerHTML = `PROCESSANDO ${step}/${total_skus}...`;
            
            const saldo_sistema = parseFloat(item.saldo_sistema || 0);
            const saldo_fisico = parseFloat(item.saldo_fisico || 0);
            const diferenca = saldo_fisico - saldo_sistema;
            const valor_unitario = parseFloat(item.valor_unitario || 0);

            total_itens += saldo_sistema;
            total_itens_contados += saldo_fisico;
            if (diferenca !== 0) {
                total_divergencias++;
                if (diferenca > 0) valor_ajuste_positivo += (diferenca * valor_unitario);
                else valor_ajuste_negativo += (Math.abs(diferenca) * valor_unitario);
            }

            // 1. Atualizar estoque_atual (Trava: se falhar, interrompe)
            console.log('[INV-DIAG] estoque payload:', { id_interno: item.id_interno, local, quantidade: saldo_fisico });
            const stockResult = await DataClient.updateEstoqueSupabase(item.id_interno, local, 'ajuste', saldo_fisico);
            console.log('[INV-DIAG] estoque result:', stockResult);
            if (!stockResult) throw new Error(`Falha ao atualizar estoque do item ${item.id_interno}`);

            // 2. Gerar movimento (Trava: se falhar, interrompe)
            if (diferenca !== 0) {
                const movPayload = {
                    tipo: diferenca > 0 ? 'AJUSTE+' : 'AJUSTE-',
                    id_interno: item.id_interno,
                    local_origem: null,
                    local_destino: null,
                    quantidade: Math.abs(diferenca),
                    usuario: user,
                    origem: 'APP_INVENTARIO',
                    observacao: sessionId
                };
                console.log('[INV-DIAG] movimento payload:', movPayload);
                const movResult = await DataClient.saveMovimentoSupabase(movPayload);
                console.log('[INV-DIAG] movimento result:', movResult);
                if (!movResult) throw new Error(`Falha ao gerar movimento do item ${item.id_interno}`);
            }
        }

        // 3. Só agora marcamos como FECHADO
        console.log('[INV-DIAG] executando fechamento final...');
        const { error: finalErr } = await client.from('inventarios').update({
            status: 'FECHADO',
            data_fim: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
            total_skus: total_skus,
            total_itens: total_itens,
            total_itens_contados: total_itens_contados,
            total_divergencias: total_divergencias,
            valor_ajuste_positivo: valor_ajuste_positivo,
            valor_ajuste_negativo: valor_ajuste_negativo
        }).eq('inventario_id', sessionId);
        
        console.log('[INV-DIAG] fechamento result:', finalErr ? 'ERRO' : 'OK');

        if (finalErr) throw finalErr;

        showToast("Inventário finalizado com sucesso!");
        appData.currentInventory = null;
        renderInventorySuccessScreen();

    } catch (err) {
        console.error('[INV-DIAG] ERRO CRÍTICO na finalização:', err);
        showToast('Erro ao finalizar: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = 'FINALIZAR INVENTÁRIO'; }
    } finally {
        isFinalizing = false;
    }
}

async function adjustInventoryQty(index, delta) {
    const item = appData.currentInventory.items[index];
    item.qty = Math.max(1, item.qty + delta);
    updateInventoryItemsList();
    saveInventoryItemToServer(item);
}

async function removeInventoryItem(index) {
    if (confirm("Remover este item?")) {
        appData.currentInventory.items.splice(index, 1);
        updateInventoryItemsList();
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
                        <p style="color: var(--muted); margin-bottom: 30px;">Dados processados e salvos com sucesso no Supabase.</p>
                        
                        <div style="background: rgba(34, 197, 94, 0.1); padding: 16px; border-radius: 16px; margin-bottom: 30px; text-align: left; border: 1px solid rgba(34, 197, 94, 0.2);">
                            <div style="display: flex; align-items: center; gap: 10px; color: #4ade80; font-size: 0.8rem; font-weight: 700; margin-bottom: 8px;">
                                <span class="material-symbols-rounded" style="font-size: 18px;">check_circle</span>
                                FLUXO CONCLUÍDO
                            </div>
                            <p style="font-size: 0.75rem; color: var(--muted); line-height: 1.4;">
                                O estoque foi atualizado e os movimentos de ajuste foram registrados no servidor.
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
        { id: 'inv_inicial', label: 'INVENTÁRIO INICIAL', icon: 'inventario_inicial', onclick: 'startInventarioInicial()' },
        { id: 'inv_geral', label: 'INVENTÁRIO GERAL', icon: 'inventario_geral', onclick: 'startInventarioGeral()' },
        { id: 'inv_parcial', label: 'INVENTÁRIO PARCIAL', icon: 'inventario_parcial', onclick: "renderInventorySetup('parcial')" },
        { id: 'ajuste', label: 'AJUSTE DE ESTOQUE', icon: 'ajuste', onclick: "renderInventorySetup('ajuste')" },
        { id: 'historico_inv', label: 'HISTÓRICO', icon: 'historico', onclick: 'renderInventarioHistory()' }
    ];

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal inventory-screen">
            ${getTopBarHTML(currentUser, 'renderMenu()')}

            <main class="container">
                <div class="menu-grid">
                    ${subItems.map(item => `
                        <div class="menu-card" onclick="${item.onclick}">
                            <span class="menu-icon-3d">${menu3DIcons[item.icon] || ''}</span>
                            <span class="label">${item.label}</span>
                        </div>
                    `).join('')}
                </div>
            </main>
        </div>
    `;
}

async function renderInventarioHistory() {
    const currentUser = localStorage.getItem('currentUser');
    
    // UI de Carregamento
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderInventarioSubMenu()')}
            <div style="padding: 20px; max-width: 600px; margin: 0 auto; text-align: center; color: #777;">
                <div class="loading-spinner" style="margin: 20px auto;"></div>
                Carregando histórico...
            </div>
        </div>
    `;

    try {
        const client = window.supabaseClient;
        if (!client) return;

        const { data, error } = await client
            .from('inventarios')
            .select('*')
            .order('data_inicio', { ascending: false });

        if (error) throw error;

        appData.inventario = data || [];
        console.log('[INV-DIAG] histórico inventarios encontrados:', appData.inventario.length);

        const history = appData.inventario;

        app.innerHTML = `
            <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
                ${getTopBarHTML(currentUser, 'renderInventarioSubMenu()')}
                <div style="padding: 20px; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: white; margin-bottom: 20px; font-size: 1.2rem;">Histórico de Inventários</h2>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${history.length === 0 ? '<p style="color: #555; text-align: center;">Nenhum registro encontrado.</p>' : 
                            history.map(inv => `
                                <div onclick="${(inv.status === 'FECHADO' || inv.status === 'ANULADO') ? `viewClosedInventory('${inv.inventario_id}')` : ''}" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 15px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; ${(inv.status === 'FECHADO' || inv.status === 'ANULADO') ? 'cursor: pointer;' : ''}">
                                    <div>
                                        <div style="color: #4ade80; font-weight: 700; font-size: 0.9rem;">${inv.inventario_id}</div>
                                        <div style="color: #777; font-size: 0.75rem;">${inv.tipo} | ${inv.local}</div>
                                        <div style="color: #555; font-size: 0.7rem;">${new Date(inv.data_inicio).toLocaleDateString('pt-BR')} ${new Date(inv.data_inicio).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</div>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="color: ${inv.status === 'FECHADO' ? '#4ade80' : (inv.status === 'ANULADO' ? '#ef4444' : '#fbbf24')}; font-size: 0.75rem; font-weight: 700;">${inv.status}</div>
                                        <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 8px;">
                                            ${(inv.status === 'ABERTO' || inv.status === 'ABERTA') ? `<button onclick="event.stopPropagation(); resumeInventorySession('${inv.inventario_id}', '${inv.tipo}')" style="background: #4ade80; border: none; padding: 5px 10px; border-radius: 5px; font-size: 0.7rem; font-weight: 700; cursor: pointer; color: #111;">CONTINUAR</button>` : ''}
                                            <button onclick="event.stopPropagation(); deleteTestInventory('${inv.inventario_id}')" style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; padding: 5px 10px; border-radius: 5px; font-size: 0.6rem; font-weight: 700; cursor: pointer; color: #ef4444;">EXCLUIR TESTE</button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        console.error('[INV-DIAG] Erro ao carregar histórico:', e);
        showToast("Erro ao carregar histórico", "error");
    }
}

async function deleteTestInventory(sessionId) {
    if (!confirm(`⚠️ EXCLUIR TESTE: Deseja apagar permanentemente todos os dados do inventário ${sessionId}?\nIsso apagará itens, movimentos e o registro da sessão.`)) return;
    
    try {
        const client = window.supabaseClient;
        if (!client) return;
        showToast("Excluindo dados de teste...");

        // 1. Deletar itens
        await client.from('inventarios_itens').delete().eq('inventario_id', sessionId);
        
        // 2. Deletar movimentos relacionados
        await client.from('movimentos').delete().or(`observacao.ilike.%${sessionId}%,observacao.ilike.%Inventário ${sessionId}%`);

        // 3. Deletar cabeçalho
        await client.from('inventarios').delete().eq('inventario_id', sessionId);

        showToast("Dados de teste excluídos!", "success");
        renderInventarioHistory(); // Recarregar
    } catch (e) {
        console.error('[INV-DIAG] Erro ao excluir teste:', e);
        showToast("Erro ao excluir dados", "error");
    }
}

async function viewClosedInventory(sessionId) {
    try {
        console.log('[INV-DIAG] viewClosedInventory id:', sessionId);
        showToast("Carregando inventário fechado...");
        
        const client = window.supabaseClient;
        if (!client) {
            console.error('[INV-DIAG] Supabase Client não disponível');
            return;
        }

        await ensureProdutosLoaded();

        const { data: invData, error: headerErr } = await client
            .from('inventarios')
            .select('*')
            .eq('inventario_id', sessionId)
            .maybeSingle();

        console.log('[INV-DIAG] header encontrado:', invData ? 'SIM' : 'NÃO');
        if (headerErr) console.error('[INV-DIAG] erro header:', headerErr);

        const { data: itensData, error: itensErr } = await client
            .from('inventarios_itens')
            .select('*')
            .eq('inventario_id', sessionId);

        const serverItems = itensData || [];
        console.log('[INV-DIAG] itens encontrados:', serverItems.length);
        if (itensErr) console.error('[INV-DIAG] erro itens:', itensErr);

        appData.currentInventory = {
            id: sessionId,
            user: invData?.usuario_responsavel || invData?.criado_por || 'N/A',
            date: invData?.data_inicio || invData?.criado_em,
            local: invData?.local || invData?.filtro_aplicado || 'TÉRREO',
            type: invData?.tipo || 'geral',
            status: invData?.status || 'FECHADO',
            items: serverItems.map(i => {
                const product = appData.products?.find(p => p.id_interno == i.id_interno);
                return {
                    ean: product?.ean || i.id_interno,
                    name: product?.descricao_completa || product?.nome || i.id_interno,
                    brand: product?.marca || '',
                    qty: Number(i.saldo_fisico || 0),
                    id_interno: i.id_interno,
                    saldo_sistema: Number(i.saldo_sistema || 0),
                    diferenca: Number(i.diferenca || 0)
                };
            })
        };

        console.log('[INV-DIAG] currentInventory.items após map (view):', appData.currentInventory.items.length);

        await renderInventarioInicialScreen(sessionId, 'view');
    } catch (e) {
        console.error('[INV-DIAG] Erro crítico ao visualizar:', e);
        showToast("Falha técnica ao abrir visualização", 'error');
    }
}

async function startInventoryReview(baseInventoryId) {
    const original = appData.currentInventory;
    if (!original || !original.items || original.items.length === 0) {
        alert("Não é possível revisar um inventário sem itens contados!");
        return;
    }

    if (!confirm("Deseja iniciar uma REVISÃO deste inventário?\nSerá gerada uma nova sessão com os mesmos itens.")) return;
    
    try {
        showToast("Iniciando revisão...");
        const client = window.supabaseClient;
        if (!client) return;

        const currentUser = localStorage.getItem('currentUser');
        
        // Gerar novo ID
        const date = new Date();
        const dateStr = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
        
        // TAREFA 4 — Numeração inteligente para REVISÃO
        const sameDayPrefix = `REV-${dateStr}-`;
        const sameDayInventories = (appData.inventario || []).filter(inv => {
            const id = (inv.inventario_id || '').toString();
            return id.startsWith(sameDayPrefix);
        });

        let nextSeq = 1;
        if (sameDayInventories.length > 0) {
            const lastSeqs = sameDayInventories.map(inv => {
                const id = inv.inventario_id.toString();
                const parts = id.split('-');
                return parseInt(parts[parts.length - 1]) || 0;
            });
            nextSeq = Math.max(...lastSeqs) + 1;
        }

        const seq = String(nextSeq).padStart(3, '0');
        const newSessionId = `REV-${dateStr}-${seq}`;

        // 1. Criar cabeçalho da revisão
        const { error: invErr } = await client.from('inventarios').insert([{
            inventario_id: newSessionId,
            tipo: 'revisao',
            status: 'ABERTO',
            criado_por: currentUser,
            usuario_responsavel: currentUser,
            data_inicio: date.toISOString(),
            local: original.local,
            filtro_aplicado: `REVISÃO DO ${baseInventoryId}`
        }]);

        if (invErr) throw invErr;

        // 2. Clonar itens
        for (const item of original.items) {
            await client.from('inventarios_itens').insert([{
                inventario_id: newSessionId,
                id_interno: item.id_interno,
                local: original.local,
                saldo_sistema: item.saldo_sistema,
                saldo_fisico: item.qty,
                diferenca: item.qty - item.saldo_sistema,
                auditado_em: date.toISOString()
            }]);
        }

        // 3. Carregar nova sessão como atual
        appData.currentInventory = {
            ...original,
            id: newSessionId,
            status: 'ABERTO',
            user: currentUser,
            date: date.toISOString()
        };

        await renderInventarioInicialScreen(newSessionId, 'edit');
        showToast("Revisão iniciada!", "success");
    } catch (e) {
        console.error('[INV] Erro ao criar revisão:', e);
        showToast("Erro ao criar revisão", 'error');
    }
}

async function cancelClosedInventory(sessionId) {
    if (!confirm('Tem certeza que deseja ANULAR este inventário?\n\nEssa ação NÃO apaga dados, apenas marca como ANULADO.')) return;

    try {
        showToast("Anulando inventário...");
        const client = window.supabaseClient;
        if (!client) return;

        const { error } = await client
            .from('inventarios')
            .update({
                status: 'ANULADO',
                atualizado_em: new Date().toISOString()
            })
            .eq('inventario_id', sessionId);

        if (error) throw error;

        showToast("Inventário anulado com sucesso!", "success");
        appData.currentInventory = null;
        
        // Atualizar cache local do histórico se existir
        if (appData.inventario) {
            const idx = appData.inventario.findIndex(inv => inv.inventario_id === sessionId);
            if (idx !== -1) appData.inventario[idx].status = 'ANULADO';
        }

        renderInventarioHistory();
    } catch (e) {
        console.error('[INV] Erro ao anular inventário:', e);
        showToast("Erro ao anular inventário", "error");
    }
}

async function renderStockCritical() {
    await ensureProdutosLoaded();
    const currentUser = localStorage.getItem('currentUser');
    const criticalProducts = appData.products.filter(p => {
        const stock = parseFloat((p.estoque_atual || p.estoque_minimo || 0).toString().replace(',', '.'));
        const min = parseFloat((p.estoque_minimo || 0).toString().replace(',', '.'));
        return stock <= min && min > 0;
    });

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
                    ${getTopBarHTML(currentUser, 'renderProductSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">ESTOQUE CRÍTICO</h2>
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
                                                ${(p.url_imagem || p.image_path) ? `<img src="${formatImageUrl(p.image_path || p.url_imagem)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span class=\\'material-symbols-rounded\\' style=\\'color: var(--muted)\\'>image</span>'">` : `<span class="material-symbols-rounded" style="color: var(--muted)">image</span>`}
                                            </div>
                                            <div style="flex: 1;">
                                                <div style="font-weight: 700; color: white; font-size: 0.9rem; margin-bottom: 4px;">${p.descricao_base || 'Sem Descrição'}</div>
                                                <div style="font-size: 0.75rem; color: var(--muted);">SKU: ${p.sku_fornecedor || '-'} | EAN: ${p.ean || '-'}</div>
                                                
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
    return renderSearchScreen();
}

function renderSearchScreen(push = true) {
    if (currentScreen === 'search' && document.getElementById('search-input')) {
        console.log('[BUSCA MOBILE DEBUG] re-render ignorado (já ativo)');
        return;
    }
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return renderLogin();
    
    // Garantir que produtos estão carregados antes de mostrar a tela
    ensureProdutosLoaded();

    currentScreen = 'search';
    if (push) pushNav('search');
    
    app.innerHTML = `
        <div class="dashboard-screen fade-in internal product-search-screen">
            ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderMenu()')}
            
            <main class="container product-search-center">
                <div class="product-search-bar">
                    <span class="material-symbols-rounded" style="color: var(--muted); font-size: 24px; margin-right: 12px;">search</span>
                    <input
                        type="search"
                        id="search-input"
                        class="product-search-input"
                        placeholder="Buscar por nome, marca ou código..."
                        autocomplete="off"
                        autocorrect="off"
                        autocapitalize="none"
                        spellcheck="false"
                        inputmode="search"
                        oninput="debouncedSearch()"
                        onkeypress="if(event.key === 'Enter') handleSearchEnter(event)"
                    />

                    <button class="product-search-camera-btn" type="button" aria-label="Escanear" onclick="startScanner()" style="margin-left: 10px;">
                        <span class="material-symbols-rounded" style="font-size: 24px; color: var(--primary);">qr_code_scanner</span>
                    </button>
                </div>
                
                <div id="scanner-container" class="hidden" style="margin-top: 24px; overflow: hidden; border-radius: 20px; border: 2px solid var(--primary); background: #000; position: relative; width: 100%; max-width: 600px; margin-left: auto; margin-right: auto;">
                    <div id="reader" style="width: 100%;"></div>
                    <div style="position: absolute; top: 15px; right: 15px; z-index: 10;">
                        <button class="btn-action" style="padding: 10px; min-width: auto; border-radius: 50%; background: rgba(0,0,0,0.6);" onclick="stopScanner()">
                            <span class="material-symbols-rounded">close</span>
                        </button>
                    </div>
                </div>
                
                <div id="search-results" class="product-search-results">
                    <!-- Resultados -->
                </div>
            </main>
        </div>
    `;
    
    console.log('[BUSCA MOBILE DEBUG] input criado');
    setTimeout(() => {
        const input = document.getElementById('search-input');
        if (input) {
            input.focus();
            console.log('[BUSCA MOBILE DEBUG] foco preservado');
        }
    }, 100);
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
        fps: 30,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.9);
            return { width: size, height: size * 0.6 };
        },
        aspectRatio: 1.0,
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
        },
        // Forçar formatos específicos para maior velocidade
        formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE
        ]
    };


    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            async (decodedText) => {
                const now = Date.now();
                if (now - lastScanTime < 1500) return;
                lastScanTime = now;

                console.log(`[SCANNER] Decoded: ${decodedText}`);

                let context = 'search';
                if (isInventory) context = 'inventory';
                else if (isPicking) context = 'picking';
                else if (isConference) context = 'conference';

                const product = await handleProductScan(decodedText, context);

                // Se não for busca, precisa tratar as funções específicas
                if (product) {
                    if (isInventory) addInventoryItem(decodedText);
                    else if (isPicking) addPickItem(decodedText);
                    else if (isConference) addPackScan(decodedText);
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

async function performSearch() {
    console.log('[BUSCA MOBILE DEBUG] evento input');
    const start = performance.now();
    const input = document.getElementById('search-input');
    if (!input) return;
    
    const queryRaw = input.value.trim();
    console.log('[BUSCA MOBILE DEBUG] termo digitado:', queryRaw);
    if (!queryRaw || queryRaw.length < 2) {
        const resultsContainer = document.getElementById('search-results');
        if (resultsContainer) resultsContainer.innerHTML = '';
        return;
    }

    // 1. Classificação Inteligente e Auto-open (Somente se não for texto genérico e tiver tamanho mínimo)
    const classification = classifyProductInput(queryRaw);
    if (classification.type !== 'text' && classification.type !== 'empty' && queryRaw.length >= 4) {
        const matchedProduct = await handleProductScan(queryRaw, 'search');
        if (matchedProduct) {
            input.value = '';
            const resultsContainer = document.getElementById('search-results');
            if (resultsContainer) resultsContainer.innerHTML = '';
            console.log('[BUSCA MOBILE DEBUG] match exato encontrado, abrindo detalhes');
            return;
        }
    }

    const query = normalizeText(queryRaw);

    // 2. Busca Local no Índice
    const results = appData.products.filter(p => p._searchIndex.includes(query));

    // 3. Score de Relevância e Ordenação
    const finalResults = results
        .sort((a, b) => {
            // Prioridade 1: Ativos primeiro (opcional, mas recomendado para ERP)
            const statusA = String(a.status || "ativo").toLowerCase();
            const statusB = String(b.status || "ativo").toLowerCase();
            const isAtivoA = statusA === 'ativo' || statusA === 'sim' || statusA === '1';
            const isAtivoB = statusB === 'ativo' || statusB === 'sim' || statusB === '1';
            
            if (isAtivoA && !isAtivoB) return -1;
            if (!isAtivoA && isAtivoB) return 1;

            // Prioridade 2: Score de termo (StartsWith > Includes)
            const getScore = (p) => {
                if (p._dBaseNorm.startsWith(query)) return 0;
                if (p._dFullNorm.startsWith(query)) return 1;
                if (p._dBaseNorm.includes(query)) return 2;
                if (p._dFullNorm.includes(query)) return 3;
                if (p._brandCatSubNorm.includes(query)) return 4;
                return 5; // Outros campos (EAN, SKU, Atributos)
            };

            const scoreA = getScore(a);
            const scoreB = getScore(b);

            if (scoreA !== scoreB) return scoreA - scoreB;

            // Prioridade 3: Alfabética
            return a._dBaseNorm.localeCompare(b._dBaseNorm);
        })
        .slice(0, 50);

    const end = performance.now();
    console.log(`[BUSCA] Local: "${queryRaw}" | Encontrados: ${results.length} | Exibindo: ${finalResults.length} | Tempo: ${Math.round(end - start)}ms`);
    
    renderSearchResults(finalResults);
}

// Criar versão debounced da busca para evitar processamento excessivo ao digitar
let lastSearchQuery = '';
const debouncedSearch = debounce(async () => {
    const input = document.getElementById('search-input');
    if (!input) return;
    const query = input.value.trim();
    if (query === lastSearchQuery) return;
    lastSearchQuery = query;
    await performSearch();
}, 300);

function handleSearchEnter(event) {
    if (event.key === 'Enter') {
        const rawValue = event.target.value.trim();
        if (!rawValue) return;
        handleProductScan(rawValue, 'search');
    }
}


function renderSearchResults(results) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;

    if (results.length === 0) {
        resultsContainer.innerHTML = `
                    <div style="text-align: center; padding: 60px; background: #fff; border-radius: 16px; border: 1px dashed #e5e7eb;">
                        <span class="material-symbols-rounded" style="font-size: 48px; color: #9ca3af; margin-bottom: 12px;">search_off</span>
                        <p style="color: #6b7280; font-weight: 600; font-size: 0.95rem;">Nenhum produto encontrado</p>
                    </div>
                `;
        return;
    }

    resultsContainer.innerHTML = `
                <div style="margin-bottom: 20px; font-size: 0.85rem; color: var(--muted); font-weight: 600; padding-left: 5px;">
                    Encontrados: ${results.length} produtos
                </div>
                <div class="product-result-list">
                    ${results.map(p => `
                        <div class="product-result-item" onclick="showProductDetails('${p.ean || p.id_interno}')">
                            <div class="product-result-img">
                                ${(p.url_imagem || p.image_path) ? `<img src="${formatImageUrl(p.image_path || p.url_imagem)}" alt="${p.descricao_base}" onerror="this.style.display='none'; this.parentElement.innerHTML='<span class=\\'material-symbols-rounded\\' style=\\'color: #d1d5db; font-size: 24px;\\'>inventory_2</span>'">` : `<span class="material-symbols-rounded" style="color: #d1d5db; font-size: 24px;">inventory_2</span>`}
                            </div>
                            <div class="product-result-info">
                                <div class="product-result-title product-title">${p.descricao_completa || p.descricao_base || 'Sem descrição'}</div>
                                <div class="product-meta">
                                    <span class="id-badge">ID: ${p.id_interno || '-'}</span>
                                    <span class="meta-item"><span class="meta-label">EAN:</span> <span class="ean-value">${p.ean || '-'}</span></span>
                                    <span class="meta-item"><span class="meta-label">SKU:</span> <span class="sku-value">${p.sku_fornecedor || p.sku || '-'}</span></span>
                                    ${p.cor ? `<span class="meta-item"><span class="meta-label">COR:</span> <span class="cor-value">${p.cor}</span></span>` : ''}
                                </div>
                            </div>
                            <div class="product-result-price">
                                ${formatPrice(p.preco_varejo)}
                            </div>
                            <div class="product-result-arrow">
                                <span class="material-symbols-rounded">chevron_right</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
    console.log('[BUSCA MOBILE DEBUG] resultados atualizados:', results.length);
}


function showProductDetails(id) {
    const product = appData.products.find(p => p.ean == id || p.id_interno == id);
    if (!product) return;
    renderProductDetails(product);
}

function openImageModal(url) {
    if (!url) return;
    const modal = document.createElement('div');
    modal.id = 'image-modal';
    modal.className = 'image-modal';
    
    // Closer on background click
    modal.onclick = (e) => {
        if (e.target.id === 'image-modal' || e.target.className === 'image-modal-content') {
            closeImageModal();
        }
    };

    modal.innerHTML = `
                <div class="image-modal-content">
                    <button class="image-modal-close" onclick="closeImageModal()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                    <img src="${url}" alt="Zoom" id="modal-image-zoom">
                </div>
            `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Premium Interaction: Click to Zoom
    const img = modal.querySelector('img');
    let isZoomed = false;
    img.onclick = (e) => {
        e.stopPropagation();
        isZoomed = !isZoomed;
        if (isZoomed) {
            img.style.transform = 'scale(1.5)';
            img.style.cursor = 'zoom-out';
modal.style.overflow = 'auto';
            img.style.maxHeight = 'none';
        } else {
            img.style.transform = 'scale(1)';
            img.style.cursor = 'zoom-in';
            modal.style.overflow = 'hidden';
            img.style.maxHeight = '90vh';
        }
    };
    img.style.cursor = 'zoom-in';
    img.style.transition = 'transform 0.4s cubic-bezier(0.19, 1, 0.22, 1)';
}

function closeImageModal() {
    const modal = document.getElementById('image-modal');
    if (modal) {
        modal.style.opacity = '0';
        modal.style.transition = 'opacity 0.2s ease';
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 200);
    }
}

// ==== LÓGICA DE ESTOQUE E LOCAIS ====
const LOCAIS_DISPONIVEIS = ['TERREO', 'MOSTRUARIO', 'PRIMEIRO_ANDAR'];
const LOCAIS_SAIDA = ['TERREO', 'MOSTRUARIO'];
const LOCAIS_NAO_VENDAVEIS = ['DEFEITO', 'EM_GARANTIA', 'EM_TRANSPORTE'];

function normalizarLocal(local) {
  return normalizeLocal(local);
}

function calcularEstoqueDisponivel(estoques) {
  if (!estoques || !Array.isArray(estoques)) return 0;
  return estoques
    .filter(item => LOCAIS_DISPONIVEIS.includes(normalizarLocal(item.local)))
    .reduce((total, item) => {
        const qtd = parseFloat(String(item.saldo_total || item.saldo || 0).replace(',', '.'));
        return total + (isNaN(qtd) ? 0 : qtd);
    }, 0);
}

function calcularEstoqueNaoVendavel(estoques) {
  if (!estoques || !Array.isArray(estoques)) return 0;
  return estoques
    .filter(item => LOCAIS_NAO_VENDAVEIS.includes(normalizarLocal(item.local)))
    .reduce((total, item) => {
        const qtd = parseFloat(String(item.saldo_total || item.saldo || 0).replace(',', '.'));
        return total + (isNaN(qtd) ? 0 : qtd);
    }, 0);
}

function getEquivalentProducts(p) {
    if (!appData.products || !p) return [];
    
    const attrs = safeParseAtributos(p.atributos);
    const norm = (val) => String(val || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Prioridade 1: Código Equivalente (Regra Principal)
    const codEquivalenteAttr = attrs.find(a => norm(a.nome).includes('equivalente'));
    const codEquivalente = (codEquivalenteAttr && norm(codEquivalenteAttr.valor)) ? norm(codEquivalenteAttr.valor) : null;
    
    if (codEquivalente && codEquivalente !== 'null' && codEquivalente !== 'undefined') {
        return appData.products.filter(other => {
            if (other.id_interno === p.id_interno) return false;
            const otherAttrs = safeParseAtributos(other.atributos);
            const otherCod = otherAttrs.find(a => norm(a.nome).includes('equivalente'));
            return otherCod && norm(otherCod.valor) === codEquivalente;
        }).slice(0, 5);
    }
    
    // 2. Prioridade 2: Fallback Seguro (Combinação Obrigatória)
    const ATRIBUTOS_OBRIGATORIOS = ['tipo', 'modelo', 'encaixe', 'tensao', 'potencia', 'polos', 'pinos', 'aplicacao'];
    const ATRIBUTOS_CONDICIONAIS = ['cor', 'lado', 'acabamento'];
    const ATRIBUTOS_CHAVE = [...ATRIBUTOS_OBRIGATORIOS, ...ATRIBUTOS_CONDICIONAIS];
    
    const pTechAttrs = {};
    attrs.forEach(a => {
        const nome = norm(a.nome);
        if (ATRIBUTOS_CHAVE.includes(nome)) {
            pTechAttrs[nome] = norm(a.valor);
        }
    });

    // Segurança: Se não houver atributos técnicos suficientes para garantir equivalência, NÃO agrupar.
    // Exigimos pelo menos 1 atributo técnico chave para o fallback.
    if (Object.keys(pTechAttrs).length === 0) return [];

    const pDesc = norm(p.descricao_base);
    const pCat = norm(p.categoria);
    const pSub = norm(p.subcategoria);
    
    // Regra 3: NÃO permitir agrupamento usando apenas descricao_base (sem categoria/sub ou atributos)
    if (!pDesc || !pCat) return [];

    return appData.products.filter(other => {
        if (other.id_interno === p.id_interno) return false;
        
        // Deve ser de marca diferente (equivalência inter-marcas)
        if (norm(other.marca) === norm(p.marca)) return false;

        // Validação de Descrição, Categoria e Subcategoria
        if (norm(other.descricao_base) !== pDesc) return false;
        if (norm(other.categoria) !== pCat) return false;
        if (norm(other.subcategoria) !== pSub) return false;
        
        // Validação de Atributos Técnicos
        const otherAttrs = safeParseAtributos(other.atributos);
        const otherTechAttrs = {};
        otherAttrs.forEach(a => {
            const nome = norm(a.nome);
            if (ATRIBUTOS_CHAVE.includes(nome)) {
                otherTechAttrs[nome] = norm(a.valor);
            }
        });
        
        // 1. Validar Atributos Obrigatórios (Devem ser idênticos, inclusive se um estiver vazio e o outro não)
        for (const key of ATRIBUTOS_OBRIGATORIOS) {
            if (pTechAttrs[key] !== otherTechAttrs[key]) return false;
        }
        
        // 2. Validar Atributos Condicionais (Se P tem valor, OTHER deve ter o mesmo valor. Se P está vazio, ignora)
        for (const key of ATRIBUTOS_CONDICIONAIS) {
            if (pTechAttrs[key] && pTechAttrs[key] !== otherTechAttrs[key]) return false;
        }

        return true;
    }).slice(0, 5);
}

function getAvailableStockCache(idInterno) {
    if (!appData.estoque) return 0;
    const id = String(idInterno);
    const entries = appData.estoque.filter(s => String(s.id_interno || s.id) === id);
    return calcularEstoqueDisponivel(entries);
}

window.toggleMoreInfo = function() {
    const content = document.getElementById('more-info-content');
    const icon = document.getElementById('more-info-icon');
    const label = document.getElementById('more-info-label');
    const mobileSecondary = document.querySelectorAll('.collapsible-mobile');
    
    if (content && icon && label) {
        const isHidden = content.classList.toggle('hidden');
        
        // Toggle mobile-specific secondary info
        mobileSecondary.forEach(el => {
            if (isHidden) el.classList.remove('open');
            else el.classList.add('open');
        });

        icon.innerText = isHidden ? 'expand_more' : 'expand_less';
        label.innerText = isHidden ? '+ MAIS INFORMAÇÕES' : '− MENOS INFORMAÇÕES';
    }
};


async function renderProductDetails(p) {
    const currentUser = localStorage.getItem('currentUser');
    const idInterno = (p.id_interno || p.col_A || '').toString();

    let productStockEntries = [];
    try {
        productStockEntries = await DataClient.fetchEstoqueProdutoSupabase(idInterno);
    } catch (e) {
        console.log('[DETALHE] Estoque via cache local');
    }

    if (productStockEntries.length === 0) {
        productStockEntries = (appData.estoque || []).filter(s => {
            const hasId = s.id_interno && s.id_interno.toString() === idInterno;
            if (!hasId) return false;
            const total = parseFloat((s.saldo_total || s.saldo || '0').toString().replace(',', '.'));
            return total > 0;
        });
    }

    const disponivel = calcularEstoqueDisponivel(productStockEntries);
    const naoVendavel = calcularEstoqueNaoVendavel(productStockEntries);
    const totalStock = disponivel + naoVendavel;

    const equivalentes = getEquivalentProducts(p);

    const attrs = safeParseAtributos(p.atributos).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const rawPdf = p.url_pdf_manual || p.url_pdf;
    const pdfUrl = isValidUrl(rawPdf) ? rawPdf : null;

    const statusColor = (p.status === 'inativo' || p.status === 'nao' || p.status === '0') ? '#ef4444' : '#4ade80';

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal no-top-bar">
            ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderSearchScreen()')}
            
            <main class="container product-detail-screen">
                <div class="product-detail-card">
                    <div class="product-detail-top-actions">
                        ${pdfUrl ? `
                        <a href="${pdfUrl}" target="_blank" class="product-manual-icon-btn" title="Abrir manual do produto">
                            <span class="material-symbols-rounded">picture_as_pdf</span>
                        </a>
                        ` : ''}
                        <div class="status-indicator-dot" style="background-color: ${statusColor};" title="Status: ${p.status || 'Ativo'}"></div>
                    </div>
                    <!-- CABEÇALHO PRINCIPAL -->
                    <div class="product-detail-header">
                        <div class="product-detail-img">
                            ${(p.url_imagem || p.image_path) ? `<img src="${formatImageUrl(p.image_path || p.url_imagem)}" onclick="openImageModal('${formatImageUrl(p.image_path || p.url_imagem)}')" style="cursor:zoom-in">` : `<span class="material-symbols-rounded" style="font-size: 48px; color: #d1d5db;">inventory_2</span>`}
                        </div>
                        <div class="product-detail-title-block">
                            <h1 class="product-detail-title">${p.descricao_completa || p.descricao_base || 'Sem descrição'}</h1>
                            <div class="product-detail-brand-row">
                                ${p.marca ? `<span class="product-detail-brand">${p.marca}</span>` : ''}
                                <span class="product-detail-main-id">ID: ${idInterno}</span>
                            </div>
                            <div class="product-detail-main-ean">EAN: ${p.ean || '-'}</div>
                            
                            <div class="product-detail-badges collapsible-mobile" style="margin-top: 12px;">
                                ${p.categoria ? `<span class="product-badge">${p.categoria}</span>` : ''}
                                ${p.subcategoria ? `<span class="product-badge">${p.subcategoria}</span>` : ''}
                                ${p.unidade ? `<span class="product-badge product-badge-unit">${formatUnityWithQty(p.unidade, p.quantidade_embalagem)}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- CARDS DE PREÇO E ESTOQUE TOTAL -->
                    <div class="product-detail-prices">
                        <div class="product-price-card">
                            <div class="product-price-label">Varejo</div>
                            <div class="product-price-value">${formatPrice(p.preco_varejo)}</div>
                        </div>
                        <div class="product-price-card" title="Térreo + Mostruário + 1º Andar">
                            <div class="product-price-label">Estoque Disponível</div>
                            <div class="product-price-value product-stock-value" style="color: #4ade80;">${disponivel} <span class="product-stock-unit">${p.unidade || 'UN'}</span></div>
                        </div>
                        <div class="product-price-card collapsible-mobile">
                            <div class="product-price-label">Atacado</div>
                            <div class="product-price-value product-price-atacado">${formatPrice(p.preco_atacado)}</div>
                        </div>
                    </div>

                    <!-- ALERTA DE TRANSFERÊNCIA (1º ANDAR) -->
                    ${(() => {
                        const t = parseFloat(productStockEntries.find(e => normalizeLocal(e.local) === 'TERREO')?.saldo_total || 0);
                        const m = parseFloat(productStockEntries.find(e => normalizeLocal(e.local) === 'MOSTRUARIO')?.saldo_total || 0);
                        const p1 = parseFloat(productStockEntries.find(e => normalizeLocal(e.local) === 'PRIMEIRO_ANDAR')?.saldo_total || 0);
                        
                        if (t === 0 && m === 0 && p1 > 0) {
                            return `
                            <div style="margin-top: 20px; padding: 14px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 14px; display: flex; align-items: center; gap: 12px;">
                                <div style="width: 40px; height: 40px; background: rgba(251, 191, 36, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <span class="material-symbols-rounded" style="color: #fbbf24; font-size: 24px;">local_shipping</span>
                                </div>
                                <div>
                                    <div style="color: #fbbf24; font-weight: 800; font-size: 0.85rem;">SEM ESTOQUE NO TÉRREO/MOSTRUÁRIO</div>
                                    <div style="color: rgba(255,255,255,0.7); font-size: 0.75rem;">Disponível no 1º andar: <b>${p1}</b></div>
                                    <div style="color: #fbbf24; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; margin-top: 2px;">Transferir para venda</div>
                                </div>
                            </div>
                            `;
                        }
                        return '';
                    })()}

                    <!-- ESTOQUE POR LOCAL (DETALHADO) -->
                    <div class="product-stock-locations" style="margin-top: 24px;">
                        <div class="product-stock-title" style="font-size: 0.9rem; margin-bottom: 12px; color: var(--muted); font-weight: 700;">ESTOQUE POR LOCAL</div>
                        <div class="product-stock-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            ${(() => {
                                const localMap = {
                                    'TERREO': 'Térreo',
                                    'MOSTRUARIO': 'Mostruário',
                                    'PRIMEIRO_ANDAR': '1º Andar',
                                    'DEFEITO': 'Defeito',
                                    'EM_GARANTIA': 'Em Garantia',
                                    'EM_TRANSPORTE': 'Em Transporte'
                                };
                                return Object.keys(localMap).map(key => {
                                    const entry = productStockEntries.find(e => normalizeLocal(e.local) === key);
                                    const saldo = entry ? parseFloat(entry.saldo_total || entry.saldo || 0) : 0;
                                    const label = localMap[key];
                                    return `
                                        <div class="product-stock-location" style="${saldo === 0 ? 'opacity: 0.4;' : ''} background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 12px; border-radius: 12px;">
                                            <span class="product-stock-location-name" style="font-size: 0.75rem; color: var(--muted);">${label}</span>
                                            <span class="product-stock-location-qty" style="font-size: 1.1rem; font-weight: 800; display: block; margin-top: 4px;">${saldo}</span>
                                        </div>
                                    `;
                                }).join('');
                            })()}
                        </div>
                    </div>

                    <!-- PRODUTOS EQUIVALENTES (Collapsible on mobile) -->
                    <div class="collapsible-mobile">
                        ${equivalentes.length > 0 ? `
                        <div class="product-related-section" style="margin-top: 32px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 24px;">
                            <div class="product-related-title" style="font-size: 0.9rem; font-weight: 800; color: var(--muted); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; text-transform: uppercase;">
                                <span class="material-symbols-rounded" style="color: var(--primary); font-size: 20px;">compare_arrows</span>
                                Produtos Equivalentes / Por Marca
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                ${equivalentes.map(eq => {
                                    const eqStock = getAvailableStockCache(eq.id_interno);
                                    return `
                                        <div class="related-product-card" onclick="renderProductDetails(${JSON.stringify(eq).replace(/"/g, '&quot;')})" style="background: rgba(255,255,255,0.03); padding: 14px; border-radius: 16px; display: flex; align-items: center; gap: 14px; cursor: pointer; border: 1px solid rgba(255,255,255,0.05); transition: all 0.2s ease;">
                                            <div style="width: 44px; height: 44px; background: rgba(255,255,255,0.05); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.1);">
                                                ${(eq.image_path || eq.url_imagem) ? `<img src="${formatImageUrl(eq.image_path || eq.url_imagem)}" style="width: 100%; height: 100%; object-fit: contain;">` : '<span class="material-symbols-rounded" style="font-size: 20px; color: var(--muted);">inventory_2</span>'}
                                            </div>
                                            <div style="flex: 1; min-width: 0;">
                                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                                    <span style="font-size: 0.7rem; color: var(--primary); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">${eq.marca || 'S/M'}</span>
                                                    <span style="font-size: 0.65rem; color: var(--muted);">ID: ${eq.id_interno}</span>
                                                </div>
                                                <div style="font-size: 0.85rem; font-weight: 600; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 2px 0;">${eq.descricao_base || eq.descricao_completa}</div>
                                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                                    <span style="font-size: 0.8rem; color: #4ade80; font-weight: 700;">${eqStock} disponíveis</span>
                                                    <span class="material-symbols-rounded" style="font-size: 18px; color: var(--muted);">chevron_right</span>
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                    </div>

                    <!-- BLOCO + INFORMAÇÕES (RECOLHÍVEL) -->
                    <div style="margin-top: 32px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">
                        <div onclick="toggleMoreInfo()" class="product-more-info-btn" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 14px; transition: background 0.2s;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span class="material-symbols-rounded" style="color: var(--muted);">info</span>
                                <span id="more-info-label" style="font-weight: 700; font-size: 0.95rem; color: white;">+ MAIS INFORMAÇÕES</span>
                            </div>
                            <span id="more-info-icon" class="material-symbols-rounded" style="color: var(--muted);">expand_more</span>
                        </div>
                        
                        <div id="more-info-content" class="hidden" style="padding: 20px 10px 0;">
                            <!-- CUSTO -->
                            <div style="margin-bottom: 24px; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 14px; border: 1px dashed rgba(255,255,255,0.1);">
                                <div id="custo-locked" style="display: flex; align-items: center; justify-content: space-between;">
                                    <div>
                                        <span style="font-size: 0.75rem; color: var(--muted); display: block; margin-bottom: 4px;">PREÇO DE CUSTO</span>
                                        <span style="font-size: 1.1rem; color: white; font-weight: 700; letter-spacing: 2px;">••••••</span>
                                    </div>
                                    <button onclick="toggleCusto()" class="btn-action" style="padding: 8px 16px; font-size: 0.75rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
                                        MOSTRAR
                                    </button>
                                </div>
                                <div id="custo-display" class="hidden" style="display: flex; align-items: center; justify-content: space-between;">
                                    <div>
                                        <span style="font-size: 0.75rem; color: var(--muted); display: block; margin-bottom: 4px;">PREÇO DE CUSTO</span>
                                        <span class="product-custo-amount" style="font-size: 1.2rem; color: #fbbf24; font-weight: 800;">${formatPrice(p.preco_custo)}</span>
                                    </div>
                                    <button onclick="toggleCusto()" class="btn-action" style="padding: 8px 16px; font-size: 0.75rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
                                        OCULTAR
                                    </button>
                                </div>
                            </div>

                            <!-- DADOS ADICIONAIS -->
                            <div class="product-detail-id-section" style="background: transparent; padding: 0; border: none; margin-bottom: 24px;">
                                ${p.sku_fornecedor ? `
                                <div class="product-id-item">
                                    <span class="product-id-label">SKU Fornecedor</span>
                                    <span class="product-id-value">${p.sku_fornecedor}</span>
                                </div>
                                ` : ''}
                                ${p.quantidade_minima_atacado ? `
                                <div class="product-id-item">
                                    <span class="product-id-label">Mínimo Atacado</span>
                                    <span class="product-id-value">${p.quantidade_minima_atacado} ${p.unidade || 'UN'}</span>
                                </div>
                                ` : ''}
                                ${p.estoque_minimo ? `
                                <div class="product-id-item">
                                    <span class="product-id-label">Estoque Mínimo</span>
                                    <span class="product-id-value">${p.estoque_minimo}</span>
                                </div>
                                ` : ''}
                            </div>

                            <!-- ATRIBUTOS TÉCNICOS -->
                            ${attrs.length > 0 ? `
                            <div class="product-attrs-section" style="margin-bottom: 24px;">
                                <div class="product-attrs-title" style="font-size: 0.8rem; color: var(--muted); text-transform: uppercase; margin-bottom: 12px; font-weight: 800;">Atributos Técnicos</div>
                                <div class="product-attrs-grid">
                                    ${attrs.map(attr => `
                                        <div class="product-attr-chip">
                                            <span class="product-attr-name">${formatAttributeName(attr.nome)}:</span>
                                            <span class="product-attr-value">${formatAttributeValue(attr.valor)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            ` : ''}

                            <!-- OBSERVAÇÕES -->
                            ${p.observacoes ? `
                            <div class="product-obs-section" style="margin-bottom: 24px;">
                                <div class="product-obs-title" style="font-size: 0.8rem; color: var(--muted); text-transform: uppercase; margin-bottom: 8px; font-weight: 800;">Observações Internas</div>
                                <div class="product-obs-text" style="font-size: 0.85rem; line-height: 1.5; color: rgba(255,255,255,0.7);">${p.observacoes}</div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;
    window.scrollTo(0, 0);
}

window.toggleCusto = function() {
    const locked = document.getElementById('custo-locked');
    const display = document.getElementById('custo-display');
    if (locked && display) {
        locked.classList.toggle('hidden');
        display.classList.toggle('hidden');
    }
};

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
        <div class="dashboard-screen fade-in internal">
            ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderProductSubMenu()')}

            <main class="container product-form-screen">
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
                        <select id="add-uni" class="input-field">
                            <option value="UN">UN - Unidade</option>
                            <option value="PC">PC - Peça</option>
                            <option value="KG">KG - Quilograma</option>
                            <option value="LT">LT - Litro</option>
                            <option value="MT">MT - Metro</option>
                            <option value="JG">JG - Jogo</option>
                            <option value="KIT">KIT - Kit</option>
                            <option value="PAR">PAR - Par</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Qtd por Embalagem</label>
                        <input type="number" id="add-qtd-emb" class="input-field" value="1" min="1">
                    </div>

                    <div class="form-section-title">Atributos Técnicos (JSON)</div>
                    <div class="input-group full-width">
                        <label>Atributos (JSON Array)</label>
                        <textarea id="add-atributos" class="input-field" style="min-height: 100px; font-family: monospace; font-size: 0.85rem;" placeholder='[{"nome":"voltagem","valor":"12v","ordem":1}]'></textarea>
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
                        <input type="number" id="add-min-at" class="input-field" value="1">
                    </div>

                    <div class="form-section-title">Status e Observações</div>
                    <div class="input-group">
                        <label>Status</label>
                        <select id="add-status" class="input-field" style="width: 100%; appearance: none;">
                            <option value="ativo">Ativo</option>
                            <option value="inativo">Inativo</option>
                        </select>
                    </div>
                    <div class="input-group full-width">
                        <label>Observações</label>
                        <textarea id="add-obs" class="input-field" style="min-height: 80px; resize: vertical;" placeholder="Detalhes adicionais..."></textarea>
                    </div>

                    <div class="form-section-title">Mídia e Documentação</div>
                    <div class="input-group full-width">
                        <label>Imagem do Produto</label>
                        <input type="file" id="add-img-file" class="input-field" accept="image/*">
                    </div>
                    <div class="input-group full-width">
                        <label>Manual / PDF</label>
                        <input type="file" id="add-pdf-file" class="input-field" accept="application/pdf">
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
    
    let image_path = null;
    let manual_path = null;
    let url_imagem = null;
    let url_pdf = null;
    
    const imgFile = document.getElementById('add-img-file').files[0];
    const pdfFile = document.getElementById('add-pdf-file').files[0];
    
    try {
        if (imgFile) {
            console.log('[PRODUTO] Arquivo imagem selecionado:', imgFile.name);
            image_path = await uploadFile(imgFile, 'produto');
            url_imagem = getPublicUrl(image_path);
            console.log('[PRODUTO] Imagem salva. path:', image_path, 'URL:', url_imagem);
        }
        
        if (pdfFile) {
            console.log('[PRODUTO] Arquivo PDF selecionado:', pdfFile.name);
            manual_path = await uploadFile(pdfFile, 'manual');
            url_pdf = getPublicUrl(manual_path);
            console.log('[PRODUTO] PDF salvo. path:', manual_path, 'URL:', url_pdf);
        }
    } catch (err) {
        console.error('[PRODUTO] Erro ao fazer upload:', err);
        showToast('Erro ao enviar arquivo: ' + err.message);
        return;
    }

    const attrsInput = document.getElementById('add-atributos').value.trim();
    let attrsArray = [];
    if (attrsInput) {
        try {
            attrsArray = JSON.parse(attrsInput);
            if (!Array.isArray(attrsArray)) {
                showToast('Atributos deve ser um array JSON');
                return;
            }
        } catch (e) {
            showToast('JSON de atributos inválido');
            return;
        }
    }
    
    const product = {
        id_interno: nextId,
        ean: document.getElementById('add-ean').value.trim(),
        sku_fornecedor: document.getElementById('add-sku').value.trim(),
        descricao_base: document.getElementById('add-desc').value.trim(),
        descricao_completa: document.getElementById('add-desc').value.trim(),
        marca: document.getElementById('add-marca').value.trim(),
        cor: document.getElementById('add-cor').value.trim(),
        categoria: document.getElementById('add-cat').value.trim(),
        subcategoria: document.getElementById('add-subcat').value.trim(),
        unidade: document.getElementById('add-uni').value.trim(),
        quantidade_embalagem: parseInt(document.getElementById('add-qtd-emb').value) || 1,
        preco_custo: parseFloat(document.getElementById('add-custo').value) || 0,
        preco_varejo: parseFloat(document.getElementById('add-varejo').value) || 0,
        preco_atacado: parseFloat(document.getElementById('add-atacado').value) || 0,
        estoque_minimo: parseInt(document.getElementById('add-min').value) || 0,
        qtd_minima_atacado: parseInt(document.getElementById('add-min-at').value) || 1,
        status: document.getElementById('add-status').value,
        observacoes: document.getElementById('add-obs').value.trim(),
        url_imagem: url_imagem,
        url_pdf_manual: url_pdf,
        atributos: JSON.stringify(attrsArray)
    };

    if (!product.descricao_base) {
        showToast("A descrição base é obrigatória.");
        return;
    }

    console.log('[PRODUTO] Salvando produto:', product);
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
                    sheet: 'produtos',
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

let removeImageFlag = false;
let removePDFFlag = false;

function markRemoveImage() {
    removeImageFlag = true;
    const preview = document.getElementById('edit-img-preview');
    if (preview) {
        preview.innerHTML = '<span style="color: #E30613; font-size: 0.8rem;">Imagem será removida ao salvar</span>';
    }
    console.log('[REMOVE] Imagem marcada para remoção');
}

function markRemovePDF() {
    removePDFFlag = true;
    const preview = document.getElementById('edit-pdf-preview');
    if (preview) {
        preview.innerHTML = '<span style="color: #E30613; font-size: 0.8rem;">PDF será removido ao salvar</span>';
    }
    console.log('[REMOVE] PDF marcado para remoção');
}

async function saveEditProduct(originalId) {
    const existingProduct = appData.products.find(p => (p.id_interno || p.col_A) == originalId);
    
    let newImagePath = existingProduct?.image_path || null;
    let newManualPath = existingProduct?.manual_path || null;
    let url_imagem = existingProduct?.url_imagem || null;
    let url_pdf = existingProduct?.url_pdf_manual || null;
    
    const oldImagePath = existingProduct?.image_path || null;
    const oldManualPath = existingProduct?.manual_path || null;
    
    const newImgFile = document.getElementById('edit-img-file')?.files[0];
    const newPdfFile = document.getElementById('edit-pdf-file')?.files[0];
    
    try {
        if (newImgFile) {
            newImagePath = await uploadFile(newImgFile, 'produto');
            url_imagem = getPublicUrl(newImagePath);
            removeImageFlag = false;
            
            if (oldImagePath && oldImagePath !== newImagePath) {
                await deleteFile(oldImagePath);
            }
        } else if (removeImageFlag && oldImagePath) {
            await deleteFile(oldImagePath);
            newImagePath = null;
            url_imagem = null;
        }
        
        if (newPdfFile) {
            newManualPath = await uploadFile(newPdfFile, 'manual');
            url_pdf = getPublicUrl(newManualPath);
            removePDFFlag = false;
            
            if (oldManualPath && oldManualPath !== newManualPath) {
                await deleteFile(oldManualPath);
            }
        } else if (removePDFFlag && oldManualPath) {
            await deleteFile(oldManualPath);
            newManualPath = null;
            url_pdf = null;
        }
    } catch (err) {
        console.error('[EDIT] Erro ao processar arquivos:', err);
        showToast('Erro ao processar arquivos: ' + err.message);
        return;
    }

    const attrsInput = document.getElementById('edit-atributos').value.trim();
    let attrsArray = [];
    if (attrsInput) {
        try {
            attrsArray = JSON.parse(attrsInput);
            if (!Array.isArray(attrsArray)) {
                showToast('Atributos deve ser um array JSON');
                return;
            }
        } catch (e) {
            showToast('JSON de atributos inválido');
            return;
        }
    }
    
    const product = {
        id_interno: document.getElementById('edit-id').value.trim(),
        ean: document.getElementById('edit-ean').value.trim(),
        sku_fornecedor: document.getElementById('edit-sku').value.trim(),
        descricao_base: document.getElementById('edit-desc').value.trim(),
        descricao_completa: document.getElementById('edit-desc').value.trim(),
        marca: document.getElementById('edit-marca').value.trim(),
        cor: document.getElementById('edit-cor').value.trim(),
        categoria: document.getElementById('edit-cat').value.trim(),
        subcategoria: document.getElementById('edit-subcat').value.trim(),
        unidade: document.getElementById('edit-uni').value.trim(),
        quantidade_embalagem: parseInt(document.getElementById('edit-qtd-emb').value) || 1,
        preco_custo: parseFloat(document.getElementById('edit-custo').value) || 0,
        preco_varejo: parseFloat(document.getElementById('edit-varejo').value) || 0,
        preco_atacado: parseFloat(document.getElementById('edit-atacado').value) || 0,
        estoque_minimo: parseInt(document.getElementById('edit-min').value) || 0,
        qtd_minima_atacado: parseInt(document.getElementById('edit-min-at').value) || 1,
        status: document.getElementById('edit-status').value,
        observacoes: document.getElementById('edit-obs').value.trim(),
        url_imagem: url_imagem,
        url_pdf_manual: url_pdf,
        atributos: JSON.stringify(attrsArray)
    };

    showToast("Atualizando produto...");

    const index = appData.products.findIndex(p => (p.id_interno || p.col_A) == originalId);
    if (index !== -1) {
        appData.products[index] = { ...appData.products[index], ...product };
    }

    playBeep('success');
    setTimeout(() => renderEditProductSearch(), 1500);
}
function renderEditProductSearch() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
                    ${getTopBarHTML(currentUser, 'renderProductSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">EDITAR PRODUTO</h2>
                        </div>

                        <div class="search-container" style="background: var(--surface); padding: 20px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                            <div class="input-group" style="margin-bottom: 0;">
                                <label style="margin-bottom: 12px; display: block; font-size: 0.7rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Digite o ID Interno ou EAN para Editar</label>
                                <div style="display: flex; gap: 12px;">
                                    <input type="text" id="edit-search-input" class="product-search-input" style="flex: 1;" placeholder="ID ou EAN..." onkeypress="if(event.key === 'Enter') loadProductToEdit()" oninput="handleEditSearchInput(this)">
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
    const existingAttrs = safeParseAtributos(p.atributos);
    const attrsString = existingAttrs.length > 0 ? JSON.stringify(existingAttrs, null, 2) : '';

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal">
            ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderEditProductSearch()')}

            <main class="container product-form-screen">
                <div class="sub-menu-header">
                    <h2 style="font-size: 1.2rem; font-weight: 700;">EDITAR: ${p.descricao_base || p.id_interno}</h2>
                </div>

                <div class="form-grid">
                    <div class="form-section-title">Identificação</div>
                    <div class="input-group">
                        <label>ID Interno</label>
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
                        <select id="edit-uni" class="input-field">
                            <option value="UN" ${p.unidade === 'UN' ? 'selected' : ''}>UN - Unidade</option>
                            <option value="PC" ${p.unidade === 'PC' ? 'selected' : ''}>PC - Peça</option>
                            <option value="KG" ${p.unidade === 'KG' ? 'selected' : ''}>KG - Quilograma</option>
                            <option value="LT" ${p.unidade === 'LT' ? 'selected' : ''}>LT - Litro</option>
                            <option value="MT" ${p.unidade === 'MT' ? 'selected' : ''}>MT - Metro</option>
                            <option value="JG" ${p.unidade === 'JG' ? 'selected' : ''}>JG - Jogo</option>
                            <option value="KIT" ${p.unidade === 'KIT' ? 'selected' : ''}>KIT - Kit</option>
                            <option value="PAR" ${p.unidade === 'PAR' ? 'selected' : ''}>PAR - Par</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Qtd por Embalagem</label>
                        <input type="number" id="edit-qtd-emb" class="input-field" value="${p.quantidade_embalagem || 1}" min="1">
                    </div>

                    <div class="form-section-title">Atributos Técnicos (JSON)</div>
                    <div class="input-group full-width">
                        <label>Atributos (JSON Array)</label>
                        <textarea id="edit-atributos" class="input-field" style="min-height: 100px; font-family: monospace; font-size: 0.85rem;">${attrsString}</textarea>
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
                    <div class="input-group">
                        <label>Qtd Mínima Atacado</label>
                        <input type="number" id="edit-min-at" class="input-field" value="${p.qtd_minima_atacado || 1}">
                    </div>

                    <div class="form-section-title">Status e Observações</div>
                    <div class="input-group">
                        <label>Status</label>
                        <select id="edit-status" class="input-field" style="width: 100%; appearance: none;">
                            <option value="ativo" ${p.status === 'ativo' ? 'selected' : ''}>Ativo</option>
                            <option value="inativo" ${p.status === 'inativo' ? 'selected' : ''}>Inativo</option>
                        </select>
                    </div>
                    <div class="input-group full-width">
                        <label>Observações</label>
                        <textarea id="edit-obs" class="input-field" style="min-height: 80px; resize: vertical;">${p.observacoes || ''}</textarea>
                    </div>

                    <div class="form-section-title">Mídia e Documentação</div>
                    <div class="input-group full-width">
                        <label>Imagem Atual</label>
                        ${(p.url_imagem || p.image_path) 
                            ? `<div id="edit-img-preview"><img src="${formatImageUrl(p.image_path || p.url_imagem)}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px;"></div>` 
                            : '<span style="color: var(--muted);">Sem imagem</span>'}
                        ${(p.url_imagem || p.image_path) ? `<button type="button" onclick="markRemoveImage()" style="margin-top: 8px; padding: 6px 12px; background: rgba(227,6,19,0.2); border: 1px solid rgba(227,6,19,0.5); border-radius: 6px; color: #E30613; cursor: pointer; font-size: 0.8rem;">Remover imagem</button>` : ''}
                        <input type="file" id="edit-img-file" class="input-field" accept="image/*" style="margin-top: 8px;">
                    </div>
                    <div class="input-group full-width">
                        <label>Manual / PDF Atual</label>
                        ${p.url_pdf_manual || p.manual_path 
                            ? `<div id="edit-pdf-preview"><a href="${getPublicUrl(p.manual_path) || p.url_pdf_manual}" target="_blank" style="color: var(--primary);">Visualizar PDF</a></div>` 
                            : '<span style="color: var(--muted);">Sem PDF</span>'}
                        ${(p.url_pdf_manual || p.manual_path) ? `<button type="button" onclick="markRemovePDF()" style="margin-top: 8px; padding: 6px 12px; background: rgba(227,6,19,0.2); border: 1px solid rgba(227,6,19,0.5); border-radius: 6px; color: #E30613; cursor: pointer; font-size: 0.8rem;">Remover PDF</button>` : ''}
                        <input type="file" id="edit-pdf-file" class="input-field" accept="application/pdf" style="margin-top: 8px;">
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

function toggleConfig(key, btnElement) {
    const current = localStorage.getItem(key) === 'true';
    localStorage.setItem(key, !current);
    btnElement.innerText = !current ? 'ON' : 'OFF';
    btnElement.className = `btn-action ${!current ? 'btn-danger' : 'btn-secondary'}`;
    showToast(`Configuração '${key}' ${!current ? 'ativada' : 'desativada'}.`);
}

function handleBackgroundImageUpload(event, deviceType) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Por favor, selecione uma imagem válida.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;
        const storageKey = deviceType === 'mobile' ? 'loginBackgroundMobile' : 'loginBackgroundDesktop';
        localStorage.setItem(storageKey, base64);
        showToast(`Imagem de fundo ${deviceType} salva! Ir para login para ver.`);
        renderConfigSubMenu();
    };
    reader.onerror = function() {
        showToast('Erro ao ler a imagem.');
    };
    reader.readAsDataURL(file);
}

function handleFontUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const validExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(ext)) {
        showToast('Por favor, selecione um arquivo de fonte válido (TTF, OTF, WOFF, WOFF2).');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const fontData = e.target.result;
        const fontName = 'CustomFont_' + Date.now();
        
        const fontFace = new FontFace(fontName, `url(${fontData})`);
        fontFace.load().then(function(loadedFace) {
            document.fonts.add(loadedFace);
            localStorage.setItem('appFontFamily', fontName);
            localStorage.setItem('appFontData', fontData);
            applyAppFont();
            showToast('Fonte aplicada com sucesso!');
            renderConfigSubMenu();
        }).catch(function(err) {
            showToast('Erro ao carregar fonte: ' + err.message);
        });
    };
    reader.onerror = function() {
        showToast('Erro ao ler a fonte.');
    };
    reader.readAsDataURL(file);
}

function applyAppFont() {
    const fontName = localStorage.getItem('appFontFamily');
    if (fontName) {
        document.documentElement.style.setProperty('--app-font-family', fontName);
    }
}

function updateLoginColor(type, value) {
    localStorage.setItem('login' + type.charAt(0).toUpperCase() + type.slice(1) + 'Color', value);
    showToast('Cor atualizada!');
}

function handleLoginBgImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const maxWidth = 1920;
            const maxHeight = 1080;
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            saveToIndexedDB('loginBgImage', dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function saveToIndexedDB(key, data) {
    const dbName = 'DYAUTO_DB';
    const storeName = 'files';
    
    const request = indexedDB.open(dbName, 1);
    
    request.onerror = function() {
        try {
            localStorage.setItem(key, data);
            showToast('Imagem salva!');
        } catch (e) {
            showToast('Erro ao salvar imagem.');
        }
        renderConfigSubMenu();
    };
    
    request.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
        }
    };
    
    request.onsuccess = function(e) {
        const db = e.target.result;
        try {
            if (!db.objectStoreNames.contains(storeName)) {
                localStorage.setItem(key, data);
                showToast('Imagem salva!');
                renderConfigSubMenu();
                return;
            }
            
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.put(data, key);
            tx.oncomplete = function() {
                showToast('Imagem salva!');
                renderConfigSubMenu();
            };
            tx.onerror = function() {
                try {
                    localStorage.setItem(key, data);
                    showToast('Imagem salva!');
                } catch (e) {
                    showToast('Erro ao salvar imagem.');
                }
                renderConfigSubMenu();
            };
        } catch (err) {
            try {
                localStorage.setItem(key, data);
                showToast('Imagem salva!');
            } catch (e) {
                showToast('Erro ao salvar imagem.');
            }
            renderConfigSubMenu();
        }
    };
}

function loadFromIndexedDB(key, callback) {
    const dbName = 'DYAUTO_DB';
    const storeName = 'files';
    
    const defaultData = null;
    const fallbackData = localStorage.getItem(key);
    
    const request = indexedDB.open(dbName);
    
    request.onerror = function() {
        callback(fallbackData);
    };
    
    request.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
        }
    };
    
    request.onsuccess = function(e) {
        try {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                callback(fallbackData);
                return;
            }
            
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const getRequest = store.get(key);
            
            getRequest.onsuccess = function() {
                const data = getRequest.result;
                callback(data || fallbackData);
            };
            getRequest.onerror = function() {
                callback(fallbackData);
            };
        } catch (err) {
            callback(fallbackData);
        }
    };
}

function removeLoginBgImage() {
    localStorage.removeItem('loginBackgroundDesktop');
    localStorage.removeItem('loginBackgroundMobile');
    showToast('Imagem de fundo removida!');
    renderConfigSubMenu();
}

function resetLoginVisual() {
    localStorage.removeItem('loginBgColor');
    localStorage.removeItem('loginTextColor');
    localStorage.removeItem('loginCardColor');
    localStorage.removeItem('loginBackgroundDesktop');
    localStorage.removeItem('loginBackgroundMobile');
    window.loginCustomBgImage = null;
    
    const request = indexedDB.deleteDatabase('DYAUTO_DB');
    request.onsuccess = function() {
        showToast('Visual resetado para padrão!');
        renderConfigSubMenu();
    };
    request.onerror = function() {
        showToast('Visual resetado para padrão!');
        renderConfigSubMenu();
    };
}

function applyLoginStyles() {
    const bgColor = localStorage.getItem('loginBgColor');
    const textColor = localStorage.getItem('loginTextColor');
    const cardColor = localStorage.getItem('loginCardColor');
    
    if (bgColor) document.documentElement.style.setProperty('--login-bg-color', bgColor);
    if (textColor) document.documentElement.style.setProperty('--login-text-color', textColor);
    if (cardColor) document.documentElement.style.setProperty('--login-card-color', cardColor);
}

function adjustColor(color, amount) {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function renderFinanceiroSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
        </div>
    `;
}


function getChannelConfig(label) {
    const l = String(label).toUpperCase();
    if (l.includes('FLEX')) return { icon: 'bolt', color: 'flex', svgIcon: channel3DIcons.flex };
    if (l.includes('SHOPEE')) return { icon: 'shopping_bag', color: 'shopee', svgIcon: channel3DIcons.shopee };
    if (l.includes('MERCADO') || l.includes('ML')) return { icon: 'local_shipping', color: 'ml', svgIcon: channel3DIcons.ml };
    if (l.includes('MAGALU')) return { icon: 'inventory_2', color: 'magalu', svgIcon: channel3DIcons.magalu };
    if (l.includes('AMAZON')) return { icon: 'shopping_cart', color: 'amazon', svgIcon: channel3DIcons.amazon || channel3DIcons.pdv };
    if (l.includes('CORREIOS')) return { icon: 'mail', color: 'correios', svgIcon: channel3DIcons.correios };
    if (l.includes('ULTRA')) return { icon: 'speed', color: 'ultra', svgIcon: channel3DIcons.ultra };
    if (l.includes('FULL')) return { icon: 'flash_on', color: 'full', svgIcon: channel3DIcons.full };
    if (l.includes('PDV') || l.includes('BALCÃO')) return { icon: 'store', color: 'pdv', svgIcon: channel3DIcons.pdv };
    return { icon: 'storefront', color: 'pdv', svgIcon: channel3DIcons.pdv };
}

async function renderPickMenu() {
    const currentUser = localStorage.getItem('currentUser');
    document.body.classList.remove('menu-active');
    
    // Garantir carregamento real do Supabase
    await ensureCanaisLoaded();
    
    console.log(`[CANAIS DEBUG] Renderizando canais vindos do Supabase: ${appData.channels.length}`);

    let channels = appData.channels.map(c => {
        const label = c.nome || c.col_B || '';
        const id = c.canal_id || c.col_A || '';
        const type = c.tipo || c.col_C || '';
        const config = getChannelConfig(label);
        return {
            ...config,
            id: id,
            label: label,
            type: type
        };
    });

    if (channels.length === 0) {
        app.innerHTML = `
            <div class="dashboard-screen fade-in internal picking-screen">
                ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderMenu()')}
                <main class="container" style="display: flex; align-items: center; justify-content: center; height: 60vh;">
                    <div style="text-align: center; color: var(--muted);">
                        <span class="material-symbols-rounded" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;">block</span>
                        <p>Nenhum canal cadastrado</p>
                    </div>
                </main>
            </div>
        `;
        return;
    }

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal picking-screen">
                    ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderMenu()')}

                    <main class="container">
                        <div class="menu-grid">
                            ${channels.map(item => `
                                <div class="menu-card" onclick="startPickingSession('${item.id}', '${item.label}', '${item.color}')">
                                    <span class="menu-icon-3d">${item.svgIcon || `<span class="material-symbols-rounded">${item.icon}</span>`}</span>
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
                <div class="dashboard-screen fade-in internal picking-screen">
                    ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderPickMenu()')}

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

function startPickingSession(channelId, channelLabel, channelColor) {
    const currentUser = localStorage.getItem('currentUser');
    const draftStr = localStorage.getItem('draft_pick_session');
    if (draftStr) {
        const draft = JSON.parse(draftStr);
        // Se o rascunho for do MESMO canal, retoma direto
        if (draft.channelColor === channelColor || draft.channelId === channelId) {
            currentSessionItems = draft.items || [];
            renderPickingScreen(draft.sessionId, draft.channelId, draft.channelLabel, draft.channelColor);
            updatePickItemsList();
            return;
        } else {
            // Se o rascunho for de OUTRO canal, oferece Retomar ou Limpar
            const msg = `Sessão ativa detectada em ${draft.channelLabel}.\n\nPara iniciar em ${channelLabel}, você deve descartar o rascunho anterior.\n\nDeseja LIMPAR o rascunho de ${draft.channelLabel} e começar ${channelLabel}?`;
            if (confirm(msg)) {
                localStorage.removeItem('draft_pick_session');
                // Segue para criação de nova sessão abaixo
            } else {
                // Se não quiser limpar, oferece retomar o antigo
                if (confirm(`Deseja RETOMAR a sessão de ${draft.channelLabel} agora?`)) {
                    currentSessionItems = draft.items || [];
                    renderPickingScreen(draft.sessionId, draft.channelId, draft.channelLabel, draft.channelColor);
                    updatePickItemsList();
                }
                return;
            }
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
        sessionId, channelId, channelLabel, channelColor, items: [],
        operatorId: currentUser, status: 'in_progress', timestamp: now.toISOString()
    }));

    renderPickingScreen(sessionId, channelId, channelLabel, channelColor);
}

// Global currentSessionItems moved to top for hoisting safety
function renderPickingScreen(sessionId, channelId, channelLabel, channelColor) {
    const currentUser = localStorage.getItem('currentUser');
    
    // Fallback absoluto para rótulos
    const safeLabel = channelLabel && channelLabel !== 'undefined' ? channelLabel : 'CANAIS';

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal picking-screen">
                    ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderPickMenu()')}

                    <main class="container" style="padding: 16px;">
                        <div class="sub-menu-header" style="flex-direction: column; align-items: flex-start; gap: 4px; margin-bottom: 20px;">
                            <div style="font-size: 0.7rem; color: #EF2B2D; font-weight: 950; letter-spacing: 0.1em; text-transform: uppercase;">SEPARAÇÃO • ${safeLabel}</div>
                            <h2 style="font-size: 1.5rem; font-weight: 950; color: #FFFFFF;">${sessionId || 'NOVA SESSÃO'}</h2>
                        </div>

                        <div class="op-card" style="padding: 20px !important; margin-bottom: 20px; border: 2px solid #27272A !important;">
                            <div class="op-label" style="margin-bottom: 12px; font-weight: 900; color: #EF2B2D !important;">ESCANEAR PRODUTO</div>
                            <div style="display: flex; gap: 10px;">
                                <input type="text" id="pick-ean-input" class="op-input" placeholder="BIPE OU DIGITE O CÓDIGO" onkeypress="if(event.key === 'Enter') addPickItem()">
                                <button class="btn-action" style="padding: 0 16px; min-width: auto; background: #EF2B2D; border-radius: 10px;" onclick="startScanner(true)">
                                    <span class="material-symbols-rounded" style="font-size: 26px;">qr_code_scanner</span>
                                </button>
                            </div>

                            <div id="scanner-container-pick" class="hidden" style="margin-top: 16px; overflow: hidden; border-radius: 14px; border: 3px solid #EF2B2D; background: #09090B; position: relative;">
                                <div id="reader-pick" style="width: 100%;"></div>
                                <div id="scanner-feedback" style="position: absolute; inset: 0; z-index: 5; display: none; align-items: center; justify-content: center; pointer-events: none;">
                                    <div id="scanner-feedback-icon" class="material-symbols-rounded" style="font-size: 80px; color: white; text-shadow: 0 0 20px rgba(0,0,0,0.5);"></div>
                                </div>
                                <div style="position: absolute; top: 10px; right: 10px; z-index: 10;">
                                    <button class="btn-action btn-secondary" style="padding: 8px; min-width: auto; border-radius: 50%;" onclick="stopScanner()">
                                        <span class="material-symbols-rounded">close</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div id="pick-items-list" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">
                            <div class="op-card" style="text-align: center; padding: 40px !important; border: 1px dashed rgba(255,255,255,0.1) !important;">
                                <span class="material-symbols-rounded" style="font-size: 48px; color: #52525B; margin-bottom: 12px;">inventory_2</span>
                                <p style="color: #71717A; font-weight: 700; font-size: 0.9rem;">NENHUM ITEM NA CAIXA</p>
                            </div>
                        </div>

                        <button class="btn-action" style="width: 100%; justify-content: center; padding: 18px; font-size: 1rem; font-weight: 950; letter-spacing: 0.05em; background: #22C55E; border-radius: 14px;" onclick="finishPickingSession('${sessionId}', '${channelId}', '${channelLabel}', '${channelColor}')">
                            <span class="material-symbols-rounded" style="font-size: 24px;">check_circle</span>
                            FINALIZAR SEPARAÇÃO
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
                showToast(`⚠️  AVISO: Estoque negativo para ${product.descricao_base || 'este item'}`);
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
                    <div class="op-card" style="text-align: center; padding: 40px !important; border: 1px dashed rgba(255,255,255,0.1) !important;">
                        <span class="material-symbols-rounded" style="font-size: 48px; color: #52525B; margin-bottom: 12px;">inventory_2</span>
                        <p style="color: #71717A; font-weight: 700; font-size: 0.9rem;">NENHUM ITEM NA CAIXA</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = currentSessionItems.map((item, index) => `
                <div class="op-card fade-in" style="display: flex; align-items: center; gap: 14px; padding: 12px 16px !important; border-left: 4px solid #EF2B2D !important;">
                    <div style="flex: 1; min-width: 0;">
                        <div class="op-value" style="font-size: 0.95rem; color: #FFFFFF; margin-bottom: 4px; font-weight: 700; line-height: 1.2;">${item.descricao_base || 'ITEM SEM DESCRIÇÃO'}</div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <div class="op-badge-grey" style="font-size: 0.55rem; padding: 2px 6px !important;">${item.ean || '-'}</div>
                            <div class="op-label" style="font-size: 0.55rem; color: #71717A;">${item.scanTime || ''}</div>
                        </div>
                    </div>
                    <div style="background: #EF2B2D; color: #FFFFFF; font-size: 1.4rem; font-weight: 950; min-width: 44px; text-align: center; padding: 4px 8px; border-radius: 8px; line-height: 1;">${item.qty}</div>
                    <button onclick="removePickItem(${index})" style="background: rgba(220, 38, 38, 0.15); border: 1px solid rgba(220, 38, 38, 0.3); color: #FCA5A5; width: 40px; height: 40px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <span class="material-symbols-rounded" style="font-size: 20px;">delete</span>
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


async function finishPickingSession(sessionId, channelId, channelLabel, channelColor) {
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
            separacao_id: sessionId,
            canal_id: channelId,
            canal_nome: channelLabel,
            data_separacao: new Date().toLocaleDateString('pt-BR'),
            status: 'em_separacao',
            criado_por: currentUser,
            criado_em: now,
            finalizado_em: now,
            data_hora: now,
            observacao: modoRapidoAtivo ? 'SAIDA_RAPIDA AUTOMATICA' : ''
        };

        const groupedItems = currentSessionItems.reduce((acc, item) => {
            const key = item.ean || item.id_interno || item.sku_fornecedor || 'unknown';
            if (!acc[key]) acc[key] = { ...item, qty: 0 };
            acc[key].qty += (item.qty || 1);
            return acc;
        }, {});

        const conferenceRows = Object.values(groupedItems).map(item => ({
            separacao_id: sessionId,
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

        // [NOVO FLUXO]: Bloqueio de Divergência se houver lista carregada
        currentPickSession = session;
        renderPickResult(sessionId, channelId, channelLabel, channelColor);


    } catch (error) {
        console.error("Error preparing picking result:", error);
        showToast("Erro ao processar separação!");
    } finally {
        isFinalizing = false;
        const submitBtn = document.querySelector(`button[onclick^="finishPickingSession"]`);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<span class="material-symbols-rounded">check_circle</span> Finalizar Separação'; }
    }
}

function renderPickResult(sessionId, channelId, channelLabel, channelColor) {
    const currentUser = localStorage.getItem('currentUser');
    const hasDivergence = currentPickSession && currentPickSession.divergence;

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal picking-screen">
            ${getTopBarHTML(localStorage.getItem('currentUser'), `renderPickingScreen('${sessionId}', '${channelId}', '${channelLabel}', '${channelColor}')`)}

            <main class="container" style="padding: 16px;">
                <div class="sub-menu-header" style="flex-direction: column; align-items: flex-start; gap: 4px; margin-bottom: 20px;">
                    <div style="font-size: 0.7rem; color: var(--primary); font-weight: 950; letter-spacing: 0.1em; text-transform: uppercase;">REVISÃO DE SEPARAÇÃO • ${channelLabel}</div>
                    <h2 style="font-size: 1.5rem; font-weight: 950; color: white;">${sessionId}</h2>
                </div>

                <div class="op-card" style="margin-bottom: 24px; text-align: center; padding: 30px !important;">
                    <span class="material-symbols-rounded" style="font-size: 56px; color: var(--primary); margin-bottom: 12px;">fact_check</span>
                    <h3 style="font-size: 1.2rem; font-weight: 950; color: white; margin-bottom: 4px;">CONFERÊNCIA FINAL</h3>
                    <p style="color: #94A3B8; font-size: 0.8rem; font-weight: 700;">VALIDE OS ITENS ANTES DE SALVAR A SESSÃO</p>
                </div>



                <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px;">
                    <div class="op-label" style="padding-left: 8px;">ITENS NA CAIXA (${currentPickSession.items.length})</div>
                    ${currentPickSession.items.map((item, index) => `
                        <div class="op-card fade-in" style="padding: 12px 16px !important;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                                <div style="flex: 1; min-width: 0;">
                                    <div class="op-value" style="font-size: 0.95rem; margin-bottom: 2px;">${item.descricao_base || item.col_aa || 'SEM DESCRIÇÃO'}</div>
                                    <div class="op-badge-grey" style="font-size: 0.6rem;">EAN: ${item.ean}</div>
                                </div>
                            </div>
                            
                            <div style="display: flex; align-items: center; justify-content: space-between; background: #000; padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                                <div class="op-label">QTDE COLETADA:</div>
                                <div style="display: flex; align-items: center; gap: 20px;">
                                    <button onclick="adjustPickRow(${index}, -1, '${sessionId}', '${channelId}', '${channelLabel}', '${channelColor}')" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: #1a1a24; color: white; cursor: pointer;">
                                        <span class="material-symbols-rounded">remove</span>
                                    </button>
                                    <div class="op-qty-highlight" style="font-size: 1.5rem;">${item.qty}</div>
                                    <button onclick="adjustPickRow(${index}, 1, '${sessionId}', '${channelId}', '${channelLabel}', '${channelColor}')" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: #1a1a24; color: white; cursor: pointer;">
                                        <span class="material-symbols-rounded">add</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                    
                    <button class="btn-action" style="width: 100%; border: 2px dashed var(--primary); background: transparent; color: var(--primary); font-weight: 900;" onclick="openManualAddProductToSession('${sessionId}', 'PICK')">
                        <span class="material-symbols-rounded">add_circle</span>
                        ADICIONAR ITEM MANUALMENTE
                    </button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                    ${!hasDivergence ? `
                    <button class="btn-action" style="background: #22c55e; padding: 20px; font-weight: 950; font-size: 1.1rem;" onclick="savePickResultFinal('${sessionId}', '${channelId}', '${channelLabel}', '${channelColor}')">
                        <span class="material-symbols-rounded" style="font-size: 28px;">done_all</span>
                        CONFIRMAR E SALVAR
                    </button>
                    ` : `
                    <div style="text-align: center; color: #ef4444; padding: 24px; background: rgba(239, 68, 68, 0.1); border-radius: 16px; border: 3px solid #ef4444;">
                        <span class="material-symbols-rounded" style="font-size: 40px; margin-bottom: 8px; display: block;">lock</span>
                        <div style="font-size: 1.2rem; font-weight: 950; letter-spacing: 0.1em; margin-bottom: 4px;">OPERAÇÃO BLOQUEADA</div>
                        <p style="font-weight: 700; opacity: 0.8; font-size: 0.85rem;">Divergência detectada entre bipagem e pedido.</p>
                    </div>
                    `}
                    <button class="btn-action btn-secondary" style="padding: 16px; font-weight: 800; opacity: 0.7;" onclick="renderPickingScreen('${sessionId}', '${channelId}', '${channelLabel}', '${channelColor}')">
                        <span class="material-symbols-rounded">arrow_back</span>
                        Voltar para Bipagem
                    </button>
                </div>
            </main>
        </div>
    `;
}


function adjustPickRow(index, delta, sessionId, channelId, channelLabel, channelColor) {
    const item = currentPickSession.items[index];
    item.qty = Math.max(0, item.qty + delta);
    if (item.qty === 0) {
        currentPickSession.items.splice(index, 1);
    }
    currentSessionItems = currentPickSession.items;
    localStorage.setItem('draft_pick_session', JSON.stringify({
        sessionId, channelId, channelLabel, channelColor, items: currentSessionItems,
        timestamp: new Date().toISOString()
    }));
    renderPickResult(sessionId, channelId, channelLabel, channelColor);
}

async function savePickResultFinal(sessionId, channelId, channelLabel, channelColor) {
    if (isFinalizing) return;
    isFinalizing = true;
    showToast("Finalizando separação...");

    try {
        const currentUser = localStorage.getItem('currentUser');
        const now = new Date().toISOString();
        const pickingData = { ...currentPickSession.pickingData, status: 'aberta' };

        console.log("[savePickResultFinal] currentPickSession.items:", currentPickSession.items);

        // Preparar itens para salvamento em lote
        const itemsToSave = currentPickSession.items.map(item => ({
            separacao_id: sessionId,
            id_interno: item.id_interno || '',
            ean: item.ean || '',
            descri_ao: item.descricao_base || item.col_aa || '', // Mantendo compatibilidade com header normalizado
            quantidade: item.qty || 1,
            usuario: currentUser,
            data_hora: now
        }));

        console.log("[savePickResultFinal] itemsToSave:", JSON.stringify(itemsToSave, null, 2));

        if (SCRIPT_URL) {
            // 1. Salvar cabeçalho
            console.log("[savePickResultFinal] Salvando cabeçalho separacao:", pickingData);
            await safePost({
                action: 'append',
                sheet: 'separacao',
                data: pickingData
            });

            // 2. Salvar itens em lote
            console.log("[savePickResultFinal] Salvando itens em separacao_itens:", itemsToSave.length, "itens");
            const result = await safePost({
                action: 'batch_append',
                sheet: 'separacao_itens',
                data: itemsToSave
            });
            console.log("[savePickResultFinal] Result do batch_append:", result);

            // [OTIMISMO]: Atualizar appData local para que o card apareça instantaneamente
            if (!appData.separacao) appData.separacao = [];
            // Adicionar ao início para aparecer primeiro
            appData.separacao.unshift({
                ...pickingData,
                separacao_id: sessionId,
                canal_nome: channelLabel,
                data_separacao: now.split('T')[0],
                status: 'aberta'
            });
        }

        localStorage.removeItem('draft_pick_session');
        showToast(`Separação ${sessionId} finalizada e enviada para conferência!`);
        renderMenu();
    } catch (e) {
        console.error("Erro ao finalizar pick:", e);
        showToast("Erro ao salvar finalização!");
    } finally {
        isFinalizing = false;
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

    // Filtrar sessões pendentes (status 'aberta' ou 'em_conferencia') vindas da planilha ou otimismo
    const activeSessions = (appData.separacao || []).filter(s => {
        const st = String(s.status || '').toLowerCase();
        return st === 'aberta' || st === 'em_conferencia' || st === 'aberto';
    });

    // Group sessions by channel
    const channelsWithSessions = [];
    const channelMap = {};

    activeSessions.forEach(s => {
        const channelName = s.canal_nome || s.col_c || s.canal || 'Outros';
        const channelId = s.separacao_id || s.col_a;
        if (!channelMap[channelName]) {
            channelMap[channelName] = {
                name: channelName,
                color: getChannelConfig(channelName).color,
                icon: getChannelConfig(channelName).icon,
                count: 0
            };
            channelsWithSessions.push(channelMap[channelName]);
        }
        channelMap[channelName].count++;
    });

        app.innerHTML = `
                <div class="dashboard-screen fade-in internal pack-screen">
                    ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderMenu()')}

                    <main class="container">
                        
                        ${channelsWithSessions.length === 0 ? '' : `
                            <div class="menu-grid">
                                ${channelsWithSessions.map(chan => `
                                    <div class="menu-card" onclick="renderPackSessionsList('${chan.name}')">
                                        <span class="menu-icon-3d">${getChannelConfig(chan.name).svgIcon || `<span class="material-symbols-rounded">${chan.icon}</span>`}</span>
                                        <span class="label">${chan.name}</span>
                                        <div class="badge" style="position: relative; top: 0; right: 0; margin-top: 5px;">${chan.count} Pendentes</div>
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
                <div class="dashboard-screen fade-in internal">
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
    const activeSessions = (appData.separacao || []).filter(s => {
        const chan = s.canal_nome || s.col_c || s.canal || 'Outros';
        const st = String(s.status || '').toLowerCase();
        return chan === channelName && (st === 'aberta' || st === 'em_conferencia' || st === 'aberto');
    });

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
                    ${getTopBarHTML(currentUser, 'renderPackMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">SESSÕES: ${channelName}</h2>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            ${activeSessions.map(session => {
                                const sid = session.separacao_id || session.col_a;
                                const user = session.criado_por || session.col_e || 'N/A';
                                return `
                                <div class="menu-card" style="flex-direction: row; align-items: center; justify-content: space-between; padding: 16px 20px; height: auto; cursor: default;">
                                    <div style="text-align: left; flex: 1; cursor: pointer;" onclick="renderPackSessionDetails('${sid}')">
                                        <div style="font-weight: 800; color: white; display: flex; align-items: center; gap: 8px;">
                                            ${sid}
                                            <span style="font-size: 0.6rem; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; color: var(--muted);">${session.status.toUpperCase()}</span>
                                        </div>
                                        <div style="font-size: 0.7rem; color: var(--muted); margin-top: 4px;">Separado por: ${user}</div>
                                    </div>
                                    <div style="display: flex; gap: 8px;">
                                        <button class="btn-action" style="padding: 8px; min-width: auto; background: var(--primary); border-radius: 12px;" onclick="renderPackSessionDetails('${sid}')" title="Conferir">
                                            <span class="material-symbols-rounded" style="font-size: 20px;">fact_check</span>
                                        </button>
                                    </div>
                                </div>
                                `;
                            }).join('')}
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

// Global Session State moved to top for hoisting safety
async function renderPackSessionDetails(sessionId) {
    const currentUser = localStorage.getItem('currentUser');
    
    // Verificar se o mesmo usuário que fez a Separação está tentando fazer a Conferência
    const separacaoSession = (appData.separacao || []).find(s => 
        (s.separacao_id || s.col_a) === sessionId
    );
    
    if (separacaoSession) {
        const criadoPor = (separacaoSession.criado_por || separacaoSession.col_e || '').trim().toLowerCase();
        const usuarioAtual = (currentUser || '').trim().toLowerCase();
        
        if (criadoPor && criadoPor === usuarioAtual) {
            showToast("Esta conferência deve ser realizada por outro usuário. O mesmo usuário que fez a separação não pode conferir esta sessão.", "error");
            playBeep('error');
            return;
        }
    }
    
    // Extrair o canal para manter a cor na conferência
    const channelName = separacaoSession ? (separacaoSession.canal_nome || separacaoSession.col_d || '') : '';
    const channelConfig = getChannelConfig(channelName);
    const channelColorClass = channelConfig.color || '';

    // INICIALIZAR SESSÃO IMEDIATAMENTE para permitir bipagem sem depender de sync
    currentPackSession = session || {
        id: sessionId,
        items: [],
        pickingData: { separacao_id: sessionId, canal_nome: channelName },
        conferenceRows: []
    };
    
    // 0. Renderizar a Moldura Imediatamente com sessão inicializada
    renderPackSessionFrame(sessionId, currentUser, channelColorClass);

    // 1. Buscar itens da planilha em BACKGROUND (não bloqueante)
    try {
        const [itemsRes] = await Promise.all([
            safeGet(`action=find&sheet=separacao_itens&field=separacao_id&value=${sessionId}`)
        ]);

        const expectedItems = itemsRes.data || [];
        
        // Reconstruir conferenceRows baseando-se no que está na planilha
        const groupedExpected = expectedItems.reduce((acc, item) => {
            const key = item.ean || item.id_interno;
            if (!acc[key]) acc[key] = { ...item, qtd_separada: 0, qtd_conferida: 0 };
            acc[key].qtd_separada += parseFloat(item.quantidade || 0);
            return acc;
        }, {});

        // Se já existia cache local com conferência em andamento, mesclar quantidades
        if (session && session.conferenceRows) {
            session.conferenceRows.forEach(row => {
                const key = row.ean || row.id_interno;
                if (groupedExpected[key]) {
                    groupedExpected[key].qtd_conferida = row.qtd_conferida;
                }
            });
        }

        currentPackSession = {
            id: sessionId,
            items: expectedItems,
            pickingData: {
                separacao_id: sessionId,
                canal_nome: expectedItems.length > 0 ? (expectedItems[0].canal_nome || sessionId.split('-')[1] || '') : ''
            },
            conferenceRows: Object.values(groupedExpected)
        };

        // Salvar no local para persistência de sessão ativa
        if (!session) {
            activeSessions.push(currentPackSession);
        } else {
            const idx = activeSessions.findIndex(s => s.id === sessionId);
            activeSessions[idx] = currentPackSession;
        }
        localStorage.setItem('active_pick_sessions', JSON.stringify(activeSessions));

        // Atualizar lista após carregar dados
        const packList = document.getElementById('pack-items-list');
        if (packList) packList.innerHTML = renderPackItemsListHTML();
        
    } catch (err) {
        console.error("Erro ao carregar sessão:", err);
        showToast("Erro ao carregar dados da planilha.", "error");
    }
}

/**
 * Renderiza apenas a moldura da tela de conferência para resposta imediata
 */
function renderPackSessionFrame(sessionId, currentUser, channelColorClass = '') {
    app.innerHTML = `
        <div class="dashboard-screen fade-in internal ${channelColorClass}">
            ${getTopBarHTML(currentUser, "renderPackMenu()")}

            <main class="container">
                <div class="sub-menu-header" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                    <div style="font-size: 0.7rem; color: var(--primary); font-weight: 800; letter-spacing: 0.1em;">CONFERÊNCIA</div>
                    <h2 style="font-size: 1.2rem; font-weight: 700;">${sessionId}</h2>
                </div>

                <div class="search-container" style="background: var(--surface); padding: 20px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 20px;">
                    <div class="input-group" style="margin-bottom: 0;">
                        <label style="margin-bottom: 12px; display: block; font-size: 0.7rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Bipar ou Digitar EAN para Conferir (às cegas)</label>
                        <div style="display: flex; gap: 12px;">
                            <input type="text" id="pack-ean-input" class="input-field" style="flex: 1;" 
                                   placeholder="EAN do Produto..." 
                                   onkeypress="if(event.key === 'Enter') addPackScan()">
                            <button class="btn-action" style="padding: 0 20px; min-width: auto; background: var(--primary);" onclick="startScanner(false, true)">
                                <span class="material-symbols-rounded">photo_camera</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div id="pack-items-list" style="margin-bottom: 20px;"></div>

                <button class="btn-action" id="btn-finish-pack" style="width: 100%; justify-content: center; padding: 16px; font-size: 1rem; opacity: 0.6; cursor: not-allowed;" onclick="showToast('Aguarde o carregamento...', 'warning')">
                    <span class="material-symbols-rounded">check_circle</span>
                    Finalizar Conferência
                </button>
            </main>
        </div>
    `;
    
    const eanInput = document.getElementById('pack-ean-input');
    if (eanInput) eanInput.focus();
}

function renderPackItemsListHTML() {
    if (!currentPackSession || !currentPackSession.conferenceRows) return '';
    
    // Atualizar estado do botão de finalizar se já carregou
    const btnFinish = document.getElementById('btn-finish-pack');
    if (btnFinish) {
        btnFinish.style.opacity = '1';
        btnFinish.style.cursor = 'pointer';
        btnFinish.setAttribute('onclick', 'finishConferenceSession()');
        const input = document.getElementById('pack-ean-input');
        if (input) input.placeholder = "Bipe o produto...";
    }

    const rowsToShow = currentPackSession.conferenceRows.filter(r => r.qtd_conferida > 0);

    if (rowsToShow.length === 0) {
        return `
            <div style="text-align: center; padding: 40px; color: var(--muted); background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.1);">
                <span class="material-symbols-rounded" style="font-size: 32px; margin-bottom: 12px; display: block; opacity: 0.5;">barcode_scanner</span>
                Nenhum item conferido ainda.<br>Comece a bipar os produtos.
            </div>
        `;
    }

    return rowsToShow.map(row => {
        return `
            <div class="fade-in conference-item" 
                 style="background: var(--surface); 
                        padding: 16px; 
                        border-radius: 16px; 
                        border: 1px solid rgba(255,255,255,0.05); 
                        display: flex; 
                        align-items: center; 
                        gap: 12px;">
                <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                    <span class="material-symbols-rounded" style="color: var(--primary)">inventory_2</span>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 700; font-size: 0.9rem; color: white;">${row.descricao}</div>
                    <div style="font-size: 0.7rem; color: var(--muted); margin-top: 2px;">
                        <span style="color: var(--primary);">EAN:</span> ${row.ean}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.6rem; color: var(--muted); text-transform: uppercase; font-weight: 800;">CONFERIDO</div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button onclick="adjustConferenceRowDirect(${currentPackSession.conferenceRows.indexOf(row)}, -1)" style="width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: white; display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-rounded" style="font-size: 14px;">remove</span>
                        </button>
                        <div style="font-weight: 800; font-size: 1.1rem; color: var(--primary)">
                            ${row.qtd_conferida}
                        </div>
                        <button onclick="adjustConferenceRowDirect(${currentPackSession.conferenceRows.indexOf(row)}, 1)" style="width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: white; display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-rounded" style="font-size: 14px;">add</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function adjustConferenceRowDirect(index, delta) {
    const row = currentPackSession.conferenceRows[index];
    row.qtd_conferida = Math.max(0, row.qtd_conferida + delta);
    
    if (row.qtd_conferida === row.qtd_separada) {
        row.divergencia = 'OK';
    } else if (row.qtd_conferida > row.qtd_separada) {
        row.divergencia = 'SOBRA';
    } else {
        row.divergencia = 'FALTA';
    }
    
    document.getElementById('pack-items-list').innerHTML = renderPackItemsListHTML();
}

/**
 * Fun????o Compartilhada para Busca Manual de Produto
 */
function openManualAddProduct(callback) {
    const term = prompt("Digite o EAN ou C??digo do produto para adicionar:");
    if (!term) return;

    const product = appData.products.find(p =>
        (p.ean && p.ean.toString() === term) ||
        (p.id_interno && p.id_interno.toString() === term) ||
        (p.sku_fornecedor && p.sku_fornecedor.toString() === term)
    );

    if (!product) {
        playBeep('error');
        showToast("Produto n??o encontrado!");
        return;
    }

    playBeep('success');
    callback(product);
}

function openManualAddProductToSession(sessionId, type = 'PACK') {
    openManualAddProduct((product) => {
        if (type === 'PACK') {
            manualAddItemToConference(product);
        } else {
            // L??gica para Separa????o
            const existing = currentSessionItems.find(item => item.ean == product.ean || item.id_interno == product.id_interno);
            if (existing) {
                existing.qty = (existing.qty || 0) + 1;
            } else {
                currentSessionItems.unshift({
                    ...product,
                    qty: 1,
                    scanTime: new Date().toLocaleTimeString()
                });
            }
            updatePickItemsList();
            showToast(`Item adicionado: ${product.descricao_base}`);
            
            if (currentPickSession && currentPickSession.id === sessionId) {
                currentPickSession.items = currentSessionItems;
                renderPickResult(sessionId, currentPickSession.channelId, currentPickSession.channelLabel, currentPickSession.channelColor);
            }
        }
    });
}

function manualAddItemToConference(product) {
    let row = currentPackSession.conferenceRows.find(r => r.ean === product.ean || r.id_interno === product.id_interno);
    if (row) {
        row.qtd_conferida++;
    } else {
        row = {
            separacao_id: currentPackSession.pickingData.separacao_id,
            rom_id: currentPackSession.id,
            id_interno: product.id_interno || '',
            ean: product.ean || '',
            descricao: product.descricao_base || 'Produto Adicionado',
            qtd_separada: 0,
            qtd_conferida: 1,
            divergencia: 'SOBRA'
        };
        currentPackSession.conferenceRows.push(row);
    }
    // Atualizar lista de conferidos
    const packList = document.getElementById('pack-items-list');
    if (packList) packList.innerHTML = renderPackItemsListHTML();
    
    // Atualizar botão de finalizar
    const btnFinish = document.getElementById('btn-finish-pack');
    if (btnFinish) {
        btnFinish.style.opacity = '1';
        btnFinish.style.cursor = 'pointer';
        btnFinish.setAttribute('onclick', 'finishConferenceSession()');
    }
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

/**
 * TELA DE CORREÇÃO DE DIVERGÊNCIA (Obrigatória se houver erro)
 */
function renderConferenceCorrection() {
    const currentUser = localStorage.getItem('currentUser');
    const hasDivergence = currentPackSession.conferenceRows.some(r => r.divergencia !== 'OK');
    const isStarted = currentPackSession.conferenceRows.some(r => r.qtd_conferida > 0);
    
    // [BLOQUEIO DE DIVERG??NCIA] - Somente permitimos finalizar se hasDivergence for false
    
    let conferenceStatus = 'EM CONFER??NCIA';
    if (hasDivergence && isStarted) conferenceStatus = 'COM DIVERG??NCIA';
    if (!hasDivergence) conferenceStatus = 'CONFERIDO';


    // Rolar para o primeiro erro se houver divergência
    if (hasDivergence) {
        setTimeout(() => {
            const firstError = document.querySelector('.conference-item-error');
            if (firstError) {
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstError.style.boxShadow = '0 0 20px rgba(227, 6, 19, 0.3)';
                setTimeout(() => firstError.style.boxShadow = '', 2000);
            }
        }, 300);
    }

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
                    ${getTopBarHTML(currentUser, "renderPackSessionDetails('" + currentPackSession.id + "')")}

                    <main class="container">
                        <div class="sub-menu-header" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="font-size: 0.7rem; color: var(--primary); font-weight: 800; letter-spacing: 0.1em;">RESULTADO DA CONFERÊNCIA</div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <h2 style="font-size: 1.2rem; font-weight: 700;">${currentPackSession.id}</h2>
                                <span class="status-pill" style="background: ${hasDivergence ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'}; color: ${hasDivergence ? '#ef4444' : '#22c55e'}; font-size: 0.6rem; padding: 2px 8px; border-radius: 4px; font-weight: 800; border: 1px solid ${hasDivergence ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'};">
                                    ${conferenceStatus}
                                </span>
                            </div>
                        </div>

                        <div style="margin-bottom: 24px; padding: 20px; border-radius: 20px; background: ${hasDivergence ? 'rgba(239, 68, 68, 0.05)' : 'rgba(34, 197, 94, 0.1)'}; border: 1px solid ${hasDivergence ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}; text-align: center;">
                            <span class="material-symbols-rounded" style="font-size: 48px; color: ${hasDivergence ? '#ef4444' : '#22c55e'}; margin-bottom: 12px;">
                                ${hasDivergence ? 'report' : 'task_alt'}
                            </span>
                            <h3 style="font-size: 1.1rem; font-weight: 700; color: white;">
                                ${hasDivergence ? 'Atenção: Divergência Detectada' : 'Fluxo Validado com Sucesso'}
                            </h3>
                            <p style="font-size: 0.8rem; color: var(--muted); margin-top: 4px;">
                                ${hasDivergence ? 'Há uma diferença entre o separado e o conferido. Ajuste obrigatório para liberar.' : 'Tudo em ordem. O status final será gravado como CONFERIDO.'}
                            </p>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px;">
                            ${currentPackSession.conferenceRows.map((row, index) => {
        if (row.divergencia === 'OK' && !hasDivergence) return ''; // Hide OK rows if everything is OK to keep it clean

        let statusColor = '#ef4444'; // FALTA
        if (row.divergencia === 'OK') statusColor = '#22c55e';
        if (row.divergencia === 'SOBRA') statusColor = '#f59e0b';

        return `
                                    <div class="fade-in ${row.divergencia !== 'OK' ? 'conference-item-error' : ''}" 
                                         id="conf-res-item-${index}"
                                         style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid ${row.divergencia !== 'OK' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.05)'}; transition: all 0.3s ease;">
                                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                                            <div style="width: 32px; height: 32px; background: ${row.divergencia === 'SOBRA' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.05)'}; border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 1px solid ${row.divergencia === 'SOBRA' ? 'rgba(245, 158, 11, 0.2)' : 'transparent'};">
                                                <span class="material-symbols-rounded" style="font-size: 18px; color: ${statusColor}">${row.divergencia === 'OK' ? 'check_circle' : (row.divergencia === 'SOBRA' ? 'priority_high' : 'error')}</span>
                                            </div>
                                            <div style="flex: 1;">
                                                <div style="font-weight: 700; font-size: 0.85rem; color: white;">${row.descricao}</div>
                                                <div style="font-size: 0.65rem; color: var(--muted);">EAN: ${row.ean}</div>
                                            </div>
                                            <div style="text-align: right; font-size: 0.7rem; font-weight: 900; color: ${statusColor}; background: ${statusColor}1A; padding: 2px 8px; border-radius: 4px;">
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
                        
                        ${hasDivergence ? `
                        <div style="margin: 20px 0; padding: 16px; background: rgba(234, 179, 8, 0.1); border-radius: 12px; border: 1px solid rgba(234, 179, 8, 0.3); text-align: center;">
                            <p style="color: #facc15; font-weight: 600; margin-bottom: 16px;">Deseja corrigir as divergências?</p>
                            <button onclick="confirm('Clique OK para confirmar a correção e prosseguir') && renderConferenceCorrection()" class="btn-action" style="width: 100%; background: #f59e0b;">
                                <span class="material-symbols-rounded">edit</span>
                                CORRIGIR E CONTINUAR
                            </button>
                        </div>
                        ` : ''}
                        
                        <!-- Botão Adicionar Produto Extra -->
                        <button onclick="openManualAddProductToSession('${currentPackSession.id}', 'PACK')" class="btn-action" style="width: 100%; border: 1px dashed var(--primary); background: transparent; margin-bottom: 20px;">
                            <span class="material-symbols-rounded">add_circle</span>
                            Adicionar Produto
                        </button>

                        <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                            <button class="btn-action" style="width: 100%; justify-content: center; background: var(--surface);" onclick="renderPackSessionDetails('${currentPackSession.id}')">
                                <span class="material-symbols-rounded">barcode_scanner</span>
                                VOLTAR PARA BIPAGEM
                            </button>
                            
                            <button class="btn-action" id="btn-finish-atomic"
                                    style="width: 100%; justify-content: center; background: #22c55e; ${hasDivergence ? 'opacity: 0.5; cursor: not-allowed;' : ''}" 
                                    ${hasDivergence ? 'disabled onclick="showToast(\'Corrija as divergências para finalizar\', \'warning\')"' : 'onclick="confirmFinishConference()"'}>
                                <span class="material-symbols-rounded">check_circle</span>
                                FINALIZAR E DAR BAIXA
                            </button>

                            ${hasDivergence ? `
                            <div style="text-align: center; color: #ef4444; font-size: 0.75rem; font-weight: 800; padding: 18px; background: rgba(239, 68, 68, 0.1); border-radius: 12px; border: 2px solid rgba(239, 68, 68, 0.3);">
                                <span class="material-symbols-rounded" style="vertical-align: middle; font-size: 24px; margin-bottom: 8px; display: block;">lock_clock</span>
                                <span style="display: block; font-size: 1rem; letter-spacing: 0.1em;">CORREÇÃO PENDENTE</span>
                                <p style="font-weight: 500; margin-top: 4px; opacity: 0.8;">Ajuste as quantidades para baterem com o esperado.</p>
                            </div>
                            ` : ''}
                        </div>
                    </main>
                </div>
            `;
}

function adjustConferenceRow(index, delta) {
    const row = currentPackSession.conferenceRows[index];
    const prevDivergence = row.divergencia;
    row.qtd_conferida = Math.max(0, row.qtd_conferida + delta);

    // Update divergence
    if (row.qtd_conferida === row.qtd_separada) {
        row.divergencia = 'OK';
    } else if (row.qtd_conferida > row.qtd_separada) {
        row.divergencia = 'SOBRA';
    } else {
        row.divergencia = 'FALTA';
    }

    // Registrar log interno caso tenha corrigido uma divergência
    if (prevDivergence !== 'OK' && row.divergencia === 'OK') {
        const logEntry = {
            timestamp: new Date().toISOString(),
            session: currentPackSession.id,
            item: row.ean,
            description: row.descricao,
            action: 'RECONCILIAÇÃO',
            from: prevDivergence,
            original_qtd: row.qtd_separada,
            final_qtd: row.qtd_conferida,
            user: localStorage.getItem('currentUser')
        };
        const logs = JSON.parse(localStorage.getItem('conference_correction_logs') || '[]');
        logs.push(logEntry);
        localStorage.setItem('conference_correction_logs', JSON.stringify(logs));
        console.log('Divergência corrigida logada:', logEntry);
    }

    // Persistência imediata no localStorage para evitar perda em F5
    let activeSessions = JSON.parse(localStorage.getItem('active_pick_sessions') || '[]');
    const sIndex = activeSessions.findIndex(s => s.id === currentPackSession.id);
    if (sIndex !== -1) {
        activeSessions[sIndex] = currentPackSession;
        localStorage.setItem('active_pick_sessions', JSON.stringify(activeSessions));
    }

    renderConferenceCorrection();
}

async function finishConferenceSession() {
    // 1. Validar se há divergência (Comparação de Ouro)
    const hasDivergence = currentPackSession.conferenceRows.some(row => 
        parseFloat(row.qtd_conferida || 0) !== parseFloat(row.qtd_separada || 0)
    );

    if (hasDivergence) {
        showToast("Divergência detectada! Abrindo tela de correção.", "warning");
        playBeep('error');
        renderConferenceCorrection();
    } else {
        // Se bater 100%, já oferece finalizar
        if (confirm("Conferência perfeita! Deseja finalizar e dar baixa no estoque agora?")) {
            await confirmFinishConference();
        } else {
            renderConferenceCorrection(); // Mostra o resumo mesmo assim
        }
    }
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
            separacao_id: sessionId,
            canal_id: channelColor || '',
            canal_nome: channelLabel,
            data_separacao: todayStr,
            status: 'rascunho',
            criado_por: currentUser,
            criado_em: now.toISOString(),
            finalizado_em: now.toISOString(), data_hora: now.toISOString(),
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

    const btn = document.getElementById('btn-finish-atomic');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-rounded spin">sync</span> BAIXANDO...';
    }

    try {
        const currentUser = localStorage.getItem('currentUser');
        const sessionId = currentPackSession.id;

        // Formatar linhas para o backend processar movimentos atomicos
        const rows = currentPackSession.conferenceRows.map(row => ({
            id_interno: row.id_interno,
            ean: row.ean,
            descricao: row.descricao,
            qtd_separada: row.qtd_separada,
            qtd_conferida: row.qtd_conferida,
            separacao_id: sessionId
        }));

        await safePost({
            action: 'finalizar_conferencia',
            sessionId: sessionId,
            user: currentUser,
            rows: rows
        });

        showToast("Conferência finalizada e estoque baixado!");
        playBeep('success');

        // Limpar sessões locais e cache
        localStorage.removeItem('draft_pack_session');
        let activeSessions = JSON.parse(localStorage.getItem('active_pick_sessions') || '[]');
        activeSessions = activeSessions.filter(s => s.id !== sessionId);
        localStorage.setItem('active_pick_sessions', JSON.stringify(activeSessions));

        // Atualizar appData local com status final para não aparecer mais como pendente
        const sIdx = (appData.separacao || []).findIndex(s => (s.separacao_id || s.col_a) === sessionId);
        if (sIdx !== -1) {
            appData.separacao[sIdx].status = 'finalizada'; // ou 'conferido' conforme o backend
        }

        renderMenu();
    } catch (err) {
        console.error("Erro na finalização:", err);
        showToast("Erro ao finalizar conferência.", "error");
    } finally {
        isFinalizing = false;
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    }
}



async function backFromConference() {
    renderPackMenu();
}

function handleMenuClick(label) {
    console.log('Menu clicked:', label);
}

function toggleQuickActions() {
    const menu = document.getElementById('quick-actions-menu');
    const overlay = document.getElementById('quick-actions-overlay');
    const icon = document.getElementById('quick-action-icon');
    
    if (menu) {
        const isHidden = menu.classList.contains('hidden');
        
        if (isHidden) {
            menu.classList.remove('hidden');
            if (overlay) overlay.classList.remove('hidden');
            if (icon) icon.textContent = 'close';
        } else {
            menu.classList.add('hidden');
            if (overlay) overlay.classList.add('hidden');
            if (icon) icon.textContent = 'add';
        }
    }
}

function startFastMode() {
    console.log('[FastMode] Iniciando modo rápido...');
    localStorage.setItem('config_modo_rapido', 'true');
    ensureFreshData(() => renderPickMenu());
}

function stopFastMode() {
    console.log('[FastMode] Desativando modo rápido...');
    localStorage.setItem('config_modo_rapido', 'false');
    renderMenu();
}

function quickActionNewMov() {
    toggleQuickActions();
    renderMovimentacoesSubMenu();
}

function quickActionEntrada() {
    toggleQuickActions();
    ensureFreshData(() => renderPickMenu());
}

function quickActionSaida() {
    toggleQuickActions();
    ensureFreshData(() => renderPickMenu());
}

function quickActionAjuste() {
    toggleQuickActions();
    renderInventarioSubMenu();
}

function quickActionNovoProduto() {
    toggleQuickActions();
    renderProductSubMenu();
}

// renderSearchScreen (versão operacional unificada no topo do arquivo)





/**
 * KIT LÂMPADA - Módulo de consulta de veículos (Supabase)
 */

function safeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}


async function ensureKitLampadaLoaded(force = false) {
    if (!force && Array.isArray(window.kitLampadaCache) && window.kitLampadaCache.length > 0) {
        console.log('[KIT] cache já existe:', window.kitLampadaCache.length);
        return window.kitLampadaCache;
    }

    console.log('[KIT] abrindo tela kit_lampada');
    console.log('[KIT] supabaseClient existe?', !!window.supabaseClient);

    const client = window.supabaseClient;
    if (!client) {
        console.error('[KIT] Supabase client não inicializado');
        return [];
    }
    
    try {
        const { data, error } = await client
            .from('kit_lampada')
            .select('*')
            .order('kit_lampada_id', { ascending: true });

        console.log('[KIT] data:', data);
        console.log('[KIT] error:', error);
        console.log('[KIT] total recebido:', data?.length || 0);

        if (error) {
            console.error('[KIT] erro ao buscar:', error);
            throw error;
        }

        const rows = data || [];
        if (rows.length === 0) {
            console.warn('[KIT] Nenhum dado retornado. Verifique RLS/policy da tabela kit_lampada.');
        }
        
        const normalizedRows = rows.map(item => ({
            ...item,
            _search: safeText([
                item.kit_lampada_id,
                item.montadora,
                item.modelo,
                item.observacao,
                item.status,
                item.lampada_baixo,
                item.lampada_alto,
                item.lampada_neblina,
                item.ano_inicio,
                item.ano_fim
            ].join(' '))
        }));

        window.kitLampadaCache = normalizedRows;
        appData.kit_lampada = normalizedRows;
        
        console.log('[KIT] cache criado:', window.kitLampadaCache.length);
        console.log('[KIT] exemplos:', window.kitLampadaCache.slice(0, 5));
        console.log('[KIT] teste civic:', window.kitLampadaCache.filter(x => x._search.includes('civic')));

        return normalizedRows;
    } catch (err) {
        console.error('[KIT] erro ao carregar:', err);
        throw err;
    }
}

function getKitLampadaSource() {
    return Array.isArray(window.kitLampadaCache) ? window.kitLampadaCache : [];
}

function searchKitLampada(term) {
    const query = safeText(term);
    if (!query) return [];

    const source = getKitLampadaSource();
    if (!source.length) {
        console.warn('[KIT] busca bloqueada: cache vazio');
        return [];
    }

    // Extrair potencial ano do termo de busca
    let searchYear = null;
    const yearMatch = term.match(/\b(20|19)\d{2}\b/);
    if (yearMatch) {
        searchYear = parseInt(yearMatch[0]);
    }

    return source
        .filter(item => {
            // Regra de Ano
            if (searchYear) {
                const anoInicio = item.ano_inicio ? Number(item.ano_inicio) : null;
                const anoFim = item.ano_fim ? Number(item.ano_fim) : null;
                
                let yearOk = false;
                if (!anoInicio && !anoFim) yearOk = true;
                else if (anoInicio && !anoFim) yearOk = searchYear >= anoInicio;
                else if (!anoInicio && anoFim) yearOk = searchYear <= anoFim;
                else if (anoInicio && anoFim) yearOk = searchYear >= anoInicio && searchYear <= anoFim;
                
                if (!yearOk) return false;
            }

            // Busca por texto (palavras-chave)
            const words = query.split(/\s+/).filter(w => w.length > 0);
            return words.every(word => {
                if (word === searchYear?.toString()) return true;
                return safeText(item._search).includes(word);
            });
        })
        .sort((a, b) => {
            const aModelo = safeText(a.modelo);
            const bModelo = safeText(b.modelo);
            const aMontadora = safeText(a.montadora);
            const bMontadora = safeText(b.montadora);

            const score = (item, modelo, montadora) => {
                let s = 0;
                if (modelo.startsWith(query)) s += 100;
                if (modelo.includes(query)) s += 80;
                if (montadora.includes(query)) s += 40;
                if (safeText(item._search).includes(query)) s += 10;
                return s;
            };

            const scoreA = score(a, aModelo, aMontadora);
            const scoreB = score(b, bModelo, bMontadora);

            if (scoreA !== scoreB) return scoreB - scoreA;
            return aModelo.localeCompare(bModelo);
        });
}


async function renderGuiaLampada(push = true) {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return renderLogin();
    
    currentScreen = 'kit_lampada';
    if (push) pushNav('kit_lampada');
    
    // 1. Mostrar estado de carregamento inicial
    app.innerHTML = `
        <div class="dashboard-screen fade-in internal product-search-screen kit-lampada-screen">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
            <main class="container product-search-center">
                <div id="kit-content-area">
                    <div style="text-align: center; padding: 100px 40px; color: var(--muted);">
                        <span class="material-symbols-rounded spin" style="font-size: 48px; color: var(--primary); margin-bottom: 24px;">sync</span>
                        <h2 style="color: white; margin-bottom: 8px;">Carregando dados...</h2>
                        <p style="font-size: 0.9rem; opacity: 0.7;">Sincronizando guia de lâmpadas com o Supabase</p>
                    </div>
                </div>
            </main>
        </div>
    `;

    try {
        // 2. Garantir carregamento dos dados
        const data = await ensureKitLampadaLoaded();
        
        // 3. Renderizar interface de busca
        const contentArea = document.getElementById('kit-content-area');
        if (!contentArea) return;

        if (!data || data.length === 0) {
            contentArea.innerHTML = `
                <div style="text-align: center; padding: 80px 40px;">
                    <span class="material-symbols-rounded" style="font-size: 64px; color: #f59e0b; margin-bottom: 24px;">database_off</span>
                    <h2 style="color: white; margin-bottom: 12px;">Sem dados disponíveis</h2>
                    <p style="color: var(--muted); margin-bottom: 24px; max-width: 400px; margin-left: auto; margin-right: auto;">
                        Nenhum dado foi retornado pelo Supabase. Verifique RLS/policy da tabela "kit_lampada".
                    </p>
                    <button class="primary-btn" onclick="renderGuiaLampada(false)" style="margin: 0 auto; display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-rounded">refresh</span>
                        Tentar Novamente
                    </button>
                </div>
            `;
            return;
        }

        contentArea.innerHTML = `
            <div class="kit-search-container">
                <input
                    type="search"
                    id="kit-search-input"
                    class="kit-search-input"
                    placeholder=""
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="none"
                    spellcheck="false"
                    inputmode="search"
                />
                <span class="material-symbols-rounded kit-search-icon">search</span>
            </div>
            
            <div id="kit-results" class="product-search-results" style="margin-top: 30px;">
                <!-- Resultados limpos -->
            </div>
        `;
        
        const kitSearchInput = document.getElementById('kit-search-input');
        if (kitSearchInput) {
            kitSearchInput.addEventListener('input', (e) => {
                handleKitLampadaSearch(e.target.value);
            });
            setTimeout(() => kitSearchInput.focus(), 100);
        }

    } catch (err) {
        const contentArea = document.getElementById('kit-content-area');
        if (!contentArea) return;
        
        contentArea.innerHTML = `
            <div style="text-align: center; padding: 80px 40px;">
                <span class="material-symbols-rounded" style="font-size: 64px; color: #ef4444; margin-bottom: 24px;">error</span>
                <h2 style="color: white; margin-bottom: 12px;">Erro ao carregar Kit Lâmpada</h2>
                <p style="color: var(--muted); margin-bottom: 24px; max-width: 400px; margin-left: auto; margin-right: auto;">
                    Não foi possível conectar ao banco de dados. Verifique permissões/RLS do Supabase.
                </p>
                <button class="primary-btn" onclick="renderGuiaLampada(false)" style="margin: 0 auto; display: flex; align-items: center; gap: 8px;">
                    <span class="material-symbols-rounded">refresh</span>
                    Tentar Novamente
                </button>
            </div>
        `;
    }
}

window.debouncedKitSearch = debounce(() => {
    const term = document.getElementById('kit-search-input')?.value;
    handleKitLampadaSearch(term);
}, 250);

function handleKitLampadaSearch(term) {
    const resultsContainer = document.getElementById('kit-results');
    if (!resultsContainer) return;
    
    if (!term || term.trim().length < 2) {
        resultsContainer.innerHTML = '';
        return;
    }

    const filtered = searchKitLampada(term);
    renderKitLampadaResults(filtered, term);
}

function renderKitLampadaResults(results, term) {
    const resultsContainer = document.getElementById('kit-results');
    if (!resultsContainer) return;

    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--muted);">
                <span class="material-symbols-rounded" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;">search_off</span>
                <p>Nenhum veículo encontrado para "${term}"</p>
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; width: 100%;">
            ${results.map(item => {
                const status = (item.status || 'verificar').toLowerCase();
                const statusColors = {
                    'postado': '#22c55e',
                    'revisar': '#f59e0b',
                    'verificar': '#ef4444'
                };
                const statusColor = statusColors[status] || statusColors.verificar;
                
                const anoStr = item.ano_inicio ? `${item.ano_inicio} - ${item.ano_fim || 'Presente'}` : 'Todos os anos';

                // Usamos escape para o JSON do item
                const itemData = JSON.stringify(item).replace(/'/g, "&#39;").replace(/"/g, '&quot;');

                return `
                    <div class="kit-lamp-card" onclick='renderKitDetailsCard(${itemData})'>
                        <div class="product-img-container" style="width: 70px; height: 70px; border-radius: 12px; background: rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.05);">
                            ${item.url ? 
                                `<img src="${item.url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;" onerror="this.outerHTML='<span class=&quot;material-symbols-rounded&quot; style=&quot;color: #555&quot;>directions_car</span>'">` : 
                                `<span class="material-symbols-rounded" style="color: #555">directions_car</span>`
                            }
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                                <span class="marca">${item.montadora}</span>
                                <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 6px ${statusColor};" title="${status}"></div>
                            </div>
                            <div class="card-title">${highlightText(item.modelo, term)}</div>
                            <div class="card-subtitle">${anoStr}</div>
                            ${item.observacao ? `<div style="font-size: 0.65rem; color: #777; font-style: italic; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.observacao}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

}

window.renderKitDetailsCard = function(item) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay fade-in';
    
    const anoStr = item.ano_inicio ? `${item.ano_inicio} - ${item.ano_fim || 'Presente'}` : 'Todos os anos';
    
    modal.innerHTML = `
        <div class="kit-detail-modal" id="kit-modal-content">
            <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()">
                <span class="material-symbols-rounded">close</span>
            </button>

            <div class="kit-modal-image-area" style="width: 100%; height: 200px; background: #000; display: flex; align-items: center; justify-content: center; cursor: zoom-in;" onclick="openKitImageViewer('${item.url || ''}')">
                ${item.url ? 
                    `<img src="${item.url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.outerHTML='<span class=&quot;material-symbols-rounded&quot; style=&quot;font-size: 64px; color: var(--muted)&quot;>directions_car</span>'">` : 
                    `<span class="material-symbols-rounded" style="font-size: 64px; color: var(--muted)">directions_car</span>`
                }
            </div>

            <div style="padding: 24px;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <span class="marca">${item.montadora}</span>
                    <h2 class="modelo">${item.modelo}</h2>
                    <span class="ano">${anoStr}</span>
                </div>

                <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
                    <div class="kit-modal-item">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(227, 6, 19, 0.1); display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-rounded" style="color: var(--primary); font-size: 24px;">light_mode</span>
                        </div>
                        <div style="flex: 1;">
                            <span class="label">Farol Baixo</span>
                            <span class="valor">${item.lampada_baixo || 'N/A'}</span>
                        </div>
                    </div>

                    <div class="kit-modal-item">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-rounded" style="color: #3b82f6; font-size: 24px;">flashlight_on</span>
                        </div>
                        <div style="flex: 1;">
                            <span class="label">Farol Alto</span>
                            <span class="valor">${item.lampada_alto || 'N/A'}</span>
                        </div>
                    </div>

                    <div class="kit-modal-item">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(245, 158, 11, 0.1); display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-rounded" style="color: #f59e0b; font-size: 24px;">foggy</span>
                        </div>
                        <div style="flex: 1;">
                            <span class="label">Farol Neblina</span>
                            <span class="valor">${item.lampada_neblina || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                ${item.observacao ? `
                    <div style="margin-top: 24px; padding: 16px; background: rgba(255,255,255,0.02); border-radius: 16px; border-left: 4px solid var(--primary);">
                        <span class="label" style="margin-bottom: 4px;">Observações</span>
                        <p style="font-size: 0.75rem; color: #d1d5db; line-height: 1.4;">${item.observacao}</p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);

    // Ativar animação de entrada já centralizado
    requestAnimationFrame(() => {
        const content = modal.querySelector('.kit-detail-modal');
        if (content) content.classList.add('open');
    });
}

window.openKitImageViewer = function(url) {
    if (!url) return;
    
    const viewer = document.createElement('div');
    viewer.className = 'image-viewer';
    viewer.onclick = () => viewer.remove();
    
    viewer.innerHTML = `
        <button class="modal-close-btn" style="top: 20px; right: 20px;" onclick="event.stopPropagation(); this.parentElement.remove()">
            <span class="material-symbols-rounded">close</span>
        </button>
        <img src="${url}" alt="Vehicle View">
    `;
    
    document.body.appendChild(viewer);
}


function renderEmptyModule(title) {
  const container = document.getElementById("main-content") || document.getElementById("app");
  if (!container) return;

  container.innerHTML = `
    <div class="dashboard-screen internal fade-in">
        ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderMenu()')}

        <main class="container">
            <div class="sub-menu-header">
                <h2 style="font-size: 1.2rem; font-weight: 700;">${title}</h2>
            </div>
            <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1); margin: 20px;">
                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">construction</span>
                <p style="color: var(--muted);">Módulo em desenvolvimento.</p>
            </div>
        </main>
    </div>
  `;
}

function renderProductSubMenu() {
  const container = document.getElementById("app");

  if (!container) {
    console.error("Container principal não encontrado para renderProductSubMenu");
    return;
  }

  container.innerHTML = `
    <div class="dashboard-screen internal fade-in product-submenu-screen">
      ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderMenu()')}

      <main class="container">
          <div class="menu-grid">
            <div class="menu-card" onclick="renderSearchScreen()">
              <span class="menu-icon-3d">${menu3DIcons?.busca || "🔍"}</span>
              <span class="label">BUSCAR</span>
            </div>

            <div class="menu-card" onclick="typeof openProductCreate === 'function' ? openProductCreate() : renderEmptyModule('Cadastrar Produto')">
              <span class="menu-icon-3d">${menu3DIcons?.cadastrar || "➕"}</span>
              <span class="label">CADASTRAR</span>
            </div>

            <div class="menu-card" onclick="renderEditProductSearch()">
              <span class="menu-icon-3d">${menu3DIcons?.editar || "✏️"}</span>
              <span class="label">EDITAR</span>
            </div>

            <div class="channel-card" style="display: none;"></div> <!-- Spacer se necessário para manter grid 2x2 visual -->
          </div>
      </main>
    </div>
  `;
}

function renderConfigSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
        </div>
    `;
}

function renderNFSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
        </div>
    `;
}

/* ===================================================
   MODERN INTERACTION LOGIC (BEHANCE STYLE)
   =================================================== */
(function() {
    function updateCardTransform(e) {
        const card = e.target.closest('.menu-card, .channel-card');
        if (!card) return;
        
        const rect = card.getBoundingClientRect();
        
        // Posição relativa do mouse/toque
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        // Injetar variáveis CSS para o Spotlight
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
        
        // Cálculo para o Tilt 3D (Desktop apenas para evitar enjoo no mobile)
        if (window.innerWidth > 768) {
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -6; // Max 6 graus
            const rotateY = ((x - centerX) / centerX) * 6;  // Max 6 graus
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        } else {
            // No mobile apenas um leve feedback de escala ao tocar
            card.style.transform = `scale3d(0.97, 0.97, 0.97)`;
        }
    }

    function resetCardTransform(e) {
        const card = e.target.closest('.menu-card, .channel-card');
        if (!card) return;
        
        // Se for um mouseout, verificar se realmente saiu do card (não para um filho)
        if (e.type === 'mouseout' || e.type === 'mouseleave') {
            if (e.relatedTarget && card.contains(e.relatedTarget)) return;
        }

        card.style.transform = '';
    }

    // Delegação de eventos para suportar cards criados dinamicamente
    document.addEventListener('mousemove', updateCardTransform, { passive: true });
    document.addEventListener('mouseout', resetCardTransform, { passive: true });

    // Mobile events
    document.addEventListener('touchstart', updateCardTransform, { passive: true });
    document.addEventListener('touchend', resetCardTransform, { passive: true });
    document.addEventListener('touchcancel', resetCardTransform, { passive: true });
})();


