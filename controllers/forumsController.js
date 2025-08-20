const Forum = require('../models/Forum')
const User = require('../models/User')
const Reply = require('../models/Reply')
const Notification = require('../models/Notification')
const Like = require('../models/Like')

// @desc Get all forums 
// @route GET /forums
// @access Private
const getAllForums = async (req, res) => {
    // Get all forums from MongoDB
    const forums = await Forum.find().lean()
   

    // If no forums 
    if (!forums?.length) {
        return res.status(400).json({ message: 'No forums found' })
    }

    // Add username to each forum before sending the response 
    // See Promise.all with map() here: https://youtu.be/4lqJBBEpjRE 
    // You could also do this with a for...of loop
    const forumsWithUser = await Promise.all(forums.map(async (forum) => {
        const user = await User.findById(forum.user).lean().exec()
       
        return { ...forum, username: user.username }
        
    }))

    res.json(forumsWithUser)
}

// @desc Create new forum
// @route POST /forums
// @access Private
const createNewForum = async (req, res) => {
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
    const duplicate = await Forum.findOne({ title }).collation({ locale: 'en', strength: 2 }).lean().exec()

    if (duplicate) {
        return res.status(409).json({ message: 'Duplicate forum title' })
    }

    // Create and store the new user 
    const forum = await Forum.create({ user: req.user._id, title, text, editedBy: null })
    
    if (forum) { // Created 
        return res.status(201).json({ message: 'New forum created' })
    } else {
        return res.status(400).json({ message: 'Invalid forum data received' })
    }
    
}

// @desc Update a forum
// @route PATCH /forums
// @access Private
const updateForum = async (req, res) => {
    const { id, user, title, text, completed } = req.body

    // Confirm data
    if (!id || !user || !title || !text ) {
        return res.status(400).json({ message: 'All fields are required' })
    }

    // Confirm forum exists to update
    const forum = await Forum.findById(id).exec()

    if (!forum) {
        return res.status(400).json({ message: 'Forum not found' })
    }

    // Check for duplicate title
    const duplicate = await Forum.findOne({ title }).collation({ locale: 'en', strength: 2 }).lean().exec()

    // Allow renaming of the original forum 
    if (duplicate && duplicate?._id.toString() !== id) {
        return res.status(409).json({ message: 'Duplicate forum title' })
    }

    forum.user = user
    forum.title = title
    forum.text = text
    forum.completed = completed
    forum.editedBy = req.user.username

    const updatedForum = await forum.save()

    res.json(`'${updatedForum.title}' updated`)
}

// @desc Delete a forum
// @route DELETE /forums
// @access Private
const deleteForum = async (req, res) => {
    const { id } = req.body

    // Confirm data
    if (!id) {
        return res.status(400).json({ message: 'Forum ID required' })
    }

    // Confirm forum exists to delete 
    const forum = await Forum.findById(id).exec()

    if (!forum) {
        return res.status(400).json({ message: 'Forum not found' })
    }

    // Get all reply IDs for this forum BEFORE deleting replies
    const replies = await Reply.find({ forum: id }).select('_id').lean();
    const replyIds = replies.map(r => r._id);

    // Delete all replies associated with this forum
    await Reply.deleteMany({ forum: id });

    // Delete all notifications associated with this forum (for all users)
    await Notification.deleteMany({ forumId: id });

    // Delete all likes associated with this forum
    await Like.deleteMany({ targetId: id, targetType: 'forum' });

    // Delete all likes associated with replies to this forum
    if (replyIds.length > 0) {
        await Like.deleteMany({ targetId: { $in: replyIds }, targetType: 'reply' });
    }

    const result = await forum.deleteOne()

    const reply = `Forum '${result.title}' with ID ${result._id} deleted (and associated replies, notifications, and likes)`

    res.json(reply)
}

// GET /forums/:forumId/replies
const getReplies = async (req, res) => {
    const forumId = req.params.forumId;
    if (!forumId) {
        return res.status(400).json({ message: 'Forum ID is required' });
    }

 try {
        // Populate username from User model
        const replies = await Reply.find({ forum: forumId })
            .populate('user', 'username') // normalize: always fetch latest username
            .lean();

        // Flatten populated user into { user, username }
        const repliesWithUsername = replies.map(r => ({
            ...r,
            user: r.user?._id,          // keep the ObjectId reference
            username: r.user?.username  // add the live username
        }));

        res.json(repliesWithUsername);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching replies' });
    }
};

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

// POST /forums/:forumId/replies
const addReply = async (req, res) => {
    try {
    const forumId = req.params.forumId
    const { replyText } = req.body
    const user = req.user

    if (!replyText) {
        return res.status(400).json({ message: 'Reply is required' })
    }

    const reply = await Reply.create({ forum: forumId, text: replyText, user: user._id })
    res.json(reply)

    // Always fetch the forum and forum owner for notifications
    const forum = await Forum.findById(forumId).lean();
    let forumOwnerUsername = null;
    if (forum && forum.user) {
      const forumOwner = await User.findById(forum.user).lean();
      forumOwnerUsername = forumOwner?.username;
    }

    // --- Tag Notification Logic ---
    const taggedUsernames = extractTaggedUsernames(replyText);
    // Check if the forum owner is tagged (by username)
    const isForumOwnerTagged = forumOwnerUsername && taggedUsernames.includes(forumOwnerUsername);

    // Only create a reply notification if the forum owner is NOT tagged and is not the reply author
    if (
      forum &&
      String(forum.user) !== String(user._id) &&
      !isForumOwnerTagged
    ) {
      const notification = new Notification({
        userId: forum.user,
        forumId: forumId,
        forumTitle: forum.title,
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
            forumId: forumId,
            forumTitle: forum ? forum.title : undefined,
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
// @route DELETE /forums/replies/:replyId
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
        const { userId, forumId, replyText, username, replyId } = req.body;
        if (!userId || !forumId || !replyText || !username) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        // Prevent users from creating notifications for their own actions
        if (req.user && String(req.user._id) === String(userId)) {
            return res.status(400).json({ message: 'Cannot create notification for your own action.' });
        }
        const notification = new Notification({
            userId,
            forumId,
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
// @route GET /forums/replies-by-user?userId=...
// @access Private
const getRepliesByUser = async (req, res) => {
    const { userId } = req.query;
    // Only allow if the authenticated user matches the requested userId
    if (!userId || String(req.user._id) !== String(userId)) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    try {
        const replies = await Reply.find({ user: userId }).populate('forum', 'title').lean();
        // Format replies to include forumTitle
        const formatted = replies.map(r => ({
            ...r,
            forumTitle: r.forum && r.forum.title ? r.forum.title : ''
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

// @desc Edit a reply
// @route PATCH /forums/replies/:replyId
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
    getAllForums,
    createNewForum,
    updateForum,
    deleteForum,
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