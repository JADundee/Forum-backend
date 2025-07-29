const Note = require('../models/Note')
const User = require('../models/User')
const Reply = require('../models/Reply')
const Notification = require('../models/Notification')
const Like = require('../models/Like')

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
    const note = await Note.create({ user: req.user._id, title, text, editedBy: null })
    
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
    note.editedBy = req.user.username

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

    // Get all reply IDs for this note BEFORE deleting replies
    const replies = await Reply.find({ note: id }).select('_id').lean();
    const replyIds = replies.map(r => r._id);

    // Delete all replies associated with this note
    await Reply.deleteMany({ note: id });

    // Delete all notifications associated with this note (for all users)
    await Notification.deleteMany({ noteId: id });

    // Delete all likes associated with this note
    await Like.deleteMany({ targetId: id, targetType: 'note' });

    // Delete all likes associated with replies to this note
    if (replyIds.length > 0) {
        await Like.deleteMany({ targetId: { $in: replyIds }, targetType: 'reply' });
    }

    const result = await note.deleteOne()

    const reply = `Note '${result.title}' with ID ${result._id} deleted (and associated replies, notifications, and likes)`

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

// Helper function to extract tagged usernames from text
function extractTaggedUsernames(text) {
    // Matches @username (alphanumeric and underscores)
    const tagRegex = /@(\w+)/g;
    const tags = new Set();
    let match;
    while ((match = tagRegex.exec(text)) !== null) {
        tags.add(match[1]);
    }
    return Array.from(tags);
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

    // Always fetch the note and note owner for notifications
    const note = await Note.findById(noteId).lean();
    let noteOwnerUsername = null;
    if (note && note.user) {
      const noteOwner = await User.findById(note.user).lean();
      noteOwnerUsername = noteOwner?.username;
    }

    // --- Tag Notification Logic ---
    const taggedUsernames = extractTaggedUsernames(replyText);
    // Check if the note owner is tagged (by username)
    const isNoteOwnerTagged = noteOwnerUsername && taggedUsernames.includes(noteOwnerUsername);

    // Only create a reply notification if the note owner is NOT tagged and is not the reply author
    if (
      note &&
      String(note.user) !== String(user._id) &&
      !isNoteOwnerTagged
    ) {
      const notification = new Notification({
        userId: note.user,
        noteId: noteId,
        noteTitle: note.title,
        replyText: replyText,
        username: user.username,
        replyId: reply._id,
        type: 'reply',
        read: false
      });
      await notification.save();
    }

    // Tag notifications for all tagged users except the reply author
    if (taggedUsernames.length > 0) {
      for (const taggedUsername of taggedUsernames) {
        // Don't notify the author if they tag themselves
        if (taggedUsername === user.username) continue;
        const taggedUser = await User.findOne({ username: taggedUsername });
        if (taggedUser && String(taggedUser._id) !== String(user._id)) {
          const tagNotification = new Notification({
            userId: taggedUser._id,
            noteId: noteId,
            noteTitle: note ? note.title : undefined,
            replyText: replyText,
            username: user.username,
            replyId: reply._id,
            type: 'tag',
            read: false,
            message: `${user.username} mentioned you in a reply.`
          });
          await tagNotification.save();
        }
      }
    }

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

    // Delete all likes associated with this reply
    await Like.deleteMany({ targetId: replyId, targetType: 'reply' });

    const result = await reply.deleteOne()

    res.json({ message: `Reply with ID ${replyId} deleted (and associated likes)` })
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
        const { userId, noteId, replyText, username, replyId } = req.body;
        if (!userId || !noteId || !replyText || !username) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        // Prevent users from creating notifications for their own actions
        if (req.user && String(req.user._id) === String(userId)) {
            return res.status(400).json({ message: 'Cannot create notification for your own action.' });
        }
        const notification = new Notification({
            userId,
            noteId,
            replyText,
            username,
            replyId,
            read: false
        });
        await notification.save();
        res.status(201).json(notification);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating notification' });
    }
};

// @desc Delete a notification
// @route DELETE /notifications/:id
// @access Private
const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: 'Notification ID required' });
        }
        // Only allow users to delete their own notifications
        const notification = await Notification.findById(id);
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        if (String(notification.userId) !== String(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized to delete this notification' });
        }
        await notification.deleteOne();
        res.json({ message: `Notification with ID ${id} deleted` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting notification' });
    }
};

// @desc Get all replies by user
// @route GET /notes/replies-by-user?userId=...
// @access Private
const getRepliesByUser = async (req, res) => {
    const { userId } = req.query;
    // Only allow if the authenticated user matches the requested userId
    if (!userId || String(req.user._id) !== String(userId)) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    try {
        const replies = await Reply.find({ user: userId }).populate('note', 'title').lean();
        // Format replies to include noteTitle
        const formatted = replies.map(r => ({
            ...r,
            noteTitle: r.note && r.note.title ? r.note.title : ''
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

// @desc Edit a reply
// @route PATCH /notes/replies/:replyId
// @access Private
const editReply = async (req, res) => {
    const { replyId } = req.params;
    const { replyText } = req.body;
    const userId = req.user._id;

    if (!replyId || !replyText) {
        return res.status(400).json({ message: 'Reply ID and new text are required' });
    }

    const reply = await Reply.findById(replyId).exec();
    if (!reply) {
        return res.status(404).json({ message: 'Reply not found' });
    }
    if (String(reply.user) !== String(userId)) {
        return res.status(403).json({ message: 'Not authorized to edit this reply' });
    }
    reply.text = replyText;
    await reply.save();
    res.json({ message: 'Reply updated', reply });
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
    createNotification,
    deleteNotification,
    getRepliesByUser,
    editReply
}