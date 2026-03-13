# Sistema de Asistencia — Universidad de La Guajira

Sistema de control de asistencia docente con GPS, selfie y panel administrativo.

## Estructura del Proyecto

```
uniguajira-asistencia/
├── server.js              # Servidor Express principal
├── db.js                  # Conexión MySQL
├── database.sql           # Esquema de base de datos
├── package.json
├── .env.example           # Variables de entorno (copiar a .env)
├── routes/
│   ├── auth.js            # Login profesor y admin
│   ├── profesor.js        # Clases, asistencia, historial
│   └── admin.js           # Gestión completa
├── middleware/
│   └── auth.js            # JWT verificación
└── public/
    ├── index.html         # Login
    ├── profesor.html      # Portal docente
    └── admin.html         # Panel administrativo
```

## Deploy en Railway

### 1. Subir a GitHub

```bash
git init
git add .
git commit -m "Sistema de asistencia UniGuajira"
git remote add origin https://github.com/tu-usuario/uniguajira-asistencia.git
git push -u origin main
```

### 2. Crear proyecto en Railway

1. Entra a [railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub repo**
3. Selecciona tu repositorio
4. Railway detecta Node.js automáticamente

### 3. Agregar MySQL en Railway

1. En tu proyecto Railway → **New** → **Database** → **MySQL**
2. Railway crea la base de datos automáticamente

### 4. Configurar variables de entorno

En Railway → tu servicio Node.js → **Variables**, agrega:

```
DB_HOST=      → copiar de MySQL service: MYSQLHOST
DB_PORT=      → copiar de MySQL service: MYSQLPORT
DB_USER=      → copiar de MySQL service: MYSQLUSER
DB_PASSWORD=  → copiar de MySQL service: MYSQLPASSWORD
DB_NAME=      → copiar de MySQL service: MYSQLDATABASE
JWT_SECRET=   → una clave segura larga (ej: uniguajira2024_clave_muy_segura_abc123)
CAMPUS_LAT=11.5448
CAMPUS_LON=-72.8936
CAMPUS_RADIO=400
```

### 5. Ejecutar el SQL

1. En Railway, clic en tu servicio **MySQL**
2. Pestaña **Query** o conéctate con un cliente MySQL
3. Copia y pega el contenido de `database.sql` y ejecútalo

### 6. Crear el primer administrador

Una vez desplegado, haz esta petición POST:

```bash
curl -X POST https://tu-app.railway.app/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Administrador",
    "correo": "admin@uniguajira.edu.co",
    "password": "tu_contraseña_segura",
    "setup_key": "el_mismo_JWT_SECRET_que_configuraste"
  }'
```

O usa Postman / Thunder Client con los mismos datos.

## Flujo del Sistema

1. **Admin** crea bloques → salones → profesores → horarios
2. **Profesor** entra a la URL del sistema desde su celular
3. Hace login con correo y contraseña
4. El GPS verifica que está dentro del campus (radio 400m)
5. Ve solo sus clases del día habilitadas según la hora
6. Toma una selfie para confirmar presencia
7. El sistema registra: hora, coordenadas GPS, salón, foto y estado
8. Admin ve todo en tiempo real en el panel

## Reglas de Asistencia

- **A tiempo**: registro dentro de los primeros 10 minutos
- **Tardanza**: registro entre 10 y 40 minutos después de inicio
- **Ausente**: no se registró antes de los 40 minutos

## Tecnologías

- **Frontend**: HTML5 + CSS3 + JavaScript puro
- **Backend**: Node.js + Express
- **Base de datos**: MySQL
- **Autenticación**: JWT + bcrypt
- **GPS**: Web Geolocation API
- **Cámara**: MediaDevices API
- **Deploy**: Railway
