const mongoose = require('mongoose')

const replySchema = new mongoose.Schema({
    note: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Note'
    },
    text: {
        type: String,
        required: true
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