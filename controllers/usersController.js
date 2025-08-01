const User = require('../models/User')
const Forum = require('../models/Forum')
const bcrypt = require('bcrypt')
const Reply = require('../models/Reply')
const Notification = require('../models/Notification')
const Like = require('../models/Like')

// @desc Get all users
// @route GET /users
// @access Private
const getAllUsers = async (req, res) => {
    // Get all users from MongoDB
    const users = await User.find().select('-password').lean()

    // If no users 
    if (!users?.length) {
        return res.status(400).json({ message: 'No users found' })
    }

    res.json(users)
}

// @desc Create new user
// @route POST /register
// @access Public
const createNewUser = async (req, res) => {
    const { username, email, password, roles } = req.body

    // Validate input formats
    const errors = [];
    if (!username) errors.push('Username is required');
    else if (username.length < 3 || username.length > 20) errors.push('Username must be 3-20 characters long');
    if (!email) errors.push('Email is required');
    else if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('Email format is invalid');
    if (!password) errors.push('Password is required');
    else if (!/^[A-Za-z0-9!@#$%]{4,12}$/.test(password)) errors.push('Password must be 4-12 characters and only contain letters, numbers, and !@#$%');
    if (errors.length > 0) {
        return res.status(400).json({ message: errors.join('. ') });
    }

    // Check for duplicate username
    const duplicateUsername = await User.findOne({ username }).collation({ locale: 'en', strength: 2 }).lean().exec()
    if (duplicateUsername) {
        return res.status(409).json({ message: 'Duplicate username' })
    }

    // Check for duplicate email
    const duplicateEmail = await User.findOne({ email }).collation({ locale: 'en', strength: 2 }).lean().exec()
    if (duplicateEmail) {
        return res.status(409).json({ message: 'Duplicate email' })
    }

    // Hash password 
    const hashedPwd = await bcrypt.hash(password, 10) // salt rounds

    const userObject = (!Array.isArray(roles) || !roles.length)
        ? { username, email, "password": hashedPwd }
        : { username, email, "password": hashedPwd, roles }

    // Create and store new user 
    const user = await User.create(userObject)

    if (user) { //created 
        res.status(201).json({ message: `New user ${username} created` })
    } else {
        res.status(400).json({ message: 'Invalid user data received' })
    }
}

// @desc Update a user
// @route PATCH /users
// @access Private
const updateUser = async (req, res) => {
    const { id, username, roles, active, password } = req.body

    // Confirm data 
    if (!id || !username || !Array.isArray(roles) || !roles.length || typeof active !== 'boolean') {
        return res.status(400).json({ message: 'All fields except password are required' })
    }

    // Does the user exist to update?
    const user = await User.findById(id).exec()

    if (!user) {
        return res.status(400).json({ message: 'User not found' })
    }

    // Check for duplicate 
    const duplicate = await User.findOne({ username }).collation({ locale: 'en', strength: 2 }).lean().exec()

    // Allow updates to the original user 
    if (duplicate && duplicate?._id.toString() !== id) {
        return res.status(409).json({ message: 'Duplicate username' })
    }

    user.username = username
    user.roles = roles
    user.active = active

    if (password) {
        // Check if new password is the same as the current password
        const isSame = await bcrypt.compare(password, user.password);
        if (isSame) {
            return res.status(400).json({ message: 'New password must be different from the current password.' });
        }
        // Hash password 
        user.password = await bcrypt.hash(password, 10) // salt rounds 
    }

    const updatedUser = await user.save()

    res.json({ message: `${updatedUser.username} updated` })
}

// @desc Delete a user
// @route DELETE /users
// @access Private
const deleteUser = async (req, res) => {
    const { id } = req.body

    // Confirm data
    if (!id) {
        return res.status(400).json({ message: 'User ID Required' })
    }

    // Does the user exist to delete?
    const user = await User.findById(id).exec()

    if (!user) {
        return res.status(400).json({ message: 'User not found' })
    }

    // Delete all forums by this user
    const forums = await Forum.find({ user: id }).lean().exec()
    const forumIds = forums.map(forum => forum._id)
    await Forum.deleteMany({ user: id })

    // Delete all replies by this user
    await Reply.deleteMany({ user: id })

    // Delete all replies on this user's forums
    if (forumIds.length > 0) {
        await Reply.deleteMany({ forum: { $in: forumIds } })
        // Delete all notifications for these forums
        await Notification.deleteMany({ forumId: { $in: forumIds.map(id => id.toString()) } })
    }

    // Delete all notifications for this user
    await Notification.deleteMany({ userId: id.toString() })

    // Delete all notifications where this user is the actor (username field)
    await Notification.deleteMany({ username: user.username })

    const result = await user.deleteOne()

    const reply = `Username ${result.username} with ID ${result._id} and all related data deleted`

    res.json(reply)
}

// @desc Get liked forums for a user
// @route GET /users/:userId/liked-forums
// @access Private
const getLikedForums = async (req, res) => {
    const { userId } = req.params;
    if (!userId || String(req.user._id) !== String(userId)) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    // Find all Like documents for this user and forums
    const likes = await Like.find({ user: userId, targetType: 'forum' }).sort({ createdAt: -1 });
    const forumIds = likes.map(like => like.targetId);
    // Fetch forums and populate user
    const forums = await Forum.find({ _id: { $in: forumIds } })
        .populate('user', 'username')
        .lean();
    // Attach like createdAt to each forum for sorting
    const forumsWithLikeDate = forums.map(forum => {
        const like = likes.find(l => String(l.targetId) === String(forum._id));
        return { ...forum, likedAt: like?.createdAt };
    });
    // Sort by like date (most recent first)
    forumsWithLikeDate.sort((a, b) => new Date(b.likedAt) - new Date(a.likedAt));
    res.json(forumsWithLikeDate);
};

// @desc Get liked replies for a user
// @route GET /users/:userId/liked-replies
// @access Private
const getLikedReplies = async (req, res) => {
    const { userId } = req.params;
    if (!userId || String(req.user._id) !== String(userId)) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    // Find all Like documents for this user and replies
    const likes = await Like.find({ user: userId, targetType: 'reply' }).sort({ createdAt: -1 });
    const replyIds = likes.map(like => like.targetId);
    // Fetch replies and populate user and forum
    const replies = await Reply.find({ _id: { $in: replyIds } })
        .populate('user', 'username')
        .populate('forum', 'title')
        .lean();
    // Attach like createdAt to each reply for sorting
    const repliesWithLikeDate = replies.map(reply => {
        const like = likes.find(l => String(l.targetId) === String(reply._id));
        return { ...reply, likedAt: like?.createdAt };
    });
    // Sort by like date (most recent first)
    repliesWithLikeDate.sort((a, b) => new Date(b.likedAt) - new Date(a.likedAt));
    res.json(repliesWithLikeDate);
};

module.exports = {
    getAllUsers,
    createNewUser,
    updateUser,
    deleteUser,
    getLikedForums,
    getLikedReplies
}