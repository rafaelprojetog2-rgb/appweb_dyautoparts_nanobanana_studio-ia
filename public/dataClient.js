/**
 * Data Access Layer - Camada de abstração para acesso a dados
 * Permite futura migração de Google Sheets para Supabase com mínimo impacto
 * 
 * Implementa:
 * - Carregamento sob demanda por módulo
 * - Cache inteligente
 * - Logging de operações
 */

const DataClient = (function () {
    // Cache por módulo
    const cache = {};
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

    // Mapeamento de módulos para abas do Google Sheets
    const MODULE_TABLES = {
        login: {
            tables: ['usuarios'],
            cacheKey: 'login'
        },
        produtos: {
            tables: ['produtos', 'estoque_atual'],
            cacheKey: 'produtos'
        },
        separacao: {
            tables: ['canais_envio', 'separacao', 'separacao_itens'],
            cacheKey: 'separacao'
        },
        conferencia: {
            tables: ['separacao', 'separacao_itens', 'conferencia_itens', 'conferencia'],
            cacheKey: 'conferencia'
        },
        movimentos: {
            tables: ['movimentos', 'estoque_atual'],
            cacheKey: 'movimentos'
        },
        inventarios: {
            tables: ['inventarios', 'inventarios_itens'],
            cacheKey: 'inventarios'
        },
        kit_lampada: {
            tables: ['kit_lampada'],
            cacheKey: 'kit_lampada'
        },
        channels: {
            tables: ['canais_envio'],
            cacheKey: 'channels'
        },
        usuarios: {
            tables: ['usuarios'],
            cacheKey: 'usuarios'
        },
        nf: {
            tables: ['entradas_nf', 'entradas_nf_itens'],
            cacheKey: 'nf'
        }
    };

    /**
     * Verifica se cache é válido
     */
    function isCacheValid(key) {
        if (!cache[key]) return false;
        return (Date.now() - cache[key].timestamp) < CACHE_TTL;
    }

    /**
     * Salva no cache
     */
    function setCache(key, data) {
        cache[key] = {
            data: data,
            timestamp: Date.now()
        };
    }

    /**
     * Obtém do cache
     */
    function getCache(key) {
        if (isCacheValid(key)) {
            return cache[key].data;
        }
        return null;
    }

    /**
     * Limpa cache de um módulo
     */
    function invalidateCache(key) {
        delete cache[key];
    }

    /**
     * Carrega produtos do Supabase
     */
    async function fetchProdutosSupabase() {
        const client = window.supabaseClient

        if (!client) {
            console.error('[FATAL] Supabase client não inicializado!')
            console.error('[FATAL] Verifique supabaseClient.js - URL e ANON_KEY podem estar incompletas')
            throw new Error('Supabase não configurado. Configure URL e ANON_KEY em supabaseClient.js')
        }

        console.log('[Supabase] Iniciando consulta na tabela produtos...')

        const { data, error } = await client
            .from('produtos')
            .select('*')

        if (error) {
            console.error('[Supabase] ERRO ao buscar produtos:', error.message)
            console.error('[Supabase] Código do erro:', error.code)
            throw new Error('Erro ao carregar produtos do Supabase: ' + error.message)
        }

        if (!data || data.length === 0) {
            console.warn('[Supabase] ATENÇÃO: Nenhum produto encontrado na tabela!')
            console.warn('[Supabase] Verifique se a tabela "produtos" possui registros')
            throw new Error('Nenhum produto encontrado no Supabase. A tabela está vazia ou não existe.')
        }

        console.log(`[Supabase] Sukesso! ${data.length} produtos carregados do Supabase`)
        console.log(`[Supabase] IDs retornados:`, data.slice(0, 5).map(p => p.id_interno || p.id))

        return data
    }

    /**
     * Carrega usuários do Supabase
     */
    async function fetchUsuariosSupabase() {
        const client = window.supabaseClient

        if (!client) {
            console.error('[Supabase] client não encontrado')
            return []
        }

        const { data, error } = await client
            .from('usuarios')
            .select('*')
            .eq('ativo', true)


        if (error) {
            console.error('[Supabase] erro ao buscar usuários:', error)
            return []
        }

        console.log(`[BOOT] usuarios -> Supabase (${data.length} registros)`);

        return data || []
    }

    /**
     * Carrega canais de envio do Supabase
     */
    async function fetchCanaisEnvioSupabase() {
        const client = window.supabaseClient

        console.log('[CANAIS DEBUG] supabase client existe?', !!client);

        if (!client) {
            console.error('[CANAIS DEBUG] Supabase client NAO encontrado!')
            return []
        }

        console.log('[CANAIS DEBUG] buscando tabela canais_envio...');

        const { data, error } = await client
            .from('canais_envio')
            .select('*')
            .eq('ativo', true)
            .order('nome', { ascending: true })

        if (error) {
            console.error('[CANAIS DEBUG] erro supabase:', error)
            return []
        }

        console.log(`[CANAIS DEBUG] quantidade retornada: ${(data || []).length}`);
        console.log('[CANAIS DEBUG] canais retornados:', data);

        return data || []
    }

    /**
     * Carrega Kit Lâmpada do Supabase (Paginado para carregar tudo)
     */
    async function fetchKitLampadaSupabase() {
        const client = window.supabaseClient

        if (!client) {
            console.error('[Supabase] client não encontrado')
            return []
        }

        let allRows = [];
        let from = 0;
        const pageSize = 1000;

        try {
            while (true) {
                const { data, error } = await client
                    .from('kit_lampada')
                    .select('*')
                    .order('kit_lampada_id', { ascending: true })
                    .range(from, from + pageSize - 1);

                if (error) throw error;

                if (data && data.length > 0) {
                    allRows.push(...data);
                }

                if (!data || data.length < pageSize) break;

                from += pageSize;
            }

            // Utilitário interno para logs
            const safeText = (val) => String(val ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

            console.log('[KIT LAMPADA] rows:', allRows);
            console.log('[KIT LAMPADA] total:', allRows.length);
            console.log('[KIT LAMPADA] civic raw:', allRows.filter(r => String(r.modelo || '').toLowerCase().includes('civic')));
            console.log('[KIT LAMPADA] primeiro item:', allRows[0]);

            if (allRows.length === 0) {
                console.warn('[KIT LAMPADA] Atenção: Nenhum registro retornado. Verifique as RLS/Policies da tabela "kit_lampada" no Supabase.');
            }

            return allRows;
        } catch (err) {
            console.error('[Supabase] erro ao buscar kit_lampada:', err);
            return [];
        }
    }

    // Auxiliares
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

    /**
     * Registra um movimento no Supabase
     */
    async function saveMovimentoSupabase(movData) {
        const client = window.supabaseClient;
        if (!client) {
            console.error('[Supabase] Client não encontrado');
            return null;
        }

        console.log(`[MOV] insert movimentos - payload:`, JSON.stringify(movData, null, 2));

        const { data, error } = await client
            .from('movimentos')
            .insert([{
                movimento_id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                data_hora: new Date().toISOString(),
                tipo: movData.tipo,
                id_interno: movData.id_interno,
                local_origem: normalizeLocal(movData.local_origem),
                local_destino: normalizeLocal(movData.local_destino),
                quantidade: movData.quantidade,
                usuario: movData.usuario,
                origem: movData.origem,
                observacao: movData.observacao
            }])
            .select();

        if (error) {
            console.error('[MOV] insert movimentos ERRO:', error);
            return null;
        }

        console.log('[MOV] insert movimentos SUCESSO:', data);
        return data ? data[0] : null;
    }

    /**
     * Atualiza o saldo na tabela estoque_atual de forma atômica
     */
    async function updateEstoqueSupabase(id_interno, localRaw, operacao, quantidade) {
        const client = window.supabaseClient;
        const local = normalizeLocal(localRaw);
        if (!client || !local) {
            console.error('[MOV] update estoque ERRO: client ou local inválido');
            return false;
        }

        console.log(`[MOV] update estoque - id_interno=${id_interno} local=${local} operacao=${operacao} quantidade=${quantidade}`);

        try {
            // 1. Buscar saldo atual
            console.log('[INV-DIAG] update estoque: buscando saldo atual para', id_interno, 'em', local);
            const { data: current, error: fetchError } = await client
                .from('estoque_atual')
                .select('*')
                .eq('id_interno', id_interno)
                .eq('local', local)
                .maybeSingle();

            if (fetchError) {
                console.error('[INV-DIAG] erro estoque Supabase (SELECT):', fetchError);
                throw fetchError;
            }

            console.log('[INV-DIAG] saldo atual encontrado:', current);

            const saldoRes = current ? parseFloat(current.saldo_reservado || 0) : 0;
            const saldoTrans = current ? parseFloat(current.saldo_em_transito || 0) : 0;

            let novoSaldoDisp = 0;
            if (operacao === 'soma') {
                novoSaldoDisp = (current ? parseFloat(current.saldo_disponivel || 0) : 0) + quantidade;
            } else if (operacao === 'subtrai') {
                novoSaldoDisp = (current ? parseFloat(current.saldo_disponivel || 0) : 0) - quantidade;
            } else if (operacao === 'ajuste') {
                novoSaldoDisp = quantidade;
            }

            const novoSaldoTotal = novoSaldoDisp + saldoRes + saldoTrans;
            const payload = {
                id_interno: id_interno,
                local: local,
                saldo_disponivel: novoSaldoDisp,
                saldo_reservado: saldoRes,
                saldo_em_transito: saldoTrans,
                saldo_total: novoSaldoTotal,
                atualizado_em: new Date().toISOString()
            };

            console.log('[INV-DIAG] estoque payload:', payload);

            let result;
            if (current) {
                console.log('[INV-DIAG] executando UPDATE em estoque_atual...');
                result = await client
                    .from('estoque_atual')
                    .update(payload)
                    .eq('id_interno', id_interno)
                    .eq('local', local);
            } else {
                console.log('[INV-DIAG] executando INSERT em estoque_atual...');
                result = await client
                    .from('estoque_atual')
                    .insert([payload]);
            }

            if (result.error) {
                console.error('[INV-DIAG] erro estoque Supabase (OP):', result.error);
                throw result.error;
            }

            console.log('[INV-DIAG] estoque result: SUCESSO');
            return true;
        } catch (err) {
            console.error('[INV-DIAG] update estoque ERRO fatal:', err.message || err);
            return false;
        }
    }

    /**
     * Busca saldos de estoque por local para um produto específico
     */
    async function fetchEstoqueProdutoSupabase(id_interno) {
        const client = window.supabaseClient;
        if (!client) return [];

        const { data, error } = await client
            .from('estoque_atual')
            .select('*')
            .eq('id_interno', id_interno);

        if (error) {
            console.warn('[Supabase] Erro ao buscar estoque do produto (não crítico):', error);
            return [];
        }

        return data || [];
    }

    /**
     * Busca saldo real de estoque para um produto em um local específico
     */
    async function fetchEstoqueItemLocalSupabase(id_interno, localRaw) {
        const client = window.supabaseClient;
        const local = normalizeLocal(localRaw);
        if (!client || !local) return null;

        const { data, error } = await client
            .from('estoque_atual')
            .select('saldo_disponivel, saldo_reservado, saldo_em_transito, saldo_total')
            .eq('id_interno', id_interno)
            .eq('local', local)
            .maybeSingle();

        if (error) {
            console.warn('[INV] fetchEstoqueItemLocal AVISO (não crítico):', error);
            return null;
        }
        return data;
    }

    /**
     * Carrega tabela inventarios do Supabase
     */
    async function fetchInventariosSupabase() {
        const client = window.supabaseClient;
        if (!client) return [];

        const { data, error } = await client
            .from('inventarios')
            .select('*')
            .order('data_inicio', { ascending: false });

        if (error) { console.error('[INV] fetch inventarios ERRO:', error); return []; }
        console.log(`[INV] inventarios -> Supabase (${data.length} registros)`);
        return data || [];
    }

    /**
     * Carrega tabela inventarios_itens do Supabase
     */
    async function fetchInventariosItensSupabase() {
        const client = window.supabaseClient;
        if (!client) return [];

        const { data, error } = await client
            .from('inventarios_itens')
            .select('*');

        if (error) { console.error('[INV] fetch inventarios_itens ERRO:', error); return []; }
        console.log(`[INV] inventarios_itens -> Supabase (${data.length} registros)`);
        return data || [];
    }

    /**
     * Carrega tabela estoque_atual do Supabase (Runtime SSOT)
     */
    async function fetchEstoqueAtualSupabase() {
        const client = window.supabaseClient;
        if (!client) return [];

        try {
            const { data, error } = await client
                .from('estoque_atual')
                .select('*');

            if (error) {
                console.warn('[Supabase] Erro ao buscar estoque_atual:', error);
                return [];
            }
            return data || [];
        } catch (e) {
            console.warn('[Supabase] Erro fatal estoque_atual:', e);
            return [];
        }
    }

    /**
     * Carrega dados de uma tabela específica (Roteamento Inteligente)
     */
    async function fetchTable(tableName) {
        try {
            // Tabelas Exclusivas do Supabase (Runtime SSOT)
            if (tableName === 'produtos') {
                console.log(`[DATA] produtos -> Supabase`);
                return await fetchProdutosSupabase();
            }

            if (tableName === 'usuarios') {
                console.log(`[DATA] usuarios -> Supabase`);
                console.log(`[DATA] Google Sheets ignorado para 'usuarios'`);
                return await fetchUsuariosSupabase();
            }

            if (tableName === 'canais_envio') {
                console.log(`[DATA] canais_envio -> Supabase`);
                return await fetchCanaisEnvioSupabase();
            }

            if (tableName === 'inventarios') {
                console.log(`[DATA] inventarios -> Supabase`);
                return await fetchInventariosSupabase();
            }

            if (tableName === 'inventarios_itens') {
                console.log(`[DATA] inventarios_itens -> Supabase`);
                return await fetchInventariosItensSupabase();
            }

            if (tableName === 'estoque_atual') {
                console.log(`[DATA] estoque_atual -> Supabase`);
                return await fetchEstoqueAtualSupabase();
            }

            if (tableName === 'movimentos') {
                console.log(`[DATA] movimentos -> Supabase`);
                return await fetchMovimentosSupabase();
            }

            if (tableName === 'kit_lampada') {
                console.log(`[DATA] kit_lampada -> Supabase`);
                return await fetchKitLampadaSupabase();
            }

            // Fallback apenas para tabelas operacionais legadas ou auxiliares
            console.log(`[DATA] Google Sheets -> ${tableName}`);
            const data = await fetchSheetData(tableName);
            return data || [];
        } catch (error) {
            console.error(`[DataClient] Erro ao carregar ${tableName}:`, error);
            // Erro de estoque é tratado como não-crítico para não bloquear visualização
            if (tableName !== 'estoque_atual') {
                showToast(`Erro ao carregar dados de ${tableName}`, 'error');
            }
            return [];
        }
    }


    /**
     * Carrega dados de um módulo específico (sob demanda)
     * @param {string} moduleName - Nome do módulo (login, produtos, separacao, etc)
     * @param {boolean} forceRefresh - Se true, ignora cache e força recarregamento
     */
    async function loadModule(moduleName, forceRefresh = false) {
        const config = MODULE_TABLES[moduleName];
        if (!config) {
            console.warn(`[DataClient] Módulo desconhecido: ${moduleName}`);
            return null;
        }

        // Verificar cache válido
        if (!forceRefresh && isCacheValid(config.cacheKey)) {
            console.log(`[DataClient] Usando cache para módulo: ${moduleName}`);
            return getCache(config.cacheKey);
        }

        console.log(`[DataClient] Carregando módulo: ${moduleName}`);

        try {
            // Carregar todas as tabelas do módulo em paralelo
            const results = await Promise.all(
                config.tables.map(table => fetchTable(table))
            );

            // Criar objeto com dados do módulo
            const moduleData = {};
            config.tables.forEach((table, index) => {
                const keyMap = {
                    'produtos': 'products',
                    'canais_envio': 'channels',
                    'conferencia_itens': 'conferencia',
                    'estoque_atual': 'estoque',
                    'movimentos': 'movimentacoes',
                    'inventarios': 'inventario',
                    'inventarios_itens': 'inventarios_itens',
                    'separacao': 'separacao',
                    'separacao_itens': 'separacao_itens'
                };
                const key = keyMap[table] || table;
                moduleData[key] = results[index] || [];
            });

            // Salvar no cache
            setCache(config.cacheKey, moduleData);

            console.log(`[DataClient] Módulo ${moduleName} carregado com sucesso`);
            return moduleData;

        } catch (error) {
            console.error(`[DataClient] Erro ao carregar módulo ${moduleName}:`, error);
            showToast(`Erro ao carregar ${moduleName}`, 'error');
            return null;
        }
    }

    /**
     * Carrega dados de múltiplos módulos de uma vez
     * @param {string[]} moduleNames - Lista de módulos para carregar
     */
    async function loadModules(moduleNames) {
        console.log(`[DataClient] Carregando múltiplos módulos:`, moduleNames);

        const results = {};
        await Promise.all(
            moduleNames.map(async (moduleName) => {
                results[moduleName] = await loadModule(moduleName);
            })
        );

        return results;
    }

    /**
     * Busca dados de uma tabela específica (sem cache de módulo)
     * Útil para operações pontuais
     */
    async function query(tableName, filters = {}) {
        console.log(`[DataClient] SEARCH START -> Table: ${tableName}`, filters);

        try {
            // Se for uma das tabelas SSOT (Supabase), não usamos dyGet (Sheets)
            const ssotTables = ['produtos', 'usuarios', 'canais_envio'];
            if (ssotTables.includes(tableName)) {
                console.log(`[DataClient] Redirecionando busca de ${tableName} para SSOT Supabase`);
                const fullData = await fetchTable(tableName);

                if (filters.field && filters.value) {
                    const normalizedValue = String(filters.value).toLowerCase();
                    return fullData.filter(item =>
                        String(item[filters.field] || "").toLowerCase() === normalizedValue
                    );
                }
                return fullData;
            }

            if (filters.field && filters.value) {
                // Busca específica no Google Sheets (fallback legado)
                const params = {
                    action: 'find',
                    sheet: tableName,
                    field: filters.field,
                    value: filters.value
                };
                return (await dyGet(params)).data || [];
            } else {
                return await fetchTable(tableName);
            }
        } catch (error) {
            console.error(`[DataClient] Query error:`, error);
            return [];
        }
    }


    /**
     * Salva dados - wrapper para safePost
     */
    async function save(action, sheetName, data) {
        console.log(`[DataClient] Salvando ${action} na aba ${sheetName}`);

        const result = await safePost({
            action: action,
            sheet: sheetName,
            data: data
        });

        // Invalidar cache do módulo relacionado se salvou com sucesso
        if (result) {
            Object.keys(MODULE_TABLES).forEach(moduleName => {
                const config = MODULE_TABLES[moduleName];
                if (config.tables.includes(sheetName)) {
                    console.log(`[DataClient] Invalidando cache de ${moduleName} após salvamento`);
                    invalidateCache(config.cacheKey);
                }
            });
        }

        return result;
    }

    /**
     * Versão batch de save
     */
    async function saveBatch(sheetName, dataArray) {
        console.log(`[DataClient] Salvando batch em ${sheetName}`);

        const result = await safePost({
            action: 'batch_append',
            sheet: sheetName,
            data: dataArray
        });

        if (result) {
            invalidateCache(sheetName);
        }

        return result;
    }

    /**
     * Obtém dados de um módulo específico do cache (sem carregar)
     */
    function getCachedData(moduleName) {
        const config = MODULE_TABLES[moduleName];
        if (!config) return null;
        return getCache(config.cacheKey);
    }

    /**
     * Verifica se módulo já foi carregado
     */
    function isModuleLoaded(moduleName) {
        const config = MODULE_TABLES[moduleName];
        if (!config) return false;
        return isCacheValid(config.cacheKey);
    }

    /**
     * Limpa todo o cache
     */
    function clearAllCache() {
        Object.keys(cache).forEach(key => delete cache[key]);
        console.log('[DataClient] Todo cache limpo');
    }

    // API pública
    async function fetchMovimentosSupabase() {
        const client = window.supabaseClient;
        if (!client) {
            console.error('[MOVIMENTOS DEBUG] erro ao listar movimentos: Supabase client não encontrado');
            throw new Error('Supabase client não encontrado');
        }

        // 1. Buscar dados
        const { data, error } = await client
            .from('movimentos')
            .select('*')
            .order('data_hora', { ascending: false });

        if (error) {
            console.error('[MOVIMENTOS DEBUG] erro ao listar movimentos:', error);
            throw error;
        }

        return data || [];
    }

    /**
     * ENTRADA NF - Criar NF Manual
     */
    async function createEntradaNFManual(payload) {
        const client = window.supabaseClient;
        if (!client) {
            console.error('[ENTRADA NF DEBUG] erro supabase: client não encontrado');
            return null;
        }

        console.log('[ENTRADA NF DEBUG] salvando NF manual', payload);

        const { data, error } = await client
            .from('entradas_nf')
            .insert([{
                numero_nf: payload.numero_nf,
                serie: payload.serie,
                data_emissao: payload.data_emissao,
                data_recebimento: payload.data_recebimento,
                cnpj_fornecedor: payload.cnpj_fornecedor,
                fornecedor_nome: payload.fornecedor_nome,
                valor_total: payload.valor_total,
                origem: 'manual',
                status: 'rascunho',
                observacoes: payload.observacoes,
                criado_por: localStorage.getItem('currentUser')
            }])
            .select();

        if (error) {
            console.error('[ENTRADA NF DEBUG] erro supabase:', error);
            return null;
        }

        console.log('[ENTRADA NF DEBUG] NF salva', data);
        invalidateCache('nf');
        return data ? data[0] : null;
    }

    /**
     * ENTRADA NF - Listar notas abertas
     */
    async function listEntradasNFAbertas() {
        const client = window.supabaseClient;
        if (!client) return [];

        console.log('[ENTRADA NF DEBUG] listando notas abertas');

        const { data, error } = await client
            .from('entradas_nf')
            .select('*')
            .not('status', 'in', '("entrada_confirmada", "cancelada")')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[ENTRADA NF DEBUG] erro supabase:', error);
            return [];
        }

        return data || [];
    }

    /**
     * ENTRADA NF - Buscar por ID
     */
    async function getEntradaNFById(id) {
        const client = window.supabaseClient;
        if (!client) return null;

        const { data, error } = await client
            .from('entradas_nf')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error('[ENTRADA NF DEBUG] erro supabase:', error);
            return null;
        }

        return data;
    }

    return {
        loadModule,
        loadModules,
        query,
        save,
        saveBatch,
        getCachedData,
        isModuleLoaded,
        invalidateCache,
        clearAllCache,
        saveMovimentoSupabase,
        updateEstoqueSupabase,
        fetchEstoqueProdutoSupabase,
        fetchEstoqueItemLocalSupabase,
        fetchUsuariosSupabase,
        fetchCanaisEnvioSupabase,

        // ENTRADA NF
        createEntradaNFManual,
        listEntradasNFAbertas,
        getEntradaNFById,

        // Constantes para uso interno
        MODULES: Object.keys(MODULE_TABLES)
    };

})();

// Tornar global para uso nos componentes
window.DataClient = DataClient;

/**
 * Teste de conexão com Supabase - apenas leitura
 * NÃO substitui o fluxo atual do Google Sheets
 */
async function testeSupabase() {
    try {
        const client = window.supabaseClient

        if (!client) {
            console.error('Supabase client não encontrado em window.supabaseClient')
            return
        }

        const { data, error } = await client
            .from('produtos')
            .select('*')
            .limit(1)

        if (error) {
            console.error('Erro Supabase:', error)
        } else {
            console.log('Dados Supabase:', data)
        }
    } catch (err) {
        console.error('Erro ao conectar com Supabase:', err)
    }
}

// Expor globalmente
window.testeSupabase = testeSupabase;