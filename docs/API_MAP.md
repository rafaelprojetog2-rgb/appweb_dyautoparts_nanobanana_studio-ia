# API MAP — DY AutoParts WMS

Este documento descreve as funções da API utilizadas pelo sistema **DY AutoParts WMS**.

O backend do sistema utiliza **Google Apps Script**.

O frontend comunica com o backend utilizando:

google.script.run

---

# Estrutura de chamada

Exemplo de chamada no frontend:

google.script.run
.withSuccessHandler(callback)
.nomeDaFuncao(parametros)

---

# PRODUTOS

## buscarProduto

Busca um produto pelo EAN ou ID interno.

Parâmetros:

ean ou id_interno

Retorno:

dados do produto

Campos retornados:

id_interno
ean
descricao
marca
categoria
estoque

---

## buscarSugestoes

Busca produtos por texto.

Parâmetros:

termo

Retorno:

lista de produtos

---

# MOVIMENTAÇÕES

## registrarMovimento

Registra movimentação de estoque.

Parâmetros:

tipo
id_interno
quantidade
local_origem
local_destino
usuario

Retorno:

status da operação

---

## listarMovimentacoes

Lista movimentações recentes.

Parâmetros:

filtros opcionais

Retorno:

lista de movimentações

---

# ENTRADA DE NF

## registrarEntradaNF

Registra entrada de mercadoria via nota fiscal.

Parâmetros:

numero_nf
fornecedor
id_interno
quantidade
custo_unitario
local

Retorno:

status da operação

---

# INVENTÁRIO

## criarInventario

Cria sessão de inventário.

Parâmetros:

tipo
filtro
usuario

Retorno:

inventario_id

---

## registrarContagemInventario

Registra contagem de item no inventário.

Parâmetros:

inventario_id
id_interno
local
quantidade

Retorno:

status

---

## finalizarInventario

Finaliza sessão de inventário.

Parâmetros:

inventario_id

Retorno:

resumo do inventário

---

# SEPARAÇÃO (PICK)

## criarSeparacao

Cria sessão de separação.

Parâmetros:

canal
usuario

Retorno:

rom_id

---

## registrarSeparacao

Registra item separado.

Parâmetros:

rom_id
id_interno
quantidade

Retorno:

status

---

## finalizarSeparacao

Finaliza sessão de separação.

Parâmetros:

rom_id

Retorno:

status

---

# CONFERÊNCIA (PACK)

## registrarConferencia

Registra conferência de item.

Parâmetros:

rom_id
id_interno
quantidade

Retorno:

status

---

## finalizarConferencia

Finaliza conferência.

Parâmetros:

rom_id

Retorno:

status

---

# USUÁRIOS

## listarUsuarios

Lista usuários ativos.

Retorno:

lista de usuários

---

# ESTOQUE

## consultarEstoque

Consulta estoque de um produto.

Parâmetros:

id_interno

Retorno:

saldo_disponivel
saldo_reservado
saldo_total

---

# Observação importante

Todas as alterações de estoque devem gerar movimentações.

Nunca alterar diretamente a tabela:

ESTOQUE_ATUAL
