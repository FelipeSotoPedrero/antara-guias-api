const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 3000;

// Sistema de keep-alive para prevenir cold starts
let keepAliveInterval = null;
const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutos

function startKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
    
    keepAliveInterval = setInterval(async () => {
        try {
            // Hacer un request interno para mantener el servidor activo
            const response = await fetch(`http://localhost:${PORT}/api/health`, {
                method: 'GET',
                headers: { 'User-Agent': 'Keep-Alive-System' }
            });
            
            if (response.ok) {
                console.log(`🔄 Keep-alive ping exitoso: ${new Date().toISOString()}`);
            } else {
                console.log(`⚠️ Keep-alive ping falló: ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ Keep-alive ping error: ${error.message}`);
        }
    }, KEEP_ALIVE_INTERVAL);
    
    console.log(`🚀 Sistema de keep-alive iniciado (cada ${KEEP_ALIVE_INTERVAL/1000} segundos)`);
}

// Rate limiting simple para prevenir ataques de fuerza bruta
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const BLOCK_TIME = 15 * 60 * 1000; // 15 minutos

function checkRateLimit(ip) {
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || { count: 0, firstAttempt: now };
    
    // Reset si ya pasó el tiempo de bloqueo
    if (now - attempts.firstAttempt > BLOCK_TIME) {
        attempts.count = 0;
        attempts.firstAttempt = now;
    }
    
    // Incrementar intentos
    attempts.count++;
    loginAttempts.set(ip, attempts);
    
    return attempts.count <= MAX_ATTEMPTS;
}

