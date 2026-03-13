const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { verificarToken, verificarAdmin } = require('../middleware/auth');

// ─── DASHBOARD ───────────────────────────────────────────────────
router.get('/dashboard', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const [[{ total_profesores }]] = await db.query('SELECT COUNT(*) AS total_profesores FROM profesores WHERE activo = TRUE');
    const [[{ presentes_hoy }]] = await db.query(`SELECT COUNT(DISTINCT profesor_id) AS presentes_hoy FROM asistencias WHERE fecha = CURDATE() AND estado != 'ausente'`);
    const [[{ tardanzas_hoy }]] = await db.query(`SELECT COUNT(*) AS tardanzas_hoy FROM asistencias WHERE fecha = CURDATE() AND estado = 'tardanza'`);
    const [[{ total_clases_hoy }]] = await db.query(`SELECT COUNT(*) AS total_clases_hoy FROM horarios WHERE dia_semana = DAYNAME(NOW()) AND activo = TRUE`);
    res.json({ total_profesores, presentes_hoy, tardanzas_hoy, total_clases_hoy, ausentes_hoy: total_clases_hoy - presentes_hoy });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener dashboard' });
  }
});

// ─── PROFESORES ───────────────────────────────────────────────────
router.get('/profesores', verificarToken, verificarAdmin, async (req, res) => {
  const [rows] = await db.query('SELECT id, nombre, correo, cedula, activo, creado_en FROM profesores ORDER BY nombre');
  res.json(rows);
});

router.post('/profesores', verificarToken, verificarAdmin, async (req, res) => {
  const { nombre, correo, cedula, password } = req.body;
  if (!nombre || !correo || !cedula || !password) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query('INSERT INTO profesores (nombre, correo, cedula, password_hash) VALUES (?,?,?,?)', [nombre, correo, cedula, hash]);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Correo o cédula ya registrado' });
    res.status(500).json({ error: 'Error al crear profesor' });
  }
});

