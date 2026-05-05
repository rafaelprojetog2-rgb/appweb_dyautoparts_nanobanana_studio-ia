# CODE PATTERNS — DY AutoParts WMS

Este documento define padrões de código utilizados no projeto **DY AutoParts WMS**.

O objetivo é garantir consistência na implementação de funcionalidades.

---

# Estrutura de Funções

Funções devem ser simples, diretas e com responsabilidade clara.

Exemplo:

function buscarProduto(ean) {

if(!ean){
return null
}

// lógica de busca

}

---

# Padrão de Consulta de Produto

Sempre buscar produto utilizando EAN ou ID interno.

Exemplo:

function consultarProduto(ean){

google.script.run
.withSuccessHandler(function(produto){

```
  if(!produto){
    mostrarErro("Produto não encontrado")
    return
  }

  renderProduto(produto)

})
.buscarProduto(ean)
```

}

---

# Padrão de Registro de Movimentação

Toda alteração de estoque deve gerar movimentação.

Exemplo:

function registrarMovimentacao(dados){

google.script.run
.withSuccessHandler(function(res){

```
  if(res.status !== "ok"){
    mostrarErro("Erro ao registrar movimentação")
    return
  }

  mostrarSucesso("Movimentação registrada")

})
.registrarMovimento(dados)
```

}

---

# Padrão de Feedback ao Operador

Sempre fornecer retorno visual ou sonoro.

Exemplo:

function mostrarSucesso(msg){

console.log(msg)

}

function mostrarErro(msg){

alert(msg)

}

---

# Padrão para Operações Offline

Quando offline, salvar operação localmente.

Exemplo:

function salvarOperacaoOffline(operacao){

const db = window.indexedDB

// salvar operação para sincronização futura

}

---

# Padrão de Sincronização

Quando internet voltar, sincronizar pendências.

Exemplo:

function sincronizarPendencias(){

if(!navigator.onLine){
return
}

// enviar dados para o backend

}

---

# Padrão de Inicialização do Sistema

Ao iniciar o sistema:

1. verificar conexão
2. carregar configurações
3. sincronizar operações pendentes

Exemplo:

function iniciarSistema(){

atualizarStatusConexao()

sincronizarPendencias()

}

---

# Padrão de Estrutura de Arquivos

Arquivos recomendados:

app.js
produtos.js
inventario.js
movimentacoes.js
separacao.js
conferencia.js

Cada arquivo deve conter apenas funções do módulo correspondente.

---

# Objetivo dos Padrões

Estes padrões garantem:

consistência de código
facilidade de manutenção
integração correta com backend
suporte ao modo offline
