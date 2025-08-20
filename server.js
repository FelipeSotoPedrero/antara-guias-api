const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: ['https://monitorsg.antarasolutions.com', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const sqlConfig = {
    user: 'antarasql-cs-admin',
    password: 'cssql$db01',
    database: 'ANTARA',
    server: 'antara-cs-sqlprod.database.windows.net',
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

app.post('/api/waybills', async (req, res) => {
    try {
        const { fecha } = req.body;
        
        if (!fecha) {
            return res.status(400).json({
                success: false,
                error: 'Fecha es requerida'
            });
        }

        await sql.connect(sqlConfig);
        
        const result = await sql.query`
            SELECT TOP 50
                w.FOLIO,
                w.CREATED_ON,
                CASE 
                    WHEN ws.WAYBILL_STATE_ID = 1 THEN 'Generada'
                    WHEN ws.WAYBILL_STATE_ID = 4 THEN 'Recepcionada'
                    ELSE 'Otro'
                END as ESTADO,
                ws.WAYBILL_STATE_ID,
                ISNULL(t.transportation_type, 'N/A') as transportation_type,
                ISNULL(l.location_name, 'N/A') as location_name
            FROM [ANTARA].[ANT_WAYBILL] w
            LEFT JOIN [ANTARA].[ANT_WAYBILL_STATE] ws ON w.ID = ws.ANT_WAYBILL_ID AND ws.IS_ACTIVE = 1
            LEFT JOIN [ANTARA].[ANT_WAYBILL_HISTORY] wh ON w.ID = wh.ANT_WAYBILL_ID
            LEFT JOIN [ANTARA].[ANT_WAYBILL_TRANSPORTATION] wt ON wt.ANT_WAYBILL_HISTORY_ID = wh.ANT_WAYBILL_ID
            LEFT JOIN [ANTARA].[ANT_TRANSPORTATION] t ON wt.ANT_TRANSPORTATION_ID = t.ID
            LEFT JOIN [ANTARA].[ANT_LOCATION] l ON t.LOCATION_ORIGIN_ID = l.ID
            WHERE CAST(w.CREATED_ON AS DATE) = ${fecha}
                AND w.IS_CANCELLED = 0
            ORDER BY w.CREATED_ON DESC
        `;

        res.json({
            success: true,
            data: result.recordset,
            count: result.recordset.length,
            fecha: fecha,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({
            success: false,
            error: 'Error al consultar la base de datos',
            details: err.message
        });
    } finally {
        sql.close();
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 API disponible en: /api/waybills`);
    console.log(`🏥 Health check: /health`);
});
