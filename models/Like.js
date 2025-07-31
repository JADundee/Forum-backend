const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true }, // forum or reply
  targetType: { type: String, enum: ['forum', 'reply'], required: true },
  createdAt: { type: Date, default: Date.now }
});

likeSchema.index({ user: 1, targetId: 1, targetType: 1 }, { unique: true });

module.exports = mongoose.model('Like', likeSchema); 