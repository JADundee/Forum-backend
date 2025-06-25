const express = require('express')
const router = express.Router()
const notesController = require('../controllers/notesController')
const verifyJWT = require('../middleware/verifyJWT')

router.use(verifyJWT)

router.get('/', notesController.getNotifications)
router.patch('/:id', notesController.updateNotificationRead)
router.patch('/mark-all-read', notesController.markAllNotificationsRead)
router.post('/', notesController.createNotification)

module.exports = router