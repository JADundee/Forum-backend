const Like = require('../models/Like');
const Forum = require('../models/Forum');
const Reply = require('../models/Reply');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Toggle like/unlike for a forum or reply
const toggleLike = async (req, res) => {
    const { targetId, targetType } = req.body;
    const userId = req.user._id;
    if (!targetId || !targetType || !['forum', 'reply'].includes(targetType)) {
        return res.status(400).json({ message: 'targetId and valid targetType are required' });
    }
    const existing = await Like.findOne({ user: userId, targetId, targetType });
    let liked;
    if (existing) {
        await existing.deleteOne();
        liked = false;
    } else {
        await Like.create({ user: userId, targetId, targetType });
        liked = true;
        // Send notification if not liking own content
        let ownerId, message;
        if (targetType === 'forum') {
            const forum = await Forum.findById(targetId);
            if (forum && String(forum.user) !== String(userId)) {
                ownerId = forum.user;
                message = `${req.user.username} liked your forum "${forum.title}"`;
                await Notification.create({
                    userId: ownerId,
                    forumId: targetId,
                    forumTitle: forum.title,
                    username: req.user.username,
                    type: 'like-forum',
                    message,
                    read: false
                });
            }
        } else if (targetType === 'reply') {
            const reply = await Reply.findById(targetId).populate('forum');
            if (reply && String(reply.user) !== String(userId)) {
                ownerId = reply.user;
                message = `${req.user.username} liked your reply "${reply.text}"`;
                await Notification.create({
                    userId: ownerId,
                    forumId: reply.forum?._id || reply.forum,
                    forumTitle: reply.forum?.title || '',
                    replyId: targetId,
                    replyText: reply.text,
                    username: req.user.username,
                    type: 'like-reply',
                    message,
                    read: false
                });
            }
        }
    }
    // Return new like count and status
    const count = await Like.countDocuments({ targetId, targetType });
    res.json({ liked, count });
};

// Get like count for a forum or reply
const getLikeCount = async (req, res) => {
    const { targetId, targetType } = req.query;
    if (!targetId || !targetType || !['forum', 'reply'].includes(targetType)) {
        return res.status(400).json({ message: 'targetId and valid targetType are required' });
    }
    const count = await Like.countDocuments({ targetId, targetType });
    res.json({ count });
};

// Check if the current user has liked a forum or reply
const getUserLike = async (req, res) => {
    const { targetId, targetType } = req.query;
    const userId = req.user._id;
    if (!targetId || !targetType || !['forum', 'reply'].includes(targetType)) {
        return res.status(400).json({ message: 'targetId and valid targetType are required' });
    }
    const like = await Like.findOne({ user: userId, targetId, targetType });
    res.json({ liked: !!like });
};

module.exports = {
    toggleLike,
    getLikeCount,
    getUserLike
}; 