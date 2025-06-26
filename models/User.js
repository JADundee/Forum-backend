const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    roles: {
        type: [String],
        default: ["Member"]
    },
    active: {
        type: Boolean,
        default: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    resetPasswordToken: {
        type: String,
        default: null
    },
    resetPasswordExpires: {
        type: Date,
        default: null
    }
})

module.exports = mongoose.model('User', userSchema)