const jwt = require('jsonwebtoken')

const verifyJWT = (req, res, next) => {
    let token;

    // Check Authorization header
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    // If not in header, check cookies
    if (!token && req.cookies?.jwt) {
        token = req.cookies.jwt;
    }

    if (!token) {
        console.log('No token found');
        return res.status(401).json({ message: 'Unauthorized' });
    }

    jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET,
        (err, decoded) => {
            if (err) {
                console.log('JWT verify error:', err);
                return res.status(403).json({ message: 'Forbidden' });
            }
            req.user = {
                _id: decoded.UserInfo._id,
                username: decoded.UserInfo.username,
                roles: decoded.UserInfo.roles
            };
            next();
        }
    );
};

module.exports = verifyJWT;