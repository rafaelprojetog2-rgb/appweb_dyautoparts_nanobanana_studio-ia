/**
 * DY AutoParts WMS - Backend (Google Apps Script)
 * Versão: 2.0.0
 * 
 * Este script deve ser colado no Editor de Scripts da Google Planilha.
 */

const CONFIG = {
  SHEET_ID: SpreadsheetApp.getActiveSpreadsheet().getId(),
  TABELAS: {
    PRODUTOS: 'produtos',
    ESTOQUE: 'estoque_atual',
    ENTRADAS: 'entradas_nf',
    MOVIMENTOS: 'movimentos',
    SEPARACAO: 'separacao',
    SEPARACAO_ITENS: 'separacao_itens',
    CONFERENCIA: 'conferencia',
    CONFERENCIA_ITENS: 'conferencia_itens',
    INVENTARIOS: 'inventarios',
    INVENTARIOS_ITENS: 'inventarios_itens',
    DEFEITOS: 'defeitos',
    USUARIOS: 'usuarios',
    KIT_LAMPADA: 'kit_lampada',
    CANAIS: 'canais_envio'
  }
};

function doGet(e) {
  const action = e.parameter.action;
  const sheetName = e.parameter.sheet;

  try {
    switch (action) {
      case 'ping':
        return jsonResponse({ ok: true, message: 'pong' });
      
      case 'list':
        return jsonResponse({ ok: true, data: listData(sheetName) });
      
      case 'find':
        const field = e.parameter.field;
        const value = e.parameter.value;
        return jsonResponse({ ok: true, data: findData(sheetName, field, value) });
      
      case 'schema':
        return jsonResponse({ ok: true, data: getSchema(sheetName) });

      case 'kit_lampada':
        const termo = e.parameter.termo;
        return jsonResponse({ ok: true, data: searchKitLampada(termo) });

      default:
        return jsonResponse({ ok: false, error: 'Ação GET inválida' });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'JSON inválido' });
  }

  const action = body.action;
  const sheetName = body.sheet;

  try {
    switch (action) {
      case 'append':
        return jsonResponse({ ok: true, data: appendData(sheetName, body.data) });
      
      case 'update':
        return jsonResponse({ ok: true, data: updateData(sheetName, body.keyField || body.idField, body.keyValue || body.idValue, body.data) });
      
      case 'upsert':
        return jsonResponse({ ok: true, data: upsertData(sheetName, body.keyField || body.idField, body.keyValue || body.idValue, body.data) });

      case 'movimento':
        return jsonResponse(processarMovimento(body));
      
      case 'lock_session':
        return jsonResponse(lockSession(body.sessionId, body.usuario));
      
      case 'unlock_session':
        return jsonResponse(unlockSession(body.sessionId));
      
      case 'finalizar_conferencia':
        return jsonResponse(finalizarConferencia(body));

      case 'batch_append':
        return jsonResponse(batchAppendData(sheetName, body.data));

      case 'ordenar_produtos':
        return jsonResponse(ordenarProdutos());

      default:
        return jsonResponse({ ok: false, error: 'Ação POST inválida' });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

/**
 * Utilitários de Resposta
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Lógica de Listagem
 */
function listData(sheetName) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => normalizeHeader(h));
  const rows = data.slice(1);

  return rows.map((row, rowIndex) => {
    const obj = { rowId: rowIndex + 2 };
    row.forEach((cell, i) => {
      if (headers[i]) {
        obj[headers[i]] = cell;
      }
      // Adicionar propriedades col_a, col_b, etc. para compatibilidade com o frontend
      const letter = getColumnLetter(i).toLowerCase();
      obj[`col_${letter}`] = cell;
      obj[`col_${i}`] = cell;
    });
    return obj;
  }).filter(row => {
    // Ignorar linhas onde todos os campos relevantes estão vazios
    return Object.values(row).some(val => val !== "" && val !== null && val !== undefined);
  });
}

/**
 * Busca Genérica
 */
function findData(sheetName, field, value) {
  const all = listData(sheetName);
  return all.filter(item => String(item[normalizeHeader(field)]) === String(value));
}

/**
 * Retorna o cabeçalho real da aba
 */
function getSchema(sheetName) {
  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return headers.map(h => normalizeHeader(h));
}

/**
 * Append de dados respeitando cabeçalhos
 */
function appendData(sheetName, rowData) {
  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const newRow = headers.map(h => {
    const normH = normalizeHeader(h);
    return rowData[normH] !== undefined ? rowData[normH] : "";
  });
  sheet.appendRow(newRow);
  return { success: true };
}

/**
 * Append de múltiplos dados em lote (Performance)
 */
