const express = require('express')
const router = express.Router()
const notesController = require('../controllers/notesController')
const verifyJWT = require('../middleware/verifyJWT')

router.use(verifyJWT)

router.route('/')
    .get(notesController.getAllNotes)
    .post(notesController.createNewNote)
    .patch(notesController.updateNote)
    .delete(notesController.deleteNote)

router.route('/:noteId/replies')
    .get(notesController.getReplies)
    .post(notesController.addReply)
    
router.route('/replies/:replyId')
    .delete(notesController.deleteReply)
    .patch(notesController.editReply)

router.route('/replies-by-user')
    .get(notesController.getRepliesByUser)

module.exports = router