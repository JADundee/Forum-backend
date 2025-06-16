/* const Notification = require('../models/Notification');

const createNotification = async (req, res) => {
  try {
    const { userId, noteId, replyText, username } = req.body;
    const notification = new Notification({ userId, noteId, replyText, username });
    await notification.save();
    res.status(201).json({ message: 'Notification created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating notification' });
  }
};

module.exports = { createNotification }; */