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
        },
        garantia: {
            tables: ['garantias'],
            cacheKey: 'garantia'
        },
        etiquetas: {
            tables: ['etiquetas_lotes', 'etiquetas_lotes_itens'],
            cacheKey: 'etiquetas'
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

    async function findProdutoByCodeSupabase(code) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const cleanCode = String(code || '').trim().replace(/\s+/g, '');
        if (!cleanCode) return null;

        console.log('[SEP] buscando supabase', cleanCode);

        const fields = ['ean', 'id_interno', 'sku_fornecedor'];
        for (const field of fields) {
            const { data, error } = await client
                .from('produtos')
                .select('*')
                .eq(field, cleanCode)
                .limit(1);

            if (error) {
                console.error('[SEP] refresh supabase erro', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code,
                    field,
                    value: cleanCode
                });
                throw error;
            }

            if (data && data.length > 0) {
                console.log('[SEP] produto encontrado supabase', {
                    field,
                    id_interno: data[0].id_interno,
                    ean: data[0].ean,
                    sku_fornecedor: data[0].sku_fornecedor
                });
                return data[0];
            }
        }

        console.log('[SEP] produto nao encontrado', cleanCode);
        return null;
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
            console.error('[CANAIS DEBUG] erro supabase ao ler canais_envio:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            })
            return []
        }

        if (!data || data.length === 0) {
            console.warn('[CANAIS DEBUG] canais_envio retornou vazio. Verifique se existem canais ativos e se as policies SELECT foram aplicadas.')
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
        let norm = local
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, '_')
            .replace('1º_ANDAR', 'PRIMEIRO_ANDAR')
            .replace('1°_ANDAR', 'PRIMEIRO_ANDAR')
            .replace('1_ANDAR', 'PRIMEIRO_ANDAR');
        // Normalizar variações de FULL ML
        if (norm === 'FULL_ML' || norm === 'FULLML' || norm === 'FULL_M_L') return 'FULL_ML';
        return norm;
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
                data_hora: getDataHoraBrasil(),
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
                atualizado_em: getDataHoraBrasil()
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

            if (tableName === 'separacao') {
                console.log(`[DATA] separacao -> Supabase`);
                return await fetchSeparacaoSupabase();
            }

            if (tableName === 'separacao_itens') {
                console.log(`[DATA] separacao_itens -> Supabase`);
                return await fetchSeparacaoItensSupabase();
            }

            if (tableName === 'conferencia') {
                console.log(`[DATA] conferencia -> Supabase`);
                return await fetchConferenciaSupabase();
            }

            if (tableName === 'conferencia_itens') {
                console.log(`[DATA] conferencia_itens -> Supabase`);
                return await fetchConferenciaItensSupabase();
            }

            if (tableName === 'etiquetas_lotes') {
                console.log(`[DATA] etiquetas_lotes -> Supabase`);
                return await listarEtiquetaLotes();
            }

            if (tableName === 'etiquetas_lotes_itens') {
                console.log(`[DATA] etiquetas_lotes_itens -> Supabase`);
                const lotes = await listarEtiquetaLotes();
                return lotes.flatMap(lote => lote.itens || []);
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

    async function fetchSeparacaoSupabase() {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const { data, error } = await client
            .from('separacao')
            .select('*')
            .order('criado_em', { ascending: false });

        if (error) {
            console.error('[SEPARACAO] erro ao listar separacao:', error);
            throw error;
        }

        return data || [];
    }

    async function fetchMovimentosProdutoSupabase(id_interno, limit = 120) {
        const client = window.supabaseClient;
        if (!client) {
            console.error('[MOVIMENTOS PRODUTO] erro ao listar movimentos: Supabase client não encontrado');
            throw new Error('Supabase client não encontrado');
        }

        const cleanId = String(id_interno || '').trim();
        if (!cleanId) return [];

        const safeLimit = Math.max(20, Math.min(parseInt(limit, 10) || 120, 300));
        const { data, error } = await client
            .from('movimentos')
            .select('*')
            .eq('id_interno', cleanId)
            .order('data_hora', { ascending: false })
            .limit(safeLimit);

        if (error) {
            console.error('[MOVIMENTOS PRODUTO] erro ao listar movimentos:', error);
            throw error;
        }

        return data || [];
    }

    async function fetchSeparacoesAbertasPorCanalSupabase(channelName) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        if (!channelName) return [];

        let { data, error } = await client
            .from('separacao')
            .select('*')
            .eq('canal_nome', channelName)
            .eq('status', 'aberta')
            .order('criado_em', { ascending: false });

        if (error) {
            console.error('[SEPARACAO] erro ao listar separacoes abertas por canal:', error);
            throw error;
        }

        if (!data?.length) {
            const fallback = await client
                .from('separacao')
                .select('*')
                .eq('canal_id', channelName)
                .eq('status', 'aberta')
                .order('criado_em', { ascending: false });

            if (fallback.error) {
                console.error('[SEPARACAO] erro ao listar separacoes abertas por canal_id:', fallback.error);
                throw fallback.error;
            }

            data = fallback.data || [];
        }

        return data || [];
    }

    async function fetchSeparacaoItensSupabase() {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const { data, error } = await client
            .from('separacao_itens')
            .select('*')
            .order('atualizado_em', { ascending: false });

        if (error) {
            console.error('[SEPARACAO] erro ao listar separacao_itens:', error);
            throw error;
        }

        return data || [];
    }

    async function fetchConferenciaSupabase() {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const { data, error } = await client
            .from('conferencia')
            .select('*')
            .order('conferido_em', { ascending: false });

        if (error) {
            console.error('[CONFERENCIA] erro ao listar conferencia:', error);
            throw error;
        }

        return data || [];
    }

    async function fetchConferenciaItensSupabase() {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const { data, error } = await client
            .from('conferencia_itens')
            .select('*');

        if (error) {
            console.error('[CONFERENCIA] erro ao listar conferencia_itens:', error);
            throw error;
        }

        return data || [];
    }

    function logSepSupabaseError(label, error, payload) {
        console.error(`[SEP] ${label}`, {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code,
            payload
        });
    }

    async function savePickingDraftSupabase(payload) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const now = getDataHoraBrasil();
        const session = payload.session || {};
        const item = payload.item || null;

        if (!session.separacao_id) throw new Error('separacao_id nao informado');

        const separacaoRow = {
            separacao_id: session.separacao_id,
            pedido_referencia: session.pedido_referencia || null,
            canal_id: session.canal_id || '',
            canal_nome: session.canal_nome || '',
            status: session.status || 'em_separacao',
            criado_por: session.criado_por || localStorage.getItem('currentUser') || 'N/A',
            criado_em: session.criado_em || now,
            atualizado_em: now,
            finalizado_em: session.finalizado_em || null,
            total_produtos_separados: Number(session.total_produtos_separados || 0),
            total_pacotes_montados: Number(session.total_pacotes_montados || 0),
            observacao: session.observacao || null
        };

        console.log('[SEP] criando separacao payload', separacaoRow);

        const { data: sepData, error: sepError } = await client
            .from('separacao')
            .upsert([separacaoRow], { onConflict: 'separacao_id' })
            .select()
            .single();

        if (sepError) {
            logSepSupabaseError('erro ao criar separacao', sepError, separacaoRow);
            throw sepError;
        }

        console.log('[SEP] separacao criada', sepData);

        let itemData = null;
        if (item && item.id_interno) {
            const itemRow = {
                separacao_id: session.separacao_id,
                id_interno: item.id_interno,
                ean: item.ean || null,
                descricao: item.descricao || '',
                qtd_solicitada: Number(item.qtd_solicitada || item.qtd_separada || 1),
                qtd_separada: Number(item.qtd_separada || item.qtd_solicitada || 1),
                atualizado_em: now
            };

            console.log('[SEP] salvando item payload', itemRow);

            const { data: existing, error: existingError } = await client
                .from('separacao_itens')
                .select('id')
                .eq('separacao_id', session.separacao_id)
                .eq('id_interno', itemRow.id_interno)
                .limit(1);

            if (existingError) {
                logSepSupabaseError('erro ao salvar item', existingError, itemRow);
                throw existingError;
            }

            if (existing && existing.length > 0) {
                const { data, error } = await client
                    .from('separacao_itens')
                    .update(itemRow)
                    .eq('separacao_id', session.separacao_id)
                    .eq('id_interno', itemRow.id_interno)
                    .select();

                if (error) {
                    logSepSupabaseError('erro ao salvar item', error, itemRow);
                    throw error;
                }
                itemData = data;
            } else {
                const { data, error } = await client
                    .from('separacao_itens')
                    .insert([itemRow])
                    .select();

                if (error) {
                    logSepSupabaseError('erro ao salvar item', error, itemRow);
                    throw error;
                }
                itemData = data;
            }

            console.log('[SEP] item salvo', itemData);
        }

        invalidateCache('separacao');
        invalidateCache('conferencia');

        return { separacao: sepData, item: itemData };
    }

    async function finalizePickingDraftSupabase(payload) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const now = getDataHoraBrasil();
        const sessionId = payload.sessionId;
        if (!sessionId) throw new Error('separacao_id nao informado');

        const updatePayload = {
            status: payload.status || 'aberta',
            atualizado_em: now,
            finalizado_em: now,
            total_produtos_separados: Number(payload.total_produtos_separados || 0),
            total_pacotes_montados: Number(payload.total_pacotes_montados || 0)
        };

        console.log('[SEP] finalizando separacao', { sessionId, payload: updatePayload });

        const { data, error } = await client
            .from('separacao')
            .update(updatePayload)
            .eq('separacao_id', sessionId)
            .select()
            .single();

        if (error) {
            logSepSupabaseError('erro ao finalizar separacao', error, { sessionId, ...updatePayload });
            throw error;
        }

        invalidateCache('separacao');
        invalidateCache('conferencia');

        return data;
    }

    async function deletePickingDraftSupabase(payload = {}) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const sessionId = payload.sessionId || payload.separacao_id;
        if (!sessionId) throw new Error('separacao_id nao informado');

        const { data: sessions, error: lookupError } = await client
            .from('separacao')
            .select('separacao_id,status')
            .eq('separacao_id', sessionId)
            .limit(1);

        if (lookupError) {
            logSepSupabaseError('erro ao buscar rascunho para exclusao', lookupError, { sessionId });
            throw lookupError;
        }

        const session = Array.isArray(sessions) ? sessions[0] : null;
        if (!session) return { deleted: false, missing: true };

        const status = String(session.status || '').toLowerCase();
        const draftStatuses = new Set(['em_separacao', 'rascunho', 'draft']);
        if (!draftStatuses.has(status)) {
            throw new Error('Somente rascunhos de separacao podem ser cancelados.');
        }

        const { error: itemsError } = await client
            .from('separacao_itens')
            .delete()
            .eq('separacao_id', sessionId);

        if (itemsError) {
            logSepSupabaseError('erro ao excluir itens do rascunho', itemsError, { sessionId });
            throw itemsError;
        }

        const { error: sessionError } = await client
            .from('separacao')
            .delete()
            .eq('separacao_id', sessionId);

        if (sessionError) {
            logSepSupabaseError('erro ao excluir rascunho', sessionError, { sessionId });
            throw sessionError;
        }

        invalidateCache('separacao');
        invalidateCache('conferencia');

        return { deleted: true, sessionId };
    }

    function mapEtiquetaItemToDb(item = {}, index = 0, loteId = null) {
        const quantity = Math.max(1, Math.floor(Number(item.quantity ?? item.quantidade_etiquetas ?? 1) || 1));
        const idInterno = String(item.idInterno || item.id_interno || item.code || item.codigo_barra || '').trim();
        const texto = String(item.name || item.texto_etiqueta || item.descricao_completa || item.descricao_base || '').trim();
        return {
            ...(loteId ? { lote_id: loteId } : {}),
            produto_id: String(item.productId || item.produto_id || '').trim() || null,
            id_interno: idInterno || null,
            descricao_base: String(item.descricao_base || item.name || texto || '').trim() || null,
            descricao_completa: String(item.descricao_completa || item.name || texto || '').trim() || null,
            ean: String(item.ean || '').trim() || null,
            quantidade_etiquetas: quantity,
            texto_etiqueta: texto || null,
            codigo_barra: String(item.codigo_barra || idInterno || '').trim() || null,
            ordem: Math.max(1, Math.floor(Number(item.ordem || index + 1) || index + 1))
        };
    }

    function mapEtiquetaLoteToDb(payload = {}, statusFallback = 'rascunho') {
        const lote = payload.lote || payload;
        return {
            nome_lote: String(lote.nome_lote || lote.nomeLote || '').trim() || null,
            modelo_etiqueta: String(lote.modelo_etiqueta || lote.modeloEtiqueta || lote.template || '').trim() || null,
            usuario_id: String(lote.usuario_id || lote.usuarioId || localStorage.getItem('currentUserId') || '').trim() || null,
            usuario_nome: String(lote.usuario_nome || lote.usuarioNome || localStorage.getItem('currentUser') || '').trim() || null,
            status: String(lote.status || statusFallback || 'rascunho').trim() || 'rascunho',
            observacoes: String(lote.observacoes || '').trim() || null
        };
    }

    async function salvarEtiquetaLote(payload = {}) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const lotePayload = mapEtiquetaLoteToDb(payload, 'rascunho');
        const items = Array.isArray(payload.items) ? payload.items : [];
        const { data: lote, error: loteError } = await client
            .from('etiquetas_lotes')
            .insert([{
                ...lotePayload,
                atualizado_em: getDataHoraBrasil()
            }])
            .select()
            .single();

        if (loteError) {
            console.error('[ETIQUETAS] erro ao salvar lote:', loteError);
            throw loteError;
        }

        let itens = [];
        const itensPayload = items
            .map((item, index) => mapEtiquetaItemToDb(item, index, lote.id))
            .filter(item => item.texto_etiqueta || item.id_interno || item.codigo_barra);

        if (itensPayload.length) {
            const { data, error } = await client
                .from('etiquetas_lotes_itens')
                .insert(itensPayload)
                .select();

            if (error) {
                console.error('[ETIQUETAS] erro ao salvar itens do lote:', error);
                throw error;
            }
            itens = data || [];
        }

        invalidateCache('etiquetas');
        return { ...lote, itens };
    }

    async function listarEtiquetaLotes() {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const { data: lotes, error } = await client
            .from('etiquetas_lotes')
            .select('*')
            .order('atualizado_em', { ascending: false });

        if (error) {
            console.error('[ETIQUETAS] erro ao listar lotes:', error);
            throw error;
        }

        const loteIds = (lotes || []).map(lote => lote.id).filter(Boolean);
        let itens = [];
        if (loteIds.length) {
            const itensResult = await client
                .from('etiquetas_lotes_itens')
                .select('*')
                .in('lote_id', loteIds)
                .order('ordem', { ascending: true });

            if (itensResult.error) {
                console.error('[ETIQUETAS] erro ao listar itens dos lotes:', itensResult.error);
                throw itensResult.error;
            }
            itens = itensResult.data || [];
        }

        const itensPorLote = itens.reduce((map, item) => {
            if (!map.has(item.lote_id)) map.set(item.lote_id, []);
            map.get(item.lote_id).push(item);
            return map;
        }, new Map());

        return (lotes || []).map(lote => {
            const loteItens = itensPorLote.get(lote.id) || [];
            return {
                ...lote,
                itens: loteItens,
                quantidade_produtos: loteItens.length,
                quantidade_total_etiquetas: loteItens.reduce((total, item) => total + Math.max(0, Number(item.quantidade_etiquetas) || 0), 0)
            };
        });
    }

    async function buscarEtiquetaLotePorId(id) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        if (!id) throw new Error('ID do lote nao informado');

        const { data: lote, error: loteError } = await client
            .from('etiquetas_lotes')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (loteError) {
            console.error('[ETIQUETAS] erro ao buscar lote:', loteError);
            throw loteError;
        }
        if (!lote) return null;

        const { data: itens, error: itensError } = await client
            .from('etiquetas_lotes_itens')
            .select('*')
            .eq('lote_id', id)
            .order('ordem', { ascending: true });

        if (itensError) {
            console.error('[ETIQUETAS] erro ao buscar itens do lote:', itensError);
            throw itensError;
        }

        return { ...lote, itens: itens || [] };
    }

    async function atualizarEtiquetaLote(id, payload = {}) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        if (!id) throw new Error('ID do lote nao informado');

        const lotePayload = mapEtiquetaLoteToDb(payload, 'rascunho');
        const { data: lote, error: loteError } = await client
            .from('etiquetas_lotes')
            .update({
                ...lotePayload,
                atualizado_em: getDataHoraBrasil()
            })
            .eq('id', id)
            .select()
            .single();

        if (loteError) {
            console.error('[ETIQUETAS] erro ao atualizar lote:', loteError);
            throw loteError;
        }

        const deleteResult = await client
            .from('etiquetas_lotes_itens')
            .delete()
            .eq('lote_id', id);

        if (deleteResult.error) {
            console.error('[ETIQUETAS] erro ao limpar itens do lote:', deleteResult.error);
            throw deleteResult.error;
        }

        let itens = [];
        const itensPayload = (Array.isArray(payload.items) ? payload.items : [])
            .map((item, index) => mapEtiquetaItemToDb(item, index, id))
            .filter(item => item.texto_etiqueta || item.id_interno || item.codigo_barra);

        if (itensPayload.length) {
            const { data, error } = await client
                .from('etiquetas_lotes_itens')
                .insert(itensPayload)
                .select();

            if (error) {
                console.error('[ETIQUETAS] erro ao atualizar itens do lote:', error);
                throw error;
            }
            itens = data || [];
        }

        invalidateCache('etiquetas');
        return { ...lote, itens };
    }

    async function duplicarEtiquetaLote(id, overrides = {}) {
        const original = await buscarEtiquetaLotePorId(id);
        if (!original) throw new Error('Lote de etiquetas nao encontrado');

        const items = (original.itens || []).map(item => ({
            productId: item.produto_id,
            idInterno: item.id_interno || item.codigo_barra,
            name: item.texto_etiqueta || item.descricao_completa || item.descricao_base,
            descricao_base: item.descricao_base,
            descricao_completa: item.descricao_completa,
            ean: item.ean,
            quantity: item.quantidade_etiquetas,
            codigo_barra: item.codigo_barra
        }));

        return await salvarEtiquetaLote({
            lote: {
                nome_lote: overrides.nome_lote || `${original.nome_lote || 'Lote'} - copia`,
                modelo_etiqueta: overrides.modelo_etiqueta || original.modelo_etiqueta,
                usuario_id: overrides.usuario_id || localStorage.getItem('currentUserId') || original.usuario_id,
                usuario_nome: overrides.usuario_nome || localStorage.getItem('currentUser') || original.usuario_nome,
                status: 'rascunho',
                observacoes: overrides.observacoes ?? original.observacoes
            },
            items
        });
    }

    async function marcarEtiquetaLoteComoImpresso(id) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        if (!id) throw new Error('ID do lote nao informado');

        const now = getDataHoraBrasil();
        const { data, error } = await client
            .from('etiquetas_lotes')
            .update({
                status: 'impresso',
                impresso_em: now,
                atualizado_em: now
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[ETIQUETAS] erro ao marcar lote como impresso:', error);
            throw error;
        }

        invalidateCache('etiquetas');
        return data;
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
            .not('status', 'in', '("finalizada", "cancelada", "entrada_confirmada", "financeiro_lancado")')
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

    /**
     * GARANTIA - Salvar envio
     */
    async function saveGarantiaSupabase(garantiaData) {
        const client = window.supabaseClient;
        if (!client) {
            console.error('[GARANTIA DEBUG] erro supabase: client não encontrado');
            return null;
        }

        console.log('[GARANTIA DEBUG] salvando garantia', garantiaData);

        const { data, error } = await client
            .from('garantias')
            .insert([{
                garantia_id: `GAR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                data_envio: getDataHoraBrasil(),
                id_interno: garantiaData.id_interno,
                descricao_produto: garantiaData.descricao_produto,
                fornecedor: garantiaData.fornecedor,
                tipo_operacao: garantiaData.tipo_operacao,
                motivo: garantiaData.motivo,
                observacao: garantiaData.observacao,
                origem_estoque: normalizeLocal(garantiaData.origem_estoque),
                quantidade: garantiaData.quantidade,
                custo_unitario: garantiaData.custo_unitario,
                custo_total: garantiaData.custo_total,
                status: 'ENVIADO',
                usuario: localStorage.getItem('currentUser')
            }])
            .select();

        if (error) {
            console.error('[GARANTIA DEBUG] erro supabase:', error);
            return null;
        }

        console.log('[GARANTIA DEBUG] Garantia salva', data);
        invalidateCache('garantia');
        return data ? data[0] : null;
    }



    async function finalizarConferenciaSupabase(payload) {
        const client = window.supabaseClient;
        if (!client) {
            throw new Error('Supabase client nao encontrado');
        }

        const rpcPayload = {
            p_session_id: payload.sessionId,
            p_usuario: payload.user,
            p_rows: payload.rows,
            p_execution_id: payload.executionId || `exec_${Date.now()}`
        };

        console.log('[CONFERENCIA RPC] finalizar_conferencia payload:', rpcPayload);

        const { data, error } = await client.rpc('finalizar_conferencia', rpcPayload);
        if (error) {
            console.error('[CONFERENCIA RPC] erro:', error);
            const rpcError = new Error(error.message || 'Erro ao finalizar conferencia no Supabase');
            rpcError.code = error.code;
            rpcError.details = error.details;
            rpcError.hint = error.hint;
            rpcError.supabaseError = error;
            throw rpcError;
        }

        invalidateCache('produtos');
        invalidateCache('movimentos');
        invalidateCache('conferencia');
        invalidateCache('separacao');

        return data;
    }

    async function transferirEstoqueSupabase(payload) {
        const client = window.supabaseClient;
        if (!client) {
            throw new Error('Supabase client nao encontrado');
        }

        const rpcPayload = {
            p_origem: normalizeLocal(payload.origem),
            p_destino: normalizeLocal(payload.destino),
            p_usuario: payload.usuario || localStorage.getItem('currentUser') || 'N/A',
            p_items: (payload.items || []).map(item => ({
                id_interno: item.id_interno,
                quantidade: Number(item.quantidade || 0)
            })),
            p_execution_id: payload.executionId || `transf_${Date.now()}`
        };

        console.log('[TRANSFERENCIA RPC] transferir_estoque payload:', rpcPayload);

        const { data, error } = await client.rpc('transferir_estoque', rpcPayload);
        if (error) {
            console.error('[TRANSFERENCIA RPC] erro:', error);
            const missingRpc = error.code === 'PGRST202' || String(error.message || '').includes('transferir_estoque');
            const rpcError = new Error(missingRpc
                ? 'RPC transferir_estoque ainda nao aplicada no Supabase. A transferencia foi bloqueada para evitar saldo parcial.'
                : (error.message || 'Erro ao transferir estoque no Supabase'));
            rpcError.code = error.code;
            rpcError.details = error.details;
            rpcError.hint = error.hint;
            rpcError.supabaseError = error;
            throw rpcError;
        }

        invalidateCache('produtos');
        invalidateCache('movimentos');

        return data;
    }

    return {
        loadModule,
        loadModules,
        query,
        save,
        saveBatch,
        savePickingDraftSupabase,
        finalizePickingDraftSupabase,
        deletePickingDraftSupabase,
        getCachedData,
        isModuleLoaded,
        invalidateCache,
        clearAllCache,
        saveMovimentoSupabase,
        updateEstoqueSupabase,
        fetchEstoqueProdutoSupabase,
        fetchEstoqueItemLocalSupabase,
        fetchMovimentosSupabase,
        fetchMovimentosProdutoSupabase,
        fetchUsuariosSupabase,
        fetchCanaisEnvioSupabase,
        fetchSeparacoesAbertasPorCanalSupabase,
        findProdutoByCodeSupabase,

        // ETIQUETAS
        salvarEtiquetaLote,
        listarEtiquetaLotes,
        buscarEtiquetaLotePorId,
        atualizarEtiquetaLote,
        duplicarEtiquetaLote,
        marcarEtiquetaLoteComoImpresso,

        // ENTRADA NF
        listEntradasNFAbertas,
        getEntradaNFById,

        // GARANTIA
        saveGarantiaSupabase,

        // CONFERENCIA
        finalizarConferenciaSupabase,

        // ESTOQUE / MOVIMENTACOES
        transferirEstoqueSupabase,

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