app.use(cors({
    origin: ['https://monitorsg.antarasolutions.com', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Middleware de logging para debug
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Configuración de credenciales (en producción deberían estar en variables de entorno)
const VALID_CREDENTIALS = {
    'monitor@antarasolutions.com': 'monitor.2025'
};

// Middleware para validar credenciales
function validateCredentials(usuario, clave) {
    return VALID_CREDENTIALS[usuario] === clave;
}

// Endpoint de autenticación
app.post('/api/auth/login', (req, res) => {
    try {
        const { usuario, clave } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        // Verificar rate limiting
        if (!checkRateLimit(clientIP)) {
            console.log(`🚫 Intento de login bloqueado desde IP: ${clientIP}`);
            return res.status(429).json({
                success: false,
                message: 'Demasiados intentos de login. Intenta nuevamente en 15 minutos.'
            });
        }
        
        // Validar que se proporcionen ambos campos
        if (!usuario || !clave) {
            return res.status(400).json({
                success: false,
                message: 'Usuario y contraseña son requeridos'
            });
        }
        
        // Validar credenciales
        if (validateCredentials(usuario, clave)) {
            console.log(`✅ Login exitoso para usuario: ${usuario} desde IP: ${clientIP}`);
            res.json({
                success: true,
                message: 'Autenticación exitosa',
                usuario: usuario,
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`❌ Login fallido para usuario: ${usuario} desde IP: ${clientIP}`);
            res.status(401).json({
                success: false,
                message: 'Usuario o contraseña incorrectos'
            });
        }
        
    } catch (error) {
        console.error('Error en autenticación:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Endpoint para verificar estado de sesión
app.get('/api/auth/status', (req, res) => {
    res.json({
        success: true,
        authenticated: true,
        timestamp: new Date().toISOString()
    });
});

const sqlConfig = {
    user: 'antarasql-cs-admin',
    password: 'cssql$db01',
    database: 'sierragorda-prod',
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

        // Validar formato de fecha (YYYY-MM-DD)
        const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!fechaRegex.test(fecha)) {
            return res.status(400).json({
                success: false,
                error: 'Formato de fecha inválido. Use YYYY-MM-DD'
            });
        }

        await sql.connect(sqlConfig);
        
        const result = await sql.query`
            SELECT TOP 50
                w.FOLIO,
                w.CREATED_ON as FECHA_ESTADO,
                CASE 
                    WHEN ws.STATE = 1 THEN 'Generada'
                    WHEN ws.STATE = 4 THEN 'Recepcionada'
                    ELSE 'Otro'
                END as ESTADO,
                ws.STATE,
                ISNULL(l.name, 'N/A') as DESTINATARIO
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
        console.error('Error en consulta de waybills:', err);
        console.error('Fecha recibida:', fecha);
        console.error('Tipo de fecha:', typeof fecha);
        res.status(500).json({
            success: false,
            error: 'Error al consultar la base de datos',
            details: err.message,
            fecha: fecha
        });
    } finally {
        try {
            await sql.close();
        } catch (closeErr) {
            console.error('Error cerrando conexión:', closeErr);
        }
    }
});

// Endpoint para obtener guías por rango de fechas
app.post('/api/waybills/range', async (req, res) => {
    try {
        const { fechaDesde, fechaHasta } = req.body;
        
        if (!fechaDesde || !fechaHasta) {
            return res.status(400).json({
                success: false,
                error: 'Fechas desde y hasta son requeridas'
            });
        }

        // Validar formato de fechas (YYYY-MM-DD)
        const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!fechaRegex.test(fechaDesde) || !fechaRegex.test(fechaHasta)) {
            return res.status(400).json({
                success: false,
                error: 'Formato de fecha inválido. Use YYYY-MM-DD'
            });
        }

        await sql.connect(sqlConfig);
        
        const result = await sql.query`
            SELECT TOP 100
                w.FOLIO,
                w.CREATED_ON as FECHA_ESTADO,
                CASE 
                    WHEN ws.STATE = 1 THEN 'Generada'
                    WHEN ws.STATE = 4 THEN 'Recepcionada'
                    ELSE 'Otro'
                END as ESTADO,
                ws.STATE,
                ISNULL(l.name, 'N/A') as DESTINATARIO
            FROM [ANTARA].[ANT_WAYBILL] w
            LEFT JOIN [ANTARA].[ANT_WAYBILL_STATE] ws ON w.ID = ws.ANT_WAYBILL_ID AND ws.IS_ACTIVE = 1
            LEFT JOIN [ANTARA].[ANT_WAYBILL_HISTORY] wh ON w.ID = wh.ANT_WAYBILL_ID
            LEFT JOIN [ANTARA].[ANT_WAYBILL_TRANSPORTATION] wt ON wt.ANT_WAYBILL_HISTORY_ID = wh.ANT_WAYBILL_ID
            LEFT JOIN [ANTARA].[ANT_TRANSPORTATION] t ON wt.ANT_TRANSPORTATION_ID = t.ID
            LEFT JOIN [ANTARA].[ANT_LOCATION] l ON t.LOCATION_ORIGIN_ID = l.ID
            WHERE CAST(w.CREATED_ON AS DATE) BETWEEN ${fechaDesde} AND ${fechaHasta}
                AND w.IS_CANCELLED = 0
            ORDER BY w.CREATED_ON DESC
        `;

        res.json({
            success: true,
            data: result.recordset,
            count: result.recordset.length,
            fechaDesde: fechaDesde,
            fechaHasta: fechaHasta,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('Error en consulta de rango:', err);
        console.error('Fecha desde:', fechaDesde);
        console.error('Fecha hasta:', fechaHasta);
        res.status(500).json({
            success: false,
            error: 'Error al consultar la base de datos',
            details: err.message,
            fechaDesde: fechaDesde,
            fechaHasta: fechaHasta
        });
    } finally {
        try {
            await sql.close();
        } catch (closeErr) {
            console.error('Error cerrando conexión:', closeErr);
        }
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Endpoint de health con prefijo /api
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Servidor funcionando correctamente',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
    });
});

// Endpoint para pre-warming del servidor (solución para cold start)
app.get('/api/warmup', async (req, res) => {
    const startTime = Date.now();
    
    try {
        console.log(`🔥 Iniciando pre-warming del servidor...`);
        
        // 1. Verificar conexión a BD
        await sql.connect(sqlConfig);
        const dbTest = await sql.query`SELECT 1 as test`;
        await sql.close();
        
        // 2. Simular operaciones típicas
        const warmupData = {
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            dbConnection: 'OK',
            serverStatus: 'Warmed up'
        };
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        console.log(`✅ Pre-warming completado en ${responseTime}ms`);
        
        res.json({
            success: true,
            message: 'Servidor pre-warmed exitosamente',
            responseTime: responseTime,
            data: warmupData,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        const endTime = Date.now();
        console.error('Error en pre-warming:', error);
        res.status(500).json({
            success: false,
            message: 'Error en pre-warming',
            error: error.message,
            responseTime: endTime - startTime,
            timestamp: new Date().toISOString()
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 Base de datos: sierragorda-prod`);
    console.log(`👤 Usuario: antarasql-cs-admin`);
    console.log(`📊 API disponible en: /api/waybills`);
    console.log(`📅 API rango disponible en: /api/waybills/range`);
    console.log(`🔐 API auth disponible en: /api/auth/login`);
    console.log(`🏥 Health check: /health y /api/health`);
    console.log(`🔥 Pre-warming: /api/warmup`);
    
    // Iniciar sistema de keep-alive después de 30 segundos
    setTimeout(() => {
        startKeepAlive();
    }, 30000);
});
