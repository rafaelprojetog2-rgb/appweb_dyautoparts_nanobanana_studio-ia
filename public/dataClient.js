/**
 * Data Access Layer - Camada de abstração para acesso a dados
 * Permite futura migração de Google Sheets para Supabase com mínimo impacto
 * 
 * Implementa:
 * - Carregamento sob demanda por módulo
 * - Cache inteligente
 * - Logging de operações
 */

const DataClient = (function() {
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
            tables: ['inventarios', 'inventario_itens'],
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
     * Carrega dados de uma tabela específica
     */
    async function fetchTable(tableName) {
        console.log(`[DataClient] Fetching table: ${tableName}`);
        try {
            const data = await fetchSheetData(tableName);
            return data || [];
        } catch (error) {
            console.error(`[DataClient] Error fetching ${tableName}:`, error);
            showToast(`Erro ao carregar dados de ${tableName}`, 'error');
            return null;
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
            if (filters.field && filters.value) {
                // Busca específica (equivalent to find)
                const params = {
                    action: 'find',
                    sheet: tableName,
                    field: filters.field,
                    value: filters.value
                };
                console.log(`[DataClient] Parâmetros enviados:`, params);

                const response = await dyGet(params);
                console.log(`[DataClient] Resposta completa do backend:`, response);

                return response.data || [];
            } else {
                // Lista geral
                const data = await fetchTable(tableName);
                console.log(`[DataClient] Lista geral retornada: ${data ? data.length : 0} itens`);
                return data || [];
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
        
        // Constantes para uso interno
        MODULES: Object.keys(MODULE_TABLES)
    };

})();

// Tornar global para uso nos componentes
window.DataClient = DataClient;