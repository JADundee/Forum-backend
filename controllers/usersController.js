const User = require('../models/User')
const Note = require('../models/Note')
const bcrypt = require('bcrypt')
const Reply = require('../models/Reply')
const Notification = require('../models/Notification')

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

    // Delete all notes by this user
    const notes = await Note.find({ user: id }).lean().exec()
    const noteIds = notes.map(note => note._id)
    await Note.deleteMany({ user: id })

    // Delete all replies by this user
    await Reply.deleteMany({ user: id })

    // Delete all replies on this user's notes
    if (noteIds.length > 0) {
        await Reply.deleteMany({ note: { $in: noteIds } })
        // Delete all notifications for these notes
        await Notification.deleteMany({ noteId: { $in: noteIds.map(id => id.toString()) } })
    }

    // Delete all notifications for this user
    await Notification.deleteMany({ userId: id.toString() })

    // Delete all notifications where this user is the actor (username field)
    await Notification.deleteMany({ username: user.username })

    const result = await user.deleteOne()

    const reply = `Username ${result.username} with ID ${result._id} and all related data deleted`

    res.json(reply)
}

module.exports = {
    getAllUsers,
    createNewUser,
    updateUser,
    deleteUser
}