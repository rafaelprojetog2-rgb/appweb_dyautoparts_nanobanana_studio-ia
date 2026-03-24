# MODULE MAP — DY AutoParts WMS

Este documento descreve os módulos do sistema **DY AutoParts WMS**.

O objetivo é ajudar desenvolvedores e ferramentas de IA a entender a estrutura funcional do sistema.

---

# Módulos Principais

O sistema é dividido nos seguintes módulos principais:

Produtos
Compras
Entrada de NF
Movimentações
Inventário
Separação (PICK)
Conferência (PACK)
Financeiro
Dashboard
Configurações

---

# Produtos

Responsável pela gestão de produtos.

Subfunções:

consulta de produto
busca por EAN
cadastro de produto
edição de produto
visualização de estoque
informações de marca e categoria

---

# Compras

Controle de pedidos de fornecedores.

Subfunções:

criar pedido de compra
acompanhar pedido
previsão de entrega
controle de fornecedores

---

# Entrada de NF

Registro de entrada de mercadorias.

Subfunções:

registro de nota fiscal
vinculação de produtos
entrada de estoque
geração de movimentação de entrada

---

# Movimentações

Módulo central do sistema.

Registra todas as alterações de estoque.

Tipos de movimentação:

entrada
saída
ajuste
transferência
inventário

---

# Inventário

Contagem física de estoque.

Subfunções:

criar sessão de inventário
leitura de produtos
registro de contagem
comparação com estoque
ajuste de divergências

---

# Separação (PICK)

Coleta de produtos para pedidos.

Subfunções:

listar pedidos
iniciar separação
leitura de produtos
registro de coleta

---

# Conferência (PACK)

Conferência final antes do envio.

Subfunções:

conferência cega
validação da separação
identificação de divergências
liberação de envio

---

# Financeiro

Controle financeiro do sistema.

Subfunções:

contas a pagar
contas a receber
controle de despesas

---

# Dashboard

Painel de indicadores do sistema.

Exibe:

estoque crítico
movimentações recentes
indicadores operacionais

---

# Configurações

Controle administrativo do sistema.

Subfunções:

gestão de usuários
parâmetros do sistema
configurações operacionais

---

# Futuras Expansões

O sistema pode incluir novos módulos:

Pedidos
Expedição
Integração com marketplaces
Relatórios avançados
Controle logístico
