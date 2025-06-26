const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true 
},
  noteId: { 
    type: String, 
    required: true 
},
  replyText: { 
    type: String, 
    required: true 
},
  username: { 
    type: String, 
    required: true 
},
  createdAt: { 
    type: Date, 
    default: Date.now 
},
  read: {
    type: Boolean,
    default: false
  },
  replyId: {
    type: String,
    required: false
  }
});

module.exports = mongoose.model('Notification', notificationSchema);