function batchAppendData(sheetName, rowsData) {
  if (!Array.isArray(rowsData) || rowsData.length === 0) return { ok: true };
  
  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const normalizedHeaders = headers.map(h => normalizeHeader(h));
  
  const batch = rowsData.map(rowData => {
    return normalizedHeaders.map(h => rowData[h] !== undefined ? rowData[h] : "");
  });
  
  sheet.getRange(sheet.getLastRow() + 1, 1, batch.length, headers.length).setValues(batch);
  return { ok: true, count: batch.length };
}

/**
 * Update por campo de ID
 */
function updateData(sheetName, idField, idValue, rowData) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => normalizeHeader(h));
  const idColIndex = headers.indexOf(normalizeHeader(idField));

  if (idColIndex === -1) throw new Error('Campo ID não encontrado');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idColIndex]) === String(idValue)) {
      const range = sheet.getRange(i + 1, 1, 1, headers.length);
      const updatedRow = headers.map((h, j) => {
        return rowData[h] !== undefined ? rowData[h] : data[i][j];
      });
      range.setValues([updatedRow]);
      return { success: true, row: i + 1 };
    }
  }
  return { success: false, message: 'Registro não encontrado' };
}

/**
 * Upsert (Update or Insert)
 */
function upsertData(sheetName, idField, idValue, rowData) {
  const result = updateData(sheetName, idField, idValue, rowData);
  if (result.success) return result;
  return appendData(sheetName, rowData);
}

/**
 * Busca no Kit de Lâmpadas
 */
function searchKitLampada(termo) {
  if (!termo) return [];
  const all = listData(CONFIG.TABELAS.KIT_LAMPADA);
  const search = termo.toLowerCase();
  return all.filter(item => {
    const modelo = String(item.modelo || item.veiculo || "").toLowerCase();
    const montadora = String(item.montadora || "").toLowerCase();
    return modelo.includes(search) || montadora.includes(search);
  });
}

/**
 * Lógica Central de Movimentação de Estoque
 */
function processarMovimento(payload) {
  const { tipo, id_interno, local, quantidade, usuario, origem, observacao } = payload;
  const qtyNum = parseFloat(quantidade);

  if (isNaN(qtyNum)) return { ok: false, error: 'Quantidade inválida' };

  const now = new Date();
  
  // 1. REGISTRAR EM MOVIMENTOS PRIMEIRO (Intenção/Auditoria)
  const movData = {
    movimento_id: 'MOV-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    data_hora: now,
    tipo: tipo,
    id_interno: id_interno,
    local_origem: payload.local_origem || (tipo === 'SAIDA' || tipo === 'RESERVA' ? local : ""),
    local_destino: payload.local_destino || (tipo === 'ENTRADA' ? local : ""),
    quantidade: Math.abs(qtyNum),
    usuario: usuario,
    origem: origem || "APP",
    observacao: observacao || ""
  };

  try {
    appendData(CONFIG.TABELAS.MOVIMENTOS, movData);
  } catch (e) {
    return { ok: false, error: 'Falha ao registrar log de movimentação: ' + e.toString() };
  }

  // 2. ATUALIZAR ESTOQUE_ATUAL (Estado)
  try {
    const sheetEstoque = getSheet(CONFIG.TABELAS.ESTOQUE);
    const dataEstoque = sheetEstoque.getDataRange().getValues();
    const headersEstoque = dataEstoque[0].map(h => normalizeHeader(h));
    
    const idIdx = headersEstoque.indexOf('id_interno');
    const localIdx = headersEstoque.indexOf('local');
    const dispIdx = headersEstoque.indexOf('saldo_disponivel');
    const resIdx = headersEstoque.indexOf('saldo_reservado');
    const transIdx = headersEstoque.indexOf('saldo_em_transito');
    const totalIdx = headersEstoque.indexOf('saldo_total');
    const updateIdx = headersEstoque.indexOf('atualizado_em');

    let rowIndex = -1;
    for (let i = 1; i < dataEstoque.length; i++) {
        if (String(dataEstoque[i][idIdx]) === String(id_interno) && String(dataEstoque[i][localIdx]) === String(local)) {
            rowIndex = i + 1;
            break;
        }
    }

    let currentDisp = 0, currentRes = 0, currentTrans = 0;
    if (rowIndex !== -1) {
        const rowData = dataEstoque[rowIndex - 1];
        currentDisp = parseFloat(rowData[dispIdx]) || 0;
        currentRes = parseFloat(rowData[resIdx]) || 0;
        currentTrans = parseFloat(rowData[transIdx]) || 0;
    }

    let nextDisp = currentDisp, nextRes = currentRes, nextTrans = currentTrans;

    // Lógica por tipo padronizado
    switch (tipo) {
        case 'ENTRADA':
            nextDisp += qtyNum;
            break;
        case 'SAIDA':
            nextDisp -= qtyNum;
            break;
        case 'RESERVA': // Flow PICK
            nextDisp -= qtyNum;
            nextRes += qtyNum;
            break;
        case 'CONFERENCIA': // Flow PACK Default / CONFIRMACAO_SAIDA
        case 'CONFIRMACAO_SAIDA':
            nextRes -= qtyNum;
            break;
        case 'INVENTARIO': // Ajuste absoluto
        case 'AJUSTE_INVENTARIO':
            nextDisp = qtyNum;
            break;
        case 'TRANSFERENCIA':
            nextDisp += qtyNum; // Se positivo entra, se negativo sai
            break;
    }

    if (nextDisp < 0 || nextRes < 0) {
        // Neste ponto, o log já foi gravado. Podemos gravar um log de erro ou apenas reportar.
        // O usuário pediu para NÃO atualizar o estoque se falhar, mas aqui a falha é de regra de negócio.
        return { ok: false, error: 'Saldo insuficiente para a operação (Disponível: ' + currentDisp + ', Reservado: ' + currentRes + ')' };
    }

    const nextTotal = nextDisp + nextRes + nextTrans;
    const rowUpdate = {
        id_interno: id_interno,
        local: local,
        saldo_disponivel: nextDisp,
        saldo_reservado: nextRes,
        saldo_em_transito: nextTrans,
        saldo_total: nextTotal,
        atualizado_em: now
    };

    if (rowIndex === -1) {
        appendData(CONFIG.TABELAS.ESTOQUE, rowUpdate);
    } else {
        const range = sheetEstoque.getRange(rowIndex, 1, 1, headersEstoque.length);
        const updatedValues = headersEstoque.map((h, j) => {
            return rowUpdate[h] !== undefined ? rowUpdate[h] : dataEstoque[rowIndex - 1][j];
        });
        range.setValues([updatedValues]);
    }

    return { ok: true, message: 'Movimento e estoque atualizados com sucesso' };
  } catch (err) {
    return { ok: false, error: 'Falha ao atualizar estoque: ' + err.toString() };
  }
}


