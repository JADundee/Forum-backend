const User = require('../models/User')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const nodemailer = require('nodemailer')
const crypto = require('crypto')

// Helper to get cookie options
const getCookieOptions = (isClearing = false) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isClearing) {
        return isProduction
            ? { httpOnly: true, secure: true, sameSite: 'None' }
            : { httpOnly: true, secure: false, sameSite: 'Lax' };
    }
    return isProduction
        ? {
            httpOnly: true,
            secure: true,
            sameSite: 'None',
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
        : {
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        };
};

// Helper to generate access token
const generateAccessToken = (user) => {
    return jwt.sign(
        {
            "UserInfo": {
                "_id": user._id,
                "username": user.username,
                "roles": user.roles
            }
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '15m' }
    );
};

// Nodemailer transporter (singleton)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// @desc Login
// @route POST /auth
// @access Public
const login = async (req, res) => {
    const { username, password } = req.body

    if (!username || !password) {
        return res.status(400).json({ message: 'All fields are required' })
    }

    // Find user by username OR email
    const foundUser = await User.findOne({
        $or: [
            { username: username },
            { email: username }
        ]
    }).exec()

    if (!foundUser || !foundUser.active) {
        return res.status(401).json({ message: 'Unauthorized' })
    }

    const match = await bcrypt.compare(password, foundUser.password)

    if (!match) return res.status(401).json({ message: 'Unauthorized' })

    const accessToken = generateAccessToken(foundUser)

    const refreshToken = jwt.sign(
        { "username": foundUser.username },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: '7d' }
    )

    // Set cookie options
    const cookieOptions = getCookieOptions()

    // Create secure cookie with refresh token 
    res.cookie('jwt', refreshToken, cookieOptions)

    // Send accessToken containing username and roles 
    res.json({ accessToken })
}

// @desc Refresh
// @route GET /auth/refresh
// @access Public - because access token has expired
const refresh = (req, res) => {
    const cookies = req.cookies

    if (!cookies?.jwt) return res.status(401).json({ message: 'Unauthorized' })

    const refreshToken = cookies.jwt

    jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET,
        async (err, decoded) => {
            if (err) return res.status(403).json({ message: 'Forbidden' })

            const foundUser = await User.findOne({ username: decoded.username }).exec()

            if (!foundUser) return res.status(401).json({ message: 'Unauthorized' })

            const accessToken = generateAccessToken(foundUser)

            res.json({ accessToken })
        }
    )
}

// @desc Logout
// @route POST /auth/logout
// @access Public - just to clear cookie if exists
const logout = (req, res) => {
    const cookies = req.cookies
    if (!cookies?.jwt) return res.sendStatus(204) //No content
    // Set cookie options
    const cookieOptions = getCookieOptions(true)
    res.clearCookie('jwt', cookieOptions)
    res.json({ message: 'Cookie cleared' })
}

// @desc Forgot Password
// @route POST /auth/forgot-password
// @access Public
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }
    const user = await User.findOne({ email }).exec();
    if (!user) {
        // Always respond with success to prevent email enumeration
        return res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
    }
    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${token}`;
    const mailOptions = {
        to: user.email,
        subject: 'Password Reset Request',
        text: `You requested a password reset. Click the link to reset your password: ${resetUrl}\nIf you did not request this, please ignore this email.`
    };
    try {
        await transporter.sendMail(mailOptions);
    } catch (err) {
        return res.status(500).json({ message: 'Error sending email' });
    }
    res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
};

// @desc Reset Password
// @route POST /auth/reset-password
// @access Public
const resetPassword = async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
        return res.status(400).json({ message: 'Token and new password are required' });
    }
    const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() }
    }).exec();
    if (!user) {
        return res.status(400).json({ message: 'Invalid or expired token' });
    }
    // Check if new password is the same as the current password
    const isSame = await bcrypt.compare(password, user.password);
    if (isSame) {
        return res.status(400).json({ message: 'New password must be different from the current password.' });
    }
    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();
    res.status(200).json({ message: 'Password has been reset successfully' });
};

module.exports = {
    login,
    refresh,
    logout,
    forgotPassword,
    resetPassword
}