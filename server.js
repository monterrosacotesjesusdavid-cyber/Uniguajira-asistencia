require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/profesor', require('./routes/profesor'));
app.use('/api/admin', require('./routes/admin'));

app.get('/profesor', (req, res) => res.sendFile(path.join(__dirname, 'public', 'profesor.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function inicializarBD() {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      correo VARCHAR(150) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS profesores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      correo VARCHAR(150) NOT NULL UNIQUE,
      cedula VARCHAR(20) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      activo BOOLEAN DEFAULT TRUE,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS bloques (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(50) NOT NULL,
      descripcion VARCHAR(150)
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS salones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bloque_id INT NOT NULL,
      piso INT NOT NULL,
      numero VARCHAR(10) NOT NULL,
      nombre_completo VARCHAR(100) NOT NULL,
      FOREIGN KEY (bloque_id) REFERENCES bloques(id) ON DELETE CASCADE
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS horarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      profesor_id INT NOT NULL,
      salon_id INT NOT NULL,
      materia VARCHAR(100) NOT NULL,
      dia_semana ENUM('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado') NOT NULL,
      hora_inicio TIME NOT NULL,
      hora_fin TIME NOT NULL,
      activo BOOLEAN DEFAULT TRUE,
      FOREIGN KEY (profesor_id) REFERENCES profesores(id) ON DELETE CASCADE,
      FOREIGN KEY (salon_id) REFERENCES salones(id) ON DELETE CASCADE
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS asistencias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      profesor_id INT NOT NULL,
      horario_id INT NOT NULL,
      fecha DATE NOT NULL,
      hora_registro DATETIME NOT NULL,
      latitud DECIMAL(10,8) NOT NULL,
      longitud DECIMAL(11,8) NOT NULL,
      distancia_campus DECIMAL(8,2),
      foto_base64 LONGTEXT,
      estado ENUM('a_tiempo','tardanza','ausente') NOT NULL,
      minutos_tarde INT DEFAULT 0,
      ip_registro VARCHAR(45),
      FOREIGN KEY (profesor_id) REFERENCES profesores(id),
      FOREIGN KEY (horario_id) REFERENCES horarios(id),
      UNIQUE KEY unique_asistencia_dia (profesor_id, horario_id, fecha)
    )`);

    const [admins] = await db.query('SELECT id FROM admins LIMIT 1');
    if (admins.length === 0) {
      const hashAdmin = await bcrypt.hash('admin', 10);
      await db.query(
        'INSERT INTO admins (nombre, correo, password_hash) VALUES (?,?,?)',
        ['Administrador', 'admin@admin.com', hashAdmin]
      );
      console.log('✅ Admin creado: admin@admin.com / admin');
    }

    const [profes] = await db.query('SELECT id FROM profesores LIMIT 1');
    if (profes.length === 0) {
      const hashProfe = await bcrypt.hash('profe', 10);
      await db.query(
        'INSERT INTO profesores (nombre, correo, cedula, password_hash) VALUES (?,?,?,?)',
        ['Profesor', 'profesor@profe.com', '00000000', hashProfe]
      );
      console.log('✅ Profesor creado: profesor@profe.com / profe');
    }

    console.log('✅ Base de datos lista');
  } catch (err) {
    console.error('❌ Error inicializando BD:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  await inicializarBD();
});
