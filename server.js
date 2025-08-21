const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static('.')); // Servir archivos estáticos

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Configuración de SQL Server
const sqlConfig = {
    user: process.env.DB_USER || 'antarasql-cs-admin',
    password: process.env.DB_PASSWORD || 'cssql$db01',
    database: process.env.DB_NAME || 'sierragorda-prod',
    server: process.env.DB_SERVER || 'antara-cs-sqlprod.database.windows.net',
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

// Función para conectar a la base de datos
async function connectDB() {
    try {
        await sql.connect(sqlConfig);
        console.log('✅ Conectado a SQL Server');
    } catch (err) {
        console.error('❌ Error conectando a SQL Server:', err);
    }
}

// Endpoint para obtener guías por fecha
app.post('/api/waybills', async (req, res) => {
    try {
        const { fecha } = req.body;
        
        if (!fecha) {
            return res.status(400).json({ error: 'Fecha es requerida' });
        }

        const query = `
            SELECT TOP 100
                w.FOLIO,
                w.CREATED_ON,
                w.IS_CANCELLED,
                l.name as DESTINATARIO,
                ws.STATE as WAYBILL_STATE_ID,
                CASE 
                    WHEN ws.STATE = 1 THEN 'Generada'
                    WHEN ws.STATE = 4 THEN 'Recepcionada'
                    WHEN ws.STATE IS NULL THEN 'Generada'
                    ELSE 'Otro'
                END as ESTADO_DESCRIPCION
            FROM [ANTARA].[ANT_WAYBILL] w
            LEFT JOIN [ANTARA].[ANT_WAYBILL_STATE] ws ON w.ID = ws.ANT_WAYBILL_ID AND ws.IS_ACTIVE = 1
            LEFT JOIN [ANTARA].[ANT_WAYBILL_HISTORY] wh ON w.ID = wh.ANT_WAYBILL_ID
            LEFT JOIN [ANTARA].[ANT_WAYBILL_TRANSPORTATION] wt ON wt.ANT_WAYBILL_HISTORY_ID = wh.ANT_WAYBILL_ID
            LEFT JOIN [ANTARA].[ANT_TRANSPORTATION] t ON wt.ANT_TRANSPORTATION_ID = t.ID
            LEFT JOIN [ANTARA].[ANT_LOCATION] l ON t.LOCATION_ORIGIN_ID = l.ID
            WHERE CAST(w.CREATED_ON AS DATE) = @fecha
                AND w.IS_CANCELLED = 0
            ORDER BY w.CREATED_ON DESC
        `;

        const request = new sql.Request();
        request.input('fecha', sql.Date, fecha);
        
        const result = await request.query(query);
        
        console.log(`📊 Encontradas ${result.recordset.length} guías para ${fecha}`);
        
        res.json({
            success: true,
            data: result.recordset,
            count: result.recordset.length
        });
        
    } catch (err) {
        console.error('❌ Error en consulta:', err);
        res.status(500).json({ 
            success: false,
            error: 'Error al consultar la base de datos',
            details: err.message 
        });
    }
});

// Endpoint para obtener guías por rango de fechas
app.post('/api/waybills/range', async (req, res) => {
    try {
        const { fechaDesde, fechaHasta } = req.body;
        
        if (!fechaDesde || !fechaHasta) {
            return res.status(400).json({ error: 'Fechas desde y hasta son requeridas' });
        }

        const query = `
            SELECT TOP 100
                w.FOLIO,
                w.CREATED_ON,
                w.IS_CANCELLED,
                l.name as DESTINATARIO,
                ws.STATE as WAYBILL_STATE_ID,
                CASE 
                    WHEN ws.STATE = 1 THEN 'Generada'
                    WHEN ws.STATE = 4 THEN 'Recepcionada'
                    WHEN ws.STATE IS NULL THEN 'Generada'
                    ELSE 'Otro'
                END as ESTADO_DESCRIPCION
            FROM [ANTARA].[ANT_WAYBILL] w
            LEFT JOIN [ANTARA].[ANT_WAYBILL_STATE] ws ON w.ID = ws.ANT_WAYBILL_ID AND ws.IS_ACTIVE = 1
            LEFT JOIN [ANTARA].[ANT_WAYBILL_HISTORY] wh ON w.ID = wh.ANT_WAYBILL_ID
            LEFT JOIN [ANTARA].[ANT_WAYBILL_TRANSPORTATION] wt ON wt.ANT_WAYBILL_HISTORY_ID = wh.ANT_WAYBILL_ID
            LEFT JOIN [ANTARA].[ANT_TRANSPORTATION] t ON wt.ANT_TRANSPORTATION_ID = t.ID
            LEFT JOIN [ANTARA].[ANT_LOCATION] l ON t.LOCATION_ORIGIN_ID = l.ID
            WHERE CAST(w.CREATED_ON AS DATE) BETWEEN @fechaDesde AND @fechaHasta
                AND w.IS_CANCELLED = 0
            ORDER BY w.CREATED_ON DESC
        `;

        const request = new sql.Request();
        request.input('fechaDesde', sql.Date, fechaDesde);
        request.input('fechaHasta', sql.Date, fechaHasta);
        
        const result = await request.query(query);
        
        console.log(`📊 Encontradas ${result.recordset.length} guías del ${fechaDesde} al ${fechaHasta}`);
        
        res.json({
            success: true,
            data: result.recordset,
            count: result.recordset.length
        });
        
    } catch (err) {
        console.error('❌ Error en consulta de rango:', err);
        res.status(500).json({ 
            success: false,
            error: 'Error al consultar la base de datos',
            details: err.message 
        });
    }
});

// Endpoint de salud
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Servidor funcionando correctamente',
        timestamp: new Date().toISOString()
    });
});

// Ruta principal
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Servidor de Guías</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .container { max-width: 800px; margin: 0 auto; }
                    .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
                    .success { background: #d4edda; color: #155724; }
                    .info { background: #d1ecf1; color: #0c5460; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🚀 Servidor de Guías - SQL Server</h1>
                    <div class="status success">
                        ✅ Servidor funcionando en puerto ${PORT}
                    </div>
                    <div class="status info">
                        📊 Base de datos: antara-cs-sqlprod.database.windows.net
                    </div>
                    <h2>📋 Endpoints disponibles:</h2>
                    <ul>
                        <li><strong>GET /api/health</strong> - Estado del servidor</li>
                        <li><strong>POST /api/waybills</strong> - Obtener guías por fecha</li>
                        <li><strong>GET /guias-dia-real.html</strong> - Interfaz web</li>
                    </ul>
                    <h2>🔗 Enlaces:</h2>
                    <ul>
                        <li><a href="/guias-dia-real.html">📋 Ver interfaz de guías</a></li>
                        <li><a href="/api/health">🔍 Verificar estado del servidor</a></li>
                    </ul>
                </div>
            </body>
        </html>
    `);
});

// Iniciar servidor
async function startServer() {
    await connectDB();
    
    app.listen(PORT, () => {
        console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
        console.log(`📋 Interfaz disponible en http://localhost:${PORT}/guias-dia-real.html`);
    });
}

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
    console.error('❌ Error no manejado:', err);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando servidor...');
    await sql.close();
    process.exit(0);
});

startServer().catch(console.error);

