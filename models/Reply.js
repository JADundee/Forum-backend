const mongoose = require('mongoose')

const replySchema = new mongoose.Schema({
    forum: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Forum'
    },
    text: {
        type: String,
        required: true,
        trim: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    }
}, {
    timestamps: true
})

module.exports = mongoose.model('Reply', replySchema)