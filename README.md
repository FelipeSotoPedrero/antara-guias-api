# 🚛 Antara Guías API

API para monitoreo de guías de transporte en tiempo real.

## 📊 Endpoints

### **POST /api/waybills**
Obtiene las guías por fecha específica.

**Body:**
```json
{
  "fecha": "2024-01-15"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "FOLIO": "GUI-001",
      "CREATED_ON": "2024-01-15T10:30:00",
      "ESTADO": "Generada",
      "WAYBILL_STATE_ID": 1,
      "transportation_type": "Terrestre",
      "location_name": "Santiago"
    }
  ],
  "count": 1,
  "fecha": "2024-01-15",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### **GET /health**
Verifica el estado del servidor.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600
}
```

## 🛠️ Tecnologías

- **Node.js** - Runtime de JavaScript
- **Express** - Framework web
- **MSSQL** - Cliente para SQL Server
- **CORS** - Middleware para CORS

## 🚀 Deploy

Este proyecto está configurado para deploy automático en Render.com.

**URL de producción:** `https://antara-guias-api.onrender.com`

## 📋 Base de Datos

Conecta a SQL Server Azure con las siguientes tablas:
- `[ANTARA].[ANT_WAYBILL]` - Guías principales
- `[ANTARA].[ANT_WAYBILL_STATE]` - Estados de guías
- `[ANTARA].[ANT_WAYBILL_HISTORY]` - Historial de guías
- `[ANTARA].[ANT_WAYBILL_TRANSPORTATION]` - Relación guía-transporte
- `[ANTARA].[ANT_TRANSPORTATION]` - Información de transporte
- `[ANTARA].[ANT_LOCATION]` - Ubicaciones

## 🔧 Desarrollo Local

```bash
# Instalar dependencias
npm install

# Ejecutar servidor
npm start

# El servidor estará disponible en http://localhost:3000
```

## 📝 Licencia

MIT License - Antara Solutions
