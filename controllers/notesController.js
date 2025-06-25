const Note = require('../models/Note')
const User = require('../models/User')
const Reply = require('../models/Reply')
const Notification = require('../models/Notification')

// @desc Get all notes 
// @route GET /notes
// @access Private
const getAllNotes = async (req, res) => {
    // Get all notes from MongoDB
    const notes = await Note.find().lean()
   

    // If no notes 
    if (!notes?.length) {
        return res.status(400).json({ message: 'No notes found' })
    }

    // Add username to each note before sending the response 
    // See Promise.all with map() here: https://youtu.be/4lqJBBEpjRE 
    // You could also do this with a for...of loop
    const notesWithUser = await Promise.all(notes.map(async (note) => {
        const user = await User.findById(note.user).lean().exec()
       
        return { ...note, username: user.username }
        
    }))

    res.json(notesWithUser)
}

// @desc Create new note
// @route POST /notes
// @access Private
const createNewNote = async (req, res) => {
    const { title, text } = req.body
    

    // Confirm data
    if (!title || !text) {
        return res.status(400).json({ message: 'All fields are required' })
    }

    // Get user from authentication middleware
   if (!req.user || !req.user._id) {
        return res.status(401).json({ message: 'Unauthorized - User not found' });
    }

    // Check for duplicate title
    const duplicate = await Note.findOne({ title }).collation({ locale: 'en', strength: 2 }).lean().exec()

    if (duplicate) {
        return res.status(409).json({ message: 'Duplicate note title' })
    }

    // Create and store the new user 
    const note = await Note.create({ user: req.user._id, title, text })
    
    if (note) { // Created 
        return res.status(201).json({ message: 'New note created' })
    } else {
        return res.status(400).json({ message: 'Invalid note data received' })
    }
    
}

// @desc Update a note
// @route PATCH /notes
// @access Private
const updateNote = async (req, res) => {
    const { id, user, title, text, completed } = req.body

    // Confirm data
    if (!id || !user || !title || !text ) {
        return res.status(400).json({ message: 'All fields are required' })
    }

    // Confirm note exists to update
    const note = await Note.findById(id).exec()

    if (!note) {
        return res.status(400).json({ message: 'Note not found' })
    }

    // Check for duplicate title
    const duplicate = await Note.findOne({ title }).collation({ locale: 'en', strength: 2 }).lean().exec()

    // Allow renaming of the original note 
    if (duplicate && duplicate?._id.toString() !== id) {
        return res.status(409).json({ message: 'Duplicate note title' })
    }

    note.user = user
    note.title = title
    note.text = text
    note.completed = completed

    const updatedNote = await note.save()

    res.json(`'${updatedNote.title}' updated`)
}

// @desc Delete a note
// @route DELETE /notes
// @access Private
const deleteNote = async (req, res) => {
    const { id } = req.body

    // Confirm data
    if (!id) {
        return res.status(400).json({ message: 'Note ID required' })
    }

    // Confirm note exists to delete 
    const note = await Note.findById(id).exec()

    if (!note) {
        return res.status(400).json({ message: 'Note not found' })
    }

    const result = await note.deleteOne()

    const reply = `Note '${result.title}' with ID ${result._id} deleted`

    res.json(reply)
}

// GET /notes/:noteId/replies
const getReplies = async (req, res) => {
    const noteId = req.params.noteId;
    if (!noteId) {
        return res.status(400).json({ message: 'Note ID is required' });
    }
    const replies = await Reply.find({ note: noteId }).lean();
    res.json(replies);
}

// POST /notes/:noteId/replies
const addReply = async (req, res) => {
    try {
    const noteId = req.params.noteId
    const { replyText } = req.body
    const user = req.user

    if (!replyText) {
        return res.status(400).json({ message: 'Reply is required' })
    }

    const reply = await Reply.create({ note: noteId, text: replyText, user: user._id })
    res.json(reply)

     // Create a notification when a reply is added
    const notification = new Notification({
      userId: user._id,
      noteId: noteId,
      replyText: replyText,
      username: user.username,
      read: false
    });
    await notification.save();
} catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
}
}

// @desc Delete a reply
// @route DELETE /notes/replies/:replyId
// @access Private
const deleteReply = async (req, res) => {
    const { replyId } = req.params

    // Confirm data
    if (!replyId) {
        return res.status(400).json({ message: 'Reply ID required' })
    }

    // Confirm reply exists to delete 
    const reply = await Reply.findById(replyId).exec()

    if (!reply) {
        return res.status(400).json({ message: 'Reply not found' })
    }

    const result = await reply.deleteOne()

    res.json({ message: `Reply with ID ${replyId} deleted` })
}

const getNotifications = async (req, res) => {
    try {
      const userId = String(req.user._id); 
      const notifications = await Notification.find({ userId }).sort({ createdAt: -1 }).lean();
      // Map _id to id and remove __v
      const mapped = notifications.map(({ _id, __v, ...rest }) => ({
        id: _id.toString(),
        ...rest
      }));
      res.json(mapped);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error retrieving notifications' });
    }
}

const updateNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const { read } = req.body;
    if (typeof read !== 'boolean') {
      return res.status(400).json({ message: 'Invalid read value' });
    }
    const notification = await Notification.findByIdAndUpdate(
      id,
      { read },
      { new: true, lean: true }
    );
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    // Map _id to id and remove __v
    const { _id, __v, ...rest } = notification;
    res.json({ id: _id.toString(), ...rest });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating notification' });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await Notification.updateMany(
      { userId, read: false },
      { $set: { read: true } }
    );
    res.json({ message: 'All notifications marked as read', modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: 'Error marking all notifications as read' });
  }
};

// @desc Create a notification
// @route POST /notifications
// @access Private
const createNotification = async (req, res) => {
    try {
        const { userId, noteId, replyText, username } = req.body;
        if (!userId || !noteId || !replyText || !username) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        const notification = new Notification({
            userId,
            noteId,
            replyText,
            username,
            read: false
        });
        await notification.save();
        res.status(201).json(notification);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating notification' });
    }
};

module.exports = {
    getAllNotes,
    createNewNote,
    updateNote,
    deleteNote,
    getReplies,
    addReply,
    deleteReply,
    getNotifications,
    updateNotificationRead,
    markAllNotificationsRead,
    createNotification
}