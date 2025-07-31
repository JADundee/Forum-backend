const express = require('express')
const router = express.Router()
const forumsController = require('../controllers/forumsController')
const verifyJWT = require('../middleware/verifyJWT')

router.use(verifyJWT)

router.get('/', forumsController.getNotifications)
router.patch('/mark-all-read', forumsController.markAllNotificationsRead)
router.patch('/:id', forumsController.updateNotificationRead)
router.post('/', forumsController.createNotification)
router.delete('/:id', forumsController.deleteNotification)

module.exports = router