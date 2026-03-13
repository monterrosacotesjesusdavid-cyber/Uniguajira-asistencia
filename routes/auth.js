const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// Login Profesor
router.post('/profesor/login', async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });
  try {
    const [rows] = await db.query('SELECT * FROM profesores WHERE correo = ? AND activo = TRUE', [correo]);
    if (rows.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const profesor = rows[0];
    const valido = await bcrypt.compare(password, profesor.password_hash);
    if (!valido) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const token = jwt.sign(
      { id: profesor.id, nombre: profesor.nombre, correo: profesor.correo, rol: 'profesor' },
      process.env.JWT_SECRET,
      { expiresIn: '10h' }
    );
    res.json({ token, nombre: profesor.nombre, id: profesor.id });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Login Admin
router.post('/admin/login', async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });
  try {
    const [rows] = await db.query('SELECT * FROM admins WHERE correo = ?', [correo]);
    if (rows.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const admin = rows[0];
    const valido = await bcrypt.compare(password, admin.password_hash);
    if (!valido) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const token = jwt.sign(
      { id: admin.id, nombre: admin.nombre, correo: admin.correo, rol: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '10h' }
    );
    res.json({ token, nombre: admin.nombre, id: admin.id });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
