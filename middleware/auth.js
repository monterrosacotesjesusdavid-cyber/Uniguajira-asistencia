const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
};

const verificarAdmin = (req, res, next) => {
  if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Acceso solo para administradores' });
  next();
};

const verificarProfesor = (req, res, next) => {
  if (req.usuario.rol !== 'profesor') return res.status(403).json({ error: 'Acceso solo para profesores' });
  next();
};

module.exports = { verificarToken, verificarAdmin, verificarProfesor };
