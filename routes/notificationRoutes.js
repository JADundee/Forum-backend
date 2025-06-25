const express = require('express')
const router = express.Router()
const notesController = require('../controllers/notesController')
const verifyJWT = require('../middleware/verifyJWT')

router.use(verifyJWT)

router.get('/', notesController.getNotifications)
router.patch('/mark-all-read', notesController.markAllNotificationsRead)
router.patch('/:id', notesController.updateNotificationRead)
router.post('/', notesController.createNotification)

module.exports = router