router.put('/profesores/:id', verificarToken, verificarAdmin, async (req, res) => {
  const { nombre, correo, cedula, activo, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.query('UPDATE profesores SET nombre=?, correo=?, cedula=?, activo=?, password_hash=? WHERE id=?', [nombre, correo, cedula, activo, hash, req.params.id]);
    } else {
      await db.query('UPDATE profesores SET nombre=?, correo=?, cedula=?, activo=? WHERE id=?', [nombre, correo, cedula, activo, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar profesor' });
  }
});

router.delete('/profesores/:id', verificarToken, verificarAdmin, async (req, res) => {
  await db.query('UPDATE profesores SET activo = FALSE WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ─── OTORGAR HORARIO (crea salón automáticamente desde código) ────
router.post('/otorgar-horario', verificarToken, verificarAdmin, async (req, res) => {
  const { profesor_id, codigo_salon, materia, dia_semana, hora_inicio, hora_fin } = req.body;
  if (!profesor_id || !codigo_salon || !materia || !dia_semana || !hora_inicio || !hora_fin)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });

  // Parsear código: ej 6103 = Bloque 6, Piso 1, Salón 03
  const codigo = codigo_salon.toString().padStart(4, '0');
  const bloque_num = codigo[0];
  const piso_num = codigo[1];
  const salon_num = codigo.slice(2);
  const bloque_nombre = `Bloque ${bloque_num}`;
  const nombre_completo = `Bloque ${bloque_num} - Piso ${piso_num} - Salón ${salon_num}`;

  try {
    // Crear bloque si no existe
    let bloque_id;
    const [bloques] = await db.query('SELECT id FROM bloques WHERE nombre = ?', [bloque_nombre]);
    if (bloques.length > 0) {
      bloque_id = bloques[0].id;
    } else {
      const [b] = await db.query('INSERT INTO bloques (nombre) VALUES (?)', [bloque_nombre]);
      bloque_id = b.insertId;
    }

    // Crear salón si no existe
    let salon_id;
    const [salones] = await db.query('SELECT id FROM salones WHERE bloque_id = ? AND piso = ? AND numero = ?', [bloque_id, piso_num, salon_num]);
    if (salones.length > 0) {
      salon_id = salones[0].id;
    } else {
      const [s] = await db.query('INSERT INTO salones (bloque_id, piso, numero, nombre_completo) VALUES (?,?,?,?)', [bloque_id, piso_num, salon_num, nombre_completo]);
      salon_id = s.insertId;
    }

    // Crear horario
    const [result] = await db.query(
      'INSERT INTO horarios (profesor_id, salon_id, materia, dia_semana, hora_inicio, hora_fin) VALUES (?,?,?,?,?,?)',
      [profesor_id, salon_id, materia, dia_semana, hora_inicio, hora_fin]
    );

    res.json({ success: true, id: result.insertId, salon: nombre_completo });
  } catch (err) {
    res.status(500).json({ error: 'Error al otorgar horario' });
  }
});

// ─── HORARIOS ─────────────────────────────────────────────────────
router.get('/horarios', verificarToken, verificarAdmin, async (req, res) => {
  const [rows] = await db.query(`
    SELECT h.id, h.materia, h.dia_semana, h.hora_inicio, h.hora_fin,
           p.nombre AS profesor_nombre, s.nombre_completo AS salon
    FROM horarios h
    JOIN profesores p ON h.profesor_id = p.id
    JOIN salones s ON h.salon_id = s.id
    WHERE h.activo = TRUE ORDER BY p.nombre, h.dia_semana, h.hora_inicio
  `);
  res.json(rows);
});

router.delete('/horarios/:id', verificarToken, verificarAdmin, async (req, res) => {
  await db.query('UPDATE horarios SET activo = FALSE WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ─── SALONES ──────────────────────────────────────────────────────
router.get('/salones', verificarToken, verificarAdmin, async (req, res) => {
  const [rows] = await db.query(`
    SELECT s.*, b.nombre AS bloque_nombre FROM salones s
    JOIN bloques b ON s.bloque_id = b.id ORDER BY b.nombre, s.piso, s.numero
  `);
  res.json(rows);
});

// ─── ASISTENCIAS ──────────────────────────────────────────────────
router.get('/asistencias', verificarToken, verificarAdmin, async (req, res) => {
  const { fecha, profesor_id } = req.query;
  let query = `
    SELECT a.*, p.nombre AS profesor_nombre, p.cedula,
           h.materia, h.hora_inicio, s.nombre_completo AS salon
    FROM asistencias a
    JOIN profesores p ON a.profesor_id = p.id
    JOIN horarios h ON a.horario_id = h.id
    JOIN salones s ON h.salon_id = s.id
    WHERE 1=1
  `;
  const params = [];
  if (fecha) { query += ' AND a.fecha = ?'; params.push(fecha); }
  if (profesor_id) { query += ' AND a.profesor_id = ?'; params.push(profesor_id); }
  query += ' ORDER BY a.fecha DESC, a.hora_registro DESC';
  const [rows] = await db.query(query, params);
  res.json(rows);
});

router.get('/asistencias/estadisticas', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const [stats] = await db.query(`
      SELECT p.nombre, p.cedula,
        COUNT(CASE WHEN a.estado = 'a_tiempo' THEN 1 END) AS a_tiempo,
        COUNT(CASE WHEN a.estado = 'tardanza' THEN 1 END) AS tardanzas,
        COUNT(CASE WHEN a.estado = 'ausente' THEN 1 END) AS ausencias,
        COUNT(a.id) AS total_registros
      FROM profesores p
      LEFT JOIN asistencias a ON p.id = a.profesor_id
      WHERE p.activo = TRUE
      GROUP BY p.id, p.nombre, p.cedula
      ORDER BY ausencias DESC
    `);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ─── SETUP ADMIN ──────────────────────────────────────────────────
router.post('/setup', async (req, res) => {
  const { nombre, correo, password, setup_key } = req.body;
  if (setup_key !== process.env.JWT_SECRET) return res.status(403).json({ error: 'Clave incorrecta' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query('INSERT INTO admins (nombre, correo, password_hash) VALUES (?,?,?)', [nombre, correo, hash]);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Correo ya registrado' });
    res.status(500).json({ error: 'Error al crear admin' });
  }
});

module.exports = router;
