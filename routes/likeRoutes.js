const express = require('express');
const router = express.Router();
const likeController = require('../controllers/likeController');
const verifyJWT = require('../middleware/verifyJWT');

router.use(verifyJWT);

router.post('/', likeController.toggleLike);
router.get('/count', likeController.getLikeCount);
router.get('/user', likeController.getUserLike);

module.exports = router; 