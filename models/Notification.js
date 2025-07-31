const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true 
},
  forumId: { 
    type: String, 
    required: false 
},
  replyText: { 
    type: String, 
    required: false,
    trim: true
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
  },
  type: {
    type: String,
    required: false
  },
  message: {
    type: String,
    required: false
  },
  forumTitle: {
    type: String,
    required: false
  }
});

module.exports = mongoose.model('Notification', notificationSchema);