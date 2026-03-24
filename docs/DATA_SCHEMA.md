# DATA SCHEMA — DY AutoParts WMS

Este documento descreve a estrutura de dados utilizada no sistema **DY AutoParts WMS**.

O banco de dados utiliza **Google Sheets** como armazenamento principal.

Cada aba representa uma tabela do sistema.

---

# PRODUTOS

Tabela principal de cadastro de produtos.

Campos:

id_interno
ean
sku_fornecedor
descricao_base
marca
cor
categoria
subcategoria

atributo1
valor1
atributo2
valor2
atributo3
valor3
atributo4
valor4

unidade

preco_custo
preco_varejo
preco_atacado

qtd_minima_atacado

status

observacoes

url_imagem
url_pdf_manual

descricao_completa

---

# ESTOQUE_ATUAL

Tabela de estoque consolidado.

Campos:

id_interno
local

saldo_disponivel
saldo_reservado
saldo_em_transito
saldo_total

atualizado_em

---

# ENTRADAS_NF

Registro de entrada de mercadorias via nota fiscal.

Campos:

data_entrada
tipo_entrada
numero_nf
fornecedor

id_interno
ean
descricao

quantidade

custo_unitario
custo_total

local

usuario

observacoes

---

# MOVIMENTOS

Tabela central do sistema.

Toda alteração de estoque deve gerar um registro nesta tabela.

Campos:

movimento_id
data
tipo

id_interno

local_origem
local_destino

quantidade

usuario

origem

observacao

---

# SEPARACAO

Controle de sessões de separação (ROM).

Campos:

rom_id

canal_id
canal_nome

status

criado_por
criado_em

finalizado_em

observacao

---

# SEPARACAO_ITENS

Itens pertencentes a uma sessão de separação.

Campos:

rom_id

id_interno
ean
descricao

qtd_solicitada
qtd_separada

---

# CONFERENCIA

Registro de conferência final antes do envio.

Campos:

rom_id

id_interno
ean
descricao

qtd_separada
qtd_conferida

divergencia

conferido_por
conferido_em

---

# INVENTARIOS

Sessões de inventário.

Campos:

inventario_id

tipo
filtro

data_inicio
data_fim

status

criado_por

total_skus
total_itens_contados

total_divergencias

valor_ajuste_positivo
valor_ajuste_negativo

---

# INVENTARIO_ITENS

Itens auditados durante inventário.

Campos:

inventario_id

id_interno

local

saldo_sistema
saldo_fisico

diferenca

valor_unitario
valor_diferenca

auditado_em

usuario

---

# DEFEITOS

Controle de produtos com defeito ou avaria.

Campos:

defeito_id

data

id_interno

local_origem

quantidade

motivo

responsavel

status

destino_final

observacao

---

# USUARIOS

Usuários do sistema.

Campos:

id

nome

perfil

ativo

criado_em

---

# CANAIS_ENVIO

Canais de venda ou envio.

Campos:

id

nome

tipo

ativo

---

# Relações Principais

Produtos são referenciados através de:

id_interno

Tabelas relacionadas ao produto:

ESTOQUE_ATUAL
MOVIMENTOS
ENTRADAS_NF
SEPARACAO_ITENS
CONFERENCIA
INVENTARIO_ITENS
DEFEITOS

---

# Regra Central de Estoque

O estoque não deve ser alterado diretamente.

Fluxo correto:

MOVIMENTOS
↓
Atualização de estoque
↓
Reflexo em ESTOQUE_ATUAL

---

# Observação Importante

O campo principal de identificação de produto é:

id_interno

O EAN é utilizado para leitura via código de barras.
