const express = require('express')
const router = express.Router()
const forumsController = require('../controllers/forumsController')
const verifyJWT = require('../middleware/verifyJWT')

router.use(verifyJWT)

router.route('/')
    .get(forumsController.getAllForums)
    .post(forumsController.createNewForum)
    .patch(forumsController.updateForum)
    .delete(forumsController.deleteForum)

router.route('/:forumId/replies')
    .get(forumsController.getReplies)
    .post(forumsController.addReply)
    
router.route('/replies/:replyId')
    .delete(forumsController.deleteReply)
    .patch(forumsController.editReply)

router.route('/replies-by-user')
    .get(forumsController.getRepliesByUser)

module.exports = router