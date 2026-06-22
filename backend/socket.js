'use strict';

const jwt = require('jsonwebtoken');
const pool = require('./config/db');
const { canAccessConversation } = require('./controllers/chatController');

function configureSocket(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const [rows] = await pool.execute("SELECT id,full_name,role,status FROM cc_users WHERE id=? AND deleted_at IS NULL", [payload.sub]);
      if (!rows.length || rows[0].status !== 'active') return next(new Error('Authentication failed'));
      socket.user = rows[0];
      next();
    } catch (error) { next(new Error('Authentication failed')); }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`);
    socket.on('conversation:join', async (conversationId, acknowledge) => {
      try {
        if (!(await canAccessConversation(conversationId, socket.user))) return acknowledge?.({ ok: false, message: 'Access denied.' });
        socket.join(`conversation:${conversationId}`);
        acknowledge?.({ ok: true });
      } catch (error) { acknowledge?.({ ok: false, message: 'Unable to join conversation.' }); }
    });
    socket.on('message:send', async (payload, acknowledge) => {
      try {
        const body = String(payload.body || '').trim().slice(0, 4000);
        if (!body) return acknowledge?.({ ok: false, message: 'Message cannot be empty.' });
        if (!(await canAccessConversation(payload.conversation_id, socket.user)) || socket.user.role === 'admin') return acknowledge?.({ ok: false, message: 'Sending is not allowed.' });
        const [result] = await pool.execute('INSERT INTO cc_messages (conversation_id,sender_id,body) VALUES (?,?,?)', [payload.conversation_id, socket.user.id, body]);
        await pool.execute('UPDATE cc_conversations SET updated_at=NOW() WHERE id=?', [payload.conversation_id]);
        const message = { id: result.insertId, conversation_id: Number(payload.conversation_id), sender_id: socket.user.id, sender_name: socket.user.full_name, sender_role: socket.user.role, body, created_at: new Date().toISOString() };
        io.to(`conversation:${payload.conversation_id}`).emit('message:new', message);
        acknowledge?.({ ok: true, message });
      } catch (error) { acknowledge?.({ ok: false, message: 'Message could not be sent.' }); }
    });
    socket.on('typing', (payload) => socket.to(`conversation:${payload.conversation_id}`).emit('typing', { conversation_id: payload.conversation_id, name: socket.user.full_name }));
  });
}

module.exports = configureSocket;
