# PROJECT RULES — DY AutoParts WMS

Este documento define regras obrigatórias para desenvolvimento do sistema **DY AutoParts WMS**.

Todas as alterações no projeto devem respeitar estas diretrizes.

---

# Regra 1 — Nunca alterar estoque diretamente

O estoque **não pode ser alterado diretamente**.

Toda alteração de estoque deve ocorrer através da tabela:

MOVIMENTOS

Fluxo correto:

Movimentação
↓
Atualização de estoque
↓
Reflexo em ESTOQUE_ATUAL

Isso garante histórico completo de operações.

---

# Regra 2 — Priorizar performance operacional

Este sistema é utilizado em ambiente de armazém.

Por isso o código deve ser:

rápido
simples
leve

Evitar:

frameworks pesados
bibliotecas desnecessárias

Priorizar:

JavaScript puro.

---

# Regra 3 — Interface otimizada para operação

A interface deve ser pensada para uso em:

celular
tablet
ambiente de estoque

Portanto:

botões grandes
interações rápidas
mínimo de cliques

---

# Regra 4 — Leitura de código de barras é prioridade

Grande parte das operações ocorre via:

leitura de EAN.

O sistema deve sempre priorizar:

bip rápido
feedback visual
feedback sonoro

Evitar operações que atrasem a leitura.

---

# Regra 5 — Manter suporte a operação offline

O sistema possui suporte a operação offline.

Quando a internet não estiver disponível:

operações devem ser armazenadas localmente.

Tecnologia utilizada:

IndexedDB

Fluxo:

Operação
↓
Salvar localmente
↓
Fila de sincronização
↓
Enviar quando online

Nenhuma nova funcionalidade deve quebrar esse fluxo.

---

# Regra 6 — Movimentações são o núcleo do sistema

O núcleo do sistema é:

MOVIMENTOS

Todas as operações devem gerar movimentações:

entrada
saída
inventário
transferência
ajustes

---

# Regra 7 — Código deve ser modular

Separar bem as responsabilidades do código.

Exemplo:

produto.js
inventario.js
movimentacao.js

Evitar arquivos gigantes.

---

# Regra 8 — Manter compatibilidade com Google Apps Script

O backend utiliza:

Google Apps Script

Toda integração deve manter compatibilidade com essa arquitetura.

Evitar dependências que não funcionem nesse ambiente.

---

# Regra 9 — Priorizar simplicidade

Sempre preferir:

soluções simples
código claro
fácil manutenção

Evitar complexidade desnecessária.

---

# Regra 10 — Antes de alterar o sistema

Antes de qualquer alteração:

1. entender a arquitetura do sistema
2. respeitar a lógica de movimentações
3. garantir que a operação offline continue funcionando