/**
 * Reordena produtos: Ativos primeiro
 */
function ordenarProdutos() {
  const sheet = getSheet(CONFIG.TABELAS.PRODUTOS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true };

  const headers = data[0].map(h => normalizeHeader(h));
  const statusIdx = headers.indexOf('status');
  
  if (statusIdx === -1) return { ok: false, error: 'Coluna status não encontrada' };

  const rows = data.slice(1);
  
  // Critério: Ativo primeiro, mantendo ordem relativa original
  rows.sort((a, b) => {
    const statusA = String(a[statusIdx]).toLowerCase().trim();
    const statusB = String(b[statusIdx]).toLowerCase().trim();
    
    const isAtivoA = (statusA === 'ativo' || statusA === '1' || statusA === 'sim');
    const isAtivoB = (statusB === 'ativo' || statusB === '1' || statusB === 'sim');

    if (isAtivoA && !isAtivoB) return -1;
    if (!isAtivoA && isAtivoB) return 1;
    return 0;
  });

  sheet.getRange(2, 1, rows.length, data[0].length).setValues(rows);
  return { ok: true, message: 'Produtos reordenados' };
}

/**
 * Auxiliares de Planilha
 */
function getSheet(name) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Aba "${name}" não encontrada`);
  return sheet;
}

/**
 * Gerencia bloqueio de sessão para conferência
 */
function lockSession(sessionId, user) {
  // Bloqueio desativado por solicitação do usuário
  return { ok: true, message: 'Bloqueio desativado' };
}

function unlockSession(sessionId) {
  // Desbloqueio desativado por solicitação do usuário
  return { ok: true };
}

/**
 * Finalização Atômica com Validação de Backend
 */
function finalizarConferencia(payload) {
  const { sessionId, rows, user } = payload;
  
  // 1. Validar integridade contra SEPARACAO_ITENS
  const expectedItems = listData(CONFIG.TABELAS.SEPARACAO_ITENS).filter(item => String(item.separacao_id) === String(sessionId));
  
  if (expectedItems.length === 0) return { ok: false, error: 'Itens da separação não encontrados para validação' };

  // Agrupar esperados por EAN/ID
  const expectedMap = {};
  expectedItems.forEach(item => {
    const key = String(item.id_interno || item.ean);
    expectedMap[key] = (expectedMap[key] || 0) + parseFloat(item.quantidade || 0);
  });

  // Agrupar recebidos do frontend
  const receivedMap = {};
  rows.forEach(row => {
    const key = String(row.id_interno || row.ean);
    receivedMap[key] = (receivedMap[key] || 0) + parseFloat(row.qtd_conferida || 0);
  });

  // VERIFICAÇÃO DE OURO (MANDATÓRIA)
  const divergence = [];
  Object.keys(expectedMap).forEach(key => {
    if (expectedMap[key] !== receivedMap[key]) {
      divergence.push(`Item ${key}: esperado ${expectedMap[key]}, recebido ${receivedMap[key]}`);
    }
  });

  if (divergence.length > 0) {
    return { ok: false, error: 'DIVERGÊNCIA DETECTADA NO BACKEND: ' + divergence.join(' | ') };
  }

  // 2. Integridade validada! Processar movimentos em LOTES para evitar timeout
  const now = new Date();
  try {
    const sheetConf = getSheet(CONFIG.TABELAS.CONFERENCIA_ITENS);
    const headersConf = sheetConf.getRange(1, 1, 1, sheetConf.getLastColumn()).getValues()[0].map(h => normalizeHeader(h));
    const confBatch = [];

    const sheetMov = getSheet(CONFIG.TABELAS.MOVIMENTOS);
    const headersMov = sheetMov.getRange(1, 1, 1, sheetMov.getLastColumn()).getValues()[0].map(h => normalizeHeader(h));
    const movBatch = [];

    // Carregar ESTOQUE em memória uma única vez (Otimização Máxima)
    const sheetEstoque = getSheet(CONFIG.TABELAS.ESTOQUE);
    const dataEstoque = sheetEstoque.getDataRange().getValues();
    const headersEstoque = dataEstoque[0].map(h => normalizeHeader(h));
    const idIdx = headersEstoque.indexOf('id_interno');
    const localIdx = headersEstoque.indexOf('local');
    const dispIdx = headersEstoque.indexOf('saldo_disponivel');
    const totalIdx = headersEstoque.indexOf('saldo_total');
    const updateIdx = headersEstoque.indexOf('atualizado_em');

    rows.forEach(row => {
      // Preparar Conferencia Row
      const confRowData = { ...row, conferido_por: user, conferido_em: now };
      confBatch.push(headersConf.map(h => confRowData[normalizeHeader(h)] !== undefined ? confRowData[normalizeHeader(h)] : ""));

      // Preparar Movimentos e Atualizar Estoque em Memória
      if (parseFloat(row.qtd_conferida) > 0) {
        const movId = 'MOV-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const movData = {
          movimento_id: movId,
          data_hora: now,
          tipo: 'CONFERENCIA',
          id_interno: row.id_interno,
          local_origem: '1_ANDAR', // Local padrão para conferência
          local_destino: "",
          quantidade: Math.abs(parseFloat(row.qtd_conferida)),
          usuario: user,
          origem: `PACK-${sessionId}`,
          observacao: `Baixa via conferência atômica`
        };
        movBatch.push(headersMov.map(h => movData[normalizeHeader(h)] !== undefined ? movData[normalizeHeader(h)] : ""));

        // Atualizar Estoque (Em Memória - sem chamadas de API repetitivas)
        for (let i = 1; i < dataEstoque.length; i++) {
          if (String(dataEstoque[i][idIdx]) === String(row.id_interno) && String(dataEstoque[i][localIdx]) === '1_ANDAR') {
             dataEstoque[i][dispIdx] = (parseFloat(dataEstoque[i][dispIdx]) || 0) - parseFloat(row.qtd_conferida);
             dataEstoque[i][totalIdx] = (parseFloat(dataEstoque[i][totalIdx]) || 0) - parseFloat(row.qtd_conferida);
             if (updateIdx !== -1) dataEstoque[i][updateIdx] = now;
             break;
          }
        }
      }
    });

    // Escritas em Lote (setValues é ordens de magnitude mais rápido que appendRow em loop)
    if (confBatch.length > 0) {
      sheetConf.getRange(sheetConf.getLastRow() + 1, 1, confBatch.length, headersConf.length).setValues(confBatch);
    }
    if (movBatch.length > 0) {
      sheetMov.getRange(sheetMov.getLastRow() + 1, 1, movBatch.length, headersMov.length).setValues(movBatch);
    }
    sheetEstoque.getRange(1, 1, dataEstoque.length, dataEstoque[0].length).setValues(dataEstoque);

    // 3. Atualizar status final da separação
    updateData(CONFIG.TABELAS.SEPARACAO, 'separacao_id', sessionId, {
      status: 'finalizada',
      atualizado_em: now,
      conferido_em: now,
      conferindo_por: ""
    });

    return { ok: true, message: 'Conferência finalizada com sucesso (Processada em Lote)' };
  } catch (err) {
    return { ok: false, error: 'Erro no processamento atômico em lote: ' + err.toString() };
  }
}

function normalizeHeader(header) {
  if (!header) return "";
  return String(header)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_') // Espaços para underscore
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9_]/g, ""); // Remove caracteres especiais
}

function getColumnLetter(index) {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}
