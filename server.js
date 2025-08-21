const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 3000;

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

        await sql.connect(sqlConfig);
        
        const result = await sql.query`
            SELECT TOP 50
					w.FOLIO,
					w.CREATED_ON,
					CASE 
						WHEN ws.STATE = 1 THEN 'Generada'
						WHEN ws.STATE = 4 THEN 'Recepcionada'
						ELSE 'Otro'
					END as ESTADO,
					ws.STATE,
					ISNULL(l.name, 'N/A') as location_name
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


