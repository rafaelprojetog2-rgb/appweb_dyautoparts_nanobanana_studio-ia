# PROMPTS — DY AutoParts WMS

Este arquivo contém prompts prontos para usar no Studio IA ou outras ferramentas de IA ao trabalhar neste projeto.

---

# 1️⃣ Prompt de Contexto do Projeto

Use este prompt antes de iniciar qualquer tarefa para garantir que a IA entenda o sistema.

Leia todo o projeto antes de fazer alterações.

Contexto do sistema:
Este projeto é o DY AutoParts WMS, um sistema web para gestão de estoque e operações logísticas de autopeças.

Arquitetura:
Frontend: HTML + CSS + JavaScript
Backend: Google Apps Script
Banco de dados: Google Sheets
Deploy: Vercel
Repositório: GitHub

Módulos do sistema:
- leitura de código de barras
- inventário
- separação (PICK)
- conferência (PACK)
- movimentações de estoque
- entrada de nota fiscal
- financeiro
- dashboard

O sistema funciona em celulares e utiliza a câmera para leitura de EAN.

Existe suporte para funcionamento offline.

Modo offline:
Operações são armazenadas localmente e sincronizadas depois.

Indicador no topo do sistema:
Online | Sync | Pendências

Tecnologia usada para offline:
IndexedDB

Regras importantes:
Não alterar a lógica atual de estoque.
Não alterar endpoints da API.
Não remover funcionalidades existentes.
Evitar frameworks pesados.
Priorizar JavaScript puro.

Sempre analisar os arquivos existentes antes de propor mudanças.

---

# 2️⃣ Prompt para Criar Funcionalidade Nova

Analise o projeto existente antes de gerar código.

Implemente a nova funcionalidade respeitando:

- arquitetura atual
- lógica de estoque existente
- compatibilidade mobile
- funcionamento offline

Não sobrescrever arquivos inteiros.
Modificar apenas o necessário.

Explique onde cada trecho de código deve ser inserido.

---

# 3️⃣ Prompt para Correção de Bug

Analise o projeto completo antes de sugerir alterações.

Identifique a causa do erro e proponha a menor alteração possível para corrigir o problema.

Não remover funcionalidades existentes.
Não alterar estrutura da API.

---

# 4️⃣ Prompt para Funcionalidade Offline

Implemente a funcionalidade considerando suporte offline.

Utilize IndexedDB para armazenar dados localmente.

As operações devem ser sincronizadas quando a conexão retornar.

Manter indicador de pendências no topo do sistema.

---

# 5️⃣ Prompt para Refatoração Segura

Analise o código atual e proponha melhorias sem alterar o comportamento do sistema.

Objetivos:
- melhorar organização
- reduzir duplicação de código
- manter compatibilidade com o backend Apps Script
