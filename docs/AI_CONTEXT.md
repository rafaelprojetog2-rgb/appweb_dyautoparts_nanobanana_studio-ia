# DY AutoParts WMS — AI Project Context

## Visão Geral

O projeto DY AutoParts é um sistema WMS (Warehouse Management System) desenvolvido para operação logística de autopeças.

O objetivo é criar um sistema rápido para uso em celular, com leitura de código de barras, inventário, separação e conferência de pedidos.

O sistema funciona como uma aplicação web (PWA) com suporte a operação offline.

---

# Arquitetura do Sistema

Frontend
- HTML
- CSS
- JavaScript puro

Backend
- Google Apps Script

Banco de dados
- Google Sheets

Deploy
- Vercel

Versionamento
- GitHub

Editor principal
- Visual Studio Code

Ferramentas de IA usadas
- Studio IA
- Copilot
- ChatGPT

---

# Estrutura de Funcionamento

O sistema utiliza Google Sheets como banco de dados principal.

As operações são feitas via Google Apps Script que atua como API.

Fluxo:

App Web → API Apps Script → Google Sheets

---

# Módulos do Sistema

Produtos  
Consulta e leitura de código de barras.

Inventário  
Contagem de estoque via leitura de EAN.

Separação (PICK)  
Operador coleta produtos para pedidos.

Conferência (PACK)  
Validação final antes do envio.

Entrada de Nota Fiscal  
Registro de entrada de mercadorias.

Compras  
Controle de pedidos de compra.

Movimentações  
Registro de entrada e saída de estoque.

Financeiro  
Controle básico financeiro.

Dashboard  
Visão geral da operação.

Configurações  
Parâmetros do sistema.

---

# Estrutura de Planilhas

As planilhas utilizadas são:

PRODUTOS  
MOVIMENTOS  
ESTOQUE_ATUAL  
USUARIOS  
COMPRAS  
CONTAS_A_PAGAR  

A lógica de estoque é baseada em movimentações.

A planilha ESTOQUE_ATUAL funciona como espelho consolidado.

---

# Regras Importantes

Nunca alterar a lógica central de estoque.

Não alterar endpoints da API Apps Script.

Não alterar estrutura de planilhas sem planejamento.

Não quebrar compatibilidade mobile.

Evitar bibliotecas externas desnecessárias.

Priorizar performance para uso em celular.

---

# Interface

Interface mobile-first.

Uso intenso de leitura de código de barras via câmera.

Feedback operacional:

- Som ao bipar produto
- Vibração no celular
- Alertas visuais

---

# Sistema Offline

O sistema está evoluindo para um modelo Local-First.

Quando offline:

Operações devem ser armazenadas localmente.

Tecnologia usada:

IndexedDB

Quando a conexão volta:

O sistema sincroniza as operações pendentes.

---

# Sistema de Sincronização

O topo do sistema exibe:

Online | Sync | Pendências

Pendências indicam operações que ainda não foram sincronizadas com o servidor.

---

# Boas Práticas de Código

Gerar código simples e performático.

Evitar frameworks pesados.

Priorizar JavaScript puro.

Separar bem as funções.

Manter compatibilidade com PWA.

---

# Objetivo Futuro

Transformar o sistema em um WMS completo Local-First com sincronização inteligente e operação offline total.
