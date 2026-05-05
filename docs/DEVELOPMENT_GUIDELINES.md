# DEVELOPMENT GUIDELINES — DY AutoParts WMS

Este documento define as diretrizes de desenvolvimento do projeto **DY AutoParts WMS**.

O objetivo é manter o código organizado, performático e fácil de manter.

---

# Estrutura de Código

O projeto deve seguir uma estrutura simples e modular.

Exemplo:

src/

produtos.js
inventario.js
movimentacoes.js
separacao.js
conferencia.js
financeiro.js

Cada módulo deve ter responsabilidade clara.

Evitar concentrar todo o código em um único arquivo.

---

# Organização de Funções

Funções devem ser pequenas e específicas.

Evitar funções gigantes.

Exemplo correto:

buscarProduto()
registrarMovimentacao()
validarEAN()

Evitar funções com múltiplas responsabilidades.

---

# Nomes de Variáveis

Utilizar nomes claros e descritivos.

Exemplo correto:

produtoSelecionado
estoqueAtual
movimentacaoTipo

Evitar abreviações confusas.

---

# Padrão de Funções

Preferir funções simples e diretas.

Exemplo:

function buscarProduto(ean) {

}

Evitar lógica excessivamente complexa.

---

# Separação de Responsabilidades

Cada módulo deve controlar apenas sua área.

Exemplo:

produtos.js
responsável por produtos

inventario.js
responsável por inventário

movimentacoes.js
responsável por registrar movimentações

---

# Integração com Backend

Toda comunicação com o backend ocorre via:

Google Apps Script

As funções devem utilizar chamadas claras como:

google.script.run

Evitar múltiplas chamadas desnecessárias.

---

# Interface do Usuário

A interface deve priorizar:

rapidez
simplicidade
uso operacional

Evitar:

animações pesadas
componentes complexos

---

# Leitura de Código de Barras

A leitura de código de barras deve ser rápida.

Sempre fornecer:

feedback visual
feedback sonoro
feedback de erro

Evitar delays na leitura.

---

# Código Offline

Sempre considerar operação offline.

Quando necessário:

salvar dados localmente utilizando:

IndexedDB

Depois sincronizar com o servidor.

---

# Comentários no Código

Adicionar comentários apenas quando necessário.

Explicar:

lógica complexa
regras de negócio importantes

Evitar comentários redundantes.

---

# Performance

Priorizar performance.

Evitar:

loops desnecessários
consultas repetidas
operações pesadas no frontend.

---

# Boas Práticas

Sempre:

manter código simples
separar responsabilidades
testar leitura de código de barras
garantir funcionamento offline

---

# Objetivo do Projeto

O objetivo do sistema é ser:

rápido
confiável
simples de operar

Especialmente em ambiente de estoque.
