const express = require('express');
const router = express.Router();
const db = require('../db');
const { verificarToken, verificarProfesor } = require('../middleware/auth');

const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Obtener clases del día con estado de asistencia
router.get('/clases-hoy', verificarToken, verificarProfesor, async (req, res) => {
  try {
    const ahora = new Date();
    const diaActual = DIAS[ahora.getDay()];
    const [clases] = await db.query(`
      SELECT h.id, h.materia, h.dia_semana, h.hora_inicio, h.hora_fin,
             s.nombre_completo AS salon, s.piso, s.numero AS salon_numero,
             b.nombre AS bloque,
             a.estado AS asistencia_estado, a.hora_registro
      FROM horarios h
      JOIN salones s ON h.salon_id = s.id
      JOIN bloques b ON s.bloque_id = b.id
      LEFT JOIN asistencias a ON a.horario_id = h.id AND a.profesor_id = ? AND a.fecha = CURDATE()
      WHERE h.profesor_id = ? AND h.dia_semana = ? AND h.activo = TRUE
      ORDER BY h.hora_inicio
    `, [req.usuario.id, req.usuario.id, diaActual]);

    const clasesConEstado = clases.map(c => {
      const [hIni, mIni] = c.hora_inicio.split(':').map(Number);
      const inicioMin = hIni * 60 + mIni;
      const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
      const diff = ahoraMin - inicioMin;
      let disponible = false;
      let mensaje = '';
      if (c.asistencia_estado) {
        mensaje = 'Ya registrado';
      } else if (diff < -10) {
        mensaje = `Disponible en ${Math.abs(diff) - 10} minutos`;
      } else if (diff >= -10 && diff <= 40) {
        disponible = true;
        if (diff <= 0) mensaje = 'A tiempo';
        else mensaje = `Tardanza (${diff} min)`;
      } else {
        mensaje = 'Tiempo expirado - Ausente';
      }
      return { ...c, disponible, mensaje };
    });

    res.json(clasesConEstado);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener clases' });
  }
});

// Obtener horario semanal completo
router.get('/horario-semana', verificarToken, verificarProfesor, async (req, res) => {
  try {
    const [horario] = await db.query(`
      SELECT h.id, h.materia, h.dia_semana, h.hora_inicio, h.hora_fin,
             s.nombre_completo AS salon, b.nombre AS bloque
      FROM horarios h
      JOIN salones s ON h.salon_id = s.id
      JOIN bloques b ON s.bloque_id = b.id
      WHERE h.profesor_id = ? AND h.activo = TRUE
      ORDER BY FIELD(h.dia_semana,'Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'), h.hora_inicio
    `, [req.usuario.id]);
    res.json(horario);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener horario' });
  }
});

// Registrar asistencia
router.post('/registrar-asistencia', verificarToken, verificarProfesor, async (req, res) => {
  const { horario_id, latitud, longitud, foto_base64 } = req.body;
  if (!horario_id || !latitud || !longitud || !foto_base64) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }
  try {
    const campusLat = parseFloat(process.env.CAMPUS_LAT);
    const campusLon = parseFloat(process.env.CAMPUS_LON);
    const radioPermitido = parseFloat(process.env.CAMPUS_RADIO);
    const distancia = calcularDistancia(latitud, longitud, campusLat, campusLon);

    if (distancia > radioPermitido) {
      return res.status(403).json({ error: `Estás a ${Math.round(distancia)}m del campus. Debes estar dentro del campus para registrar asistencia.` });
    }

    const [horarios] = await db.query(
      'SELECT * FROM horarios WHERE id = ? AND profesor_id = ? AND activo = TRUE',
      [horario_id, req.usuario.id]
    );
    if (horarios.length === 0) return res.status(404).json({ error: 'Horario no encontrado' });

    const horario = horarios[0];
    const ahora = new Date();
    const [hIni, mIni] = horario.hora_inicio.split(':').map(Number);
    const inicioMin = hIni * 60 + mIni;
    const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
    const diff = ahoraMin - inicioMin;

    if (diff < -10) return res.status(400).json({ error: 'La clase aún no está disponible para registrar' });
    if (diff > 40) return res.status(400).json({ error: 'El tiempo para registrar asistencia ha expirado' });

    const estado = diff <= 0 ? 'a_tiempo' : 'tardanza';
    const minutos_tarde = diff > 0 ? diff : 0;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    await db.query(`
      INSERT INTO asistencias (profesor_id, horario_id, fecha, hora_registro, latitud, longitud, distancia_campus, foto_base64, estado, minutos_tarde, ip_registro)
      VALUES (?, ?, CURDATE(), NOW(), ?, ?, ?, ?, ?, ?, ?)
    `, [req.usuario.id, horario_id, latitud, longitud, Math.round(distancia), foto_base64, estado, minutos_tarde, ip]);

    res.json({ success: true, estado, minutos_tarde, distancia: Math.round(distancia) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya registraste asistencia para esta clase hoy' });
    res.status(500).json({ error: 'Error al registrar asistencia' });
  }
});

// Historial de asistencias del profesor
router.get('/historial', verificarToken, verificarProfesor, async (req, res) => {
  try {
    const [historial] = await db.query(`
      SELECT a.fecha, a.hora_registro, a.estado, a.minutos_tarde,
             h.materia, h.hora_inicio, s.nombre_completo AS salon, b.nombre AS bloque
      FROM asistencias a
      JOIN horarios h ON a.horario_id = h.id
      JOIN salones s ON h.salon_id = s.id
      JOIN bloques b ON s.bloque_id = b.id
      WHERE a.profesor_id = ?
      ORDER BY a.fecha DESC, a.hora_registro DESC
      LIMIT 60
    `, [req.usuario.id]);
    res.json(historial);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

module.exports = router;
