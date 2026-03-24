# SYSTEM ARCHITECTURE — DY AutoParts WMS

## Visão Geral do Sistema

O projeto **DY AutoParts WMS** é um sistema web para gestão de estoque e operações logísticas de autopeças.

O objetivo do sistema é permitir operações rápidas através de dispositivos móveis, utilizando leitura de código de barras e interface simplificada para operações de estoque.

O sistema foi projetado para funcionar em:

* Desktop
* Celular
* Operação em armazém
* Ambiente com internet instável

Por isso possui suporte a **operações offline** com sincronização posterior.

---

# Arquitetura Tecnológica

## Frontend

Tecnologias utilizadas:

HTML
CSS
JavaScript

Interface otimizada para uso operacional com:

* botões grandes
* leitura rápida
* baixa latência

---

## Backend

O backend utiliza:

Google Apps Script

Responsável por:

* processar dados
* gravar movimentações
* consultar produtos
* integrar com Google Sheets

---

## Banco de Dados

O sistema utiliza **Google Sheets como banco de dados**.

Principais tabelas:

PRODUTOS
MOVIMENTOS
ESTOQUE_ATUAL
COMPRAS
FORNECEDORES
USUARIOS
FINANCEIRO

---

# Estrutura de Estoque

O estoque **não deve ser alterado diretamente**.

Toda alteração deve ocorrer através da tabela:

MOVIMENTOS

Fluxo correto:

MOVIMENTAÇÃO
↓
Atualização de estoque
↓
Reflexo em ESTOQUE_ATUAL

Isso garante histórico completo das operações.

---

# Módulos do Sistema

## Produtos

Responsável por:

* consulta de produtos
* leitura de EAN
* visualização de estoque
* cadastro de produtos
* edição de dados

Campos comuns:

id_interno
ean
descricao
marca
categoria
estoque

---

## Compras

Responsável por controle de pedidos de fornecedores.

Funções:

* registrar pedido de compra
* acompanhar status do pedido
* registrar previsão de entrega

Quando o produto chega:

Entrada é registrada via **Entrada de NF**.

---

## Entrada de NF

Responsável por registrar entrada de mercadorias.

Fluxo:

Nota fiscal recebida
↓
Produtos identificados
↓
Criação de movimentação de entrada
↓
Atualização do estoque

---

## Movimentações

Tabela central do sistema.

Registra:

entrada
saída
transferência
ajuste
inventário

Cada movimentação contém:

data
produto
quantidade
tipo_movimento
usuario

---

## Inventário

Permite realizar contagem física de estoque.

Fluxo:

iniciar sessão de inventário
↓
operador bipando produtos
↓
registro de contagem
↓
comparação com estoque atual
↓
geração de ajustes

---

## Separação (PICK)

Responsável por coletar produtos para pedidos.

Fluxo:

pedido gerado
↓
operador inicia separação
↓
produtos são bipados
↓
registro de coleta

---

## Conferência (PACK)

Etapa final antes da expedição.

Funções:

* conferência cega
* validação da separação
* bloqueio se divergência

Fluxo:

produto bipado
↓
comparação com lista esperada
↓
liberação para envio

---

## Financeiro

Controle financeiro básico.

Funções:

contas a pagar
contas a receber
controle de despesas

---

## Dashboard

Painel de indicadores do sistema.

Mostra:

estoque crítico
movimentações recentes
indicadores operacionais

---

## Configurações

Controle administrativo do sistema.

Inclui:

* permissões de usuário
* parâmetros operacionais
* configurações gerais

---

# Arquitetura Offline

O sistema suporta operação offline.

Quando a internet não está disponível:

Operações são armazenadas localmente.

Tecnologia utilizada:

IndexedDB

Fluxo offline:

Operação realizada
↓
Salva localmente
↓
Adiciona na fila de sincronização

Quando a conexão volta:

Sistema envia dados pendentes para o servidor.

---

# Sistema de Sincronização

O topo da interface exibe:

Online
Sync
Pendências

Pendências representam operações ainda não sincronizadas.

Quando o sistema volta online:

* operações são enviadas ao servidor
* contador de pendências é zerado

---

# Boas Práticas do Projeto

Priorizar:

JavaScript puro

Evitar:

frameworks pesados

Objetivo:

manter sistema rápido para operações de estoque.

---

# Diretrizes de Desenvolvimento

Sempre que novas funcionalidades forem criadas:

* respeitar arquitetura de movimentações
* evitar alterar estoque diretamente
* manter compatibilidade com operação offline
* priorizar performance operacional

---

# Futuras Expansões

O sistema pode evoluir para incluir:

Pedidos
Integração com marketplaces
Gestão de expedição
Relatórios avançados
Controle de logística
