  # WORKFLOW RULES — DY AutoParts WMS

This document defines the operational workflows of the warehouse system.

The AI must follow these workflows when implementing or modifying features.

---

# 1. Product Registration

Flow:

Create product
↓
Generate id_interno
↓
Register EAN
↓
Define category
↓
Define storage location
↓
Product becomes available for operations

Rules:

id_interno is the unique identifier
EAN may be duplicated across brands
Product cannot be deleted if movements exist

---

# 2. Purchase Workflow

Create purchase order
↓
Send order to supplier
↓
Wait for delivery
↓
Receive goods
↓
Register invoice (Entrada NF)
↓
Generate movement CHEGADA_COMPRA
↓
Stock becomes available

Rules:

Purchase orders do not affect stock
Stock is only affected after invoice entry

---

# 3. Inventory Workflow

Start inventory session
↓
Scan products
↓
Count quantities
↓
Save inventory items
↓
Compare with expected stock
↓
Generate adjustment movement if needed

Movement types used:

AJUSTE_POSITIVO
AJUSTE_NEGATIVO

Rules:

Inventory must not edit stock directly
Adjustments generate movements

---

# 4. Picking Workflow (Order Separation)

Create picking order
↓
Reserve stock
↓
Operator scans items
↓
Items added to separation
↓
Separation completed

Movement type:

RESERVA_ESTOQUE

Rules:

Stock becomes reserved but not removed yet

---

# 5. Packing Workflow (Order Conference)

Start packing session
↓
Scan separated products
↓
Validate quantities
↓
Finalize order

Movement type:

CONFIRMACAO_SAIDA

Rules:

This is when stock is effectively reduced

---

# 6. Stock Movement Rules

Stock must never be edited directly.

Stock balance must always be calculated from movement logs.

Allowed movement types:

CHEGADA_COMPRA
CONFIRMACAO_SAIDA
AJUSTE_POSITIVO
AJUSTE_NEGATIVO
TRANSFERENCIA
RESERVA_ESTOQUE

---
# 7. Offline Operation

System must support offline operation.

When offline:

Operations are stored locally
↓
Added to synchronization queue
↓
Sent to server when connection returns

Technology used:

IndexedDB
Offline Queue
Background Sync
