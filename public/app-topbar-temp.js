function getTopBarHTML(currentUser, backAction = null, screenType = 'internal') {
    const isModoRapido = localStorage.getItem('config_modo_rapido') === 'true';
    const modoRapidoIndicator = isModoRapido ? `
        <span style="background: #FEF3C7; color: #B45309; font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 999px; display: flex; align-items: center; gap: 4px;">
            <span class="material-symbols-rounded" style="font-size: 14px;">bolt</span>
            RÁPIDO
        </span>
    ` : '';

    // MODO PADRÃO: Dados para Header Completo
    const isMenuScreen = screenType === 'menu';
    const headerBgColor = isMenuScreen ? '#101018' : '#FFFFFF';
    const headerLogoUrl = getLogoForHeader(headerBgColor);

    // Retornamos AMBOS os cabeçalhos. O CSS (index.css) cuidará de mostrar apenas 1 por vez baseado na classe .fullscreen-mode no body.
    return `
        <!-- HEADER MINIMALISTA (TELA CHEIA) -->
        <header class="top-bar-minimal">
            <div class="top-bar-minimal-left">
                ${backAction ? `
                    <button class="btn-back-minimal" onclick="${backAction}" title="Voltar">
                        <span class="material-symbols-rounded">arrow_back</span>
                    </button>
                ` : `
                    <div style="width: 20px;"></div>
                `}
            </div>
            <div class="top-bar-minimal-right">
                ${!backAction ? `
                    <button onclick="logout()" class="btn-exit-minimal" title="Sair do Sistema">
                        <span class="material-symbols-rounded">logout</span>
                    </button>
                ` : ''}
            </div>
        </header>
        <div id="exit-fullscreen-float" onclick="toggleFullscreen()" title="Sair da Tela Cheia">
            <span class="material-symbols-rounded">fullscreen_exit</span>
        </div>

        <!-- HEADER PADRÃO (TELA NORMAL) -->
        <header class="top-bar">
            <div class="top-bar-left">
                ${backAction ? `
                    <button class="btn-back-top" onclick="${backAction}" title="Voltar">
                        <span class="material-symbols-rounded">arrow_back</span>
                    </button>
                ` : `
                    <div style="width: 44px;"></div> 
                `}
                <img src="${headerLogoUrl}" alt="DY AutoParts" class="top-bar-logo-img" onerror="this.onerror=null; this.src='/imagens/icon-192-black.png';">
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
                <span id="statusConexao" style="font-size:13px;font-weight:600;">
                    🟢 Online
                </span>
                <span style="opacity:0.3;">|</span>
                <button onclick="sincronizarSistema()" class="btn-sync-header" title="Sincronizar agora" style="background: transparent; border: none; color: var(--primary); cursor:pointer;">
                    <span class="material-symbols-rounded" style="font-size:20px;">sync</span>
                </button>
                <span style="opacity:0.3;">|</span>
                <span id="pendentesSync" style="font-size:13px;font-weight:600;">
                    <span class="material-symbols-rounded" style="font-size:16px;">inventory_2</span> 0
                </span>
            </div>

            <div style="display: flex; align-items: center; gap: 12px; position: relative; z-index: 99999;">
                <div id="user-profile-badge" class="user-profile-badge" onclick="window.handleUserClick(event)" style="gap: 8px; padding-right: 8px; cursor: pointer; position: relative; z-index: 99999; pointer-events: auto; display: flex; align-items: center;">
                    <div class="user-avatar" style="pointer-events: none;">
                        ${currentUser ? currentUser.charAt(0).toUpperCase() : '?'}
                    </div>
                    <span class="user-name" style="pointer-events: none;">${currentUser}</span>
                    <button onclick="event.stopPropagation(); logout()" title="Sair do Sistema" style="background: transparent; border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; margin-left: 4px; padding: 4px; border-radius: 50%; transition: background 0.2s; position: relative; z-index: 100000; pointer-events: auto;">
                        <span class="material-symbols-rounded" style="font-size: 20px; pointer-events: none;">logout</span>
                    </button>
                </div>
            </div>
        </header>
    `;
}
