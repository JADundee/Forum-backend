const mongoose = require('mongoose')
const AutoIncrement = require('mongoose-sequence')(mongoose)

const forumSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User'
        },
        title: {
            type: String,
            required: true
        },
        text: {
            type: String,
            required: true
        },
        completed: {
            type: Boolean,
            default: false
        },
        editedBy: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
)

forumSchema.plugin(AutoIncrement, {
    inc_field: 'ticket',
    id: 'ticketNums',
    start_seq: 500
})

module.exports = mongoose.model('Forum', forumSchema)