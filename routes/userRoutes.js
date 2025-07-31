const express = require('express')
const router = express.Router()
const usersController = require('../controllers/usersController')
const verifyJWT = require('../middleware/verifyJWT')

router.route('/')
    .post(usersController.createNewUser)

router.use(verifyJWT)

router.route('/')
    .get(usersController.getAllUsers)
    .patch(usersController.updateUser)
    .delete(usersController.deleteUser)

router.route('/:userId/liked-forums')
    .get(usersController.getLikedForums)

router.route('/:userId/liked-replies')
    .get(usersController.getLikedReplies)

module.exports = router