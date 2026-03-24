# BUSINESS RULES — DY AutoParts WMS

This document defines the business rules that govern the warehouse system.

All AI-generated code must respect these rules.

---

# 1. Product Identification

Products must be identified using:

id_interno

EAN is used only for scanning.

Multiple products may share the same EAN.

Example:

Sensor Grafite Mafreet
Sensor Grafite JP2

Same EAN, different id_interno.

---

# 2. Stock Control

Stock cannot be edited manually.

Stock must always be calculated using the movement log.

Stock formula:

Current Stock = SUM(entries) - SUM(exits)

Source table:

MOVIMENTOS

---

# 3. Movement Integrity

Every stock change must create a movement record.

Allowed movement types:

CHEGADA_COMPRA
CONFIRMACAO_SAIDA
AJUSTE_POSITIVO
AJUSTE_NEGATIVO
TRANSFERENCIA
RESERVA_ESTOQUE

Stock must never be edited directly.

---

# 4. Traceability

Every operation must record:

user
timestamp
operation
origin
location

Example origins:

INVENTARIO
PICK
PACK
COMPRA
AJUSTE

---

# 5. Mobile Warehouse Operation

The system is designed for warehouse mobile operation.

Rules:

Large buttons
Barcode scanning
Audio feedback
Vibration feedback
Minimal typing

---

# 6. Performance

System must prioritize speed.

Rules:

Avoid heavy frameworks
Prefer simple JavaScript
Cache data locally
Minimize server requests

---

# 7. Error Prevention

System must prevent:

Negative stock
Duplicate movements
Invalid product identifiers

---

# 8. System Integrity

AI must never:

Delete movement history
Modify historical records
Change product identifiers
Break API compatibility
